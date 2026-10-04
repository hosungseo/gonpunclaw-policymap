import { NextResponse } from "next/server";
import { includedPublicMarkers, publicMapMeta, requestOrigin } from "@/lib/maps/public-api";
import { preparePublicMapResponse, publicApiOptions } from "@/lib/maps/public-api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const prepared = await preparePublicMapResponse(req, slug);
  if (prepared.kind === "response") return prepared.response;
  const meta = publicMapMeta(prepared.record, requestOrigin(req));
  return NextResponse.json({ ok: true, map: meta, markers: includedPublicMarkers(prepared.record) }, { headers: prepared.headers });
}

export async function OPTIONS() {
  return publicApiOptions();
}
