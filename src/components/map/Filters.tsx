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
  return (
    <div className="space-y-4">
      {categories.length > 0 && (
        <section>
          <h3 className="text-sm font-medium">{categoryLabel ?? "분류"}</h3>
          <ul className="mt-2 space-y-1">
            {categories.map((c) => (
              <li key={c.name}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.has(c.name)} onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(c.name); else next.delete(c.name);
                    setSelectedCategories(next.size === categories.length ? null : next);
                  }} />
                  <span>{c.name}</span>
                  <span className="ml-auto text-zinc-500">{c.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      {valueRange && (
        <section>
          <h3 className="text-sm font-medium">{valueLabel ?? "값"} 범위</h3>
          <div className="mt-2 text-xs text-zinc-600">
            {(currentValueRange ?? valueRange)[0].toLocaleString()} ~ {(currentValueRange ?? valueRange)[1].toLocaleString()}
          </div>
          <div className="mt-3 space-y-3">
            <label className="block">
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                <span>최소값</span>
                <span>{(currentValueRange ?? valueRange)[0].toLocaleString()}</span>
              </div>
              <input type="range" min={valueRange[0]} max={valueRange[1]}
                value={(currentValueRange ?? valueRange)[0]}
                onChange={(e) => {
                  const lo = Number(e.target.value); const hi = (currentValueRange ?? valueRange)[1];
                  setCurrentValueRange([Math.min(lo, hi), hi]);
                }} className="w-full" aria-label="최소값" />
            </label>
            <label className="block">
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                <span>최대값</span>
                <span>{(currentValueRange ?? valueRange)[1].toLocaleString()}</span>
              </div>
              <input type="range" min={valueRange[0]} max={valueRange[1]}
                value={(currentValueRange ?? valueRange)[1]}
                onChange={(e) => {
                  const hi = Number(e.target.value); const lo = (currentValueRange ?? valueRange)[0];
                  setCurrentValueRange([lo, Math.max(lo, hi)]);
                }} className="w-full" aria-label="최대값" />
            </label>
          </div>
        </section>
      )}
      <p className="text-xs text-zinc-500">총 {total.toLocaleString()}곳</p>
    </div>
  );
}
