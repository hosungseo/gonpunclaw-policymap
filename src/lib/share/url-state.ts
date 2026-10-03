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
const QUERY_MAX_LENGTH = 200;

function parseNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Converts Next.js page `searchParams` (string | string[] values) into URLSearchParams. */
export function toUrlSearchParams(input: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  return params;
}

export function parseMapUrlState(input: string | URLSearchParams, known?: { categories?: string[] }): MapUrlState {
  const params = typeof input === "string" ? new URLSearchParams(input.replace(/^\?/, "")) : input;
  const state: MapUrlState = { ...EMPTY_MAP_URL_STATE };

  if (params.has("cat")) {
    const parsed = params.getAll("cat").filter((c) => c.length > 0);
    const allowed = known?.categories;
    state.categories = allowed ? parsed.filter((c) => allowed.includes(c)) : parsed;
  }

  const min = parseNumber(params.get("min"));
  const max = parseNumber(params.get("max"));
  if (min !== null && max !== null && min <= max) state.valueRange = [min, max];

  state.query = (params.get("q") ?? "").slice(0, QUERY_MAX_LENGTH);

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
  if (state.categories !== null) {
    if (state.categories.length === 0) {
      params.set("cat", "");
    } else {
      for (const category of state.categories) params.append("cat", category);
    }
  }
  if (state.valueRange) {
    params.set("min", String(state.valueRange[0]));
    params.set("max", String(state.valueRange[1]));
  }
  const query = state.query.trim().slice(0, QUERY_MAX_LENGTH);
  if (query) params.set("q", query);
  if (state.view !== "map") params.set("view", state.view);
  if (state.boundary) params.set("bnd", state.boundary);
  if (state.policyLayer) params.set("pop", "1");
  if (state.region) params.set("region", state.region);
  return params.toString();
}
