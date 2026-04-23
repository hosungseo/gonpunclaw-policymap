import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const mockMapLookup = vi.fn();
const mockReportInsert = vi.fn();
const mockRecordAudit = vi.fn();

vi.mock("@/lib/audit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit")>("@/lib/audit");
  return {
    ...actual,
    recordAudit: (...args: unknown[]) => mockRecordAudit(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      if (table === "maps") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: mockMapLookup,
            }),
          }),
        };
      }
      if (table === "reports") {
        return { insert: (row: unknown) => mockReportInsert(row) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

function makeRequest(body: unknown, ip = "198.51.100.10"): NextRequest {
  return new Request("http://localhost/api/maps/s/report", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

async function callRoute(body: unknown, ip?: string, slug = "testslug") {
  const mod = await import("@/app/api/maps/[slug]/report/route");
  return mod.POST(makeRequest(body, ip), { params: Promise.resolve({ slug }) });
}

describe("POST /api/maps/[slug]/report", () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN_PEPPER = "pepper";
    mockMapLookup.mockReset();
    mockReportInsert.mockReset();
    mockRecordAudit.mockReset();
    mockRecordAudit.mockResolvedValue(undefined);
    mockReportInsert.mockResolvedValue({ error: null });
    // reset rate-limit in-memory store by re-importing module
    vi.resetModules();
  });

  it("rejects malformed JSON", async () => {
    const res = await callRoute("{not json", "10.0.0.1");
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("BAD_JSON");
    expect(mockMapLookup).not.toHaveBeenCalled();
  });

  it("rejects missing reason", async () => {
    const res = await callRoute({}, "10.0.0.2");
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("BAD_REASON");
  });

  it("rejects reason shorter than minimum", async () => {
    const res = await callRoute({ reason: "  short  " }, "10.0.0.3");
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("REASON_TOO_SHORT");
  });

  it("rejects reason longer than maximum", async () => {
    const res = await callRoute({ reason: "a".repeat(501) }, "10.0.0.4");
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("REASON_TOO_LONG");
  });

  it("returns 404 when slug does not exist", async () => {
    mockMapLookup.mockResolvedValueOnce({ data: null, error: null });
    const res = await callRoute({ reason: "something genuinely wrong" }, "10.0.0.5");
    expect(res.status).toBe(404);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("NOT_FOUND");
    expect(mockReportInsert).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("returns 404 when map is not listed", async () => {
    mockMapLookup.mockResolvedValueOnce({
      data: { id: "m1", is_listed: false },
      error: null,
    });
    const res = await callRoute({ reason: "hidden map should not accept" }, "10.0.0.6");
    expect(res.status).toBe(404);
    expect(mockReportInsert).not.toHaveBeenCalled();
  });

  it("inserts hashed IP and records audit on success", async () => {
    mockMapLookup.mockResolvedValueOnce({
      data: { id: "mid-1", is_listed: true },
      error: null,
    });

    const res = await callRoute(
      { reason: "  valid reason please " },
      "203.0.113.7",
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: true };
    expect(json.ok).toBe(true);

    expect(mockReportInsert).toHaveBeenCalledTimes(1);
    const row = mockReportInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.map_id).toBe("mid-1");
    expect(row.reason).toBe("valid reason please");
    expect(typeof row.reporter_ip_hash).toBe("string");
    const { hashIp } = await import("@/lib/audit");
    expect(row.reporter_ip_hash).toBe(hashIp("203.0.113.7", "pepper"));
    // raw IP never persisted
    expect(JSON.stringify(row)).not.toContain("203.0.113.7");

    expect(mockRecordAudit).toHaveBeenCalledTimes(1);
    const audit = mockRecordAudit.mock.calls[0][0];
    expect(audit.action).toBe("report.create");
    expect(audit.mapId).toBe("mid-1");
    expect(audit.details).toEqual({ slug: "testslug", reason_length: 19 });
  });

  it("stores null ip_hash when pepper is missing", async () => {
    delete process.env.ADMIN_TOKEN_PEPPER;
    mockMapLookup.mockResolvedValueOnce({
      data: { id: "mid-2", is_listed: true },
      error: null,
    });
    const res = await callRoute({ reason: "ten characters at least" }, "10.0.0.8");
    expect(res.status).toBe(200);
    const row = mockReportInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.reporter_ip_hash).toBeNull();
  });

  it("rate limits after 5 reports from the same IP", async () => {
    mockMapLookup.mockResolvedValue({
      data: { id: "mid-3", is_listed: true },
      error: null,
    });
    const ip = "192.0.2.50";
    for (let i = 0; i < 5; i++) {
      const res = await callRoute({ reason: `attempt number ${i} here` }, ip);
      expect(res.status).toBe(200);
    }
    const res = await callRoute({ reason: "one too many valid" }, ip);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("RATE_LIMITED");
  });

  it("returns 500 when insert fails", async () => {
    mockMapLookup.mockResolvedValueOnce({
      data: { id: "mid-4", is_listed: true },
      error: null,
    });
    mockReportInsert.mockResolvedValueOnce({ error: { message: "boom" } });
    const res = await callRoute({ reason: "valid reason here" }, "10.0.0.9");
    expect(res.status).toBe(500);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("INSERT_FAILED");
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });
});
