import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hashIp, recordAudit } from "@/lib/audit";
import { reviewJsonError, withReviewToken } from "@/lib/reviews/route-auth";
import { decideReview, normalizeChecklist, validateDecision, type ReviewDecision } from "@/lib/reviews/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const auth = await withReviewToken(req, slug, "review.decide");
  if (!auth.ok) return auth.response;

  const decision = auth.body.decision as ReviewDecision;
  const comment = typeof auth.body.comment === "string" ? auth.body.comment : "";
  // Validate before any DB write so an incomplete checklist never reaches the service.
  const invalid = validateDecision({ decision, checklist: auth.body.checklist, comment });
  if (invalid) return reviewJsonError(invalid.code, invalid.message, 400);

  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const result = await decideReview({
    mapId: auth.mapId,
    decision,
    checklist: normalizeChecklist(auth.body.checklist),
    comment,
    reviewerLabel: typeof auth.body.reviewer_label === "string" ? auth.body.reviewer_label : null,
    reviewerIpHash: pepper && ip ? hashIp(ip, pepper) : null,
  });
  if (!result.ok) return reviewJsonError(result.code, result.message, result.code === "NO_PENDING_REVIEW" ? 409 : 500);

  await recordAudit({
    action: decision === "approve" ? "map.review_approve" : "map.review_reject",
    mapId: auth.mapId,
    req,
    details: { slug, review_id: result.review.id, version_id: result.review.version_id, has_comment: Boolean(comment.trim()) },
  });
  return NextResponse.json({ ok: true, review: result.review });
}
