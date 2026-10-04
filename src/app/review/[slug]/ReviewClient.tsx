"use client";

import { useEffect, useState } from "react";
import { REVIEW_CHECKLIST_KEYS, REVIEW_CHECKLIST_LABELS, type ReviewChecklist, type ReviewChecklistKey } from "@/lib/reviews/service";

type Decision = "approve" | "reject";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "done"; decision: Decision };

type DecideResponse = { ok: true } | { ok: false; error?: { code?: string; message?: string } };

const EMPTY: ReviewChecklist = { source: false, as_of: false, sensitive: false, visibility: false };
const GENERIC_ERROR = "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";

/** Query key that carries the review token in the shared link. */
const TOKEN_PARAM = "t";

/**
 * Remove the review token from the address bar without adding a history entry. The token lives only
 * in component state afterwards, so it is neither kept in browser history nor leaked as a Referer.
 */
function stripTokenFromLocation() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has(TOKEN_PARAM)) return;
  params.delete(TOKEN_PARAM);
  const search = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
}

export function ReviewDecisionForm({ slug, reviewToken, pending }: { slug: string; reviewToken: string; pending: boolean }) {
  const [checklist, setChecklist] = useState<ReviewChecklist>(EMPTY);
  const [comment, setComment] = useState("");
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Runs once on mount, before any early return, so the token is stripped even when nothing is pending.
  useEffect(() => {
    stripTokenFromLocation();
  }, []);

  const allChecked = REVIEW_CHECKLIST_KEYS.every((key) => checklist[key]);

  async function decide(decision: Decision) {
    if (decision === "reject" && !comment.trim()) {
      setStatus({ kind: "error", message: "반려할 때는 의견을 입력해 주세요." });
      return;
    }
    setStatus({ kind: "submitting" });
    let res: Response;
    try {
      res = await fetch(`/api/maps/${slug}/review/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_token: reviewToken, decision, checklist, comment, reviewer_label: label.trim() || null }),
      });
    } catch {
      setStatus({ kind: "error", message: "네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해 주세요." });
      return;
    }
    const json = (await res.json().catch(() => null)) as DecideResponse | null;
    if (!res.ok || !json?.ok) {
      // 409 conflicts (ALREADY_DECIDED / VERSION_CHANGED / NO_PENDING_REVIEW) carry an actionable message from the server.
      const serverMessage = json && json.ok === false ? json.error?.message : undefined;
      setStatus({ kind: "error", message: serverMessage || GENERIC_ERROR });
      return;
    }
    setStatus({ kind: "done", decision });
  }

  if (!pending) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        대기 중인 검토 요청이 없습니다. 소유자가 관리 페이지에서 &lsquo;검토 요청&rsquo;을 보내면 이 페이지에서 승인·반려할 수 있습니다.
      </div>
    );
  }

  if (status.kind === "done") {
    return (
      <div
        className={`rounded-lg border p-4 text-sm ${
          status.decision === "approve"
            ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
            : "border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        }`}
        role="status"
      >
        {status.decision === "approve"
          ? "승인 처리되었습니다. 소유자가 이제 공개로 전환할 수 있습니다."
          : "반려 처리되었습니다. 의견이 소유자의 관리 페이지에 표시됩니다."}
      </div>
    );
  }

  const submitting = status.kind === "submitting";

  return (
    <div className="space-y-5 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h2 className="text-lg font-semibold">검토 체크리스트</h2>
        <p className="mt-1 text-xs text-zinc-500">승인하려면 네 항목을 모두 확인해야 합니다. 반려는 의견만 있으면 됩니다.</p>
      </div>
      <ul className="space-y-2">
        {REVIEW_CHECKLIST_KEYS.map((key: ReviewChecklistKey) => (
          <li key={key}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
              <input
                type="checkbox"
                checked={checklist[key]}
                onChange={(e) => setChecklist((c) => ({ ...c, [key]: e.target.checked }))}
                className="mt-0.5 h-4 w-4 accent-blue-700"
              />
              <span>{REVIEW_CHECKLIST_LABELS[key]}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="review-comment">
            의견 <span className="text-xs font-normal text-zinc-500">(반려 시 필수, 1,000자)</span>
          </label>
          <textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={4}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="review-label">
            검토자 표시명 <span className="text-xs font-normal text-zinc-500">(선택)</span>
          </label>
          <input
            id="review-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={40}
            placeholder="예: 기획팀 검토"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      </div>
      {status.kind === "error" && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {status.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!allChecked || submitting}
          onClick={() => void decide("approve")}
          className="inline-flex min-h-10 items-center rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          승인
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void decide("reject")}
          className="inline-flex min-h-10 items-center rounded-lg border border-zinc-300 px-5 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          반려
        </button>
      </div>
    </div>
  );
}
