"use client";

import { useEffect, useRef, useState } from "react";
import { buildApiUrl, buildEmbedSnippet, buildMapUrl, resolveOrigin } from "@/lib/share/embed";

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

const COPIED_RESET_MS = 1600;

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
  // Text the user can copy by hand when the clipboard API is unavailable or refused.
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const resetTimerRef = useRef<number | null>(null);
  const base = origin ?? resolveOrigin();
  const mapUrl = buildMapUrl(base, slug, search);
  const apiUrl = buildApiUrl(base, slug);
  const snippet = buildEmbedSnippet({ origin: base, slug, title, search });

  // Close on Escape or on a pointer press outside the panel while it is open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => () => clearResetTimer(), []);

  function clearResetTimer() {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }

  function close() {
    setOpen(false);
    setFallbackText(null);
  }

  async function copy(key: CopyKey, text: string) {
    const ok = await copyText(text);
    clearResetTimer();
    setCopied(ok ? key : "fail");
    setFallbackText(ok ? null : text);
    resetTimerRef.current = window.setTimeout(() => {
      resetTimerRef.current = null;
      setCopied(null);
    }, COPIED_RESET_MS);
  }

  const itemClass = "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
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
          {fallbackText !== null && (
            <div className="px-3 pt-2">
              <p className="text-[11px] leading-4 text-red-700 dark:text-red-300">자동 복사에 실패했습니다. 아래 내용을 직접 복사해 주세요.</p>
              <input
                type="text"
                readOnly
                value={fallbackText}
                aria-label="복사할 내용"
                onFocus={(event) => event.currentTarget.select()}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-2 py-1.5 font-mono text-[11px] text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          )}
          <p className="px-3 pb-1 pt-2 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
            링크와 임베드는 현재 선택한 분류·값 범위·검색어·보기 상태를 그대로 엽니다.
          </p>
        </div>
      )}
    </div>
  );
}
