import { describe, expect, it } from "vitest";
import { generateUploadJobToken, hashUploadJobToken, verifyUploadJobToken } from "@/lib/upload/job-token";

describe("upload job token", () => {
  it("generates opaque tokens and verifies only matching hashes", () => {
    const token = generateUploadJobToken();
    const hash = hashUploadJobToken(token, "pepper");

    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyUploadJobToken(token, hash, "pepper")).toBe(true);
    expect(verifyUploadJobToken("wrong-token", hash, "pepper")).toBe(false);
  });
});
