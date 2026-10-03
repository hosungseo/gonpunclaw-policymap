// Encodes the public map viewer's filter state into a query string so links and embeds
// can reproduce the same view. Pure functions only; MapClient owns the React state.

export type MapViewMode = "map" | "table";
export type MapBoundaryLevel = "sido" | "sigg" | "emd";

export interface MapUrlState {
  /** null = all categories; [] = none selected. */
  categories: string[] | null;
  valueRange: [number, number] | null;
  query: string;
  view: MapViewMode;
  boundary: MapBoundaryLevel | null;
  policyLayer: boolean;
  region: string | null;
}

export const EMPTY_MAP_URL_STATE: MapUrlState = {
  categories: null,
  valueRange: null,
  query: "",
  view: "map",
  boundary: null,
  policyLayer: false,
  region: null,
};

const VIEWS: readonly MapViewMode[] = ["map", "table"];
const BOUNDARIES: readonly MapBoundaryLevel[] = ["sido", "sigg", "emd"];
const CATEGORY_SEPARATOR = ",";

function encodeCategory(name: string): string {
  return encodeURIComponent(name);
}

function decodeCategory(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function parseNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseMapUrlState(input: string | URLSearchParams, known?: { categories?: string[] }): MapUrlState {
  const params = typeof input === "string" ? new URLSearchParams(input.replace(/^\?/, "")) : input;
  const state: MapUrlState = { ...EMPTY_MAP_URL_STATE };

  const cat = params.get("cat");
  if (cat !== null) {
    const parsed = cat === "" ? [] : cat.split(CATEGORY_SEPARATOR).map(decodeCategory).filter((c) => c.length > 0);
    state.categories = known?.categories ? parsed.filter((c) => known.categories!.includes(c)) : parsed;
  }

  const min = parseNumber(params.get("min"));
  const max = parseNumber(params.get("max"));
  if (min !== null && max !== null && min <= max) state.valueRange = [min, max];

  state.query = (params.get("q") ?? "").slice(0, 200);

  const view = params.get("view");
  if (view && (VIEWS as readonly string[]).includes(view)) state.view = view as MapViewMode;

  const bnd = params.get("bnd");
  if (bnd && (BOUNDARIES as readonly string[]).includes(bnd)) state.boundary = bnd as MapBoundaryLevel;

  const region = params.get("region");
  if (region && /^\d{5}$/.test(region)) state.region = region;

  state.policyLayer = params.get("pop") === "1" || state.region !== null;

  return state;
}

export function serializeMapUrlState(state: MapUrlState): string {
  const params = new URLSearchParams();
  if (state.categories !== null) params.set("cat", state.categories.map(encodeCategory).join(CATEGORY_SEPARATOR));
  if (state.valueRange) {
    params.set("min", String(state.valueRange[0]));
    params.set("max", String(state.valueRange[1]));
  }
  if (state.query.trim()) params.set("q", state.query.trim());
  if (state.view !== "map") params.set("view", state.view);
  if (state.boundary) params.set("bnd", state.boundary);
  if (state.policyLayer) params.set("pop", "1");
  if (state.region) params.set("region", state.region);
  return params.toString();
}
