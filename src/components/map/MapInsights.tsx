"use client";

import { useMemo } from "react";
import { insightsToCsv, summarizeMarkers, type InsightMarker } from "@/lib/dashboard/insights";

function formatNumber(value: number | null, suffix = "") {
  return value == null ? "—" : `${value.toLocaleString("ko-KR")}${suffix}`;
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function MapInsights({
  filteredMarkers,
  viewportMarkers,
  valueLabel,
  valueUnit,
}: {
  filteredMarkers: InsightMarker[];
  viewportMarkers: InsightMarker[];
  valueLabel: string | null;
  valueUnit: string | null;
}) {
  const filtered = useMemo(() => summarizeMarkers(filteredMarkers), [filteredMarkers]);
  const viewport = useMemo(() => summarizeMarkers(viewportMarkers), [viewportMarkers]);
  const hasValues = filtered.valueCount > 0;

  return (
    <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900" aria-labelledby="map-insights-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">R2 요약 대시보드</p>
          <h3 id="map-insights-heading" className="mt-1 text-sm font-semibold">현재 조건의 분포와 대표값</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">지도 이동 시 현재 화면 범위의 수치가 다시 계산됩니다.</p>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(insightsToCsv(filtered), "policymap-insights.csv")}
          className="min-h-9 shrink-0 rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          집계 CSV
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">조건 결과</p>
          <p className="mt-1 text-lg font-semibold">{filtered.total.toLocaleString()}건</p>
        </div>
        <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/50">
          <p className="text-xs text-blue-700 dark:text-blue-300">현재 지도 범위</p>
          <p className="mt-1 text-lg font-semibold text-blue-900 dark:text-blue-100">{viewport.total.toLocaleString()}건</p>
        </div>
      </div>

      {hasValues ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">{valueLabel ?? "대표값"} 합계</dt>
            <dd className="mt-0.5 font-semibold">{formatNumber(filtered.valueSum, valueUnit ?? "")}</dd>
          </div>
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">중앙값</dt>
            <dd className="mt-0.5 font-semibold">{formatNumber(filtered.valueMedian, valueUnit ?? "")}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">대표값 열이 없어 개수 중심으로 표시합니다.</p>
      )}

      {filtered.categories.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">상위 분류</p>
          <ul className="mt-2 space-y-1.5">
            {filtered.categories.slice(0, 5).map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-zinc-600 dark:text-zinc-300">{item.name}</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{item.count.toLocaleString()}건</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {filtered.regions.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">행정구역별 상위 분포</p>
          <ul className="mt-2 space-y-1.5">
            {filtered.regions.slice(0, 5).map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-zinc-600 dark:text-zinc-300">{item.name}</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{item.count.toLocaleString()}건</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
