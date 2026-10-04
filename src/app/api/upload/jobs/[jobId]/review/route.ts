import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { verifyUploadJobToken } from "@/lib/upload/job-token";
import { geocodeParsedRows } from "@/lib/upload/geocode-rows";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ErrorBody = { ok: false; error: { code: string; message: string } };

function error(code: string, message: string, status: number) {
  return NextResponse.json<ErrorBody>({ ok: false, error: { code, message } }, { status });
}

async function loadJob(req: Request, jobId: string) {
  const jobResult = await supabaseServer()
    .from("upload_jobs")
    .select("id, map_id, slug, status, job_token_hash")
    .eq("id", jobId)
    .single();
  if (jobResult.error || !jobResult.data) return { error: error("JOB_NOT_FOUND", "업로드 작업을 찾을 수 없습니다.", 404) } as const;
  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  const token = req.headers.get("x-upload-job-token")?.trim() ?? "";
  if (!pepper || !token || !jobResult.data.job_token_hash || !verifyUploadJobToken(token, jobResult.data.job_token_hash, pepper)) {
    return { error: error("BAD_JOB_TOKEN", "업로드 작업 토큰을 확인할 수 없습니다.", 401) } as const;
  }
  return { job: jobResult.data } as const;
}

export async function GET(req: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const loaded = await loadJob(req, jobId);
  if ("error" in loaded) return loaded.error;
  const sb = supabaseServer();
  const [{ data: markers, error: markerError }, { data: failures, error: failureError }] = await Promise.all([
    sb.from("markers").select("id, row_index, address_raw, original_address, address_normalized, lat, lng, name, value, category, extra, quality_status, quality_reason, included, manual_corrected").eq("map_id", loaded.job.map_id).order("row_index", { ascending: true }),
    sb.from("geocode_failures").select("id, row_index, address_raw, address_current, reason, attempted_providers, included, quality_status").eq("map_id", loaded.job.map_id).order("row_index", { ascending: true }),
  ]);
  if (markerError || failureError) return error("REVIEW_LOAD_FAILED", "검수 데이터를 불러오지 못했습니다.", 500);
  return NextResponse.json({ ok: true, job_id: jobId, status: loaded.job.status, markers: markers ?? [], failures: failures ?? [] });
}

export async function POST(req: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const loaded = await loadJob(req, jobId);
  if ("error" in loaded) return loaded.error;
  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    row_index?: unknown;
    address?: unknown;
    lat?: unknown;
    lng?: unknown;
  } | null;
  const action = body?.action;
  const rowIndex = Number(body?.row_index);
  if (!Number.isInteger(rowIndex) || rowIndex < 2) return error("BAD_ROW", "검수할 행 번호가 올바르지 않습니다.", 400);
  if (!["address_update", "coordinate_update", "exclude", "include"].includes(String(action))) return error("BAD_ACTION", "지원하지 않는 검수 작업입니다.", 400);

  const sb = supabaseServer();
  const { data: marker } = await sb.from("markers").select("*").eq("map_id", loaded.job.map_id).eq("row_index", rowIndex).maybeSingle();
  const { data: failure } = await sb.from("geocode_failures").select("*").eq("map_id", loaded.job.map_id).eq("row_index", rowIndex).maybeSingle();
  if (!marker && !failure) return error("ROW_NOT_FOUND", "검수 대상 행을 찾을 수 없습니다.", 404);

  if (action === "exclude" || action === "include") {
    const included = action === "include";
    if (marker) {
      const { error: updateError } = await sb.from("markers").update({ included, updated_at: new Date().toISOString() }).eq("id", marker.id);
      if (updateError) return error("REVIEW_UPDATE_FAILED", "발행 대상 상태를 저장하지 못했습니다.", 500);
    } else if (failure) {
      const { error: updateError } = await sb.from("geocode_failures").update({ included }).eq("id", failure.id);
      if (updateError) return error("REVIEW_UPDATE_FAILED", "실패 행 상태를 저장하지 못했습니다.", 500);
    }
    await sb.from("review_actions").insert({ map_id: loaded.job.map_id, job_id: jobId, row_index: rowIndex, action, before_value: { included: marker?.included ?? failure?.included ?? false }, after_value: { included } });
  } else if (action === "coordinate_update") {
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 32 || lat > 40 || lng < 124 || lng > 132) return error("BAD_COORDINATE", "대한민국 범위의 위도·경도를 입력해 주세요.", 400);
    if (!marker) return error("ROW_NOT_GEOCODED", "주소를 먼저 성공적으로 변환해 주세요.", 400);
    const { error: updateError } = await sb.from("markers").update({ lat, lng, quality_status: "manual", quality_reason: "MANUAL_COORDINATE", manual_corrected: true, included: true, updated_at: new Date().toISOString() }).eq("id", marker.id);
    if (updateError) return error("REVIEW_UPDATE_FAILED", "수동 좌표를 저장하지 못했습니다.", 500);
    await sb.from("review_actions").insert({ map_id: loaded.job.map_id, job_id: jobId, row_index: rowIndex, action, before_value: { lat: marker.lat, lng: marker.lng }, after_value: { lat, lng } });
  } else if (action === "address_update") {
    const address = typeof body?.address === "string" ? body.address.trim() : "";
    if (!address) return error("BAD_ADDRESS", "수정할 주소를 입력해 주세요.", 400);
    const source = marker ?? failure;
    const result = await geocodeParsedRows([{
      row_index: rowIndex,
      address_raw: address,
      name: marker?.name ?? null,
      value: marker?.value == null ? null : Number(marker.value),
      category: marker?.category ?? null,
      extra: (marker?.extra as Record<string, unknown>) ?? {},
    }], 1);
    if (result.successes[0]) {
      const next = result.successes[0];
      if (marker) {
        const { error: updateError } = await sb.from("markers").update({ address_raw: address, original_address: marker.original_address ?? marker.address_raw, address_normalized: next.address_normalized, lat: next.lat, lng: next.lng, geocoder_used: next.geocoder_used, quality_status: next.quality_status, quality_reason: next.quality_reason, manual_corrected: false, included: true, updated_at: new Date().toISOString() }).eq("id", marker.id);
        if (updateError) return error("REVIEW_UPDATE_FAILED", "수정 주소를 저장하지 못했습니다.", 500);
      } else {
        const { error: insertError } = await sb.from("markers").insert({ map_id: loaded.job.map_id, ...next, original_address: failure?.address_raw ?? next.original_address });
        if (insertError) return error("REVIEW_UPDATE_FAILED", "수정 주소 결과를 저장하지 못했습니다.", 500);
        await sb.from("geocode_failures").delete().eq("id", failure?.id);
      }
      await sb.from("review_actions").insert({ map_id: loaded.job.map_id, job_id: jobId, row_index: rowIndex, action, before_value: { address_hash: await shortHash(String(source?.address_current ?? source?.address_raw ?? "")) }, after_value: { address_hash: await shortHash(address) } });
    } else {
      if (failure) await sb.from("geocode_failures").update({ address_current: address, address_raw: failure.address_raw, reason: result.failures[0]?.reason ?? "ALL_FAILED", attempted_providers: result.failures[0]?.attempted ?? [] }).eq("id", failure.id);
      else if (marker) await sb.from("markers").update({ address_raw: address, original_address: marker.original_address ?? marker.address_raw, quality_status: "review", quality_reason: "ADDRESS_RETRY_FAILED", included: false, updated_at: new Date().toISOString() }).eq("id", marker.id);
      if (marker) await touchMapData(sb, loaded.job.map_id);
      return NextResponse.json({ ok: true, row_index: rowIndex, status: "failed", message: "수정한 주소도 변환에 실패했습니다." });
    }
  }

  await refreshDuplicateQuality(sb, loaded.job.map_id);
  await touchMapData(sb, loaded.job.map_id);
  const { data: reviewCountRows } = await sb.from("markers").select("quality_status, included").eq("map_id", loaded.job.map_id);
  const { data: failureCountRows } = await sb.from("geocode_failures").select("included").eq("map_id", loaded.job.map_id);
  await sb.from("upload_jobs").update({
    quality_review_count: (reviewCountRows ?? []).filter((row) => row.quality_status === "review").length,
    excluded_count: (reviewCountRows ?? []).filter((row) => row.included === false).length + (failureCountRows ?? []).filter((row) => row.included === false).length,
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  await recordAudit({ action: "upload_job.review", mapId: loaded.job.map_id, req, details: { slug: loaded.job.slug, row_index: rowIndex, review_action: action } });
  return NextResponse.json({ ok: true, row_index: rowIndex, action });
}

async function shortHash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Marker corrections change what the public viewer and API show, so bump `last_data_update_at`
 * (part of the public ETag). The job token outlives publish, so the map may already be public here.
 */
async function touchMapData(sb: ReturnType<typeof supabaseServer>, mapId: string) {
  const now = new Date().toISOString();
  await sb.from("maps").update({ last_data_update_at: now, updated_at: now }).eq("id", mapId);
}

async function refreshDuplicateQuality(sb: ReturnType<typeof supabaseServer>, mapId: string) {
  const { data: rows } = await sb.from("markers").select("id, lat, lng, quality_status, quality_reason, manual_corrected").eq("map_id", mapId);
  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    const key = `${Number(row.lat).toFixed(5)},${Number(row.lng).toFixed(5)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const row of rows ?? []) {
    if (row.manual_corrected) continue;
    const key = `${Number(row.lat).toFixed(5)},${Number(row.lng).toFixed(5)}`;
    const duplicate = (counts.get(key) ?? 0) > 1;
    if (duplicate && row.quality_reason !== "DUPLICATE_COORDINATE") {
      await sb.from("markers").update({ quality_status: "review", quality_reason: "DUPLICATE_COORDINATE", updated_at: new Date().toISOString() }).eq("id", row.id);
    } else if (!duplicate && row.quality_reason === "DUPLICATE_COORDINATE") {
      await sb.from("markers").update({ quality_status: "success", quality_reason: null, updated_at: new Date().toISOString() }).eq("id", row.id);
    }
  }
}
