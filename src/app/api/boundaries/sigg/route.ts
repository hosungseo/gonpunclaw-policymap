import { NextResponse } from "next/server";
import {
  fetchVWorldSiggBoundaries,
  type BoundaryBbox,
  type SiggBoundaryFeatureCollection,
} from "@/lib/boundary/vworld-sigg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BoundaryOk = {
  ok: true;
  source: "vworld";
  count: number;
  feature_collection: SiggBoundaryFeatureCollection;
};

type BoundaryErr = {
  ok: false;
  disabled?: boolean;
  error: { code: string; message: string };
};

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};

function jsonError(code: string, message: string, status: number, disabled = false) {
  return NextResponse.json<BoundaryErr>(
    { ok: false, disabled: disabled || undefined, error: { code, message } },
    { status, headers: CACHE_HEADERS },
  );
}

function parseBbox(value: string | null): BoundaryBbox | null {
  const parts = value?.split(",").map((part) => Number(part.trim())) ?? [];
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;

  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  if (minLng >= maxLng || minLat >= maxLat) return null;

  return [minLng, minLat, maxLng, maxLat];
}

export async function GET(req: Request): Promise<NextResponse<BoundaryOk | BoundaryErr>> {
  const { searchParams } = new URL(req.url);
  const bbox = parseBbox(searchParams.get("bbox"));
  if (!bbox) {
    return jsonError("BAD_BBOX", "bbox는 minLng,minLat,maxLng,maxLat 형식이어야 합니다.", 400);
  }

  const result = await fetchVWorldSiggBoundaries({
    apiKey: process.env.VWORLD_API_KEY ?? "",
    domain: process.env.VWORLD_DOMAIN,
    bbox,
  });

  if (!result.ok) {
    const disabled = result.code === "DISABLED";
    return jsonError(result.code, result.message, disabled ? 200 : 502, disabled);
  }

  return NextResponse.json<BoundaryOk>(
    {
      ok: true,
      source: "vworld",
      count: result.featureCollection.features.length,
      feature_collection: result.featureCollection,
    },
    { headers: CACHE_HEADERS },
  );
}
