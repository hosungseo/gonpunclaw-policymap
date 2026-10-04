import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit";
import { requestOrigin } from "@/lib/maps/public-api";
import { reviewJsonError, withAdminToken } from "@/lib/reviews/route-auth";
import { loadReviewState, updateReviewSettings } from "@/lib/reviews/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const auth = await withAdminToken(req, slug, "review.settings");
  if (!auth.ok) return auth.response;
  if (typeof auth.body.review_required !== "boolean") return reviewJsonError("BAD_REVIEW_REQUIRED", "review_required 값은 true/false 여야 합니다.", 400);
  const rotate = auth.body.rotate_token === true;
  let result: Awaited<ReturnType<typeof updateReviewSettings>>;
  try {
    result = await updateReviewSettings({ mapId: auth.mapId, reviewRequired: auth.body.review_required, rotate });
  } catch (error) {
    return reviewJsonError("SETTINGS_FAILED", error instanceof Error ? error.message : "설정을 저장하지 못했습니다.", 500);
  }
  await recordAudit({ action: "map.review_settings", mapId: auth.mapId, req, details: { slug, review_required: result.review_required, token_rotated: result.rotated } });
  const origin = requestOrigin(req);
  // Fresh details so the manage page can sync without a second authenticated call. The write has
  // already succeeded, so a failed state load degrades to a response without `state`.
  const state = await loadReviewState(auth.mapId).catch(() => undefined);
  return NextResponse.json({
    ok: true,
    review_required: result.review_required,
    // The plaintext token is only available right after issuing; it is never stored.
    review_token: result.review_token,
    review_url: result.review_token ? `${origin}/review/${slug}?t=${result.review_token}` : null,
    ...(state ? { state } : {}),
  });
}
