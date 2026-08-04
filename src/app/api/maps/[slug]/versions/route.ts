import { NextResponse } from "next/server";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";
import { supabaseServer } from "@/lib/supabase/server";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const limit = await rateLimitRequest(req, "admin-versions", LIMITS.adminAttempt);
  if (!limit.allowed) return NextResponse.json({ ok: false, error: { code: "RATE_LIMITED", message: "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요." } }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { admin_token?: unknown } | null;
  const token = typeof body?.admin_token === "string" ? body.admin_token.trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: { code: "NO_TOKEN", message: "관리 토큰을 입력해 주세요." } }, { status: 400 });
  const auth = await verifyAdminTokenForMap(slug, token);
  if (!auth.ok) return NextResponse.json({ ok: false, error: { code: "BAD_TOKEN", message: "지도 또는 관리 토큰을 확인할 수 없습니다." } }, { status: 404 });

  const { data, error } = await supabaseServer()
    .from("map_versions")
    .select("id, version_number, status, reason, change_summary, created_at, published_at")
    .eq("map_id", auth.mapId)
    .order("version_number", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: { code: "VERSIONS_LOAD_FAILED", message: error.message } }, { status: 500 });
  return NextResponse.json({ ok: true, slug, versions: data ?? [] });
}
