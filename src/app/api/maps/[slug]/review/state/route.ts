import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAdminToken } from "@/lib/reviews/route-auth";
import { loadReviewState } from "@/lib/reviews/service";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Review details (reviewer label, comment, request history) and the staff hide reason are only
 * served here, behind the admin token. The server-rendered manage page ships a status pill only.
 * Read-only: no audit on success; auth failures are audited by route-auth.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const auth = await withAdminToken(req, slug, "review.state");
  if (!auth.ok) return auth.response;
  const [state, { data: map }] = await Promise.all([
    loadReviewState(auth.mapId),
    supabaseServer().from("maps").select("directory_hidden, directory_hidden_reason").eq("id", auth.mapId).maybeSingle(),
  ]);
  return NextResponse.json({
    ok: true,
    state,
    directory: { hidden: Boolean(map?.directory_hidden), reason: (map?.directory_hidden_reason as string | null | undefined) ?? null },
  });
}
