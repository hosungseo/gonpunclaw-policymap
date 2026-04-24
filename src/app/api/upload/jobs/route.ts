import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseWorkbook } from "@/lib/excel/parse";
import { detectSensitiveHeaders, sensitiveHeadersMessage } from "@/lib/upload/sensitive";
import { supabaseServer } from "@/lib/supabase/server";
import { generateAdminToken, generateSlug, hashAdminToken } from "@/lib/tokens";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { generateUploadJobToken, hashUploadJobToken } from "@/lib/upload/job-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 3 * 1024 * 1024;

type UploadJobOk = {
  ok: true;
  job_id: string;
  job_token: string;
  status: "pending" | "processing" | "completed" | "failed";
  slug: string;
  admin_token: string;
  total: number;
  processed: number;
  inserted: number;
  failed: number;
  geocoder_stats: Record<string, number>;
  failure_preview: Array<{ row_index: number; address_raw: string; reason: string; attempted: string[] }>;
};
type UploadJobErr = { ok: false; error: { code: string; message: string } };

function jsonError(code: string, message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json<UploadJobErr>({ ok: false, error: { code, message } }, { status, headers });
}

export async function POST(req: NextRequest): Promise<NextResponse<UploadJobOk | UploadJobErr>> {
  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  if (!pepper) {
    return jsonError("SERVER_MISCONFIG", "Server pepper not configured.", 500);
  }

  const limit = await rateLimitRequest(req, "upload", LIMITS.upload);
  if (!limit.allowed) {
    return jsonError(
      "RATE_LIMITED",
      "업로드 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
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

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("NO_FILE", "파일을 선택해 주세요.", 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return jsonError("FILE_TOO_LARGE", "파일 크기는 3MB를 초과할 수 없습니다.", 413);
  }

  const title = String(form.get("title") ?? "").trim();
  if (!title) {
    return jsonError("NO_TITLE", "지도 제목을 입력해 주세요.", 400);
  }

  const description = String(form.get("description") ?? "").trim();
  const valueLabel = String(form.get("value_label") ?? "").trim() || null;
  const valueUnit = String(form.get("value_unit") ?? "").trim() || null;
  const categoryLabel = String(form.get("category_label") ?? "").trim() || null;

  const parsed = parseWorkbook(Buffer.from(await file.arrayBuffer()));
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const sensitiveHeaders = detectSensitiveHeaders(parsed.headers);
  if (sensitiveHeaders.length > 0) {
    return jsonError("SENSITIVE_HEADERS", sensitiveHeadersMessage(sensitiveHeaders), 400);
  }

  const sb = supabaseServer();
  const slug = generateSlug();
  const adminToken = generateAdminToken();
  const adminHash = hashAdminToken(adminToken, pepper);
  const jobToken = generateUploadJobToken();
  const jobTokenHash = hashUploadJobToken(jobToken, pepper);

  const { data: mapRow, error: mapErr } = await sb
    .from("maps")
    .insert({
      slug,
      admin_token_hash: adminHash,
      title,
      description,
      value_label: valueLabel,
      value_unit: valueUnit,
      category_label: categoryLabel,
      is_listed: false,
      source_file: file.name,
      geocoder_stats: {},
    })
    .select("id")
    .single();

  if (mapErr || !mapRow) {
    return jsonError("DB_INSERT_MAP", mapErr?.message ?? "지도 저장에 실패했습니다.", 500);
  }

  const { data: jobRow, error: jobErr } = await sb
    .from("upload_jobs")
    .insert({
      map_id: mapRow.id,
      slug,
      status: "pending",
      total_rows: parsed.rows.length,
      processed_rows: 0,
      inserted_count: 0,
      failed_count: 0,
      geocoder_stats: {},
      failure_preview: [],
      rows: parsed.rows,
      job_token_hash: jobTokenHash,
      source_file: file.name,
    })
    .select("id, status, total_rows, processed_rows, inserted_count, failed_count, geocoder_stats, failure_preview")
    .single();

  if (jobErr || !jobRow) {
    await sb.from("maps").delete().eq("id", mapRow.id);
    return jsonError("DB_INSERT_JOB", jobErr?.message ?? "업로드 작업 저장에 실패했습니다.", 500);
  }

  await recordAudit({
    action: "upload_job.create",
    mapId: mapRow.id,
    req,
    details: { slug, source_file: file.name, total_rows: parsed.rows.length },
  });

  return NextResponse.json<UploadJobOk>({
    ok: true,
    job_id: jobRow.id,
    job_token: jobToken,
    status: jobRow.status,
    slug,
    admin_token: adminToken,
    total: jobRow.total_rows,
    processed: jobRow.processed_rows,
    inserted: jobRow.inserted_count,
    failed: jobRow.failed_count,
    geocoder_stats: jobRow.geocoder_stats ?? {},
    failure_preview: jobRow.failure_preview ?? [],
  });
}
