import type { ParsedRow } from "@/lib/excel/parse";
import { supabaseServer } from "@/lib/supabase/server";
import { geocodeParsedRows, mergeGeocoderStats, type FailedGeocodeRow } from "@/lib/upload/geocode-rows";
import { verifyUploadJobToken } from "@/lib/upload/job-token";
import { recordAudit } from "@/lib/audit";

const GEOCODE_CONCURRENCY = 8;
const PROCESS_BATCH_SIZE = 25;
const INSERT_CHUNK = 500;
const LEASE_MS = 10 * 60 * 1000;
const CLEANUP_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export type UploadJobOk = {
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

export type UploadJobRecord = {
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
  job_token_hash: string | null;
  locked_until: string | null;
  cleanup_after: string | null;
  error_message: string | null;
};

export type ProcessUploadJobResult =
  | { ok: true; job: UploadJobRecord; completedNow: boolean }
  | { ok: false; code: string; message: string; status: number };

const JOB_SELECT =
  "id, map_id, slug, status, total_rows, processed_rows, inserted_count, failed_count, geocoder_stats, failure_preview, rows, job_token_hash, locked_until, cleanup_after, error_message";

export function serializeUploadJob(job: UploadJobRecord): UploadJobOk {
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

function cleanupAfterIso(): string {
  return new Date(Date.now() + CLEANUP_AFTER_MS).toISOString();
}

function terminalUpdateFields() {
  return {
    rows: [],
    locked_until: null,
    cleanup_after: cleanupAfterIso(),
    updated_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  };
}

function verifyJobRequest(req: Request, job: UploadJobRecord, auth: "token" | "cron"): ProcessUploadJobResult | null {
  if (auth === "cron") return null;
  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  if (!pepper) {
    return { ok: false, code: "SERVER_MISCONFIG", message: "Server pepper not configured.", status: 500 };
  }
  const token = req.headers.get("x-upload-job-token")?.trim() ?? "";
  if (!token || !job.job_token_hash || !verifyUploadJobToken(token, job.job_token_hash, pepper)) {
    return { ok: false, code: "BAD_JOB_TOKEN", message: "업로드 작업 토큰을 확인할 수 없습니다.", status: 401 };
  }
  return null;
}

export async function processUploadJob(
  req: Request,
  jobId: string,
  options: { auth: "token" | "cron" },
): Promise<ProcessUploadJobResult> {
  const sb = supabaseServer();

  const { data: job, error: loadErr } = await sb
    .from("upload_jobs")
    .select(JOB_SELECT)
    .eq("id", jobId)
    .single();

  if (loadErr || !job) {
    return { ok: false, code: "JOB_NOT_FOUND", message: "업로드 작업을 찾을 수 없습니다.", status: 404 };
  }

  const current = job as UploadJobRecord;
  const authError = verifyJobRequest(req, current, options.auth);
  if (authError) return authError;

  if (current.status === "completed" || current.status === "failed") {
    return { ok: true, job: current, completedNow: false };
  }

  const now = new Date();
  if (current.locked_until && new Date(current.locked_until).getTime() > now.getTime()) {
    return { ok: false, code: "JOB_LOCKED", message: "이미 처리 중인 업로드 작업입니다. 잠시 후 다시 시도해 주세요.", status: 409 };
  }

  const lockUntil = new Date(now.getTime() + LEASE_MS).toISOString();
  const { data: lockedJob, error: lockErr } = await sb
    .from("upload_jobs")
    .update({ status: "processing", locked_until: lockUntil, updated_at: now.toISOString() })
    .eq("id", current.id)
    .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
    .select(JOB_SELECT)
    .maybeSingle();

  if (lockErr) {
    return { ok: false, code: "JOB_LOCK_FAILED", message: lockErr.message ?? "작업 잠금에 실패했습니다.", status: 500 };
  }
  if (!lockedJob) {
    return { ok: false, code: "JOB_LOCKED", message: "이미 처리 중인 업로드 작업입니다. 잠시 후 다시 시도해 주세요.", status: 409 };
  }

  const active = lockedJob as UploadJobRecord;
  const rows = active.rows ?? [];
  const batch = rows.slice(active.processed_rows, active.processed_rows + PROCESS_BATCH_SIZE);
  if (batch.length === 0) {
    const completedStatus: JobStatus = active.inserted_count > 0 ? "completed" : "failed";
    const errorMessage = completedStatus === "failed" ? "모든 주소의 지오코딩에 실패했습니다. API 키와 주소 형식을 확인해 주세요." : null;
    const { data: updated, error: updateErr } = await sb
      .from("upload_jobs")
      .update({
        status: completedStatus,
        error_message: errorMessage,
        ...terminalUpdateFields(),
      })
      .eq("id", active.id)
      .select(JOB_SELECT)
      .single();
    if (updateErr || !updated) {
      return { ok: false, code: "JOB_UPDATE_FAILED", message: updateErr?.message ?? "작업 상태 저장에 실패했습니다.", status: 500 };
    }
    if (completedStatus === "completed") {
      await sb
        .from("maps")
        .update({ is_listed: true, geocoder_stats: active.geocoder_stats ?? {}, updated_at: new Date().toISOString() })
        .eq("id", active.map_id);
    }
    return { ok: true, job: updated as UploadJobRecord, completedNow: completedStatus === "completed" };
  }

  const result = await geocodeParsedRows(batch, GEOCODE_CONCURRENCY);
  const markersPayload = result.successes.map((row) => ({ ...row, map_id: active.map_id }));
  for (let i = 0; i < markersPayload.length; i += INSERT_CHUNK) {
    const { error } = await sb.from("markers").insert(markersPayload.slice(i, i + INSERT_CHUNK));
    if (error) {
      const message = error.message ?? "마커 저장에 실패했습니다.";
      const { data: failedJob } = await sb
        .from("upload_jobs")
        .update({
          status: "failed",
          error_message: message,
          ...terminalUpdateFields(),
        })
        .eq("id", active.id)
        .select(JOB_SELECT)
        .single();
      return {
        ok: true,
        job: (failedJob ?? { ...active, status: "failed", error_message: message, rows: [], locked_until: null, cleanup_after: cleanupAfterIso() }) as UploadJobRecord,
        completedNow: false,
      };
    }
  }

  if (result.failures.length > 0) {
    const failPayload = result.failures.map((failure) => ({
      map_id: active.map_id,
      row_index: failure.row_index,
      address_raw: failure.address_raw,
      reason: failure.reason,
      attempted_providers: failure.attempted,
    }));
    for (let i = 0; i < failPayload.length; i += INSERT_CHUNK) {
      await sb.from("geocode_failures").insert(failPayload.slice(i, i + INSERT_CHUNK));
    }
  }

  const processed = active.processed_rows + batch.length;
  const inserted = active.inserted_count + result.successes.length;
  const failed = active.failed_count + result.failures.length;
  const stats = mergeGeocoderStats(active.geocoder_stats ?? {}, result.stats);
  const failurePreview = [...(active.failure_preview ?? []), ...result.failures].slice(0, 10);
  const finished = processed >= active.total_rows;
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
      locked_until: null,
      ...(finished ? { rows: [], cleanup_after: cleanupAfterIso(), finished_at: new Date().toISOString() } : { finished_at: null }),
    })
    .eq("id", active.id)
    .select(JOB_SELECT)
    .single();

  if (updateErr || !updated) {
    return { ok: false, code: "JOB_UPDATE_FAILED", message: updateErr?.message ?? "작업 상태 저장에 실패했습니다.", status: 500 };
  }

  if (nextStatus === "completed") {
    await sb
      .from("maps")
      .update({ is_listed: true, geocoder_stats: stats, updated_at: new Date().toISOString() })
      .eq("id", active.map_id);
    await recordAudit({
      action: "upload_job.complete",
      mapId: active.map_id,
      req,
      details: { slug: active.slug, inserted, failed, geocoder_stats: stats },
    });
  }

  return { ok: true, job: updated as UploadJobRecord, completedNow: nextStatus === "completed" };
}
