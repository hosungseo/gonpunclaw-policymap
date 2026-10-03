// Pure helpers for the opt-in review gate. No I/O here.

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
