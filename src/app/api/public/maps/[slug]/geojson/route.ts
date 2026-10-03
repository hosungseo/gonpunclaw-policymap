import { NextResponse } from "next/server";
import { includedPublicMarkers, publicMapMeta, requestOrigin, toGeoJson } from "@/lib/maps/public-api";
import { preparePublicMapResponse, publicApiOptions } from "@/lib/maps/public-api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const prepared = await preparePublicMapResponse(req, slug);
  if (prepared.kind === "response") return prepared.response;
  const meta = publicMapMeta(prepared.record, requestOrigin(req));
  const body = JSON.stringify(toGeoJson(meta, includedPublicMarkers(prepared.record)));
  return new NextResponse(body, {
    status: 200,
    headers: { ...prepared.headers, "Content-Type": "application/geo+json; charset=utf-8", "Content-Disposition": `inline; filename="${slug}.geojson"` },
  });
}

export async function OPTIONS() {
  return publicApiOptions();
}
