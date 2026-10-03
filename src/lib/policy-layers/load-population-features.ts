// Loads the population-decline region polygons once per page and turns features into
// viewer selections. Shared by PolicyLayer (drawing) and MapClient (restoring a shared region),
// so a region can be resolved even while the map itself is not mounted (table view).

import { POPULATION_REGIONS, regionTypeLabel, type PopulationRegion, type PopulationRegionType } from "@/lib/policy-layers/population";

export interface PolicyRegionSelection {
  code: string;
  name: string;
  fullName: string;
  regionType: PopulationRegionType;
  sourceNotice: string;
  geometry: GeoJSON.Geometry;
}

export const POPULATION_FEATURES_URL = "/data/sigg-boundaries.geojson";

let cachedCollection: Promise<GeoJSON.FeatureCollection> | null = null;

function fetchFeatureCollection(): Promise<GeoJSON.FeatureCollection> {
  const knownCodes = new Set(POPULATION_REGIONS.map((region) => region.lawdCd));
  return fetch(POPULATION_FEATURES_URL).then(async (response) => {
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

/** Memoised loader; a failed load clears the cache so the next call retries. */
export function loadPopulationFeatureCollection(): Promise<GeoJSON.FeatureCollection> {
  if (!cachedCollection) {
    cachedCollection = fetchFeatureCollection().catch((error: unknown) => {
      cachedCollection = null;
      throw error;
    });
  }
  return cachedCollection;
}

export function findPopulationFeature(collection: GeoJSON.FeatureCollection, code: string): GeoJSON.Feature | null {
  return collection.features.find((feature) => String(feature.properties?.policy_code ?? "") === code) ?? null;
}

export function selectionFromFeature(feature: GeoJSON.Feature): PolicyRegionSelection | null {
  const code = String(feature.properties?.policy_code ?? "");
  const region: PopulationRegion | undefined = POPULATION_REGIONS.find((item) => item.lawdCd === code);
  if (!region) return null;
  return {
    code,
    name: region.name,
    fullName: String(feature.properties?.full_nm ?? `${region.normalizedProvince} ${region.name}`),
    regionType: region.regionType,
    sourceNotice: region.sourceNotice,
    geometry: feature.geometry as GeoJSON.Geometry,
  };
}
