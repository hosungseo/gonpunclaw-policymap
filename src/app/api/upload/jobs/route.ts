import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { inspectWorkbook, parseWorkbook, parsedRowsForSensitiveScan, type ColumnMapping } from "@/lib/excel/parse";
import { scanSensitiveData, sensitiveFindingsMessage } from "@/lib/upload/sensitive";
import { supabaseServer } from "@/lib/supabase/server";
import { generateAdminToken, generateSlug, hashAdminToken } from "@/lib/tokens";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { generateUploadJobToken, hashUploadJobToken } from "@/lib/upload/job-token";
import { metadataValidationErrors, normalizeNullable, normalizeVisibility } from "@/lib/maps/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const configuredMaxBytes = Number(process.env.MAX_UPLOAD_BYTES);
const MAX_FILE_BYTES = Number.isFinite(configuredMaxBytes) && configuredMaxBytes > 0 ? configuredMaxBytes : 3 * 1024 * 1024;
const configuredRetentionDays = Number(process.env.UPLOAD_RETENTION_DAYS);
const RETENTION_DAYS = Number.isFinite(configuredRetentionDays) && configuredRetentionDays > 0 ? configuredRetentionDays : 30;

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
  preflight: Record<string, unknown>;
  quality_review_count: number;
  excluded_count: number;
  needs_review: boolean;
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
    return jsonError("FILE_TOO_LARGE", `파일 크기는 ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(1)}MB를 초과할 수 없습니다.`, 413);
  }
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    return jsonError("BAD_FILE_TYPE", "XLSX, XLS 또는 CSV 파일만 업로드할 수 있습니다.", 400);
  }

  const title = String(form.get("title") ?? "").trim();
  if (!title) {
    return jsonError("NO_TITLE", "지도 제목을 입력해 주세요.", 400);
  }

  const description = String(form.get("description") ?? "").trim();
  const valueLabel = String(form.get("value_label") ?? "").trim() || null;
  const valueUnit = String(form.get("value_unit") ?? "").trim() || null;
  const categoryLabel = String(form.get("category_label") ?? "").trim() || null;
  const visibility = normalizeVisibility(form.get("visibility"), "private");
  const metadata = {
    title,
    description,
    source_name: normalizeNullable(form.get("source_name"), 200),
    source_url: normalizeNullable(form.get("source_url"), 500),
    data_as_of: normalizeNullable(form.get("data_as_of"), 10),
    owner_department: normalizeNullable(form.get("owner_department"), 200),
    contact: normalizeNullable(form.get("contact"), 200),
    license: normalizeNullable(form.get("license"), 200),
    refresh_cycle: normalizeNullable(form.get("refresh_cycle"), 100),
    next_review_at: normalizeNullable(form.get("next_review_at"), 10),
    value_label: valueLabel,
    value_unit: valueUnit,
    category_label: categoryLabel,
    visibility,
  };
  const metadataErrors = metadataValidationErrors(metadata);
  if (metadataErrors.length > 0 && visibility !== "private") {
    return jsonError("METADATA_REQUIRED", `공개 범위로 발행하려면 다음 항목이 필요합니다: ${metadataErrors.join(", ")}`, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const inspection = inspectWorkbook(buffer, file.name);
  if (!inspection.ok) return NextResponse.json({ ok: false, error: inspection.error }, { status: 400 });
  const sheetName = String(form.get("sheet_name") ?? inspection.inspection.sheets[0]?.name ?? "");
  const sheet = inspection.inspection.sheets.find((item) => item.name === sheetName);
  if (!sheet) return jsonError("BAD_SHEET", "사용할 시트를 선택해 주세요.", 400);

  let mapping: Partial<ColumnMapping> | undefined;
  const mappingValue = form.get("mapping");
  if (typeof mappingValue === "string" && mappingValue.trim()) {
    try {
      mapping = JSON.parse(mappingValue) as Partial<ColumnMapping>;
    } catch {
      return jsonError("BAD_MAPPING", "열 연결 정보가 올바르지 않습니다.", 400);
    }
  }
  let publicExtraColumns: number[] | undefined;
  const extraValue = form.get("public_extra_columns");
  if (typeof extraValue === "string" && extraValue.trim()) {
    try {
      const parsedExtra = JSON.parse(extraValue) as unknown;
      publicExtraColumns = Array.isArray(parsedExtra) ? parsedExtra.filter((value): value is number => Number.isInteger(value)) : undefined;
    } catch {
      return jsonError("BAD_MAPPING", "공개 추가정보 열이 올바르지 않습니다.", 400);
    }
  }

  const parsed = parseWorkbook(buffer, {
    sheetName,
    mapping,
    publicExtraColumns,
    allowArbitraryAddressColumn: Boolean(mapping),
    includeRaw: true,
  });
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const publicIndices = [parsed.mapping.address, parsed.mapping.name, parsed.mapping.value, parsed.mapping.category, ...parsed.mapping.extra].filter((index): index is number => index != null);
  const findings = scanSensitiveData(parsed.headers, parsedRowsForSensitiveScan(parsed), publicIndices);
  const blockingFindings = findings.filter((finding) => finding.severity === "block");
  if (blockingFindings.length > 0) {
    return jsonError("SENSITIVE_HEADERS", sensitiveFindingsMessage(blockingFindings), 400);
  }
  const sensitiveConfirmed = form.get("sensitive_confirmed") === "true";
  if (findings.length > 0 && !sensitiveConfirmed) {
    return jsonError("SENSITIVE_CONFIRMATION_REQUIRED", sensitiveFindingsMessage(findings), 400);
  }

  const sb = supabaseServer();
  const slug = generateSlug();
  const adminToken = generateAdminToken();
  const adminHash = hashAdminToken(adminToken, pepper);
  const jobToken = generateUploadJobToken();
  const jobTokenHash = hashUploadJobToken(jobToken, pepper);
  const rowsForJob = parsed.rows.map(({ row_index, address_raw, name, value, category, extra }) => ({ row_index, address_raw, name, value, category, extra }));

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
      visibility: "private",
      source_file: file.name,
      source_name: metadata.source_name,
      source_url: metadata.source_url,
      data_as_of: metadata.data_as_of,
      owner_department: metadata.owner_department,
      contact: metadata.contact,
      license: metadata.license,
      refresh_cycle: metadata.refresh_cycle,
      next_review_at: metadata.next_review_at,
      public_extra_columns: parsed.mapping.extra.map((index) => parsed.headers[index]).filter(Boolean),
      column_mapping: parsed.mapping,
      source_retention_until: new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
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
      total_rows: rowsForJob.length,
      processed_rows: 0,
      inserted_count: 0,
      failed_count: 0,
      geocoder_stats: {},
      failure_preview: [],
      rows: rowsForJob,
      job_token_hash: jobTokenHash,
      source_file: file.name,
      sheet_name: parsed.sheetName,
      headers: parsed.headers,
      column_mapping: parsed.mapping,
      public_extra_columns: parsed.mapping.extra,
      requested_visibility: visibility,
      preflight: {
        file_name: file.name,
        file_type: inspection.inspection.fileType,
        sheet_count: inspection.inspection.sheets.length,
        headers: parsed.headers,
        empty_row_count: parsed.empty_row_count,
        skipped_empty_address: parsed.skipped_empty_address.length,
        duplicate_candidate_count: parsed.duplicate_candidate_count,
        value_stats: parsed.value_stats,
        sensitive_findings: findings.map(({ header, severity, kind, row_count }) => ({ header, severity, kind, row_count })),
        sensitive_confirmed: sensitiveConfirmed,
        mapping: parsed.mapping,
      },
    })
    .select("id, status, total_rows, processed_rows, inserted_count, failed_count, geocoder_stats, failure_preview, quality_review_count, excluded_count")
    .single();

  if (jobErr || !jobRow) {
    await sb.from("maps").delete().eq("id", mapRow.id);
    return jsonError("DB_INSERT_JOB", jobErr?.message ?? "업로드 작업 저장에 실패했습니다.", 500);
  }

  await recordAudit({
    action: "upload_job.create",
    mapId: mapRow.id,
    req,
    details: {
      slug,
      source_file: file.name,
      total_rows: parsed.rows.length,
      sheet_name: parsed.sheetName,
      public_column_count: publicIndices.length,
      sensitive_findings_count: findings.length,
      sensitive_confirmed: sensitiveConfirmed,
    },
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
    preflight: {
      file_name: file.name,
      file_type: inspection.inspection.fileType,
      sheet_count: inspection.inspection.sheets.length,
      headers: parsed.headers,
      empty_row_count: parsed.empty_row_count,
      skipped_empty_address: parsed.skipped_empty_address.length,
      duplicate_candidate_count: parsed.duplicate_candidate_count,
      value_stats: parsed.value_stats,
      sensitive_findings: findings.map(({ header, severity, kind, row_count }) => ({ header, severity, kind, row_count })),
      mapping: parsed.mapping,
    },
    quality_review_count: jobRow.quality_review_count ?? 0,
    excluded_count: jobRow.excluded_count ?? 0,
    needs_review: false,
  });
}
