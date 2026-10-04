"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import { POPULATION_REGIONS } from "@/lib/policy-layers/population";
import {
  findPopulationFeature,
  loadPopulationFeatureCollection,
  selectionFromFeature,
  type PolicyRegionSelection,
} from "@/lib/policy-layers/load-population-features";

export type { PolicyRegionSelection } from "@/lib/policy-layers/load-population-features";

export type PolicyLayerStatus = "idle" | "loading" | "ready" | "unavailable";

const SOURCE_ID = "population-policy-layer-src";
const FILL_LAYER_ID = "population-policy-layer-fill";
const LINE_LAYER_ID = "population-policy-layer-line";

function removeLayers(map: MLMap) {
  try {
    if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
    if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  } catch {
    // MapLibre may clear the style before React cleanup runs.
  }
}

function applySelectedState(map: MLMap, selectedCode: string | null) {
  try {
    if (!map.getSource(SOURCE_ID)) return;
    for (const region of POPULATION_REGIONS) {
      map.setFeatureState({ source: SOURCE_ID, id: region.lawdCd }, { selected: region.lawdCd === selectedCode });
    }
  } catch {
    // Best-effort: the source may still be loading, or the map instance may already be
    // removed (MapView unmounts on the table view before MapClient receives the new map).
  }
}

function boundsFromGeometry(geometry: GeoJSON.Geometry): maplibregl.LngLatBounds | null {
  const bounds = new maplibregl.LngLatBounds();
  let found = false;
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      bounds.extend([value[0], value[1]]);
      found = true;
      return;
    }
    value.forEach(visit);
  };
  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((child) => {
      const childBounds = boundsFromGeometry(child);
      if (!childBounds || childBounds.isEmpty()) return;
      bounds.extend(childBounds.getSouthWest());
      bounds.extend(childBounds.getNorthEast());
      found = true;
    });
  } else {
    visit(geometry.coordinates);
  }
  return found && !bounds.isEmpty() ? bounds : null;
}

export function PolicyLayer({
  map,
  enabled,
  selectedCode,
  frameSelection = true,
  onSelect,
  onStatusChange,
}: {
  map: MLMap | null;
  enabled: boolean;
  selectedCode: string | null;
  /** Frame the pre-selected region once when the layer becomes ready (off while a marker focus is pending). */
  frameSelection?: boolean;
  onSelect: (selection: PolicyRegionSelection | null) => void;
  onStatusChange?: (status: PolicyLayerStatus) => void;
}) {
  const onSelectRef = useRef(onSelect);
  const selectedCodeRef = useRef(selectedCode);
  const frameSelectionRef = useRef(frameSelection);
  // Frames the already-selected region once per enable cycle (e.g. a region restored from a shared URL).
  const framedRef = useRef(false);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    selectedCodeRef.current = selectedCode;
  }, [selectedCode]);
  useEffect(() => {
    frameSelectionRef.current = frameSelection;
  }, [frameSelection]);

  useEffect(() => {
    if (!map) return;
    if (!enabled) {
      framedRef.current = false;
      removeLayers(map);
      onStatusChange?.("idle");
      return;
    }

    let disposed = false;
    onStatusChange?.("loading");
    loadPopulationFeatureCollection()
      .then((featureCollection) => {
        if (disposed) return;
        removeLayers(map);
        map.addSource(SOURCE_ID, { type: "geojson", data: featureCollection });
        map.addLayer({
          id: FILL_LAYER_ID,
          type: "fill",
          source: SOURCE_ID,
          paint: {
            "fill-color": ["match", ["get", "policy_type"], "decline", "#dc2626", "interest", "#f59e0b", "#64748b"],
            "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.35, 0.16],
          },
        });
        map.addLayer({
          id: LINE_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: {
            "line-color": ["match", ["get", "policy_type"], "decline", "#b91c1c", "interest", "#b45309", "#475569"],
            "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, 1.2],
            "line-opacity": 0.9,
          },
        });
        map.on("click", FILL_LAYER_ID, (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const selection = selectionFromFeature(feature as GeoJSON.Feature);
          if (!selection) return;
          onSelectRef.current(selection);
          const bounds = boundsFromGeometry(selection.geometry);
          if (bounds) map.fitBounds(bounds, { padding: 48, maxZoom: 10, duration: 500 });
        });
        map.on("mouseenter", FILL_LAYER_ID, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", FILL_LAYER_ID, () => { map.getCanvas().style.cursor = ""; });
        onStatusChange?.("ready");

        // A selection made before the layer was ready (shared URL, or remount after the table view)
        // needs its highlight applied and, once, the viewport framed on it.
        const currentCode = selectedCodeRef.current;
        applySelectedState(map, currentCode);
        if (currentCode && frameSelectionRef.current && !framedRef.current) {
          framedRef.current = true;
          const feature = findPopulationFeature(featureCollection, currentCode);
          const bounds = feature ? boundsFromGeometry(feature.geometry) : null;
          if (bounds) map.fitBounds(bounds, { padding: 48, maxZoom: 10, duration: 0 });
        }
      })
      .catch(() => {
        if (!disposed) {
          removeLayers(map);
          onStatusChange?.("unavailable");
        }
      });

    return () => {
      disposed = true;
      removeLayers(map);
    };
  }, [enabled, map, onStatusChange]);

  useEffect(() => {
    if (!map || !enabled) return;
    applySelectedState(map, selectedCode);
  }, [enabled, map, selectedCode]);

  useEffect(() => () => { if (map) removeLayers(map); }, [map]);

  return null;
}
