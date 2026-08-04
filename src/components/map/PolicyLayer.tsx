"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import { POPULATION_REGIONS, regionTypeLabel, type PopulationRegion, type PopulationRegionType } from "@/lib/policy-layers/population";

export type PolicyLayerStatus = "idle" | "loading" | "ready" | "unavailable";

export interface PolicyRegionSelection {
  code: string;
  name: string;
  fullName: string;
  regionType: PopulationRegionType;
  sourceNotice: string;
  geometry: GeoJSON.Geometry;
}

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

function buildFeatureCollection() {
  const knownCodes = new Set(POPULATION_REGIONS.map((region) => region.lawdCd));
  return fetch("/data/sigg-boundaries.geojson").then(async (response) => {
    if (!response.ok) throw new Error("boundary fetch failed");
    const data = await response.json() as GeoJSON.FeatureCollection;
    return {
      type: "FeatureCollection",
      features: data.features
        .filter((feature) => knownCodes.has(String(feature.properties?.sig_cd ?? "")))
        .map((feature) => {
          const code = String(feature.properties?.sig_cd ?? "");
          const region = POPULATION_REGIONS.find((item) => item.lawdCd === code);
          if (!region) return null;
          return {
            ...feature,
            id: code,
            properties: {
              ...feature.properties,
              policy_code: code,
              policy_type: region.regionType,
              policy_type_label: regionTypeLabel(region.regionType),
              policy_source_notice: region.sourceNotice,
            },
          };
        })
        .filter((feature) => feature !== null) as GeoJSON.Feature[],
    } as GeoJSON.FeatureCollection;
  });
}

export function PolicyLayer({
  map,
  enabled,
  selectedCode,
  onSelect,
  onStatusChange,
}: {
  map: MLMap | null;
  enabled: boolean;
  selectedCode: string | null;
  onSelect: (selection: PolicyRegionSelection | null) => void;
  onStatusChange?: (status: PolicyLayerStatus) => void;
}) {
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!map) return;
    if (!enabled) {
      removeLayers(map);
      onStatusChange?.("idle");
      return;
    }

    let disposed = false;
    onStatusChange?.("loading");
    buildFeatureCollection()
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
          const code = String(feature.properties?.policy_code ?? "");
          const region: PopulationRegion | undefined = POPULATION_REGIONS.find((item) => item.lawdCd === code);
          if (!region) return;
          const selection: PolicyRegionSelection = {
            code,
            name: region.name,
            fullName: String(feature.properties?.full_nm ?? `${region.normalizedProvince} ${region.name}`),
            regionType: region.regionType,
            sourceNotice: region.sourceNotice,
            geometry: feature.geometry as GeoJSON.Geometry,
          };
          onSelectRef.current(selection);
          const bounds = boundsFromGeometry(selection.geometry);
          if (bounds) map.fitBounds(bounds, { padding: 48, maxZoom: 10, duration: 500 });
        });
        map.on("mouseenter", FILL_LAYER_ID, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", FILL_LAYER_ID, () => { map.getCanvas().style.cursor = ""; });
        onStatusChange?.("ready");
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
    const source = map.getSource(SOURCE_ID);
    if (!source) return;
    for (const region of POPULATION_REGIONS) {
      try {
        map.setFeatureState({ source: SOURCE_ID, id: region.lawdCd }, { selected: region.lawdCd === selectedCode });
      } catch {
        // Feature state is best-effort while the async source is loading.
      }
    }
  }, [enabled, map, selectedCode]);

  useEffect(() => () => { if (map) removeLayers(map); }, [map]);

  return null;
}
