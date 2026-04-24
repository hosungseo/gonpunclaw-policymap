import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type Position = [number, number];
type Ring = Position[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

interface VWorldFeature {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry?: {
    type: "Polygon" | "MultiPolygon";
    coordinates: Polygon | MultiPolygon;
  };
}

interface VWorldResponse {
  response?: {
    status?: string;
    error?: { code?: string; text?: string };
    record?: { total?: string | number; current?: string | number };
    page?: { total?: string | number; current?: string | number; size?: string | number };
    result?: {
      featureCollection?: {
        type: "FeatureCollection";
        features?: VWorldFeature[];
      };
    };
  };
}

interface BoundaryDataset {
  data: string;
  outputFile: string;
  name: string;
  source: string;
  columns: string;
  defaultTolerance: number;
  toleranceEnv: string;
  properties: string[];
}

const DEFAULT_BBOX = "124,33,132,39.5";

const DATASETS: BoundaryDataset[] = [
  {
    data: "LT_C_ADSIDO_INFO",
    outputFile: "sido-boundaries.geojson",
    name: "vworld-lt-c-adsido-info",
    source: "VWorld 2D Data API 2.0 LT_C_ADSIDO_INFO",
    columns: "ctprvn_cd,ctp_kor_nm",
    defaultTolerance: 0.003,
    toleranceEnv: "SIDO_SIMPLIFY_TOLERANCE",
    properties: ["ctprvn_cd", "ctp_kor_nm"],
  },
  {
    data: "LT_C_ADSIGG_INFO",
    outputFile: "sigg-boundaries.geojson",
    name: "vworld-lt-c-adsigg-info",
    source: "VWorld 2D Data API 2.0 LT_C_ADSIGG_INFO",
    columns: "sig_cd,full_nm,sig_kor_nm",
    defaultTolerance: 0.002,
    toleranceEnv: "SIGG_SIMPLIFY_TOLERANCE",
    properties: ["sig_cd", "full_nm", "sig_kor_nm"],
  },
  {
    data: "LT_C_ADEMD_INFO",
    outputFile: "emd-boundaries.geojson",
    name: "vworld-lt-c-ademd-info",
    source: "VWorld 2D Data API 2.0 LT_C_ADEMD_INFO",
    columns: "emd_cd,full_nm,emd_kor_nm",
    defaultTolerance: 0.003,
    toleranceEnv: "EMD_SIMPLIFY_TOLERANCE",
    properties: ["emd_cd", "full_nm", "emd_kor_nm"],
  },
];

function sqSegDist(point: Position, start: Position, end: Position) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyDPStep(points: Position[], first: number, last: number, sqTolerance: number, simplified: Position[]) {
  let maxSqDist = sqTolerance;
  let index = -1;

  for (let i = first + 1; i < last; i++) {
    const sqDistance = sqSegDist(points[i], points[first], points[last]);
    if (sqDistance > maxSqDist) {
      index = i;
      maxSqDist = sqDistance;
    }
  }

  if (index > -1) {
    if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
    simplified.push(points[index]);
    if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
  }
}

function simplifyLine(points: Position[], tolerance: number) {
  if (points.length <= 2) return points;
  const sqTolerance = tolerance * tolerance;
  const simplified = [points[0]];
  simplifyDPStep(points, 0, points.length - 1, sqTolerance, simplified);
  simplified.push(points[points.length - 1]);
  return simplified;
}

function roundPosition(position: Position): Position {
  return [Number(position[0].toFixed(6)), Number(position[1].toFixed(6))];
}

function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 4) return ring.map(roundPosition);
  const openRing = ring.slice(0, -1);
  const simplified = simplifyLine(openRing, tolerance).map(roundPosition);
  if (simplified.length < 3) return ring.map(roundPosition);
  const first = simplified[0];
  const last = simplified[simplified.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) simplified.push(first);
  return simplified;
}

function simplifyPolygon(polygon: Polygon, tolerance: number): Polygon {
  return polygon.map((ring) => simplifyRing(ring, tolerance));
}

function simplifyGeometry(feature: VWorldFeature, tolerance: number) {
  if (!feature.geometry) return null;
  if (feature.geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: simplifyPolygon(feature.geometry.coordinates as Polygon, tolerance) };
  }
  return {
    type: "MultiPolygon",
    coordinates: (feature.geometry.coordinates as MultiPolygon).map((polygon) => simplifyPolygon(polygon, tolerance)),
  };
}

function pickProperties(feature: VWorldFeature, keys: string[]) {
  const properties: Record<string, string> = {};
  for (const key of keys) {
    const value = feature.properties?.[key];
    properties[key] = value == null ? "" : String(value);
  }
  return properties;
}

function readPositiveInteger(value: string | number | undefined, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.ceil(numberValue) : fallback;
}

async function fetchDatasetPage(dataset: BoundaryDataset, apiKey: string, domain: string | undefined, page: number) {
  const params = new URLSearchParams({
    service: "data",
    request: "GetFeature",
    version: "2.0",
    data: dataset.data,
    format: "json",
    size: "1000",
    page: String(page),
    geomFilter: `BOX(${process.env.BOUNDARY_BBOX ?? DEFAULT_BBOX})`,
    columns: dataset.columns,
    geometry: "true",
    attribute: "true",
    crs: "EPSG:4326",
    key: apiKey,
  });
  if (domain) params.set("domain", domain);

  const res = await fetch(`https://api.vworld.kr/req/data?${params.toString()}`);
  if (!res.ok) throw new Error(`${dataset.data} request failed: ${res.status}`);

  const payload = (await res.json()) as VWorldResponse;
  if (payload.response?.status !== "OK") {
    const error = payload.response?.error;
    throw new Error(`${dataset.data} error: ${error?.code ?? payload.response?.status} ${error?.text ?? ""}`.trim());
  }

  return payload;
}

async function fetchDataset(dataset: BoundaryDataset, apiKey: string, domain: string | undefined) {
  const tolerance = Number(process.env[dataset.toleranceEnv] ?? dataset.defaultTolerance);
  let page = 1;
  let totalPages = 1;
  const features: VWorldFeature[] = [];

  do {
    const payload = await fetchDatasetPage(dataset, apiKey, domain, page);
    const pageFeatures = payload.response?.result?.featureCollection?.features ?? [];
    features.push(...pageFeatures);

    const responsePage = payload.response?.page;
    const responseRecord = payload.response?.record;
    const currentPage = readPositiveInteger(responsePage?.current, page);
    const pageSize = readPositiveInteger(responsePage?.size, 1000);
    const recordTotal = readPositiveInteger(responseRecord?.total, pageFeatures.length);
    totalPages = readPositiveInteger(responsePage?.total, Math.max(currentPage, Math.ceil(recordTotal / pageSize)));
    page = currentPage + 1;
  } while (page <= totalPages);

  const output = {
    type: "FeatureCollection",
    name: dataset.name,
    source: dataset.source,
    updated_at: "2026-04-23",
    crs: "EPSG:4326",
    simplify_tolerance: tolerance,
    features: features.flatMap((feature) => {
      const geometry = simplifyGeometry(feature, tolerance);
      if (!geometry) return [];
      return [{
        type: "Feature",
        properties: pickProperties(feature, dataset.properties),
        geometry,
      }];
    }),
  };

  const outPath = path.join(process.cwd(), "public/data", dataset.outputFile);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(output)}\n`);
  console.log(`Wrote ${output.features.length} ${dataset.data} boundaries to ${outPath}`);
}

async function main() {
  const apiKey = process.env.VWORLD_API_KEY;
  if (!apiKey) throw new Error("VWORLD_API_KEY is required.");

  const domain = process.env.VWORLD_DOMAIN;
  for (const dataset of DATASETS) {
    await fetchDataset(dataset, apiKey, domain);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
