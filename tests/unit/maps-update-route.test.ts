import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const mockUpdateSingle = vi.fn();
const mockPrevSingle = vi.fn();
const mockAuditInsert = vi.fn();
const mockVerify = vi.fn();
const mockRecordAudit = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminTokenForMap: (...args: unknown[]) => mockVerify(...args),
}));

vi.mock("@/lib/audit", () => ({
  recordAudit: (...args: unknown[]) => mockRecordAudit(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      if (table === "audit_log") {
        return { insert: (row: unknown) => mockAuditInsert(row) };
      }
      return {
        update: () => ({
          eq: () => ({
            select: () => ({
              single: mockUpdateSingle,
            }),
          }),
        }),
        select: () => ({
          eq: () => ({
            single: mockPrevSingle,
          }),
        }),
      };
    },
  }),
}));

function makeRequest(body: unknown, ip = "127.0.0.1"): NextRequest {
  return new Request("http://localhost/api/maps/s/update", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

async function callRoute(body: unknown, ip?: string) {
  const { POST } = await import("@/app/api/maps/[slug]/update/route");
  return POST(makeRequest(body, ip), { params: Promise.resolve({ slug: "testslug" }) });
}

describe("POST /api/maps/[slug]/update", () => {
  beforeEach(() => {
    mockUpdateSingle.mockReset();
    mockPrevSingle.mockReset();
    mockAuditInsert.mockReset();
    mockVerify.mockReset();
    mockRecordAudit.mockReset();
    mockRecordAudit.mockResolvedValue(undefined);
  });

  it("rejects missing admin token", async () => {
    const res = await callRoute({ title: "new" }, "10.0.0.1");
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NO_TOKEN");
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("returns 404 when token does not match, and logs admin.auth_fail", async () => {
    mockVerify.mockResolvedValueOnce({ ok: false, reason: "NOT_FOUND" });
    const res = await callRoute({ admin_token: "wrong", title: "x" }, "10.0.0.2");
    expect(res.status).toBe(404);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("NOT_FOUND");
    expect(mockRecordAudit).toHaveBeenCalledTimes(1);
    const audit = mockRecordAudit.mock.calls[0][0];
    expect(audit.action).toBe("admin.auth_fail");
    expect(audit.mapId).toBeNull();
    expect(audit.details).toEqual({ slug: "testslug", route: "update" });
  });

  it("does not log audit for MISSING_PEPPER auth failures", async () => {
    mockVerify.mockResolvedValueOnce({ ok: false, reason: "MISSING_PEPPER" });
    const res = await callRoute({ admin_token: "t", title: "x" }, "10.0.0.10");
    expect(res.status).toBe(500);
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("rejects empty title", async () => {
    mockVerify.mockResolvedValueOnce({ ok: true, mapId: "mid" });
    const res = await callRoute({ admin_token: "t", title: "   " }, "10.0.0.3");
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("NO_TITLE");
  });

  it("rejects oversized description", async () => {
    mockVerify.mockResolvedValueOnce({ ok: true, mapId: "mid" });
    const res = await callRoute(
      { admin_token: "t", description: "a".repeat(501) },
      "10.0.0.4",
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("DESCRIPTION_TOO_LONG");
  });

  it("rejects wrong type for is_listed", async () => {
    mockVerify.mockResolvedValueOnce({ ok: true, mapId: "mid" });
    const res = await callRoute(
      { admin_token: "t", is_listed: "yes" },
      "10.0.0.5",
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("BAD_IS_LISTED");
  });

  it("rejects empty update", async () => {
    mockVerify.mockResolvedValueOnce({ ok: true, mapId: "mid" });
    const res = await callRoute({ admin_token: "t" }, "10.0.0.6");
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("NO_FIELDS");
  });

  it("applies valid update, records audit, and captures is_listed transition", async () => {
    mockVerify.mockResolvedValueOnce({ ok: true, mapId: "mid" });
    mockPrevSingle.mockResolvedValueOnce({ data: { is_listed: true }, error: null });
    mockUpdateSingle.mockResolvedValueOnce({
      data: {
        slug: "testslug",
        title: "New Title",
        description: "desc",
        value_label: null,
        value_unit: "원",
        category_label: null,
        is_listed: false,
      },
      error: null,
    });

    const res = await callRoute(
      {
        admin_token: "t",
        title: "New Title",
        description: "desc",
        value_label: "   ",
        value_unit: "원",
        is_listed: false,
      },
      "10.0.0.7",
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: true; map: Record<string, unknown> };
    expect(json.ok).toBe(true);
    expect(json.map.title).toBe("New Title");
    expect(json.map.value_label).toBeNull();
    expect(json.map.value_unit).toBe("원");
    expect(json.map.is_listed).toBe(false);

    expect(mockRecordAudit).toHaveBeenCalledTimes(1);
    const audit = mockRecordAudit.mock.calls[0][0];
    expect(audit.action).toBe("map.update");
    expect(audit.mapId).toBe("mid");
    expect(audit.details.slug).toBe("testslug");
    expect(audit.details.changed_fields).toEqual(
      expect.arrayContaining(["title", "description", "value_label", "value_unit", "is_listed"]),
    );
    expect(audit.details.changed_fields).not.toContain("updated_at");
    expect(audit.details.is_listed_before).toBe(true);
    expect(audit.details.is_listed_after).toBe(false);
  });

  it("omits is_listed transition details when flag was not in the request", async () => {
    mockVerify.mockResolvedValueOnce({ ok: true, mapId: "mid" });
    mockUpdateSingle.mockResolvedValueOnce({
      data: {
        slug: "testslug",
        title: "T",
        description: "",
        value_label: null,
        value_unit: null,
        category_label: null,
        is_listed: true,
      },
      error: null,
    });

    const res = await callRoute({ admin_token: "t", title: "T" }, "10.0.0.8");
    expect(res.status).toBe(200);
    expect(mockPrevSingle).not.toHaveBeenCalled();
    const audit = mockRecordAudit.mock.calls[0][0];
    expect(audit.details.is_listed_before).toBeUndefined();
    expect(audit.details.is_listed_after).toBeUndefined();
    expect(audit.details.changed_fields).toEqual(["title"]);
  });
});
