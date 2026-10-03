import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockIsAuthed = vi.fn();
const mockLookup = vi.fn();
const mockUpdate = vi.fn();
const mockRecordAudit = vi.fn();

vi.mock("@/lib/staff-auth", () => ({ isStaffAuthorized: (...args: unknown[]) => mockIsAuthed(...args) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...args: unknown[]) => mockRecordAudit(...args) }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      if (table !== "maps") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({ eq: () => ({ maybeSingle: mockLookup }) }),
        update: (row: unknown) => ({ eq: () => mockUpdate(row) }),
      };
    },
  }),
}));

function formReq(params: Record<string, string>): NextRequest {
  return new Request("http://localhost/api/staff/maps/directory", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  }) as unknown as NextRequest;
}

describe("POST /api/staff/maps/directory", () => {
  beforeEach(() => {
    mockIsAuthed.mockReset();
    mockLookup.mockReset();
    mockUpdate.mockReset().mockResolvedValue({ error: null });
    mockRecordAudit.mockReset().mockResolvedValue(undefined);
  });

  it("requires staff session", async () => {
    mockIsAuthed.mockResolvedValue(false);
    const { POST } = await import("@/app/api/staff/maps/directory/route");
    const res = await POST(formReq({ map_id: "m1", hidden: "1" }));
    expect(res.status).toBe(401);
  });

  it("hides a map with a reason, audits, and redirects for form posts", async () => {
    mockIsAuthed.mockResolvedValue(true);
    mockLookup.mockResolvedValue({ data: { id: "m1", slug: "abc", directory_hidden: false } });
    const { POST } = await import("@/app/api/staff/maps/directory/route");
    const res = await POST(formReq({ map_id: "m1", hidden: "1", reason: "신고 확인 중", return_to: "/staff/reports?status=pending" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/staff/reports?status=pending");
    const row = mockUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(row.directory_hidden).toBe(true);
    expect(row.directory_hidden_reason).toBe("신고 확인 중");
    expect(typeof row.directory_hidden_at).toBe("string");
    expect(mockRecordAudit.mock.calls[0][0]).toMatchObject({ action: "map.directory_hide", mapId: "m1", details: { slug: "abc", reason: "신고 확인 중" } });
  });

  it("shows a map again and clears the reason", async () => {
    mockIsAuthed.mockResolvedValue(true);
    mockLookup.mockResolvedValue({ data: { id: "m1", slug: "abc", directory_hidden: true } });
    const { POST } = await import("@/app/api/staff/maps/directory/route");
    const res = await POST(new Request("http://localhost/api/staff/maps/directory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ map_id: "m1", hidden: false }) }) as unknown as NextRequest);
    expect(res.status).toBe(200);
    const row = mockUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ directory_hidden: false, directory_hidden_reason: null, directory_hidden_at: null });
    expect(mockRecordAudit.mock.calls[0][0].action).toBe("map.directory_show");
  });

  it("returns 404 for unknown maps", async () => {
    mockIsAuthed.mockResolvedValue(true);
    mockLookup.mockResolvedValue({ data: null });
    const { POST } = await import("@/app/api/staff/maps/directory/route");
    const res = await POST(formReq({ map_id: "nope", hidden: "1" }));
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
