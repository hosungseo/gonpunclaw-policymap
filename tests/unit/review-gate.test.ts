import { describe, expect, it } from "vitest";
import { manageReviewStatus, reviewGate, reviewStatus } from "@/lib/reviews/gate";

const base = { review_required: true, approved_version_id: "v1", current_version_id: "v1" };

describe("reviewStatus", () => {
  it("is none when not required", () => expect(reviewStatus({ ...base, review_required: false })).toBe("none"));
  it("is approved when approved == current", () => expect(reviewStatus(base)).toBe("approved"));
  it("is pending otherwise", () => {
    expect(reviewStatus({ ...base, approved_version_id: null })).toBe("pending");
    expect(reviewStatus({ ...base, current_version_id: "v2" })).toBe("pending");
  });
});

describe("reviewGate", () => {
  it("passes when review is not required", () => {
    expect(reviewGate({ ...base, review_required: false, visibility: "private" }, "public").ok).toBe(true);
  });
  it("passes for private targets", () => {
    expect(reviewGate({ ...base, approved_version_id: null, visibility: "private" }, "private").ok).toBe(true);
  });
  it("passes for transitions between already-public states", () => {
    expect(reviewGate({ ...base, approved_version_id: null, visibility: "unlisted" }, "public").ok).toBe(true);
  });
  it("passes private→public when the current version is approved", () => {
    expect(reviewGate({ ...base, visibility: "private" }, "unlisted").ok).toBe(true);
  });
  it("blocks private→public without a matching approval", () => {
    const result = reviewGate({ ...base, current_version_id: "v2", visibility: "private" }, "public");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("REVIEW_REQUIRED");
      expect(result.message).toContain("검토");
    }
  });
});

describe("manageReviewStatus", () => {
  it("reports none / pending / rejected / approved / stale", () => {
    expect(manageReviewStatus({ ...base, review_required: false }, null)).toBe("none");
    expect(manageReviewStatus(base, null)).toBe("none");
    expect(manageReviewStatus(base, { status: "pending" })).toBe("pending");
    expect(manageReviewStatus(base, { status: "rejected" })).toBe("rejected");
    expect(manageReviewStatus(base, { status: "approved" })).toBe("approved");
    expect(manageReviewStatus({ ...base, current_version_id: "v2" }, { status: "approved" })).toBe("stale");
  });
});
