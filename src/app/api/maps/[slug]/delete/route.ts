import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";
import { supabaseServer } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeleteOk = { ok: true };
type DeleteErr = { ok: false; error: { code: string; message: string } };

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse<DeleteOk | DeleteErr>> {
  const { slug } = await context.params;

  const limit = await rateLimitRequest(req, "admin-delete", LIMITS.deleteMap);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요." } },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  let body: { admin_token?: string } | null = null;
  try {
    body = (await req.json()) as { admin_token?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_JSON", message: "요청 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const token = body?.admin_token?.trim();
  if (!token) {
    return NextResponse.json(
      { ok: false, error: { code: "NO_TOKEN", message: "관리 토큰을 입력해 주세요." } },
      { status: 400 },
    );
  }

  const auth = await verifyAdminTokenForMap(slug, token);
  if (!auth.ok) {
    if (auth.reason === "NOT_FOUND") {
      await recordAudit({
        action: "admin.auth_fail",
        mapId: null,
        req,
        details: { slug, route: "delete" },
      });
    }
    const message =
      auth.reason === "MISSING_PEPPER"
        ? "서버 설정이 올바르지 않습니다."
        : "지도 또는 관리 토큰을 확인할 수 없습니다.";
    const status = auth.reason === "MISSING_PEPPER" ? 500 : 404;
    return NextResponse.json(
      { ok: false, error: { code: auth.reason, message } },
      { status },
    );
  }

  const sb = supabaseServer();

  const { error: slugErr } = await sb
    .from("deleted_slugs")
    .upsert({ slug }, { onConflict: "slug", ignoreDuplicates: true });
  if (slugErr) {
    return NextResponse.json(
      { ok: false, error: { code: "SLUG_RESERVE_FAILED", message: slugErr.message } },
      { status: 500 },
    );
  }

  const { error: deleteErr } = await sb.from("maps").delete().eq("id", auth.mapId);
  if (deleteErr) {
    return NextResponse.json(
      { ok: false, error: { code: "DELETE_FAILED", message: deleteErr.message } },
      { status: 500 },
    );
  }

  await recordAudit({
    action: "map.delete",
    mapId: null,
    req,
    details: { slug, deleted_map_id: auth.mapId },
  });

  return NextResponse.json({ ok: true });
}
