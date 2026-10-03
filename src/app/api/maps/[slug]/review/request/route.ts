import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit";
import { reviewJsonError, withAdminToken } from "@/lib/reviews/route-auth";
import { requestReview } from "@/lib/reviews/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const auth = await withAdminToken(req, slug, "review.request");
  if (!auth.ok) return auth.response;
  const note = typeof auth.body.note === "string" ? auth.body.note : "";
  const result = await requestReview({ mapId: auth.mapId, note, actorToken: auth.token });
  if (!result.ok) return reviewJsonError(result.code, result.message, result.code === "REVIEW_NOT_ENABLED" ? 409 : 500);
  await recordAudit({ action: "map.review_request", mapId: auth.mapId, req, details: { slug, review_id: result.review.id, version_number: result.review.version_number } });
  return NextResponse.json({ ok: true, review: result.review });
}
