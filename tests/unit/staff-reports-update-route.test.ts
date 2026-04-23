import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const mockIsAuthed = vi.fn();
const mockReportLookup = vi.fn();
const mockReportUpdate = vi.fn();
const mockRecordAudit = vi.fn();

vi.mock("@/lib/staff-auth", () => ({
  isStaffAuthorized: (...args: unknown[]) => mockIsAuthed(...args),
}));

vi.mock("@/lib/audit", () => ({
  recordAudit: (...args: unknown[]) => mockRecordAudit(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      if (table !== "reports") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: mockReportLookup,
          }),
        }),
        update: (row: unknown) => ({
          eq: () => mockReportUpdate(row),
        }),
      };
    },
  }),
}));

function makeJsonRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/staff/reports/update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function makeFormRequest(params: Record<string, string>): NextRequest {
  const body = new URLSearchParams(params).toString();
  return new Request("http://localhost/api/staff/reports/update", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  }) as unknown as NextRequest;
}

async function callRoute(req: NextRequest) {
  const { POST } = await import("@/app/api/staff/reports/update/route");
  return POST(req);
}

describe("POST /api/staff/reports/update", () => {
  beforeEach(() => {
    mockIsAuthed.mockReset();
    mockReportLookup.mockReset();
    mockReportUpdate.mockReset();
    mockRecordAudit.mockReset();
    mockRecordAudit.mockResolvedValue(undefined);
    mockReportUpdate.mockResolvedValue({ error: null });
  });

  it("rejects unauthenticated callers with 401", async () => {
    mockIsAuthed.mockResolvedValueOnce(false);
    const res = await callRoute(makeJsonRequest({ id: "r1", status: "reviewed" }));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("UNAUTHORIZED");
    expect(mockReportLookup).not.toHaveBeenCalled();
  });

  it("rejects missing id", async () => {
    mockIsAuthed.mockResolvedValueOnce(true);
    const res = await callRoute(makeJsonRequest({ status: "reviewed" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("BAD_ID");
  });

  it("rejects an unknown status", async () => {
    mockIsAuthed.mockResolvedValueOnce(true);
    const res = await callRoute(makeJsonRequest({ id: "r1", status: "bogus" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("BAD_STATUS");
  });

  it("returns 404 when the report does not exist", async () => {
    mockIsAuthed.mockResolvedValueOnce(true);
    mockReportLookup.mockResolvedValueOnce({ data: null, error: null });
    const res = await callRoute(makeJsonRequest({ id: "missing", status: "reviewed" }));
    expect(res.status).toBe(404);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("NOT_FOUND");
    expect(mockReportUpdate).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("updates the report and records an audit with the status transition", async () => {
    mockIsAuthed.mockResolvedValueOnce(true);
    mockReportLookup.mockResolvedValueOnce({
      data: { id: "r1", status: "pending", map_id: "m1" },
      error: null,
    });
    const res = await callRoute(makeJsonRequest({ id: "r1", status: "reviewed" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: true; id: string; status: string };
    expect(json.ok).toBe(true);
    expect(json.id).toBe("r1");
    expect(json.status).toBe("reviewed");

    expect(mockReportUpdate).toHaveBeenCalledTimes(1);
    expect(mockReportUpdate.mock.calls[0][0]).toEqual({ status: "reviewed" });

    expect(mockRecordAudit).toHaveBeenCalledTimes(1);
    const audit = mockRecordAudit.mock.calls[0][0];
    expect(audit.action).toBe("report.update");
    expect(audit.mapId).toBe("m1");
    expect(audit.details).toEqual({
      report_id: "r1",
      status_before: "pending",
      status_after: "reviewed",
    });
  });

  it("skips the update and audit when status is unchanged", async () => {
    mockIsAuthed.mockResolvedValueOnce(true);
    mockReportLookup.mockResolvedValueOnce({
      data: { id: "r1", status: "reviewed", map_id: "m1" },
      error: null,
    });
    const res = await callRoute(makeJsonRequest({ id: "r1", status: "reviewed" }));
    expect(res.status).toBe(200);
    expect(mockReportUpdate).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("returns 500 when the update fails", async () => {
    mockIsAuthed.mockResolvedValueOnce(true);
    mockReportLookup.mockResolvedValueOnce({
      data: { id: "r1", status: "pending", map_id: "m1" },
      error: null,
    });
    mockReportUpdate.mockResolvedValueOnce({ error: { message: "boom" } });
    const res = await callRoute(makeJsonRequest({ id: "r1", status: "dismissed" }));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("UPDATE_FAILED");
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("redirects back to a safe return_to when submitted as a form", async () => {
    mockIsAuthed.mockResolvedValueOnce(true);
    mockReportLookup.mockResolvedValueOnce({
      data: { id: "r1", status: "pending", map_id: "m1" },
      error: null,
    });
    const res = await callRoute(
      makeFormRequest({
        id: "r1",
        status: "resolved",
        return_to: "/staff/reports?status=pending&limit=50",
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "http://localhost/staff/reports?status=pending&limit=50",
    );
  });

  it("ignores a malicious return_to and falls back to /staff/reports", async () => {
    mockIsAuthed.mockResolvedValueOnce(true);
    mockReportLookup.mockResolvedValueOnce({
      data: { id: "r1", status: "pending", map_id: "m1" },
      error: null,
    });
    const res = await callRoute(
      makeFormRequest({
        id: "r1",
        status: "resolved",
        return_to: "https://evil.example.com/steal",
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/staff/reports");
  });
});
