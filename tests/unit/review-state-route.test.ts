import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockVerifyAdmin = vi.fn();
const mockRecordAudit = vi.fn();
const mockLoadState = vi.fn();
const mockMapsSelect = vi.fn();
const mockRateLimit = vi.fn();

vi.mock("@/lib/admin-auth", () => ({ verifyAdminTokenForMap: (...a: unknown[]) => mockVerifyAdmin(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => mockRecordAudit(...a) }));
vi.mock("@/lib/reviews/service", () => ({ loadReviewState: (...a: unknown[]) => mockLoadState(...a) }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, rateLimitRequest: (...a: unknown[]) => mockRateLimit(...a) };
});
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: (table: string) => ({
      select: (cols: string) => ({ eq: (key: string, value: unknown) => ({ maybeSingle: () => mockMapsSelect({ table, cols, key, value }) }) }),
      // route-auth's rate limiter probes the RPC; an error makes it fall back to the in-memory bucket.
    }),
    rpc: () => Promise.resolve({ data: null, error: { message: "no rpc in tests" } }),
  }),
}));

// Each request gets its own client IP so the in-memory rate limiter (5 per bucket) never trips across tests.
let ipCounter = 0;
function post(body: unknown): NextRequest {
  ipCounter += 1;
  return new Request("http://localhost/api/maps/abc123/review/state", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.1.${Math.floor(ipCounter / 250)}.${ipCounter % 250}` },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}
const ctx = { params: Promise.resolve({ slug: "abc123" }) };

const state = {
  required: true,
  hasToken: true,
  status: "rejected",
  currentVersionNumber: 2,
  approvedVersionNumber: null,
  latest: { id: "r1", status: "rejected", version_id: "v2", request_note: "확인 부탁", checklist: {}, comment: "출처 URL 오류", reviewer_label: "검토자 김", created_at: "2026-01-01T00:00:00Z", decided_at: "2026-01-02T00:00:00Z", version_number: 2 },
};

describe("POST /api/maps/[slug]/review/state", () => {
  beforeEach(() => {
    for (const m of [mockVerifyAdmin, mockRecordAudit, mockLoadState, mockMapsSelect, mockRateLimit]) m.mockReset();
    mockRecordAudit.mockResolvedValue(undefined);
    mockRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  });

  it("rejects without admin token and never touches the service", async () => {
    const { POST } = await import("@/app/api/maps/[slug]/review/state/route");
    const res = await POST(post({}), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("NO_TOKEN");
    expect(mockLoadState).not.toHaveBeenCalled();
    expect(mockMapsSelect).not.toHaveBeenCalled();
  });

  it("returns 404 and audits on a bad token", async () => {
    mockVerifyAdmin.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    const { POST } = await import("@/app/api/maps/[slug]/review/state/route");
    const res = await POST(post({ admin_token: "bad" }), ctx);
    expect(res.status).toBe(404);
    expect(mockRecordAudit.mock.calls[0][0]).toMatchObject({ action: "admin.auth_fail", details: { slug: "abc123", route: "review.state" } });
    expect(mockLoadState).not.toHaveBeenCalled();
  });

  it("returns the full review state and the hide reason with a valid token, without auditing", async () => {
    mockVerifyAdmin.mockResolvedValue({ ok: true, mapId: "m1" });
    mockLoadState.mockResolvedValue(state);
    mockMapsSelect.mockResolvedValue({ data: { directory_hidden: true, directory_hidden_reason: "신고 확인" }, error: null });
    const { POST } = await import("@/app/api/maps/[slug]/review/state/route");
    const res = await POST(post({ admin_token: "t" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, state, directory: { hidden: true, reason: "신고 확인" } });
    expect(mockLoadState).toHaveBeenCalledWith("m1");
    expect(mockMapsSelect.mock.calls[0][0]).toMatchObject({ table: "maps", cols: "directory_hidden, directory_hidden_reason", key: "id", value: "m1" });
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("uses the per-slug read limit bucket instead of the write-attempt one", async () => {
    const { LIMITS } = await import("@/lib/rate-limit");
    const { POST } = await import("@/app/api/maps/[slug]/review/state/route");
    await POST(post({}), ctx);
    expect(mockRateLimit).toHaveBeenCalledTimes(1);
    const [, prefix, limit] = mockRateLimit.mock.calls[0];
    expect(prefix).toBe("review-admin_read-abc123");
    expect(limit).toEqual(LIMITS.adminRead);
    expect(limit).not.toEqual(LIMITS.adminAttempt);
  });

  it("answers 429 with Retry-After when the read bucket is exhausted", async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 4000 });
    const { POST } = await import("@/app/api/maps/[slug]/review/state/route");
    const res = await POST(post({ admin_token: "t" }), ctx);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("4");
    expect(mockVerifyAdmin).not.toHaveBeenCalled();
  });

  it("returns 500 STATE_FAILED when the maps select errors", async () => {
    mockVerifyAdmin.mockResolvedValue({ ok: true, mapId: "m1" });
    mockLoadState.mockResolvedValue(state);
    mockMapsSelect.mockResolvedValue({ data: null, error: { message: "connection reset" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/maps/[slug]/review/state/route");
    const res = await POST(post({ admin_token: "t" }), ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: { code: "STATE_FAILED", message: "지도 상태를 불러오지 못했습니다." } });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("defaults the directory block when the map row is missing", async () => {
    mockVerifyAdmin.mockResolvedValue({ ok: true, mapId: "m1" });
    mockLoadState.mockResolvedValue(state);
    mockMapsSelect.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("@/app/api/maps/[slug]/review/state/route");
    const json = await (await POST(post({ admin_token: "t" }), ctx)).json();
    expect(json.directory).toEqual({ hidden: false, reason: null });
  });
});
