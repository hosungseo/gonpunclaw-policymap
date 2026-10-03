import { describe, expect, it } from "vitest";
import { generateReviewToken, hashReviewToken, verifyReviewToken } from "@/lib/reviews/tokens";
import { hashAdminToken, verifyAdminToken } from "@/lib/tokens";

const pepper = "p".repeat(32);

describe("review tokens", () => {
  it("generates 32-char base64url tokens", () => {
    expect(generateReviewToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("verifies its own hash and rejects a different token", () => {
    const token = generateReviewToken();
    const hash = hashReviewToken(token, pepper);
    expect(verifyReviewToken(token, hash, pepper)).toBe(true);
    expect(verifyReviewToken(generateReviewToken(), hash, pepper)).toBe(false);
  });

  it("is domain-separated from admin tokens", () => {
    const token = generateReviewToken();
    expect(hashReviewToken(token, pepper)).not.toBe(hashAdminToken(token, pepper));
    expect(verifyAdminToken(token, hashReviewToken(token, pepper), pepper)).toBe(false);
    expect(verifyReviewToken(token, hashAdminToken(token, pepper), pepper)).toBe(false);
  });

  it("rejects null or malformed stored hashes", () => {
    expect(verifyReviewToken("x", null, pepper)).toBe(false);
    expect(verifyReviewToken("x", "", pepper)).toBe(false);
  });
});
