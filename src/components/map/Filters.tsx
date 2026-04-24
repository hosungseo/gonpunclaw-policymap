"use client";
import { useMemo } from "react";

export function Filters({
  categories, valueRange, valueLabel, categoryLabel,
  selectedCategories, setSelectedCategories,
  currentValueRange, setCurrentValueRange,
  total,
}: {
  categories: { name: string; count: number }[];
  valueRange: [number, number] | null;
  valueLabel: string | null;
  categoryLabel: string | null;
  selectedCategories: Set<string> | null;
  setSelectedCategories: (s: Set<string> | null) => void;
  currentValueRange: [number, number] | null;
  setCurrentValueRange: (r: [number, number] | null) => void;
  total: number;
}) {
  const selected = useMemo(() => selectedCategories ?? new Set(categories.map((c) => c.name)), [selectedCategories, categories]);
  const activeRange = currentValueRange ?? valueRange;
  const hasCustomRange = Boolean(currentValueRange && valueRange && (currentValueRange[0] !== valueRange[0] || currentValueRange[1] !== valueRange[1]));

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">현재 조건</p>
        <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">{total.toLocaleString()}곳</p>
      </div>

      {categories.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{categoryLabel ?? "분류"}</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategories(null)}
                className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                전체
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategories(new Set())}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                해제
              </button>
            </div>
          </div>
          <ul className="space-y-1.5">
            {categories.map((c) => (
              <li key={c.name}>
                <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800">
                  <input
                    type="checkbox"
                    checked={selected.has(c.name)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(c.name); else next.delete(c.name);
                      setSelectedCategories(next.size === categories.length ? null : next);
                    }}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {c.count.toLocaleString()}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {selected.size === 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              선택된 분류가 없습니다. 전체를 눌러 모든 분류를 다시 표시할 수 있습니다.
            </p>
          )}
        </section>
      )}

      {valueRange && activeRange && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{valueLabel ?? "값"} 범위</h3>
            {hasCustomRange && (
              <button
                type="button"
                onClick={() => setCurrentValueRange(null)}
                className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                초기화
              </button>
            )}
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {activeRange[0].toLocaleString()} ~ {activeRange[1].toLocaleString()}
            </div>
            <div className="mt-3 space-y-3">
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>최소값</span>
                  <span>{activeRange[0].toLocaleString()}</span>
                </div>
                <input type="range" min={valueRange[0]} max={valueRange[1]}
                  value={activeRange[0]}
                  onChange={(e) => {
                    const lo = Number(e.target.value); const hi = activeRange[1];
                    setCurrentValueRange([Math.min(lo, hi), hi]);
                  }} className="w-full accent-blue-700" aria-label="최소값" />
              </label>
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>최대값</span>
                  <span>{activeRange[1].toLocaleString()}</span>
                </div>
                <input type="range" min={valueRange[0]} max={valueRange[1]}
                  value={activeRange[1]}
                  onChange={(e) => {
                    const hi = Number(e.target.value); const lo = activeRange[0];
                    setCurrentValueRange([lo, Math.max(lo, hi)]);
                  }} className="w-full accent-blue-700" aria-label="최대값" />
              </label>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
