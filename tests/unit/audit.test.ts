import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: (table: string) => ({
      insert: (row: unknown) => mockInsert(table, row),
    }),
  }),
}));

function makeReq(headers: Record<string, string>): Request {
  return new Request("http://localhost/x", { method: "POST", headers });
}

describe("recordAudit", () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN_PEPPER = "pepper";
    mockInsert.mockReset();
    mockInsert.mockReturnValue(Promise.resolve({ data: null, error: null }));
  });

  it("hashes IP and does not store raw IP", async () => {
    const { recordAudit, hashIp } = await import("@/lib/audit");
    await recordAudit({
      action: "map.create",
      mapId: "m1",
      req: makeReq({ "x-forwarded-for": "203.0.113.9", "user-agent": "ua/1.0" }),
      details: { slug: "s1" },
    });
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const [table, row] = mockInsert.mock.calls[0];
    const r = row as Record<string, unknown>;
    expect(table).toBe("audit_log");
    expect(r.action).toBe("map.create");
    expect(r.map_id).toBe("m1");
    expect(r.user_agent).toBe("ua/1.0");
    expect(r.details).toEqual({ slug: "s1" });
    expect(r.ip_hash).toBe(hashIp("203.0.113.9", "pepper"));
    expect(JSON.stringify(row)).not.toContain("203.0.113.9");
  });

  it("uses first IP from a comma-separated x-forwarded-for chain", async () => {
    const { recordAudit, hashIp } = await import("@/lib/audit");
    await recordAudit({
      action: "map.update",
      mapId: "m1",
      req: makeReq({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }),
    });
    const [, row] = mockInsert.mock.calls[0];
    expect((row as Record<string, unknown>).ip_hash).toBe(hashIp("198.51.100.7", "pepper"));
  });

  it("records null ip_hash when no x-forwarded-for header", async () => {
    const { recordAudit } = await import("@/lib/audit");
    await recordAudit({ action: "map.update", mapId: "m", req: makeReq({}) });
    const [, row] = mockInsert.mock.calls[0];
    expect((row as Record<string, unknown>).ip_hash).toBeNull();
  });

  it("records null ip_hash when pepper is missing", async () => {
    delete process.env.ADMIN_TOKEN_PEPPER;
    const { recordAudit } = await import("@/lib/audit");
    await recordAudit({
      action: "map.update",
      mapId: "m",
      req: makeReq({ "x-forwarded-for": "203.0.113.9" }),
    });
    const [, row] = mockInsert.mock.calls[0];
    expect((row as Record<string, unknown>).ip_hash).toBeNull();
  });

  it("defaults details to an empty object when none provided", async () => {
    const { recordAudit } = await import("@/lib/audit");
    await recordAudit({ action: "map.delete", mapId: null, req: makeReq({}) });
    const [, row] = mockInsert.mock.calls[0];
    expect((row as Record<string, unknown>).details).toEqual({});
    expect((row as Record<string, unknown>).map_id).toBeNull();
  });

  it("truncates absurdly long user-agent strings", async () => {
    const { recordAudit } = await import("@/lib/audit");
    const longUa = "a".repeat(2000);
    await recordAudit({
      action: "map.create",
      mapId: "m",
      req: makeReq({ "user-agent": longUa }),
    });
    const [, row] = mockInsert.mock.calls[0];
    const ua = (row as Record<string, unknown>).user_agent as string;
    expect(ua.length).toBeLessThanOrEqual(512);
  });

  it("swallows insert errors so callers are not affected", async () => {
    mockInsert.mockImplementationOnce(() => Promise.reject(new Error("boom")));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { recordAudit } = await import("@/lib/audit");
    await expect(
      recordAudit({ action: "map.create", mapId: "m", req: makeReq({}) }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
