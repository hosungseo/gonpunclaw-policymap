"use client";

import { useState } from "react";

const REASON_MIN = 10;
const REASON_MAX = 500;

const CANNED_REASONS = [
  "부정확하거나 오래된 정보",
  "저작권 또는 개인정보 침해",
  "스팸 또는 광고성 콘텐츠",
  "부적절하거나 혐오적인 내용",
  "기타",
] as const;

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

export function ReportForm({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(CANNED_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const combined = `[${category}] ${detail.trim()}`.trim();
  const tooShort = combined.length < REASON_MIN;
  const tooLong = combined.length > REASON_MAX;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (tooShort || tooLong) return;
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch(`/api/maps/${encodeURIComponent(slug)}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: combined }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: { code: string; message: string } }
        | null;
      if (!res.ok || !json || json.ok !== true) {
        const message =
          (json && !json.ok && json.error?.message) ||
          (res.status === 429
            ? "신고 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
            : "신고 전송에 실패했습니다.");
        setStatus({ kind: "error", message });
        return;
      }
      setStatus({ kind: "ok" });
      setDetail("");
    } catch {
      setStatus({ kind: "error", message: "네트워크 오류가 발생했습니다." });
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        이 지도 신고하기
      </button>
    );
  }

  if (status.kind === "ok") {
    return (
      <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
        <p>신고가 접수되었습니다. 확인 후 조치하겠습니다.</p>
        <button
          type="button"
          onClick={() => {
            setStatus({ kind: "idle" });
            setOpen(false);
          }}
          className="underline"
        >
          닫기
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 text-xs">
      <label className="block">
        <span className="text-zinc-600 dark:text-zinc-400">신고 유형</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {CANNED_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-zinc-600 dark:text-zinc-400">자세한 사유</span>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          maxLength={REASON_MAX}
          placeholder="무엇이 문제인지 간단히 적어 주세요."
          className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <p className="text-[11px] text-zinc-500">
        {combined.length}/{REASON_MAX}자
        {tooShort && ` · 최소 ${REASON_MIN}자`}
      </p>
      {status.kind === "error" && (
        <p className="text-[11px] text-red-600 dark:text-red-400">{status.message}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={tooShort || tooLong || status.kind === "submitting"}
          className="rounded bg-zinc-900 px-2 py-1 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {status.kind === "submitting" ? "전송 중…" : "신고하기"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setStatus({ kind: "idle" });
          }}
          className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700"
        >
          취소
        </button>
      </div>
    </form>
  );
}
