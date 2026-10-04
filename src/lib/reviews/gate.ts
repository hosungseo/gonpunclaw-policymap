// Pure helpers for the opt-in review gate. No I/O here.
import type { Visibility } from "@/lib/maps/metadata";

export type ReviewStatus = "approved" | "pending" | "none";

export interface ReviewGateFields {
  review_required: boolean | null;
  approved_version_id: string | null;
  current_version_id: string | null;
}

/** Public-facing status: approved only when the approved version is the live version. */
export function reviewStatus(map: ReviewGateFields): ReviewStatus {
  if (!map.review_required) return "none";
  if (map.approved_version_id && map.approved_version_id === map.current_version_id) return "approved";
  return "pending";
}

export type ReviewGateResult = { ok: true } | { ok: false; code: "REVIEW_REQUIRED"; message: string };

export const REVIEW_REQUIRED_MESSAGE = "공개 전 검토가 필요한 지도입니다. 검토 링크로 승인을 받은 뒤 공개로 전환하세요.";

/**
 * Only the private → public/unlisted transition is gated. Public ↔ unlisted and any → private pass.
 */
export function reviewGate(map: ReviewGateFields & { visibility: Visibility }, target: Visibility): ReviewGateResult {
  if (!map.review_required) return { ok: true };
  if (target === "private") return { ok: true };
  if (map.visibility !== "private") return { ok: true };
  if (reviewStatus(map) === "approved") return { ok: true };
  return { ok: false, code: "REVIEW_REQUIRED", message: REVIEW_REQUIRED_MESSAGE };
}

export type ManageReviewStatus = "none" | "pending" | "rejected" | "approved" | "stale";

/** Owner-facing status that also surfaces "approved but data changed since". */
export function manageReviewStatus(map: ReviewGateFields, latest: { status: "pending" | "approved" | "rejected" } | null): ManageReviewStatus {
  if (!map.review_required || !latest) return "none";
  if (latest.status === "pending") return "pending";
  if (latest.status === "rejected") return "rejected";
  return reviewStatus(map) === "approved" ? "approved" : "stale";
}
