"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LngLatBounds, type Map as MLMap } from "maplibre-gl";
import { MapView } from "@/components/map/MapView";
import { MarkerLayer, type MarkerData } from "@/components/map/MarkerLayer";
import { Filters } from "@/components/map/Filters";
import { Legend } from "@/components/map/Legend";
import { ReportForm } from "@/components/map/ReportForm";
import { filterMarkersForDisplay } from "@/components/map/filterMarkers";

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
  isDemo?: boolean;
}

type ViewMode = "map" | "table";

export function MapClient({ slug, title, description, valueLabel, valueUnit, categoryLabel, markers, isDemo = false }: MapClientProps) {
  const [map, setMap] = useState<MLMap | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string> | null>(null);
  const [valueRange, setValueRange] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [focusedMarkerId, setFocusedMarkerId] = useState<string | null>(null);
  const [showMobileTools, setShowMobileTools] = useState(false);

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
    return filterMarkersForDisplay(markers, { selectedCategories, valueRange, searchQuery });
  }, [markers, searchQuery, selectedCategories, valueRange]);

  const searchResults = useMemo(() => filteredMarkers.slice(0, 8), [filteredMarkers]);
  const hasActiveFilters = Boolean(searchQuery.trim() || selectedCategories || valueRange);

  function handleResetFilters() {
    setSearchQuery("");
    setSelectedCategories(null);
    setValueRange(null);
  }

  function handleResetView() {
    if (!map || filteredMarkers.length === 0) return;
    const bounds = filteredMarkers.reduce((acc, marker) => acc.extend([marker.lng, marker.lat]), new LngLatBounds());
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 500 });
  }

  function handleFocusMarker(marker: MarkerData) {
    setViewMode("map");
    setShowMobileTools(false);
    setFocusedMarkerId(marker.id);
    if (!map) return;
    map.flyTo({ center: [marker.lng, marker.lat], zoom: 13, essential: true });
  }

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="flex min-h-[72px] items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <Link href="/" className="shrink-0 text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100">
          ← 처음
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-base font-semibold">{title}</h1>
            {isDemo && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                샘플 데이터
              </span>
            )}
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {filteredMarkers.length.toLocaleString()} / {markers.length.toLocaleString()}곳
            </span>
          </div>
          {description && (
            <p className="mt-1 truncate text-xs text-zinc-600 dark:text-zinc-400">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden rounded-lg border border-zinc-300 bg-zinc-50 p-0.5 text-xs md:flex dark:border-zinc-700 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setViewMode("map")}
              className={`min-h-8 rounded-md px-3 font-semibold ${viewMode === "map" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-700 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-800"}`}
            >
              지도
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`min-h-8 rounded-md px-3 font-semibold ${viewMode === "table" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-700 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-800"}`}
            >
              표
            </button>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex min-h-9 items-center rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {copied ? "링크 복사됨" : "링크 복사"}
          </button>
        </div>
      </header>

      <div className="relative grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[340px_1fr]">
        <aside
          id="map-tools-panel"
          className={`order-2 overflow-y-auto border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950 md:static md:order-1 md:block md:max-h-none md:rounded-none md:border-y-0 md:border-l-0 md:border-r md:shadow-none ${showMobileTools ? "absolute inset-x-3 top-[96px] z-20 max-h-[calc(100dvh-180px)] rounded-xl border shadow-xl" : "hidden"}`}
        >
          <section className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
            <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-100">지도 사용법</h2>
            <p className="mt-2 text-xs leading-5 text-blue-800 dark:text-blue-200">
              검색으로 기관명이나 주소를 찾고, 분류와 값 범위로 좁힌 뒤 표로 확인할 수 있습니다.
            </p>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">검색</h3>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                >
                  조건 초기화
                </button>
              )}
            </div>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="기관명, 주소, 분류 검색"
              className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">조건에 맞는 위치 {filteredMarkers.length.toLocaleString()}곳</p>
            {searchQuery.trim() && (
              <div className="mt-3 space-y-2">
                {searchResults.length > 0 ? (
                  searchResults.map((marker) => (
                    <button
                      key={marker.id}
                      type="button"
                      onClick={() => handleFocusMarker(marker)}
                      className="block w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-blue-800 dark:hover:bg-blue-950"
                    >
                      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{marker.name ?? marker.address_normalized ?? "이름 없음"}</div>
                      <div className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{marker.address_normalized ?? "주소 없음"}</div>
                    </button>
                  ))
                ) : (
                  <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                    검색 결과가 없습니다.
                  </p>
                )}
              </div>
            )}
          </section>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
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
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleResetView}
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                disabled={filteredMarkers.length === 0}
              >
                지도 맞춤
              </button>
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                초기화
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-sm font-semibold">범례</h3>
            <div className="mt-2">
              <Legend categories={categoryBuckets.map((c) => c.name)} valueLabel={valueLabel} />
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            {isDemo ? (
              <div>
                <h3 className="text-sm font-semibold">샘플 지도</h3>
                <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                  업로드 없이 공개 지도 화면을 확인하는 예시입니다. 실제 지도는 엑셀 업로드 후
                  생성된 공개 링크에서 공유할 수 있습니다.
                </p>
                <Link
                  href="/upload"
                  className="mt-3 inline-flex min-h-9 items-center rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  내 데이터로 만들기
                </Link>
              </div>
            ) : (
              <ReportForm slug={slug} />
            )}
          </div>
        </aside>

        <main className="order-1 relative bg-white md:order-2 dark:bg-zinc-950">
          <div className="flex flex-col gap-2 border-b border-zinc-200 bg-white px-4 py-3 text-xs md:hidden dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <span className="min-w-0 font-semibold text-zinc-700 dark:text-zinc-300">
                {filteredMarkers.length.toLocaleString()}곳 표시 중
              </span>
              <div className="flex shrink-0 items-center gap-3">
                {hasActiveFilters && (
                  <button type="button" onClick={handleResetFilters} className="whitespace-nowrap font-medium text-blue-700 dark:text-blue-400">
                    초기화
                  </button>
                )}
                <button
                  type="button"
                  aria-controls="map-tools-panel"
                  aria-expanded={showMobileTools}
                  onClick={() => setShowMobileTools((current) => !current)}
                  className="whitespace-nowrap font-medium text-blue-700 dark:text-blue-400"
                >
                  {showMobileTools ? "검색·필터 닫기" : "검색·필터 열기"}
                </button>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setViewMode("map")}
                className={`min-h-10 rounded-lg px-3 py-2 font-semibold ${viewMode === "map" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"}`}
              >
                지도
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`min-h-10 rounded-lg px-3 py-2 font-semibold ${viewMode === "table" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"}`}
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
              <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-base font-semibold">데이터 표</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    행을 선택하면 해당 위치를 지도에서 확인할 수 있습니다.
                  </p>
                </div>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    조건 초기화
                  </button>
                )}
              </div>
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
                      <tr key={marker.id} className="bg-white transition hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900">
                        <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">{marker.name ?? "-"}</td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{marker.address_normalized ?? "-"}</td>
                        {valueLabel && (
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {marker.value != null ? `${marker.value.toLocaleString()}${valueUnit ?? ""}` : "-"}
                          </td>
                        )}
                        {categoryLabel && <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{marker.category ?? "-"}</td>}
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => handleFocusMarker(marker)} className="font-medium text-blue-700 hover:underline dark:text-blue-400">
                            지도에서 보기
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredMarkers.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    <p className="font-medium text-zinc-700 dark:text-zinc-200">조건에 맞는 데이터가 없습니다.</p>
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      조건 초기화
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
