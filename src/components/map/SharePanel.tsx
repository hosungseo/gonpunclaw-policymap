"use client";

import { useState } from "react";
import { buildEmbedSnippet, buildMapUrl, resolveOrigin } from "@/lib/share/embed";

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type CopyKey = "link" | "embed" | "api";

export function SharePanel({
  slug,
  title,
  search,
  origin,
  apiAvailable,
}: {
  slug: string;
  title: string;
  /** Current filter state as a query string without the leading "?". */
  search: string;
  origin?: string;
  apiAvailable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<CopyKey | "fail" | null>(null);
  const base = origin ?? resolveOrigin();
  const mapUrl = buildMapUrl(base, slug, search);
  const apiUrl = `${base}/api/public/maps/${slug}`;
  const snippet = buildEmbedSnippet({ origin: base, slug, title, search });

  async function copy(key: CopyKey, text: string) {
    const ok = await copyText(text);
    setCopied(ok ? key : "fail");
    window.setTimeout(() => setCopied(null), 1600);
  }

  const itemClass = "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800";

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-9 items-center rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        {copied === "fail" ? "복사 실패" : copied ? "복사됨" : "공유"}
      </button>
      {open && (
        <div role="dialog" aria-label="공유 옵션" className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <button type="button" className={itemClass} onClick={() => void copy("link", mapUrl)}>
            <span>현재 보기 링크 복사</span>
            <span className="text-[11px] font-normal text-zinc-500">{copied === "link" ? "복사됨" : "필터 포함"}</span>
          </button>
          <button type="button" className={itemClass} onClick={() => void copy("embed", snippet)}>
            <span>임베드 코드 복사</span>
            <span className="text-[11px] font-normal text-zinc-500">{copied === "embed" ? "복사됨" : "iframe"}</span>
          </button>
          {apiAvailable && (
            <button type="button" className={itemClass} onClick={() => void copy("api", apiUrl)}>
              <span>데이터 API 주소 복사</span>
              <span className="text-[11px] font-normal text-zinc-500">{copied === "api" ? "복사됨" : "JSON"}</span>
            </button>
          )}
          <p className="px-3 pb-1 pt-2 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
            링크와 임베드는 현재 선택한 분류·값 범위·검색어·보기 상태를 그대로 엽니다.
          </p>
        </div>
      )}
    </div>
  );
}
