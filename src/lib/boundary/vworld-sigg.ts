export type BoundaryBbox = [number, number, number, number];

export interface SiggBoundaryProperties {
  sig_cd?: string;
  full_nm?: string;
  sig_kor_nm?: string;
  sig_eng_nm?: string;
  [key: string]: unknown;
}

export type SiggBoundaryFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  SiggBoundaryProperties
>;

export type SiggBoundaryResult =
  | { ok: true; featureCollection: SiggBoundaryFeatureCollection }
  | { ok: false; code: string; message: string };

interface BuildBoundaryUrlOptions {
  apiKey: string;
  bbox: BoundaryBbox;
  domain?: string;
}

interface FetchBoundaryOptions extends BuildBoundaryUrlOptions {
  signal?: AbortSignal;
}

function emptyFeatureCollection(): SiggBoundaryFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRecord(value: unknown, key: string) {
  if (!isRecord(value)) return null;
  const child = value[key];
  return isRecord(child) ? child : null;
}

function readString(value: unknown, key: string) {
  if (!isRecord(value)) return "";
  const child = value[key];
  return typeof child === "string" ? child : "";
}

function isFeatureCollection(value: unknown): value is SiggBoundaryFeatureCollection {
  return isRecord(value) && value.type === "FeatureCollection" && Array.isArray(value.features);
}

export function buildVWorldSiggBoundaryUrl({ apiKey, bbox, domain }: BuildBoundaryUrlOptions) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const url = new URL("https://api.vworld.kr/req/data");
  url.search = new URLSearchParams({
    service: "data",
    request: "GetFeature",
    version: "2.0",
    data: "LT_C_ADSIGG_INFO",
    format: "json",
    size: "1000",
    page: "1",
    geomFilter: `BOX(${minLng},${minLat},${maxLng},${maxLat})`,
    columns: "sig_cd,full_nm,sig_kor_nm",
    geometry: "true",
    attribute: "true",
    crs: "EPSG:4326",
    key: apiKey,
  }).toString();
  if (domain) url.searchParams.set("domain", domain);
  return url;
}

function buildHttpFallbackUrl(url: URL) {
  const fallback = new URL(url.toString());
  fallback.protocol = "http:";
  return fallback;
}

export function parseVWorldSiggBoundaryResponse(payload: unknown): SiggBoundaryResult {
  const response = readRecord(payload, "response");
  const status = readString(response, "status");

  if (status === "NOT_FOUND") {
    return { ok: true, featureCollection: emptyFeatureCollection() };
  }

  if (status === "ERROR") {
    const error = readRecord(response, "error");
    return {
      ok: false,
      code: readString(error, "code") || "VWORLD_ERROR",
      message: readString(error, "text") || "VWorld 시군구 경계 API 오류가 발생했습니다.",
    };
  }

  const result = readRecord(response, "result");
  const featureCollection = readRecord(result, "featureCollection") ?? result;
  if (status === "OK" && isFeatureCollection(featureCollection)) {
    return { ok: true, featureCollection };
  }

  return {
    ok: false,
    code: "INVALID_RESPONSE",
    message: "VWorld 시군구 경계 API 응답 형식이 올바르지 않습니다.",
  };
}

export async function fetchVWorldSiggBoundaries({
  apiKey,
  bbox,
  domain,
  signal,
}: FetchBoundaryOptions): Promise<SiggBoundaryResult> {
  if (!apiKey.trim()) {
    return { ok: false, code: "DISABLED", message: "VWorld API key is not configured." };
  }

  const url = buildVWorldSiggBoundaryUrl({ apiKey, bbox, domain });
  const urls = [url, buildHttpFallbackUrl(url)];
  let lastNetworkMessage = "VWorld 시군구 경계 API 요청에 실패했습니다.";

  for (let i = 0; i < urls.length; i++) {
    let res: Response;
    try {
      res = await fetch(urls[i], { signal });
    } catch (error) {
      lastNetworkMessage = error instanceof Error ? error.message : lastNetworkMessage;
      continue;
    }

    if (!res.ok) {
      if (i === urls.length - 1 || res.status < 500) {
        return { ok: false, code: `HTTP_${res.status}`, message: "VWorld 시군구 경계 API 응답이 올바르지 않습니다." };
      }
      continue;
    }

    const payload = await res.json().catch(() => null);
    return parseVWorldSiggBoundaryResponse(payload);
  }

  return { ok: false, code: "NETWORK", message: lastNetworkMessage };
}
