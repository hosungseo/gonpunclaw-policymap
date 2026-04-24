"use client";
import { useEffect, useRef } from "react";
import type { Map as MLMap } from "maplibre-gl";
import maplibregl from "maplibre-gl";

export interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  name: string | null;
  value: number | null;
  category: string | null;
  address_normalized: string | null;
  extra: Record<string, unknown>;
}

export interface MarkerLayerProps {
  map: MLMap | null;
  markers: MarkerData[];
  valueLabel: string | null;
  valueUnit: string | null;
  categoryLabel: string | null;
  filterCategories: Set<string> | null;
  valueRange: [number, number] | null;
  focusedMarkerId?: string | null;
}

const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b", "#a855f7", "#22c55e", "#3b82f6"];

function buildPopupHtml(
  properties: Record<string, string>,
  valueLabel: string | null,
  valueUnit: string | null,
  categoryLabel: string | null,
) {
  const extraObj = JSON.parse(properties.extra || "{}") as Record<string, unknown>;
  const extraHtml = Object.entries(extraObj).map(([k, v]) => `<div><b>${k}:</b> ${String(v)}</div>`).join("");
  const valHtml = properties.value && properties.value !== "null"
    ? `<div><b>${valueLabel ?? "값"}:</b> ${Number(properties.value).toLocaleString()}${valueUnit ?? ""}</div>`
    : "";
  const catHtml = properties.category ? `<div><b>${categoryLabel ?? "분류"}:</b> ${properties.category}</div>` : "";

  return `<div class="text-sm">
    <div class="font-semibold">${properties.name || properties.address}</div>
    <div class="text-zinc-500">${properties.address}</div>
    ${valHtml}${catHtml}${extraHtml}
  </div>`;
}

export function MarkerLayer({ map, markers, valueLabel, valueUnit, categoryLabel, filterCategories, valueRange, focusedMarkerId }: MarkerLayerProps) {
  const didFitInitialBounds = useRef(false);

  useEffect(() => {
    if (!map) return;
    const srcId = "markers-src";
    const filtered = markers.filter((m) => {
      if (filterCategories && m.category && !filterCategories.has(m.category)) return false;
      if (valueRange && m.value != null && (m.value < valueRange[0] || m.value > valueRange[1])) return false;
      return true;
    });

    const categories = Array.from(new Set(markers.map((m) => m.category).filter((c): c is string => !!c)));
    const catColor: Record<string, string> = {};
    categories.forEach((c, i) => (catColor[c] = PALETTE[i % PALETTE.length]));

    const values = markers.map((m) => m.value ?? 0);
    const vMin = Math.min(...values, 0);
    const vMax = Math.max(...values, 1);
    const radius = (v: number | null) => {
      if (v == null || vMax === vMin) return 8;
      return 8 + ((v - vMin) / (vMax - vMin)) * 16;
    };

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: filtered.map((m) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [m.lng, m.lat] },
        properties: {
          id: m.id,
          name: m.name ?? "",
          address: m.address_normalized ?? "",
          value: m.value ?? null,
          category: m.category ?? "",
          color: m.category ? catColor[m.category] : "#2563eb",
          radius: radius(m.value),
          extra: JSON.stringify(m.extra ?? {}),
        },
      })),
    };

    const existing = map.getSource(srcId) as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(geojson);
    } else {
      map.addSource(srcId, { type: "geojson", data: geojson, cluster: true, clusterRadius: 40, clusterMaxZoom: 12 });
      map.addLayer({
        id: "clusters", type: "circle", source: srcId, filter: ["has", "point_count"],
        paint: {
          "circle-color": "#2563eb",
          "circle-radius": ["step", ["get", "point_count"], 16, 50, 22, 200, 28],
          "circle-opacity": 0.75,
        },
      });
      map.addLayer({
        id: "cluster-count", type: "symbol", source: srcId, filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
        paint: { "text-color": "#fff" },
      });
      map.addLayer({
        id: "points", type: "circle", source: srcId, filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["get", "radius"],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1,
        },
      });

      map.on("click", "points", (e) => {
        const f = e.features?.[0]; if (!f) return;
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        const p = f.properties as Record<string, string>;
        new maplibregl.Popup().setLngLat([lng, lat]).setHTML(
          buildPopupHtml(p, valueLabel, valueUnit, categoryLabel)
        ).addTo(map);
      });

      map.on("click", "clusters", (e) => {
        const f = e.features?.[0]; if (!f) return;
        const src = map.getSource(srcId) as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom((f.properties as { cluster_id: number }).cluster_id).then((zoom) => {
          map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
        });
      });
      map.on("mouseenter", "points", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "points", () => (map.getCanvas().style.cursor = ""));
    }

    if (!didFitInitialBounds.current && filtered.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const m of filtered) bounds.extend([m.lng, m.lat]);
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 500 });
        didFitInitialBounds.current = true;
      }
    }
  }, [map, markers, valueLabel, valueUnit, categoryLabel, filterCategories, valueRange]);

  useEffect(() => {
    if (!map || !focusedMarkerId) return;
    const source = map.getSource("markers-src") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const marker = markers.find((item) => item.id === focusedMarkerId);
    if (!marker) return;
    const properties = {
      id: marker.id,
      name: marker.name ?? "",
      address: marker.address_normalized ?? "",
      value: marker.value == null ? "null" : String(marker.value),
      category: marker.category ?? "",
      extra: JSON.stringify(marker.extra ?? {}),
    };
    new maplibregl.Popup()
      .setLngLat([marker.lng, marker.lat])
      .setHTML(buildPopupHtml(properties, valueLabel, valueUnit, categoryLabel))
      .addTo(map);
  }, [map, markers, focusedMarkerId, valueLabel, valueUnit, categoryLabel]);

  return null;
}
