import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ParsedRow } from "@/lib/excel/parse";
import { supabaseServer } from "@/lib/supabase/server";
import { geocodeParsedRows, mergeGeocoderStats, type FailedGeocodeRow } from "@/lib/upload/geocode-rows";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEOCODE_CONCURRENCY = 8;
const PROCESS_BATCH_SIZE = 25;
const INSERT_CHUNK = 500;

type JobStatus = "pending" | "processing" | "completed" | "failed";
type UploadJobOk = {
  ok: true;
  job_id: string;
  status: JobStatus;
  slug: string;
  total: number;
  processed: number;
  inserted: number;
  failed: number;
  geocoder_stats: Record<string, number>;
  failure_preview: FailedGeocodeRow[];
  error_message?: string | null;
};
type UploadJobErr = { ok: false; error: { code: string; message: string } };

type UploadJobRecord = {
  id: string;
  map_id: string;
  slug: string;
  status: JobStatus;
  total_rows: number;
  processed_rows: number;
  inserted_count: number;
  failed_count: number;
  geocoder_stats: Record<string, number> | null;
  failure_preview: FailedGeocodeRow[] | null;
  rows: ParsedRow[];
  error_message: string | null;
};

function serializeJob(job: UploadJobRecord): UploadJobOk {
  return {
    ok: true,
    job_id: job.id,
    status: job.status,
    slug: job.slug,
    total: job.total_rows,
    processed: job.processed_rows,
    inserted: job.inserted_count,
    failed: job.failed_count,
    geocoder_stats: job.geocoder_stats ?? {},
    failure_preview: job.failure_preview ?? [],
    error_message: job.error_message,
  };
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json<UploadJobErr>({ ok: false, error: { code, message } }, { status });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> },
): Promise<NextResponse<UploadJobOk | UploadJobErr>> {
  const { jobId } = await context.params;
  const sb = supabaseServer();

  const { data: job, error: loadErr } = await sb
    .from("upload_jobs")
    .select("id, map_id, slug, status, total_rows, processed_rows, inserted_count, failed_count, geocoder_stats, failure_preview, rows, error_message")
    .eq("id", jobId)
    .single();

  if (loadErr || !job) {
    return jsonError("JOB_NOT_FOUND", "업로드 작업을 찾을 수 없습니다.", 404);
  }

  const current = job as UploadJobRecord;
  if (current.status === "completed" || current.status === "failed") {
    return NextResponse.json(serializeJob(current));
  }

  const rows = current.rows ?? [];
  const batch = rows.slice(current.processed_rows, current.processed_rows + PROCESS_BATCH_SIZE);
  if (batch.length === 0) {
    const completedStatus: JobStatus = current.inserted_count > 0 ? "completed" : "failed";
    const errorMessage = completedStatus === "failed" ? "모든 주소의 지오코딩에 실패했습니다. API 키와 주소 형식을 확인해 주세요." : null;
    const { data: updated } = await sb
      .from("upload_jobs")
      .update({
        status: completedStatus,
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .select("id, map_id, slug, status, total_rows, processed_rows, inserted_count, failed_count, geocoder_stats, failure_preview, rows, error_message")
      .single();
    if (completedStatus === "completed") {
      await sb
        .from("maps")
        .update({ is_listed: true, geocoder_stats: current.geocoder_stats ?? {}, updated_at: new Date().toISOString() })
        .eq("id", current.map_id);
    }
    return NextResponse.json(serializeJob((updated ?? current) as UploadJobRecord));
  }

  await sb
    .from("upload_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", current.id);

  const result = await geocodeParsedRows(batch, GEOCODE_CONCURRENCY);
  const markersPayload = result.successes.map((row) => ({ ...row, map_id: current.map_id }));
  for (let i = 0; i < markersPayload.length; i += INSERT_CHUNK) {
    const { error } = await sb.from("markers").insert(markersPayload.slice(i, i + INSERT_CHUNK));
    if (error) {
      const message = error.message ?? "마커 저장에 실패했습니다.";
      const { data: failedJob } = await sb
        .from("upload_jobs")
        .update({ status: "failed", error_message: message, updated_at: new Date().toISOString(), finished_at: new Date().toISOString() })
        .eq("id", current.id)
        .select("id, map_id, slug, status, total_rows, processed_rows, inserted_count, failed_count, geocoder_stats, failure_preview, rows, error_message")
        .single();
      return NextResponse.json(serializeJob((failedJob ?? { ...current, status: "failed", error_message: message }) as UploadJobRecord));
    }
  }

  if (result.failures.length > 0) {
    const failPayload = result.failures.map((failure) => ({
      map_id: current.map_id,
      row_index: failure.row_index,
      address_raw: failure.address_raw,
      reason: failure.reason,
      attempted_providers: failure.attempted,
    }));
    for (let i = 0; i < failPayload.length; i += INSERT_CHUNK) {
      await sb.from("geocode_failures").insert(failPayload.slice(i, i + INSERT_CHUNK));
    }
  }

  const processed = current.processed_rows + batch.length;
  const inserted = current.inserted_count + result.successes.length;
  const failed = current.failed_count + result.failures.length;
  const stats = mergeGeocoderStats(current.geocoder_stats ?? {}, result.stats);
  const failurePreview = [...(current.failure_preview ?? []), ...result.failures].slice(0, 10);
  const finished = processed >= current.total_rows;
  const nextStatus: JobStatus = finished ? (inserted > 0 ? "completed" : "failed") : "processing";
  const errorMessage = nextStatus === "failed" ? "모든 주소의 지오코딩에 실패했습니다. API 키와 주소 형식을 확인해 주세요." : null;

  const { data: updated, error: updateErr } = await sb
    .from("upload_jobs")
    .update({
      status: nextStatus,
      processed_rows: processed,
      inserted_count: inserted,
      failed_count: failed,
      geocoder_stats: stats,
      failure_preview: failurePreview,
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
      finished_at: finished ? new Date().toISOString() : null,
    })
    .eq("id", current.id)
    .select("id, map_id, slug, status, total_rows, processed_rows, inserted_count, failed_count, geocoder_stats, failure_preview, rows, error_message")
    .single();

  if (updateErr || !updated) {
    return jsonError("JOB_UPDATE_FAILED", updateErr?.message ?? "작업 상태 저장에 실패했습니다.", 500);
  }

  if (nextStatus === "completed") {
    await sb
      .from("maps")
      .update({ is_listed: true, geocoder_stats: stats, updated_at: new Date().toISOString() })
      .eq("id", current.map_id);
    await recordAudit({
      action: "upload_job.complete",
      mapId: current.map_id,
      req,
      details: { slug: current.slug, inserted, failed, geocoder_stats: stats },
    });
  }

  return NextResponse.json(serializeJob(updated as UploadJobRecord));
}
