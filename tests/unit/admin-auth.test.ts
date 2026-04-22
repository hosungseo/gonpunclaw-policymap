import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashAdminToken } from "@/lib/tokens";

const mockSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mockSingle,
        }),
      }),
    }),
  }),
}));

describe("verifyAdminTokenForMap", () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN_PEPPER = "test-pepper";
    mockSingle.mockReset();
  });

  it("returns map when token matches", async () => {
    const token = "valid-token-abc123";
    const hash = hashAdminToken(token, "test-pepper");
    mockSingle.mockResolvedValueOnce({ data: { id: "mid", admin_token_hash: hash }, error: null });

    const { verifyAdminTokenForMap } = await import("@/lib/admin-auth");
    const r = await verifyAdminTokenForMap("slug", token);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mapId).toBe("mid");
  });

  it("returns not-found when hash mismatches", async () => {
    const storedHash = hashAdminToken("real-token", "test-pepper");
    mockSingle.mockResolvedValueOnce({ data: { id: "mid", admin_token_hash: storedHash }, error: null });

    const { verifyAdminTokenForMap } = await import("@/lib/admin-auth");
    const r = await verifyAdminTokenForMap("slug", "wrong-token");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_FOUND");
  });

  it("returns not-found when map row is missing", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: null });
    const { verifyAdminTokenForMap } = await import("@/lib/admin-auth");
    const r = await verifyAdminTokenForMap("missing-slug", "anything");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_FOUND");
  });

  it("fails with MISSING_PEPPER when env var absent", async () => {
    delete process.env.ADMIN_TOKEN_PEPPER;
    const { verifyAdminTokenForMap } = await import("@/lib/admin-auth");
    const r = await verifyAdminTokenForMap("slug", "token");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MISSING_PEPPER");
  });
});
