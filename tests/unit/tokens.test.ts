import { describe, it, expect } from "vitest";
import {
  generateSlug,
  generateAdminToken,
  hashAdminToken,
  verifyAdminToken,
  isReservedSlug,
} from "@/lib/tokens";

describe("generateSlug", () => {
  it("returns 8 lowercase alphanumeric chars", () => {
    const s = generateSlug();
    expect(s).toMatch(/^[a-z0-9]{8}$/);
  });
  it("rejects reserved words", () => {
    for (const r of ["admin", "api", "new", "m", "staff", "template"]) {
      expect(isReservedSlug(r)).toBe(true);
    }
    expect(isReservedSlug("a3f7k2m9")).toBe(false);
  });
});

describe("admin token", () => {
  it("generates 32-char URL-safe token", () => {
    const t = generateAdminToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });

  it("hash and verify roundtrip", () => {
    const pepper = "test-pepper";
    const t = generateAdminToken();
    const h = hashAdminToken(t, pepper);
    expect(verifyAdminToken(t, h, pepper)).toBe(true);
    expect(verifyAdminToken("wrong", h, pepper)).toBe(false);
  });

  it("different pepper fails verification", () => {
    const t = generateAdminToken();
    const h = hashAdminToken(t, "p1");
    expect(verifyAdminToken(t, h, "p2")).toBe(false);
  });
});
