"use client";

import { useEffect } from "react";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import type { MarkerData } from "@/components/map/MarkerLayer";
import type { BoundaryBbox, SiggBoundaryFeatureCollection } from "@/lib/boundary/vworld-sigg";

interface BoundaryLayerProps {
  map: MLMap | null;
  markers: MarkerData[];
  enabled: boolean;
  level: BoundaryLevel;
  onStatusChange?: (status: BoundaryLayerStatus) => void;
}

export type BoundaryLevel = "sido" | "sigg";
export type BoundaryLayerStatus = "idle" | "loading" | "ready" | "empty" | "unavailable";

type BoundaryApiResponse =
  SiggBoundaryFeatureCollection
  | { ok: false; disabled?: boolean; error: { code: string; message: string } };

const SOURCE_ID = "sigg-boundaries-src";
const FILL_LAYER_ID = "sigg-boundary-fill";
const LINE_LAYER_ID = "sigg-boundary-line";

function roundCoord(value: number) {
  return Number(value.toFixed(5));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function bboxForMarkers(markers: MarkerData[]): BoundaryBbox | null {
  if (markers.length === 0) return null;
  const lngs = markers.map((marker) => marker.lng);
  const lats = markers.map((marker) => marker.lat);
  const minLng = Math.min(...lngs);
  const minLat = Math.min(...lats);
  const maxLng = Math.max(...lngs);
  const maxLat = Math.max(...lats);
  const padding = 0.04;

  return [
    roundCoord(clamp(minLng - padding, -180, 180)),
    roundCoord(clamp(minLat - padding, -90, 90)),
    roundCoord(clamp(maxLng + padding, -180, 180)),
    roundCoord(clamp(maxLat + padding, -90, 90)),
  ];
}

function removeBoundaryLayers(map: MLMap) {
  try {
    if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
    if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  } catch {
    // MapLibre can clear its style before React cleanup runs during view switches.
  }
}

function isBoundaryFeatureCollection(value: BoundaryApiResponse): value is SiggBoundaryFeatureCollection {
  return "type" in value && value.type === "FeatureCollection" && "features" in value;
}

function upsertBoundaryLayers(map: MLMap, featureCollection: SiggBoundaryFeatureCollection) {
  try {
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (source) {
      source.setData(featureCollection);
      return;
    }

    map.addSource(SOURCE_ID, { type: "geojson", data: featureCollection });
    const beforeId = map.getLayer("clusters") ? "clusters" : undefined;

    map.addLayer({
      id: FILL_LAYER_ID,
      type: "fill",
      source: SOURCE_ID,
      paint: {
        "fill-color": "#0ea5e9",
        "fill-opacity": 0.08,
      },
    }, beforeId);
    map.addLayer({
      id: LINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      paint: {
        "line-color": "#0369a1",
        "line-opacity": 0.8,
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.7, 11, 1.6],
      },
    }, beforeId);
  } catch {
    // Ignore stale map instances after route or view transitions.
  }
}

export function BoundaryLayer({ map, markers, enabled, level, onStatusChange }: BoundaryLayerProps) {
  useEffect(() => {
    if (!map) return;
    const bbox = bboxForMarkers(markers);
    if (!enabled) {
      removeBoundaryLayers(map);
      onStatusChange?.("idle");
      return;
    }
    if (!bbox) {
      removeBoundaryLayers(map);
      onStatusChange?.("empty");
      return;
    }

    const controller = new AbortController();
    onStatusChange?.("loading");

    fetch(`/data/${level}-boundaries.geojson`, { signal: controller.signal })
      .then((res) => res.json() as Promise<BoundaryApiResponse>)
      .then((json) => {
        if (controller.signal.aborted) return;
        if (!isBoundaryFeatureCollection(json)) {
          removeBoundaryLayers(map);
          onStatusChange?.("unavailable");
          return;
        }
        upsertBoundaryLayers(map, json);
        onStatusChange?.(json.features.length > 0 ? "ready" : "empty");
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          removeBoundaryLayers(map);
          onStatusChange?.("unavailable");
        }
      });

    return () => {
      controller.abort();
    };
  }, [enabled, level, map, markers, onStatusChange]);

  useEffect(() => {
    return () => {
      if (map) removeBoundaryLayers(map);
    };
  }, [map]);

  return null;
}
