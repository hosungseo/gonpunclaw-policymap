"use client";
const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b", "#a855f7", "#22c55e", "#3b82f6"];

export function Legend({ categories, valueLabel }: { categories: string[]; valueLabel: string | null }) {
  if (categories.length === 0 && !valueLabel) {
    return <p className="text-xs text-zinc-500 dark:text-zinc-400">표시할 범례가 없습니다.</p>;
  }

  return (
    <div className="space-y-3 text-xs">
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((c, i) => (
            <span
              key={c}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="truncate">{c}</span>
            </span>
          ))}
        </div>
      )}
      {valueLabel && (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          원의 크기는 {valueLabel} 값을 기준으로 표시됩니다.
        </p>
      )}
    </div>
  );
}
