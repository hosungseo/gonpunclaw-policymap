import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

describe("rateLimitRequest", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRpc.mockReset();
  });

  it("uses the database rate limit bucket when the RPC is available", async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ allowed: false, retry_after_ms: 1200 }], error: null });
    const { rateLimitRequest } = await import("@/lib/rate-limit");
    const req = new Request("http://localhost", { headers: { "x-forwarded-for": "203.0.113.5" } });

    const result = await rateLimitRequest(req, "upload", { limit: 3, windowMs: 60_000 });

    expect(result).toEqual({ allowed: false, retryAfterMs: 1200 });
    expect(mockRpc).toHaveBeenCalledWith("take_rate_limit", {
      p_key: "upload:203.0.113.5",
      p_limit: 3,
      p_window_seconds: 60,
    });
  });
});
