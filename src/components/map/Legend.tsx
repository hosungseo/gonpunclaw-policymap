"use client";
const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b", "#a855f7", "#22c55e", "#3b82f6"];
export function Legend({ categories, valueLabel }: { categories: string[]; valueLabel: string | null }) {
  return (
    <div className="space-y-2 text-xs">
      {categories.length > 0 && (
        <div className="space-y-1">
          {categories.map((c, i) => (
            <div key={c} className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}
      {valueLabel && <p>크기 = {valueLabel}</p>}
    </div>
  );
}
