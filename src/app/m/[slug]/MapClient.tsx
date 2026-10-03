"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LngLatBounds, type Map as MLMap } from "maplibre-gl";
import { MapView } from "@/components/map/MapView";
import { BoundaryLayer, type BoundaryLayerStatus, type BoundaryLevel } from "@/components/map/BoundaryLayer";
import { MarkerLayer, type MarkerData } from "@/components/map/MarkerLayer";
import { Filters } from "@/components/map/Filters";
import { Legend } from "@/components/map/Legend";
import { MapInsights } from "@/components/map/MapInsights";
import { PolicyLayer, type PolicyLayerStatus, type PolicyRegionSelection } from "@/components/map/PolicyLayer";
import { ReportForm } from "@/components/map/ReportForm";
import { SharePanel } from "@/components/map/SharePanel";
import { filterMarkersForDisplay } from "@/components/map/filterMarkers";
import { pointInGeometry } from "@/lib/policy-layers/geometry";
import { findPopulationFeature, loadPopulationFeatureCollection, selectionFromFeature } from "@/lib/policy-layers/load-population-features";
import { POPULATION_LAYER_META, regionTypeLabel } from "@/lib/policy-layers/population";
import { serializeMapUrlState, type MapUrlState } from "@/lib/share/url-state";

// Query keys owned by the viewer; anything else in the address bar is preserved on write-back.
const MAP_URL_KEYS = ["cat", "min", "max", "q", "view", "bnd", "pop", "region"] as const;

function computeBaseValueRange(markers: MarkerData[]): [number, number] | null {
  const values = markers.map((m) => m.value).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return [Math.min(...values), Math.max(...values)];
}

/** Clamps a shared value range to the data's own range; null when nothing valid remains. */
function clampValueRange(range: [number, number] | null | undefined, base: [number, number] | null): [number, number] | null {
  if (!range || !base) return null;
  const min = Math.max(range[0], base[0]);
  const max = Math.min(range[1], base[1]);
  return min <= max ? [min, max] : null;
}

export interface MapClientProps {
  slug: string;
  title: string;
  description: string;
  valueLabel: string | null;
  valueUnit: string | null;
  categoryLabel: string | null;
  visibility?: "public" | "unlisted" | "private";
  sourceName?: string | null;
  sourceUrl?: string | null;
  dataAsOf?: string | null;
  ownerDepartment?: string | null;
  contact?: string | null;
  license?: string | null;
  refreshCycle?: string | null;
  nextReviewAt?: string | null;
  lastDataUpdateAt?: string | null;
  qualitySummary?: { total: number; review: number; excluded: number; failed?: number };
  markers: MarkerData[];
  isDemo?: boolean;
  /** Filter state parsed from the request URL on the server (shared links, embeds). */
  initialUrlState?: MapUrlState;
  reviewBadge?: { status: "approved" | "pending"; versionNumber: number | null; decidedAt: string | null } | null;
  /** Compact chrome for iframe embedding and the reviewer preview. */
  embed?: boolean;
}

type ViewMode = "map" | "table";

export function MapClient({ slug, title, description, valueLabel, valueUnit, categoryLabel, visibility = "public", sourceName, sourceUrl, dataAsOf, ownerDepartment, contact, license, refreshCycle, nextReviewAt, lastDataUpdateAt, qualitySummary, markers, isDemo = false, initialUrlState, reviewBadge = null, embed = false }: MapClientProps) {
  const [map, setMap] = useState<MLMap | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string> | null>(() => (initialUrlState?.categories ? new Set(initialUrlState.categories) : null));
  const [valueRange, setValueRange] = useState<[number, number] | null>(() => clampValueRange(initialUrlState?.valueRange, computeBaseValueRange(markers)));
  const [searchQuery, setSearchQuery] = useState(initialUrlState?.query ?? "");
  const [viewMode, setViewMode] = useState<ViewMode>(initialUrlState?.view ?? "map");
  const [focusedMarkerId, setFocusedMarkerId] = useState<string | null>(null);
  const [showMobileTools, setShowMobileTools] = useState(false);
  const [showBoundaries, setShowBoundaries] = useState(Boolean(initialUrlState?.boundary));
  const [boundaryLevel, setBoundaryLevel] = useState<BoundaryLevel>(initialUrlState?.boundary ?? "sido");
  const [boundaryStatus, setBoundaryStatus] = useState<BoundaryLayerStatus>(initialUrlState?.boundary ? "loading" : "idle");
  const [showPolicyLayer, setShowPolicyLayer] = useState(initialUrlState?.policyLayer ?? false);
  const [policyLayerStatus, setPolicyLayerStatus] = useState<PolicyLayerStatus>("idle");
  const [selectedPolicyRegion, setSelectedPolicyRegion] = useState<PolicyRegionSelection | null>(null);
  // Region code from the shared URL that still has to be resolved to a polygon.
  const [pendingRegion, setPendingRegion] = useState<string | null>(initialUrlState?.region ?? null);
  const [viewportBounds, setViewportBounds] = useState<[number, number, number, number] | null>(null);

  // Resolve the shared region without depending on the map being mounted (table view included).
  useEffect(() => {
    if (!pendingRegion) return;
    let cancelled = false;
    loadPopulationFeatureCollection()
      .then((collection) => {
        if (cancelled) return;
        const feature = findPopulationFeature(collection, pendingRegion);
        const selection = feature ? selectionFromFeature(feature) : null;
        if (selection) setSelectedPolicyRegion(selection);
        setPendingRegion(null);
      })
      .catch(() => {
        if (!cancelled) setPendingRegion(null);
      });
    return () => { cancelled = true; };
  }, [pendingRegion]);

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

  const baseValueRange = useMemo(() => computeBaseValueRange(markers), [markers]);

  const baseFilteredMarkers = useMemo(() => {
    return filterMarkersForDisplay(markers, { selectedCategories, valueRange, searchQuery });
  }, [markers, searchQuery, selectedCategories, valueRange]);

  const filteredMarkers = useMemo(() => {
    if (!selectedPolicyRegion) return baseFilteredMarkers;
    return baseFilteredMarkers.filter((marker) => pointInGeometry([marker.lng, marker.lat], selectedPolicyRegion.geometry));
  }, [baseFilteredMarkers, selectedPolicyRegion]);

  const viewportMarkers = useMemo(() => {
    if (!viewportBounds) return filteredMarkers;
    const [west, south, east, north] = viewportBounds;
    return filteredMarkers.filter((marker) => marker.lng >= west && marker.lng <= east && marker.lat >= south && marker.lat <= north);
  }, [filteredMarkers, viewportBounds]);

  useEffect(() => {
    if (!map) return;
    const updateViewport = () => {
      const bounds = map.getBounds();
      setViewportBounds([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    };
    map.on("moveend", updateViewport);
    updateViewport();
    return () => { map.off("moveend", updateViewport); };
  }, [map]);

  const searchResults = useMemo(() => filteredMarkers.slice(0, 8), [filteredMarkers]);
  const hasActiveFilters = Boolean(searchQuery.trim() || selectedCategories || valueRange || selectedPolicyRegion);

  const currentSearch = useMemo(() => serializeMapUrlState({
    categories: selectedCategories ? Array.from(selectedCategories) : null,
    valueRange,
    query: searchQuery,
    view: viewMode,
    boundary: showBoundaries ? boundaryLevel : null,
    policyLayer: showPolicyLayer,
    region: selectedPolicyRegion?.code ?? null,
  }), [boundaryLevel, searchQuery, selectedCategories, selectedPolicyRegion, showBoundaries, showPolicyLayer, valueRange, viewMode]);

  // Mirror the filter state into the address bar (debounced) without adding history entries.
  // Waits until a shared region is resolved so `region` is never stripped transiently.
  useEffect(() => {
    if (pendingRegion !== null || typeof window === "undefined") return;
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      for (const key of MAP_URL_KEYS) params.delete(key);
      for (const [key, value] of new URLSearchParams(currentSearch)) params.append(key, value);
      const nextSearch = params.toString();
      const next = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
      if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.replaceState(window.history.state, "", next);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [currentSearch, pendingRegion]);

  const boundaryLevelLabel = {
    sido: "광역시도",
    sigg: "시군구",
    emd: "읍면동",
  }[boundaryLevel];
  const boundaryMessage = useMemo(() => {
    if (!showBoundaries || boundaryStatus === "idle") {
      return "VWorld 경계도를 기준으로 현재 위치 주변의 행정구역 경계를 함께 봅니다.";
    }
    if (boundaryStatus === "loading") return `${boundaryLevelLabel} 경계를 불러오는 중입니다.`;
    if (boundaryStatus === "ready") return `현재 표시 위치 주변의 ${boundaryLevelLabel} 경계를 표시 중입니다.`;
    if (boundaryStatus === "empty") return `현재 범위에서 표시할 ${boundaryLevelLabel} 경계를 찾지 못했습니다.`;
    return "경계 데이터를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";
  }, [boundaryLevelLabel, boundaryStatus, showBoundaries]);

  function handleResetFilters() {
    setSearchQuery("");
    setSelectedCategories(null);
    setValueRange(null);
    setSelectedPolicyRegion(null);
  }

  const handlePolicyRegionSelect = useCallback((selection: PolicyRegionSelection | null) => {
    setSelectedPolicyRegion(selection);
  }, []);

  // MapView removes its MapLibre instance when the table view takes over; drop the stale
  // reference so the layers do not touch a removed map when the map view is shown again.
  const handleMapDispose = useCallback(() => {
    setMap(null);
  }, []);

  const policyLayerMessage = useMemo(() => {
    if (!showPolicyLayer || policyLayerStatus === "idle") return "인구감소지역과 관심지역을 시군구 경계에 겹쳐 봅니다.";
    if (policyLayerStatus === "loading") return "인구감소지역 기준 레이어를 불러오는 중입니다.";
    if (policyLayerStatus === "unavailable") return "기준 레이어를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    if (selectedPolicyRegion) return `${selectedPolicyRegion.fullName} · ${regionTypeLabel(selectedPolicyRegion.regionType)}만 표시 중입니다.`;
    return `${POPULATION_LAYER_META.regionCount}개 지역을 표시 중입니다. 지도에서 지역을 선택하면 해당 지역만 볼 수 있습니다.`;
  }, [policyLayerStatus, selectedPolicyRegion, showPolicyLayer]);

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

  // In embed mode the tools panel always floats over the map (no desktop sidebar column).
  const asideFloating = showMobileTools
    ? "absolute inset-x-3 top-[64px] z-20 max-h-[calc(100dvh-140px)] rounded-xl border shadow-xl"
    : "hidden";
  const asideClass = embed
    ? `order-2 overflow-y-auto border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950 ${asideFloating}`
    : `order-2 overflow-y-auto border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950 md:static md:order-1 md:block md:max-h-none md:rounded-none md:border-y-0 md:border-l-0 md:border-r md:shadow-none ${showMobileTools ? "absolute inset-x-3 top-[96px] z-20 max-h-[calc(100dvh-180px)] rounded-xl border shadow-xl" : "hidden"}`;

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="flex min-h-[72px] items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        {!embed && (
          <Link href="/" className="shrink-0 text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100">
            ← 처음
          </Link>
        )}
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
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>{visibility === "unlisted" ? "링크 보유자 공개" : "공개 지도"}</span>
            {reviewBadge?.status === "approved" && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                검토 완료{reviewBadge.versionNumber ? ` · v${reviewBadge.versionNumber}` : ""}{reviewBadge.decidedAt ? ` · ${new Date(reviewBadge.decidedAt).toLocaleDateString("ko-KR")}` : ""}
              </span>
            )}
            {reviewBadge?.status === "pending" && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">검토 대기</span>
            )}
            {sourceName && <span>출처: {sourceName}</span>}
            {dataAsOf && <span>기준일: {dataAsOf}</span>}
            {ownerDepartment && <span>관리: {ownerDepartment}</span>}
            {lastDataUpdateAt && <span>갱신: {new Date(lastDataUpdateAt).toLocaleDateString("ko-KR")}</span>}
          </div>
        </div>
        {!embed && (
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
            <SharePanel slug={slug} title={title} search={currentSearch} apiAvailable={!isDemo && visibility !== "private"} />
          </div>
        )}
      </header>

      {!embed && (
        <div className="border-b border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">데이터 품질</span>
            <span>표시 {markers.length.toLocaleString()}건</span>
            {qualitySummary?.review ? <span className="text-amber-700 dark:text-amber-300">검수 필요 {qualitySummary.review.toLocaleString()}건</span> : <span className="text-emerald-700 dark:text-emerald-300">자동 검수 완료</span>}
            {qualitySummary?.failed ? <span className="text-red-700 dark:text-red-300">변환 실패 {qualitySummary.failed.toLocaleString()}건</span> : null}
            {qualitySummary?.excluded ? <span>제외 {qualitySummary.excluded.toLocaleString()}건</span> : null}
            {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline dark:text-blue-400">출처 원문</a>}
            {license && <span>이용조건: {license}</span>}
            {refreshCycle && <span>갱신주기: {refreshCycle}</span>}
            {nextReviewAt && <span>다음 점검일: {nextReviewAt}</span>}
            {contact && <span>문의: {contact}</span>}
          </div>
        </div>
      )}

      <div className={`relative grid flex-1 grid-cols-1 overflow-hidden ${embed ? "" : "md:grid-cols-[340px_1fr]"}`}>
        <aside
          id="map-tools-panel"
          className={asideClass}
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
            <h3 className="text-sm font-semibold">지도 표시</h3>
            <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">행정구역 경계 표시</span>
              <input
                type="checkbox"
                checked={showBoundaries}
                onChange={(e) => {
                  setShowBoundaries(e.target.checked);
                  setBoundaryStatus(e.target.checked ? "loading" : "idle");
                }}
                className="h-4 w-4 accent-blue-700"
              />
            </label>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-950">
              {([
                ["sido", "광역시도"],
                ["sigg", "시군구"],
                ["emd", "읍면동"],
              ] as const).map(([level, label]) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => {
                    setBoundaryLevel(level);
                    if (showBoundaries) setBoundaryStatus("loading");
                  }}
                  aria-pressed={boundaryLevel === level}
                  className={`min-h-9 rounded-md px-3 text-xs font-semibold transition ${
                    boundaryLevel === level
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "text-zinc-700 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {boundaryMessage}
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">정책 기준 레이어</h3>
                <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{policyLayerMessage}</p>
              </div>
              <input
                type="checkbox"
                checked={showPolicyLayer}
                onChange={(event) => {
                  setShowPolicyLayer(event.target.checked);
                  if (!event.target.checked) {
                    setSelectedPolicyRegion(null);
                    // Drop a shared region that is still resolving so it cannot filter a hidden layer.
                    setPendingRegion(null);
                  }
                }}
                className="mt-1 h-4 w-4 accent-blue-700"
                aria-label="인구감소지역 기준 레이어 표시"
              />
            </div>
            {showPolicyLayer && (
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-red-800 dark:bg-red-950 dark:text-red-200"><span className="h-2 w-2 rounded-full bg-red-600" />인구감소지역 89</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-200"><span className="h-2 w-2 rounded-full bg-amber-500" />관심지역 18</span>
                </div>
                {selectedPolicyRegion && (
                  <button type="button" onClick={() => setSelectedPolicyRegion(null)} className="font-semibold text-blue-700 hover:underline dark:text-blue-400">선택 지역 초기화</button>
                )}
                <p className="text-zinc-500 dark:text-zinc-400">출처: {POPULATION_LAYER_META.sourceName} · 기준일 {POPULATION_LAYER_META.dataAsOf}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <a href={POPULATION_LAYER_META.sourceUrls.decline} target="_blank" rel="noreferrer" className="underline hover:text-zinc-900 dark:hover:text-zinc-100">인구감소지역 고시</a>
                  <a href={POPULATION_LAYER_META.sourceUrls.interest} target="_blank" rel="noreferrer" className="underline hover:text-zinc-900 dark:hover:text-zinc-100">관심지역 고시</a>
                </div>
              </div>
            )}
          </div>

          <MapInsights filteredMarkers={filteredMarkers} viewportMarkers={viewportMarkers} valueLabel={valueLabel} valueUnit={valueUnit} />

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
          <div className={`flex flex-col gap-2 border-b border-zinc-200 bg-white px-4 py-3 text-xs dark:border-zinc-800 dark:bg-zinc-950 ${embed ? "" : "md:hidden"}`}>
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
              <MapView onReady={setMap} onDispose={handleMapDispose} />
              <BoundaryLayer
                map={map}
                markers={filteredMarkers}
                enabled={showBoundaries}
                level={boundaryLevel}
                onStatusChange={setBoundaryStatus}
              />
              <PolicyLayer
                map={map}
                enabled={showPolicyLayer}
                selectedCode={selectedPolicyRegion?.code ?? null}
                frameSelection={focusedMarkerId === null}
                onSelect={handlePolicyRegionSelect}
                onStatusChange={setPolicyLayerStatus}
              />
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

      {embed && (
        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-white px-3 py-1.5 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          <span className="truncate">
            {title}{sourceName ? ` · 출처 ${sourceName}` : ""}{dataAsOf ? ` · 기준일 ${dataAsOf}` : ""}
          </span>
          <a
            href={`/m/${slug}${currentSearch ? `?${currentSearch}` : ""}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 font-semibold text-blue-700 hover:underline dark:text-blue-400"
          >
            PolicyMap에서 열기 ↗
          </a>
        </div>
      )}
    </div>
  );
}
