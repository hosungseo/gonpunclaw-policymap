"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Map as MLMap } from "maplibre-gl";
import { MapView } from "@/components/map/MapView";
import { MarkerLayer, type MarkerData } from "@/components/map/MarkerLayer";
import { Filters } from "@/components/map/Filters";
import { Legend } from "@/components/map/Legend";
import { ReportForm } from "@/components/map/ReportForm";

export interface MapClientProps {
  slug: string;
  title: string;
  description: string;
  valueLabel: string | null;
  valueUnit: string | null;
  categoryLabel: string | null;
  markers: MarkerData[];
}

export function MapClient({ slug, title, description, valueLabel, categoryLabel, markers }: MapClientProps) {
  const [map, setMap] = useState<MLMap | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string> | null>(null);
  const [valueRange, setValueRange] = useState<[number, number] | null>(null);

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

  const visibleCount = useMemo(() => {
    return markers.filter((m) => {
      if (selectedCategories && m.category && !selectedCategories.has(m.category)) return false;
      if (valueRange && m.value != null && (m.value < valueRange[0] || m.value > valueRange[1])) return false;
      return true;
    }).length;
  }, [markers, selectedCategories, valueRange]);

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
        <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          {markers.length.toLocaleString()}곳
        </span>
      </header>

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[280px_1fr]">
        <aside className="order-2 overflow-y-auto border-t border-zinc-200 bg-zinc-50 p-4 text-sm md:order-1 md:border-r md:border-t-0 dark:border-zinc-800 dark:bg-zinc-950">
          <Filters
            categories={categoryBuckets}
            valueRange={baseValueRange}
            valueLabel={valueLabel}
            categoryLabel={categoryLabel}
            selectedCategories={selectedCategories}
            setSelectedCategories={setSelectedCategories}
            currentValueRange={valueRange}
            setCurrentValueRange={setValueRange}
            total={visibleCount}
          />
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
          <MapView onReady={setMap} />
          <MarkerLayer
            map={map}
            markers={markers}
            valueLabel={valueLabel}
            categoryLabel={categoryLabel}
            filterCategories={selectedCategories}
            valueRange={valueRange}
          />
        </main>
      </div>
    </div>
  );
}
