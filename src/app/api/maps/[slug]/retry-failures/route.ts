import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";
import type { ParsedRow } from "@/lib/excel/parse";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase/server";
import { geocodeParsedRows, mergeGeocoderStats } from "@/lib/upload/geocode-rows";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEOCODE_CONCURRENCY = 6;
const INSERT_CHUNK = 500;
const MAX_RETRY_ROWS = 500;

type RetryOk = {
  ok: true;
  inserted: number;
  failed: number;
  remaining: number;
  geocoder_stats: Record<string, number>;
};
type RetryErr = { ok: false; error: { code: string; message: string } };

type FailureRow = {
  id: string;
  row_index: number;
  address_raw: string;
  reason: string;
  attempted_providers: string[] | null;
};

function jsonError(code: string, message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json<RetryErr>({ ok: false, error: { code, message } }, { status, headers });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse<RetryOk | RetryErr>> {
  const { slug } = await context.params;
  const limit = await rateLimitRequest(req, "admin-retry", LIMITS.adminAttempt);
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

  const sb = supabaseServer();
  const { data: failures, error: failureErr } = await sb
    .from("geocode_failures")
    .select("id, row_index, address_raw, reason, attempted_providers")
    .eq("map_id", auth.mapId)
    .order("row_index", { ascending: true })
    .limit(MAX_RETRY_ROWS);

  if (failureErr) {
    return jsonError("FAILURE_LOOKUP_FAILED", failureErr.message, 500);
  }

  const retryRows = (failures ?? []) as FailureRow[];
  if (retryRows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, failed: 0, remaining: 0, geocoder_stats: {} });
  }

  const rows: ParsedRow[] = retryRows.map((failure) => ({
    row_index: failure.row_index,
    address_raw: failure.address_raw,
    name: null,
    value: null,
    category: null,
    extra: { retry_source: "geocode_failures" },
  }));
  const result = await geocodeParsedRows(rows, GEOCODE_CONCURRENCY);

  if (result.successes.length > 0) {
    const markersPayload = result.successes.map((row) => ({ ...row, map_id: auth.mapId }));
    for (let i = 0; i < markersPayload.length; i += INSERT_CHUNK) {
      const { error } = await sb.from("markers").insert(markersPayload.slice(i, i + INSERT_CHUNK));
      if (error) {
        return jsonError("DB_INSERT_MARKERS", error.message, 500);
      }
    }

    const succeededRows = new Set(result.successes.map((row) => row.row_index));
    const succeededIds = retryRows.filter((failure) => succeededRows.has(failure.row_index)).map((failure) => failure.id);
    if (succeededIds.length > 0) {
      await sb.from("geocode_failures").delete().in("id", succeededIds);
    }
  }

  for (const failure of result.failures) {
    const original = retryRows.find((row) => row.row_index === failure.row_index);
    if (!original) continue;
    await sb
      .from("geocode_failures")
      .update({
        reason: failure.reason,
        attempted_providers: failure.attempted,
      })
      .eq("id", original.id);
  }

  const { data: mapRow } = await sb
    .from("maps")
    .select("geocoder_stats")
    .eq("id", auth.mapId)
    .single();
  const geocoderStats = mergeGeocoderStats(mapRow?.geocoder_stats ?? {}, result.stats);
  await sb
    .from("maps")
    .update({ geocoder_stats: geocoderStats, updated_at: new Date().toISOString() })
    .eq("id", auth.mapId);

  const remaining = retryRows.length - result.successes.length;
  await recordAudit({
    action: "map.retry_failures",
    mapId: auth.mapId,
    req,
    details: { slug, attempted: retryRows.length, inserted: result.successes.length, failed: result.failures.length, remaining },
  });

  return NextResponse.json({
    ok: true,
    inserted: result.successes.length,
    failed: result.failures.length,
    remaining,
    geocoder_stats: geocoderStats,
  });
}
