import { describe, expect, it } from "vitest";
import { REVIEW_CHECKLIST_KEYS, normalizeChecklist, validateDecision } from "@/lib/reviews/service";

describe("review decision validation", () => {
  it("normalizes a checklist to the four known keys", () => {
    expect(normalizeChecklist({ source: true, as_of: "yes", sensitive: 1, visibility: false, extra: true })).toEqual({ source: true, as_of: false, sensitive: false, visibility: false });
    expect(Object.keys(normalizeChecklist(null))).toEqual([...REVIEW_CHECKLIST_KEYS]);
  });

  it("requires every checklist item for approval", () => {
    const all = { source: true, as_of: true, sensitive: true, visibility: true };
    expect(validateDecision({ decision: "approve", checklist: all, comment: "" })).toBeNull();
    expect(validateDecision({ decision: "approve", checklist: { ...all, sensitive: false }, comment: "" })).toMatchObject({ code: "CHECKLIST_INCOMPLETE" });
  });

  it("requires a comment for rejection", () => {
    const none = { source: false, as_of: false, sensitive: false, visibility: false };
    expect(validateDecision({ decision: "reject", checklist: none, comment: "   " })).toMatchObject({ code: "COMMENT_REQUIRED" });
    expect(validateDecision({ decision: "reject", checklist: none, comment: "출처 URL이 깨짐" })).toBeNull();
  });

  it("rejects unknown decisions and oversized comments", () => {
    expect(validateDecision({ decision: "maybe" as never, checklist: null, comment: "" })).toMatchObject({ code: "BAD_DECISION" });
    expect(validateDecision({ decision: "reject", checklist: null, comment: "a".repeat(1001) })).toMatchObject({ code: "COMMENT_TOO_LONG" });
  });
});
