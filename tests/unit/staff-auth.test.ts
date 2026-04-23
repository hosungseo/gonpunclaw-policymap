import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

async function loadModule() {
  return await import("@/lib/staff-auth");
}

function setEnv({ token, pepper }: { token?: string | null; pepper?: string | null }) {
  if (token === null) delete process.env.STAFF_DASHBOARD_TOKEN;
  else if (token !== undefined) process.env.STAFF_DASHBOARD_TOKEN = token;
  if (pepper === null) delete process.env.ADMIN_TOKEN_PEPPER;
  else if (pepper !== undefined) process.env.ADMIN_TOKEN_PEPPER = pepper;
}

describe("staffAuthConfig", () => {
  beforeEach(() => {
    setEnv({ token: "staff-token", pepper: "pepper" });
  });

  it("is ok when both env vars are present", async () => {
    const { staffAuthConfig } = await loadModule();
    const cfg = staffAuthConfig();
    expect(cfg.ok).toBe(true);
    if (cfg.ok) {
      expect(cfg.expected).toMatch(/^[0-9a-f]{64}$/);
      expect(cfg.expected).not.toBe("staff-token");
    }
  });

  it("returns MISSING_TOKEN when STAFF_DASHBOARD_TOKEN is missing", async () => {
    setEnv({ token: null });
    const { staffAuthConfig } = await loadModule();
    const cfg = staffAuthConfig();
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.reason).toBe("MISSING_TOKEN");
  });

  it("returns MISSING_PEPPER when ADMIN_TOKEN_PEPPER is missing", async () => {
    setEnv({ pepper: null });
    const { staffAuthConfig } = await loadModule();
    const cfg = staffAuthConfig();
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.reason).toBe("MISSING_PEPPER");
  });

  it("derives a different expected value when pepper rotates", async () => {
    const { staffAuthConfig } = await loadModule();
    const before = staffAuthConfig();
    setEnv({ pepper: "another-pepper" });
    const after = staffAuthConfig();
    expect(before.ok && after.ok).toBe(true);
    if (before.ok && after.ok) expect(before.expected).not.toBe(after.expected);
  });
});

describe("verifyStaffToken", () => {
  beforeEach(() => {
    setEnv({ token: "s3cret", pepper: "pep" });
  });

  it("accepts the configured token", async () => {
    const { verifyStaffToken } = await loadModule();
    expect(verifyStaffToken("s3cret")).toBe(true);
  });

  it("rejects a wrong token", async () => {
    const { verifyStaffToken } = await loadModule();
    expect(verifyStaffToken("nope")).toBe(false);
  });

  it("rejects when env is missing", async () => {
    setEnv({ token: null });
    const { verifyStaffToken } = await loadModule();
    expect(verifyStaffToken("s3cret")).toBe(false);
  });
});

describe("verifyStaffSessionCookie", () => {
  beforeEach(() => {
    setEnv({ token: "tok", pepper: "pep" });
  });

  it("accepts cookies that match the derived session", async () => {
    const { staffAuthConfig, verifyStaffSessionCookie } = await loadModule();
    const cfg = staffAuthConfig();
    if (!cfg.ok) throw new Error("expected ok");
    expect(verifyStaffSessionCookie(cfg.expected)).toBe(true);
  });

  it("rejects undefined / empty cookies", async () => {
    const { verifyStaffSessionCookie } = await loadModule();
    expect(verifyStaffSessionCookie(undefined)).toBe(false);
    expect(verifyStaffSessionCookie("")).toBe(false);
  });

  it("rejects the raw token value (token must not serve as session value)", async () => {
    const { verifyStaffSessionCookie } = await loadModule();
    expect(verifyStaffSessionCookie("tok")).toBe(false);
  });

  it("rejects when pepper rotated", async () => {
    const { staffAuthConfig, verifyStaffSessionCookie } = await loadModule();
    const cfg = staffAuthConfig();
    if (!cfg.ok) throw new Error("expected ok");
    setEnv({ pepper: "new-pep" });
    expect(verifyStaffSessionCookie(cfg.expected)).toBe(false);
  });
});

describe("isStaffAuthorized", () => {
  beforeEach(() => {
    setEnv({ token: "tok", pepper: "pep" });
  });

  it("returns true when cookie matches", async () => {
    const { isStaffAuthorized, staffAuthConfig, STAFF_COOKIE } = await loadModule();
    const cfg = staffAuthConfig();
    if (!cfg.ok) throw new Error("expected ok");
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: (name: string) => (name === STAFF_COOKIE ? { name, value: cfg.expected } : undefined),
    });
    expect(await isStaffAuthorized()).toBe(true);
  });

  it("returns false when cookie is absent", async () => {
    const { isStaffAuthorized } = await loadModule();
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: () => undefined,
    });
    expect(await isStaffAuthorized()).toBe(false);
  });

  it("returns false when config is broken", async () => {
    setEnv({ token: null });
    const { isStaffAuthorized } = await loadModule();
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: () => ({ name: "staff_session", value: "anything" }),
    });
    expect(await isStaffAuthorized()).toBe(false);
  });
});
