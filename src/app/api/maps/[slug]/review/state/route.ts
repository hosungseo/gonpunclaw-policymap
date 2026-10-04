import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LIMITS } from "@/lib/rate-limit";
import { reviewJsonError, withAdminToken } from "@/lib/reviews/route-auth";
import { loadReviewState } from "@/lib/reviews/service";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Review details (reviewer label, comment, request history) and the staff hide reason are only
 * served here, behind the admin token. The server-rendered manage page ships a status pill only.
 * Read-only: no audit on success; auth failures are audited by route-auth. Uses the looser read
 * limit in its own bucket so refreshing details cannot lock the owner out of settings/request.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const auth = await withAdminToken(req, slug, "review.state", { limit: LIMITS.adminRead, prefix: "review-admin_read" });
  if (!auth.ok) return auth.response;
  const [state, { data: map, error }] = await Promise.all([
    loadReviewState(auth.mapId),
    supabaseServer().from("maps").select("directory_hidden, directory_hidden_reason").eq("id", auth.mapId).maybeSingle(),
  ]);
  if (error) {
    console.error("[review.state] maps select failed", { slug, message: error.message });
    return reviewJsonError("STATE_FAILED", "지도 상태를 불러오지 못했습니다.", 500);
  }
  return NextResponse.json({
    ok: true,
    state,
    directory: { hidden: Boolean(map?.directory_hidden), reason: (map?.directory_hidden_reason as string | null | undefined) ?? null },
  });
}
