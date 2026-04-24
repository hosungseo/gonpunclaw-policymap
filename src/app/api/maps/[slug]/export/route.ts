import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";
import { markersToCsv } from "@/lib/export/csv";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportErr = { ok: false; error: { code: string; message: string } };

function jsonError(code: string, message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json<ExportErr>({ ok: false, error: { code, message } }, { status, headers });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const limit = await rateLimitRequest(req, "admin-export", LIMITS.adminAttempt);
  if (!limit.allowed) {
    return jsonError(
      "RATE_LIMITED",
      "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
      429,
      { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
    );
  }

  const body = (await req.json().catch(() => null)) as { admin_token?: unknown } | null;
  const token = typeof body?.admin_token === "string" ? body.admin_token.trim() : "";
  if (!token) {
    return jsonError("NO_TOKEN", "관리 토큰을 입력해 주세요.", 400);
  }

  const auth = await verifyAdminTokenForMap(slug, token);
  if (!auth.ok) {
    const message =
      auth.reason === "MISSING_PEPPER"
        ? "서버 설정이 올바르지 않습니다."
        : "지도 또는 관리 토큰을 확인할 수 없습니다.";
    const status = auth.reason === "MISSING_PEPPER" ? 500 : 404;
    return jsonError(auth.reason, message, status);
  }

  const { data: markers, error } = await supabaseServer()
    .from("markers")
    .select("row_index, address_raw, address_normalized, lat, lng, name, value, category, extra, geocoder_used")
    .eq("map_id", auth.mapId)
    .order("row_index", { ascending: true });

  if (error) {
    return jsonError("EXPORT_FAILED", error.message, 500);
  }

  await recordAudit({
    action: "map.export_csv",
    mapId: auth.mapId,
    req,
    details: { slug, rows: markers?.length ?? 0 },
  });

  const csv = markersToCsv((markers ?? []) as Parameters<typeof markersToCsv>[0]);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-markers.csv"`,
    },
  });
}
