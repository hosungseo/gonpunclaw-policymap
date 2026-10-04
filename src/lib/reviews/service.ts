import { supabaseServer } from "@/lib/supabase/server";
import { captureMapVersion } from "@/lib/versions";
import { generateReviewToken, hashReviewToken } from "@/lib/reviews/tokens";
import { manageReviewStatus, type ManageReviewStatus, type ReviewGateFields } from "@/lib/reviews/gate";

export const REVIEW_CHECKLIST_KEYS = ["source", "as_of", "sensitive", "visibility"] as const;
export type ReviewChecklistKey = (typeof REVIEW_CHECKLIST_KEYS)[number];
export type ReviewChecklist = Record<ReviewChecklistKey, boolean>;
export type ReviewDecision = "approve" | "reject";

export const REVIEW_CHECKLIST_LABELS: Record<ReviewChecklistKey, string> = {
  source: "자료 출처와 출처 URL을 확인했습니다.",
  as_of: "자료 기준일이 맞고 최신 자료입니다.",
  sensitive: "공개 추가정보에 개인정보·민감정보가 없습니다.",
  visibility: "요청한 공개 범위가 적절합니다.",
};

const COMMENT_MAX = 1000;
const LABEL_MAX = 40;
const NOTE_MAX = 500;

export type ServiceError = { code: string; message: string };

export function normalizeChecklist(raw: unknown): ReviewChecklist {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(REVIEW_CHECKLIST_KEYS.map((key) => [key, source[key] === true])) as ReviewChecklist;
}

export function validateDecision(input: { decision: ReviewDecision; checklist: unknown; comment: string }): ServiceError | null {
  if (input.decision !== "approve" && input.decision !== "reject") return { code: "BAD_DECISION", message: "결정 값은 approve 또는 reject 여야 합니다." };
  if (input.comment.length > COMMENT_MAX) return { code: "COMMENT_TOO_LONG", message: `의견은 ${COMMENT_MAX}자 이하로 입력해 주세요.` };
  const checklist = normalizeChecklist(input.checklist);
  if (input.decision === "approve" && REVIEW_CHECKLIST_KEYS.some((key) => !checklist[key])) {
    return { code: "CHECKLIST_INCOMPLETE", message: "승인하려면 체크리스트 4개 항목을 모두 확인해야 합니다." };
  }
  if (input.decision === "reject" && !input.comment.trim()) return { code: "COMMENT_REQUIRED", message: "반려할 때는 의견을 입력해 주세요." };
  return null;
}

export interface ReviewRow {
  id: string;
  status: "pending" | "approved" | "rejected";
  version_id: string | null;
  request_note: string;
  checklist: Record<string, unknown>;
  comment: string;
  reviewer_label: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface ReviewState {
  required: boolean;
  hasToken: boolean;
  status: ManageReviewStatus;
  latest: (ReviewRow & { version_number: number | null }) | null;
  currentVersionNumber: number | null;
  approvedVersionNumber: number | null;
}

/** Owner/reviewer-facing state for a map. */
export async function loadReviewState(mapId: string): Promise<ReviewState> {
  const sb = supabaseServer();
  const [{ data: map }, { data: latest }] = await Promise.all([
    sb.from("maps").select("review_required, review_token_hash, approved_version_id, current_version_id").eq("id", mapId).single(),
    sb.from("map_reviews").select("id, status, version_id, request_note, checklist, comment, reviewer_label, created_at, decided_at").eq("map_id", mapId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const fields: ReviewGateFields = {
    review_required: map?.review_required ?? false,
    approved_version_id: map?.approved_version_id ?? null,
    current_version_id: map?.current_version_id ?? null,
  };
  const versionIds = [latest?.version_id, fields.current_version_id, fields.approved_version_id].filter((v): v is string => Boolean(v));
  const versions = new Map<string, number>();
  if (versionIds.length > 0) {
    const { data } = await sb.from("map_versions").select("id, version_number").in("id", Array.from(new Set(versionIds)));
    for (const v of data ?? []) versions.set(v.id, v.version_number);
  }
  const latestRow = latest as ReviewRow | null;
  return {
    required: Boolean(fields.review_required),
    hasToken: Boolean(map?.review_token_hash),
    status: manageReviewStatus(fields, latestRow),
    latest: latestRow ? { ...latestRow, version_number: latestRow.version_id ? versions.get(latestRow.version_id) ?? null : null } : null,
    currentVersionNumber: fields.current_version_id ? versions.get(fields.current_version_id) ?? null : null,
    approvedVersionNumber: fields.approved_version_id ? versions.get(fields.approved_version_id) ?? null : null,
  };
}

/**
 * Toggle review_required. A token is issued when enabling without one, or when rotate is requested.
 * The plaintext token is returned exactly once.
 */
export async function updateReviewSettings({ mapId, reviewRequired, rotate }: { mapId: string; reviewRequired: boolean; rotate: boolean }): Promise<{ review_required: boolean; review_token: string | null; rotated: boolean }> {
  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  if (!pepper) throw new Error("ADMIN_TOKEN_PEPPER missing");
  const sb = supabaseServer();
  const { data: map } = await sb.from("maps").select("review_token_hash").eq("id", mapId).single();
  const needsToken = reviewRequired && (rotate || !map?.review_token_hash);
  const token = needsToken ? generateReviewToken() : null;
  const update: Record<string, unknown> = { review_required: reviewRequired, updated_at: new Date().toISOString() };
  if (token) update.review_token_hash = hashReviewToken(token, pepper);
  const { error } = await sb.from("maps").update(update).eq("id", mapId);
  if (error) throw new Error(error.message);
  return { review_required: reviewRequired, review_token: token, rotated: Boolean(token) };
}

async function versionNumberOf(versionId: string | null): Promise<number | null> {
  if (!versionId) return null;
  const { data } = await supabaseServer().from("map_versions").select("version_number").eq("id", versionId).maybeSingle();
  return (data?.version_number as number | undefined) ?? null;
}

/** A review always points at a concrete version; capture one if the map has none yet. */
async function resolveReviewVersion(mapId: string, currentVersionId: string | null, actorToken: string | null): Promise<{ id: string; version_number: number | null }> {
  if (!currentVersionId) {
    const version = await captureMapVersion({ mapId, reason: "검토 요청", actorToken });
    return { id: version.id as string, version_number: version.version_number as number };
  }
  return { id: currentVersionId, version_number: await versionNumberOf(currentVersionId) };
}

// Postgres unique_violation: a concurrent request already inserted the one allowed pending row.
const PG_UNIQUE_VIOLATION = "23505";

export type RequestReviewResult =
  | { ok: true; review: { id: string; status: "pending"; version_number: number | null } }
  | { ok: false; code: string; message: string };

export async function requestReview({ mapId, note, actorToken }: { mapId: string; note: string; actorToken: string | null }): Promise<RequestReviewResult> {
  const sb = supabaseServer();
  const { data: map } = await sb.from("maps").select("review_required, current_version_id").eq("id", mapId).single();
  if (!map?.review_required) return { ok: false, code: "REVIEW_NOT_ENABLED", message: "먼저 '공개 전 검토 필수'를 켜 주세요." };

  const resolved = await resolveReviewVersion(mapId, map.current_version_id as string | null, actorToken).then(
    (target) => ({ ok: true as const, target }),
    (err: unknown) => ({ ok: false as const, message: err instanceof Error ? err.message : "검토 대상 버전을 저장하지 못했습니다." }),
  );
  if (!resolved.ok) return { ok: false, code: "VERSION_CAPTURE_FAILED", message: resolved.message };
  const { target } = resolved;

  // Keep at most one pending review per map (the partial unique index enforces this under concurrency).
  await sb.from("map_reviews").delete().eq("map_id", mapId).eq("status", "pending");
  const { data: review, error } = await sb.from("map_reviews").insert({
    map_id: mapId,
    version_id: target.id,
    status: "pending",
    request_note: note.trim().slice(0, NOTE_MAX),
  }).select("id").single();
  if (error?.code === PG_UNIQUE_VIOLATION) {
    const { data: existing } = await sb.from("map_reviews").select("id, version_id").eq("map_id", mapId).eq("status", "pending").maybeSingle();
    if (existing) return { ok: true, review: { id: existing.id, status: "pending", version_number: await versionNumberOf(existing.version_id ?? null) } };
  }
  if (error || !review) return { ok: false, code: "REQUEST_FAILED", message: error?.message ?? "검토 요청을 저장하지 못했습니다." };
  return { ok: true, review: { id: review.id, status: "pending", version_number: target.version_number } };
}

export const VERSION_CHANGED_PREFIX = "[자동 반려] 요청 이후 데이터가 바뀌었습니다.";

export type DecideReviewResult =
  | { ok: true; review: { id: string; status: "approved" | "rejected"; version_id: string | null } }
  // `review` is present for VERSION_CHANGED so the route can audit the auto-rejection it caused.
  | { ok: false; code: string; message: string; review?: { id: string; version_id: string | null } };

export async function decideReview({ mapId, decision, checklist, comment, reviewerLabel, reviewerIpHash }: {
  mapId: string;
  decision: ReviewDecision;
  checklist: ReviewChecklist;
  comment: string;
  reviewerLabel: string | null;
  reviewerIpHash: string | null;
}): Promise<DecideReviewResult> {
  const sb = supabaseServer();
  const { data: pending } = await sb.from("map_reviews").select("id, version_id").eq("map_id", mapId).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!pending) return { ok: false, code: "NO_PENDING_REVIEW", message: "대기 중인 검토 요청이 없습니다. 소유자에게 검토 요청을 다시 보내 달라고 알려 주세요." };

  const now = new Date().toISOString();
  const decidedFields = {
    checklist,
    reviewer_label: reviewerLabel ? reviewerLabel.trim().slice(0, LABEL_MAX) : null,
    reviewer_ip_hash: reviewerIpHash,
    decided_at: now,
  };
  // Conditional update on status = 'pending': only one caller can flip the row, so a repeated or
  // concurrent decision reports ALREADY_DECIDED instead of silently overwriting the first one.
  const flip = async (status: "approved" | "rejected", finalComment: string) => {
    const { data, error } = await sb.from("map_reviews").update({ ...decidedFields, status, comment: finalComment })
      .eq("id", pending.id).eq("status", "pending").select("id, version_id").maybeSingle();
    if (error) return { ok: false as const, code: "DECIDE_FAILED", message: error.message };
    if (!data) return { ok: false as const, code: "ALREADY_DECIDED", message: "이미 결정된 검토 요청입니다." };
    return { ok: true as const, row: data as { id: string; version_id: string | null } };
  };

  if (decision === "approve") {
    // An approval is only meaningful for the version the reviewer actually looked at. If the live
    // version moved on since the request, auto-reject so the owner has to re-request.
    const { data: map } = await sb.from("maps").select("current_version_id").eq("id", mapId).single();
    const currentVersionId = (map?.current_version_id as string | null | undefined) ?? null;
    if (currentVersionId !== pending.version_id) {
      const trimmed = comment.trim();
      const flipped = await flip("rejected", `${VERSION_CHANGED_PREFIX}${trimmed ? ` ${trimmed}` : ""}`);
      if (!flipped.ok) return flipped;
      return {
        ok: false,
        code: "VERSION_CHANGED",
        message: "요청 이후 데이터가 바뀌었습니다. 소유자에게 검토 재요청을 부탁해 주세요.",
        review: { id: flipped.row.id, version_id: flipped.row.version_id },
      };
    }
  }

  const status = decision === "approve" ? "approved" : "rejected";
  const flipped = await flip(status, comment.trim());
  if (!flipped.ok) return flipped;

  if (status === "approved") {
    // The gate compares approved_version_id with current_version_id; approval pins the reviewed version.
    await sb.from("maps").update({ approved_version_id: flipped.row.version_id, updated_at: now }).eq("id", mapId);
  }
  return { ok: true, review: { id: flipped.row.id, status, version_id: flipped.row.version_id } };
}
