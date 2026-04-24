"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LngLatBounds, type Map as MLMap } from "maplibre-gl";
import { MapView } from "@/components/map/MapView";
import { MarkerLayer, type MarkerData } from "@/components/map/MarkerLayer";
import { Filters } from "@/components/map/Filters";
import { Legend } from "@/components/map/Legend";
import { ReportForm } from "@/components/map/ReportForm";

async function copyText(text: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface MapClientProps {
  slug: string;
  title: string;
  description: string;
  valueLabel: string | null;
  valueUnit: string | null;
  categoryLabel: string | null;
  markers: MarkerData[];
}

type ViewMode = "map" | "table";

export function MapClient({ slug, title, description, valueLabel, valueUnit, categoryLabel, markers }: MapClientProps) {
  const [map, setMap] = useState<MLMap | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string> | null>(null);
  const [valueRange, setValueRange] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [focusedMarkerId, setFocusedMarkerId] = useState<string | null>(null);

  async function handleCopy() {
    const ok = await copyText(typeof window === "undefined" ? `/m/${slug}` : window.location.href);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1500);
  }

  const categoryBuckets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of markers) {
      if (!m.category) continue;
      counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [markers]);

  const baseValueRange: [number, number] | null = useMemo(() => {
    const values = markers.map((m) => m.value).filter((v): v is number => v != null);
    if (values.length === 0) return null;
    return [Math.min(...values), Math.max(...values)];
  }, [markers]);

  const filteredMarkers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return markers.filter((m) => {
      if (selectedCategories && m.category && !selectedCategories.has(m.category)) return false;
      if (valueRange && m.value != null && (m.value < valueRange[0] || m.value > valueRange[1])) return false;
      if (!q) return true;
      const haystack = [m.name, m.address_normalized, m.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [markers, searchQuery, selectedCategories, valueRange]);

  const searchResults = useMemo(() => filteredMarkers.slice(0, 8), [filteredMarkers]);

  function handleResetView() {
    if (!map || filteredMarkers.length === 0) return;
    const bounds = filteredMarkers.reduce((acc, marker) => acc.extend([marker.lng, marker.lat]), new LngLatBounds());
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 500 });
  }

  function handleFocusMarker(marker: MarkerData) {
    setViewMode("map");
    setFocusedMarkerId(marker.id);
    if (!map) return;
    map.flyTo({ center: [marker.lng, marker.lat], zoom: 13, essential: true });
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <Link href="/" className="text-sm text-zinc-600 underline dark:text-zinc-400">
          ← 처음
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          {description && (
            <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden rounded-md border border-zinc-300 p-0.5 text-xs sm:flex dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setViewMode("map")}
              className={`rounded px-2 py-1 ${viewMode === "map" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-700 dark:text-zinc-300"}`}
            >
              지도
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`rounded px-2 py-1 ${viewMode === "table" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-700 dark:text-zinc-300"}`}
            >
              표
            </button>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {copied ? "링크 복사됨" : "링크 복사"}
          </button>
          <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {filteredMarkers.length.toLocaleString()}곳
          </span>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[320px_1fr]">
        <aside className="order-2 overflow-y-auto border-t border-zinc-200 bg-zinc-50 p-4 text-sm md:order-1 md:border-r md:border-t-0 dark:border-zinc-800 dark:bg-zinc-950">
          <section>
            <h3 className="text-sm font-medium">검색</h3>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="기관명, 주소, 분류 검색"
              className="mt-2 w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="mt-2 text-xs text-zinc-500">검색 결과 {filteredMarkers.length.toLocaleString()}건</p>
            {searchQuery.trim() && (
              <div className="mt-3 space-y-2">
                {searchResults.length > 0 ? (
                  searchResults.map((marker) => (
                    <button
                      key={marker.id}
                      type="button"
                      onClick={() => handleFocusMarker(marker)}
                      className="block w-full rounded border border-zinc-200 bg-white px-3 py-2 text-left hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    >
                      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{marker.name ?? marker.address_normalized ?? "이름 없음"}</div>
                      <div className="mt-1 text-xs text-zinc-500">{marker.address_normalized ?? "주소 없음"}</div>
                    </button>
                  ))
                ) : (
                  <p className="rounded border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    검색 결과가 없습니다.
                  </p>
                )}
              </div>
            )}
          </section>

          <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <Filters
              categories={categoryBuckets}
              valueRange={baseValueRange}
              valueLabel={valueLabel}
              categoryLabel={categoryLabel}
              selectedCategories={selectedCategories}
              setSelectedCategories={setSelectedCategories}
              currentValueRange={valueRange}
              setCurrentValueRange={setValueRange}
              total={filteredMarkers.length}
            />
            <button
              type="button"
              onClick={handleResetView}
              className="mt-4 text-sm text-blue-700 underline"
            >
              전체 보기
            </button>
          </div>

          <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h3 className="text-sm font-medium">범례</h3>
            <div className="mt-2">
              <Legend categories={categoryBuckets.map((c) => c.name)} valueLabel={valueLabel} />
            </div>
          </div>
          <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <ReportForm slug={slug} />
          </div>
        </aside>

        <main className="order-1 relative md:order-2">
          <div className="flex border-b border-zinc-200 bg-white px-4 py-2 text-xs sm:hidden dark:border-zinc-800 dark:bg-zinc-950">
            <div className="grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setViewMode("map")}
                className={`rounded px-3 py-2 ${viewMode === "map" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"}`}
              >
                지도
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`rounded px-3 py-2 ${viewMode === "table" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"}`}
              >
                표
              </button>
            </div>
          </div>

          {viewMode === "map" ? (
            <>
              <MapView onReady={setMap} />
              <MarkerLayer
                map={map}
                markers={filteredMarkers}
                valueLabel={valueLabel}
                valueUnit={valueUnit}
                categoryLabel={categoryLabel}
                filterCategories={null}
                valueRange={null}
                focusedMarkerId={focusedMarkerId}
              />
            </>
          ) : (
            <div className="h-full overflow-auto bg-white p-4 dark:bg-zinc-950">
              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                  <thead className="bg-zinc-50 dark:bg-zinc-900">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">이름</th>
                      <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">주소</th>
                      {valueLabel && <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">{valueLabel}</th>}
                      {categoryLabel && <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">{categoryLabel}</th>}
                      <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">보기</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {filteredMarkers.map((marker) => (
                      <tr key={marker.id} className="bg-white dark:bg-zinc-950">
                        <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">{marker.name ?? "-"}</td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{marker.address_normalized ?? "-"}</td>
                        {valueLabel && (
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {marker.value != null ? `${marker.value.toLocaleString()}${valueUnit ?? ""}` : "-"}
                          </td>
                        )}
                        {categoryLabel && <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{marker.category ?? "-"}</td>}
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => handleFocusMarker(marker)} className="text-blue-700 underline">
                            지도에서 보기
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredMarkers.length === 0 && (
                  <div className="px-4 py-6 text-sm text-zinc-500">조건에 맞는 데이터가 없습니다.</div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
