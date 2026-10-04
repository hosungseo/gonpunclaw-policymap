"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { formatKoreanDate } from "@/lib/maps/metadata";
import type { ManageReviewStatus } from "@/lib/reviews/gate";

/** Only the review fields the manage page renders; the server never ships ids, hashes or checklists. */
export type ManagedReviewLatest = {
  status: "pending" | "approved" | "rejected";
  version_number: number | null;
  created_at: string;
  decided_at: string | null;
  reviewer_label: string | null;
  comment: string;
};

export type ManagedReview = {
  required: boolean;
  hasToken: boolean;
  status: ManageReviewStatus;
  latest: ManagedReviewLatest | null;
  currentVersionNumber: number | null;
  approvedVersionNumber: number | null;
};

export const EMPTY_REVIEW: ManagedReview = {
  required: false,
  hasToken: false,
  status: "none",
  latest: null,
  currentVersionNumber: null,
  approvedVersionNumber: null,
};

type ReviewActionStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

const REVIEW_STATUS_LABEL: Record<ManagedReview["status"], string> = {
  none: "요청 없음",
  pending: "검토 대기",
  rejected: "반려됨",
  approved: "승인됨",
  stale: "재검토 필요",
};

const COPIED_RESET_MS = 1600;

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ReviewSection({
  slug,
  token,
  review,
  setReview,
}: {
  slug: string;
  token: string;
  review: ManagedReview;
  setReview: Dispatch<SetStateAction<ManagedReview>>;
}) {
  const [status, setStatus] = useState<ReviewActionStatus>({ kind: "idle" });
  const [issued, setIssued] = useState<{ token: string; url: string } | null>(null);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    },
    [],
  );

  async function copyLink(url: string) {
    const ok = await copyText(url);
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    setCopied(ok ? "ok" : "fail");
    // Leave the manual-copy fallback visible; only the "copied" confirmation times out.
    if (ok) {
      resetTimerRef.current = window.setTimeout(() => {
        resetTimerRef.current = null;
        setCopied(null);
      }, COPIED_RESET_MS);
    }
  }

  async function callApi(path: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    if (!token.trim()) {
      setStatus({ kind: "error", message: "관리 토큰을 입력해 주세요." });
      return null;
    }
    setStatus({ kind: "submitting" });
    let res: Response;
    try {
      res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_token: token, ...body }),
      });
    } catch {
      setStatus({ kind: "error", message: "네트워크 오류가 발생했습니다." });
      return null;
    }
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !json || json.ok !== true) {
      const message = (json?.error as { message?: string } | undefined)?.message ?? "요청에 실패했습니다.";
      setStatus({ kind: "error", message });
      return null;
    }
    return json;
  }

  async function updateSettings(required: boolean, rotate = false) {
    const json = await callApi(`/api/maps/${slug}/review/settings`, { review_required: required, rotate_token: rotate });
    if (!json) return;
    const reviewToken = typeof json.review_token === "string" ? json.review_token : null;
    const reviewUrl = typeof json.review_url === "string" ? json.review_url : null;
    // The server keeps the existing hash when re-enabling, so no new token is issued.
    const keptExistingLink = required && !reviewToken && review.hasToken;
    setReview((r) => ({ ...r, required, hasToken: r.hasToken || Boolean(reviewToken) }));
    if (reviewToken && reviewUrl) {
      setIssued({ token: reviewToken, url: reviewUrl });
      setCopied(null);
    }
    setStatus({
      kind: "success",
      message: rotate
        ? "검토 링크를 재발급했습니다. 이전 링크는 더 이상 사용할 수 없습니다."
        : keptExistingLink
          ? "검토 필수를 켰습니다. 이전에 발급한 검토 링크가 계속 유효합니다. 새 링크가 필요하면 재발급하세요."
          : required
            ? "공개 전 검토 필수가 켜졌습니다."
            : "공개 전 검토 필수가 꺼졌습니다. 기존 승인 기록은 유지됩니다.",
    });
  }

  async function requestReview() {
    const json = await callApi(`/api/maps/${slug}/review/request`, { note });
    if (!json) return;
    const created = json.review as { version_number?: number | null } | undefined;
    setReview((r) => ({
      ...r,
      status: "pending",
      // A first request may capture the map's first version; surface it as the current one.
      currentVersionNumber: r.currentVersionNumber ?? created?.version_number ?? null,
      latest: {
        status: "pending",
        version_number: created?.version_number ?? r.currentVersionNumber,
        created_at: new Date().toISOString(),
        decided_at: null,
        reviewer_label: null,
        comment: "",
      },
    }));
    setNote("");
    setStatus({ kind: "success", message: "검토 요청을 보냈습니다. 검토 링크를 검토자에게 전달하세요." });
  }

  const latest = review.latest;
  const requestedOn = review.status === "pending" && latest ? formatKoreanDate(latest.created_at) : null;
  const decidedOn = latest?.decided_at ? formatKoreanDate(latest.decided_at) : null;

  return (
    <section id="review-section" className="space-y-5 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">검토·승인</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          켜두면 비공개 → 공개/링크 공개 전환 전에 검토자의 승인이 필요합니다. 검토자는 계정 없이 검토 링크만으로 승인·반려합니다.
        </p>
        <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          검토 링크는 검토자에게만 전달하세요. 소유자가 직접 승인하면 검토의 의미가 없습니다. 승인 뒤에 데이터를 교체·복원하거나 출처·출처 URL·기준일·담당 부서를 수정하면 승인이 무효가 되어 다시 검토를 받아야 합니다.
        </p>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="text-sm font-medium">공개 전 검토 필수</span>
        <input
          type="checkbox"
          checked={review.required}
          disabled={status.kind === "submitting"}
          onChange={(e) => void updateSettings(e.target.checked)}
          className="h-4 w-4 accent-blue-700"
        />
      </label>

      {issued && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-4 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-semibold">검토 링크 (한 번만 표시됩니다 — 지금 복사해 검토자에게 전달하세요)</p>
          {copied === "fail" ? (
            <input
              type="text"
              readOnly
              value={issued.url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="검토 링크"
              className="w-full rounded border border-amber-300 bg-white px-2 py-1 font-mono text-[11px] text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
            />
          ) : (
            <code className="block break-all rounded bg-white px-2 py-1 text-[11px] text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">{issued.url}</code>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void copyLink(issued.url)} className="rounded border border-amber-400 px-2 py-1 font-medium">
              {copied === "ok" ? "복사됨" : "링크 복사"}
            </button>
            {copied === "fail" && <span>링크를 직접 선택해 복사하세요</span>}
          </div>
          <p>검토 필수를 끄더라도 링크는 유지됩니다.</p>
        </div>
      )}

      {review.required && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium dark:bg-zinc-900">{REVIEW_STATUS_LABEL[review.status]}</span>
            {latest?.version_number != null && <span className="text-zinc-500">요청 버전 v{latest.version_number}</span>}
            {review.currentVersionNumber != null && <span className="text-zinc-500">현재 버전 v{review.currentVersionNumber}</span>}
            {requestedOn && <span className="text-zinc-500">요청 {requestedOn}</span>}
            {decidedOn && (
              <span className="text-zinc-500">
                결정 {decidedOn}
                {latest?.reviewer_label ? ` · ${latest.reviewer_label}` : ""}
              </span>
            )}
          </div>

          {review.status === "stale" && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
              승인 이후 데이터가 바뀌어 재검토가 필요합니다. 공개 지도에는 &lsquo;검토 대기&rsquo;로 표시됩니다.
            </p>
          )}
          {review.status === "rejected" && latest?.comment && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
              <p className="text-xs font-semibold">반려 의견</p>
              <p className="mt-1 whitespace-pre-wrap">{latest.comment}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="review-note">
              검토 요청 메모 <span className="text-xs font-normal text-zinc-500">(선택, 500자)</span>
            </label>
            <input
              id="review-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="예: 3월 취합본 반영, 공개 전 확인 부탁드립니다"
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void requestReview()}
                disabled={status.kind === "submitting"}
                className="inline-flex items-center rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
              >
                검토 요청
              </button>
              <button
                type="button"
                onClick={() => void updateSettings(true, true)}
                disabled={status.kind === "submitting"}
                className="inline-flex items-center rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
              >
                검토 링크 재발급
              </button>
            </div>
            <p className="text-xs text-zinc-500">재발급하면 이전 검토 링크는 즉시 무효가 됩니다.</p>
          </div>
        </div>
      )}

      {status.kind === "error" && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {status.message}
        </p>
      )}
      {status.kind === "success" && (
        <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {status.message}
        </p>
      )}
    </section>
  );
}
