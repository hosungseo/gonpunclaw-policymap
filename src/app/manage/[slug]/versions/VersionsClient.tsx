"use client";

import Link from "next/link";
import { useState } from "react";

type ChangeSummary = {
  reason?: string;
  added?: number;
  deleted?: number;
  updated?: number;
  coordinateChanged?: number;
  includedChanged?: number;
  changedRows?: number[];
};

type Version = {
  id: string;
  version_number: number;
  status: "draft" | "published" | "archived";
  reason: string;
  change_summary: ChangeSummary | null;
  created_at: string;
  published_at: string | null;
};

type Status = { kind: "idle" | "loading" | "restoring" | "ready" | "error"; message?: string };

export function VersionsClient({ slug }: { slug: string }) {
  const [token, setToken] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function loadVersions(event?: React.FormEvent) {
    event?.preventDefault();
    if (!token.trim()) {
      setStatus({ kind: "error", message: "관리 토큰을 입력해 주세요." });
      return;
    }
    setStatus({ kind: "loading" });
    try {
      const response = await fetch(`/api/maps/${slug}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_token: token }),
      });
      const json = await response.json().catch(() => null) as { ok?: boolean; versions?: Version[]; error?: { message?: string } } | null;
      if (!response.ok || !json?.ok) {
        setStatus({ kind: "error", message: json?.error?.message ?? "버전 목록을 불러오지 못했습니다." });
        return;
      }
      setVersions(json.versions ?? []);
      setStatus({ kind: "ready" });
    } catch {
      setStatus({ kind: "error", message: "네트워크 오류가 발생했습니다." });
    }
  }

  async function restore(version: Version) {
    if (!token.trim() || !window.confirm(`버전 ${version.version_number}으로 복원할까요? 현재 데이터는 새 버전으로 먼저 보존됩니다.`)) return;
    setStatus({ kind: "restoring" });
    try {
      const response = await fetch(`/api/maps/${slug}/versions/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_token: token, version_id: version.id, confirmed: true }),
      });
      const json = await response.json().catch(() => null) as { ok?: boolean; error?: { message?: string } } | null;
      if (!response.ok || !json?.ok) {
        setStatus({ kind: "error", message: json?.error?.message ?? "버전 복원에 실패했습니다." });
        return;
      }
      await loadVersions();
      setStatus({ kind: "ready", message: `버전 ${version.version_number}을 복원했습니다. 새 버전 이력이 생성되었습니다.` });
    } catch {
      setStatus({ kind: "error", message: "네트워크 오류가 발생했습니다." });
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={loadVersions} className="flex flex-col gap-3 border-b border-zinc-200 pb-6 dark:border-zinc-800 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1 text-sm">
          <span className="block font-medium">관리 토큰</span>
          <input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900" />
        </label>
        <button type="submit" disabled={status.kind === "loading" || status.kind === "restoring"} className="min-h-11 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950">
          {status.kind === "loading" ? "불러오는 중…" : "버전 불러오기"}
        </button>
      </form>

      {status.message && <p className={`rounded-lg border px-3 py-2 text-sm ${status.kind === "error" ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"}`}>{status.message}</p>}

      {versions.length === 0 && status.kind !== "idle" && status.kind !== "loading" && status.kind !== "error" && (
        <p className="border-t border-zinc-200 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800">아직 저장된 버전이 없습니다. 다음 발행·데이터 교체부터 이력이 쌓입니다.</p>
      )}

      {versions.length > 0 && (
        <ol className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {versions.map((version, index) => {
            const summary = version.change_summary ?? {};
            return (
              <li key={version.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">버전 {version.version_number}</h2>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{version.status === "published" ? "공개 당시" : "관리 중"}</span>
                    {index === 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">최신</span>}
                  </div>
                  <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">{version.reason || "변경 사유 없음"}</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{new Date(version.created_at).toLocaleString("ko-KR")}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                    <span>추가 {summary.added ?? 0}</span>
                    <span>삭제 {summary.deleted ?? 0}</span>
                    <span>변경 {summary.updated ?? 0}</span>
                    <span>좌표 변경 {summary.coordinateChanged ?? 0}</span>
                    <span>포함 여부 변경 {summary.includedChanged ?? 0}</span>
                  </div>
                </div>
                {index !== 0 && (
                  <button type="button" onClick={() => restore(version)} disabled={status.kind === "restoring"} className="min-h-10 shrink-0 rounded-lg border border-amber-300 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950">
                    {status.kind === "restoring" ? "복원 중…" : "이 버전 복원"}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <Link href={`/manage/${slug}`} className="inline-flex text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">관리 페이지로 돌아가기</Link>
    </div>
  );
}
