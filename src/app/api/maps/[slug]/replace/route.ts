import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";
import { parseWorkbook } from "@/lib/excel/parse";
import { supabaseServer } from "@/lib/supabase/server";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { geocodeParsedRows } from "@/lib/upload/geocode-rows";
import { detectSensitiveHeaders, sensitiveHeadersMessage } from "@/lib/upload/sensitive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const GEOCODE_CONCURRENCY = 8;
const INSERT_CHUNK = 500;

type ReplaceOk = {
  ok: true;
  inserted: number;
  failed: number;
  geocoder_stats: Record<string, number>;
  failure_preview: Array<{ row_index: number; address_raw: string; reason: string; attempted: string[] }>;
};
type ReplaceErr = { ok: false; error: { code: string; message: string } };

function jsonError(code: string, message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json<ReplaceErr>({ ok: false, error: { code, message } }, { status, headers });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ReplaceOk | ReplaceErr>> {
  const { slug } = await context.params;

  const limit = await rateLimitRequest(req, "admin-replace", LIMITS.adminAttempt);
  if (!limit.allowed) {
    return jsonError(
      "RATE_LIMITED",
      "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
      429,
      { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("BAD_FORM", "폼 데이터를 읽을 수 없습니다.", 400);
  }

  const token = String(form.get("admin_token") ?? "").trim();
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

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("NO_FILE", "파일을 선택해 주세요.", 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return jsonError("FILE_TOO_LARGE", "파일 크기는 3MB를 초과할 수 없습니다.", 413);
  }

  const parsed = parseWorkbook(Buffer.from(await file.arrayBuffer()));
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const sensitiveHeaders = detectSensitiveHeaders(parsed.headers);
  if (sensitiveHeaders.length > 0) {
    return jsonError("SENSITIVE_HEADERS", sensitiveHeadersMessage(sensitiveHeaders), 400);
  }

  const result = await geocodeParsedRows(parsed.rows, GEOCODE_CONCURRENCY);
  if (result.successes.length === 0) {
    return jsonError("ALL_GEOCODE_FAILED", "모든 주소의 지오코딩에 실패했습니다. API 키와 주소 형식을 확인해 주세요.", 422);
  }

  const sb = supabaseServer();
  const { error: oldFailuresErr } = await sb.from("geocode_failures").delete().eq("map_id", auth.mapId);
  if (oldFailuresErr) {
    return jsonError("DELETE_OLD_FAILURES", oldFailuresErr.message, 500);
  }
  const { error: oldMarkersErr } = await sb.from("markers").delete().eq("map_id", auth.mapId);
  if (oldMarkersErr) {
    return jsonError("DELETE_OLD_MARKERS", oldMarkersErr.message, 500);
  }

  const markersPayload = result.successes.map((row) => ({ ...row, map_id: auth.mapId }));
  for (let i = 0; i < markersPayload.length; i += INSERT_CHUNK) {
    const { error } = await sb.from("markers").insert(markersPayload.slice(i, i + INSERT_CHUNK));
    if (error) {
      return jsonError("DB_INSERT_MARKERS", error.message, 500);
    }
  }

  if (result.failures.length > 0) {
    const failPayload = result.failures.map((failure) => ({
      map_id: auth.mapId,
      row_index: failure.row_index,
      address_raw: failure.address_raw,
      reason: failure.reason,
      attempted_providers: failure.attempted,
    }));
    for (let i = 0; i < failPayload.length; i += INSERT_CHUNK) {
      await sb.from("geocode_failures").insert(failPayload.slice(i, i + INSERT_CHUNK));
    }
  }

  const { error: mapUpdateErr } = await sb
    .from("maps")
    .update({
      source_file: file.name,
      geocoder_stats: result.stats,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.mapId);
  if (mapUpdateErr) {
    return jsonError("UPDATE_MAP_FAILED", mapUpdateErr.message, 500);
  }

  await recordAudit({
    action: "map.replace_data",
    mapId: auth.mapId,
    req,
    details: {
      slug,
      source_file: file.name,
      inserted: result.successes.length,
      failed: result.failures.length,
      geocoder_stats: result.stats,
    },
  });

  return NextResponse.json<ReplaceOk>({
    ok: true,
    inserted: result.successes.length,
    failed: result.failures.length,
    geocoder_stats: result.stats,
    failure_preview: result.failures.slice(0, 10),
  });
}
