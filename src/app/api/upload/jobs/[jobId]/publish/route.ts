import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { verifyUploadJobToken } from "@/lib/upload/job-token";
import { metadataValidationErrors, normalizeNullable, normalizeVisibility, mapVisibilityToListed } from "@/lib/maps/metadata";
import { recordAudit } from "@/lib/audit";
import { tryCaptureMapVersion } from "@/lib/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ErrorBody = { ok: false; error: { code: string; message: string } };
function error(code: string, message: string, status: number) {
  return NextResponse.json<ErrorBody>({ ok: false, error: { code, message } }, { status });
}

export async function POST(req: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const sb = supabaseServer();
  const { data: job, error: jobError } = await sb.from("upload_jobs").select("id, map_id, slug, status, job_token_hash, quality_review_count, failed_count, requested_visibility").eq("id", jobId).single();
  if (jobError || !job) return error("JOB_NOT_FOUND", "업로드 작업을 찾을 수 없습니다.", 404);
  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  const token = req.headers.get("x-upload-job-token")?.trim() ?? "";
  if (!pepper || !token || !job.job_token_hash || !verifyUploadJobToken(token, job.job_token_hash, pepper)) return error("BAD_JOB_TOKEN", "업로드 작업 토큰을 확인할 수 없습니다.", 401);
  if (job.status !== "completed") return error("JOB_NOT_COMPLETED", "주소 변환 작업이 끝난 뒤 발행할 수 있습니다.", 409);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const visibility = normalizeVisibility(body?.visibility, normalizeVisibility(job.requested_visibility, "private"));
  const metadata = {
    title: typeof body?.title === "string" ? body.title.trim() : "",
    description: normalizeNullable(body?.description, 1000),
    source_name: normalizeNullable(body?.source_name, 200),
    source_url: normalizeNullable(body?.source_url, 500),
    data_as_of: normalizeNullable(body?.data_as_of, 10),
    owner_department: normalizeNullable(body?.owner_department, 200),
    contact: normalizeNullable(body?.contact, 200),
    license: normalizeNullable(body?.license, 200),
    refresh_cycle: normalizeNullable(body?.refresh_cycle, 100),
    next_review_at: normalizeNullable(body?.next_review_at, 10),
    value_label: normalizeNullable(body?.value_label, 80),
    value_unit: normalizeNullable(body?.value_unit, 40),
    category_label: normalizeNullable(body?.category_label, 80),
    visibility,
  };
  const metadataErrors = metadataValidationErrors(metadata);
  if (metadataErrors.length > 0 && visibility !== "private") return error("METADATA_REQUIRED", `공개 범위로 발행하려면 다음 항목이 필요합니다: ${metadataErrors.join(", ")}`, 400);

  const { data: reviewMarkers, error: reviewError } = await sb.from("markers").select("row_index, included, quality_status").eq("map_id", job.map_id).eq("quality_status", "review");
  if (reviewError) return error("REVIEW_LOAD_FAILED", "주소 품질 상태를 확인하지 못했습니다.", 500);
  const includedReviewCount = (reviewMarkers ?? []).filter((marker) => marker.included !== false).length;
  const reviewConfirmed = body?.review_confirmed === true;
  if (includedReviewCount > 0 && !reviewConfirmed) return error("REVIEW_CONFIRMATION_REQUIRED", `검수 필요 위치 ${includedReviewCount.toLocaleString()}건을 확인하거나 제외한 뒤 발행해 주세요.`, 400);

  const sourceConfirmed = body?.source_confirmed === true;
  const asOfConfirmed = body?.as_of_confirmed === true;
  const sensitiveConfirmed = body?.sensitive_confirmed === true;
  if (visibility !== "private" && (!sourceConfirmed || !asOfConfirmed || !sensitiveConfirmed)) return error("PUBLISH_CONFIRMATION_REQUIRED", "출처·기준일·민감정보 확인을 모두 체크해 주세요.", 400);

  const now = new Date().toISOString();
  const { data: updatedMap, error: updateError } = await sb.from("maps").update({
    title: metadata.title,
    description: metadata.description ?? "",
    value_label: metadata.value_label,
    value_unit: metadata.value_unit,
    category_label: metadata.category_label,
    visibility,
    is_listed: mapVisibilityToListed(visibility),
    source_name: metadata.source_name,
    source_url: metadata.source_url,
    data_as_of: metadata.data_as_of,
    owner_department: metadata.owner_department,
    contact: metadata.contact,
    license: metadata.license,
    refresh_cycle: metadata.refresh_cycle,
    next_review_at: metadata.next_review_at,
    published_at: visibility === "private" ? null : now,
    metadata_confirmed_at: now,
    updated_at: now,
  }).eq("id", job.map_id).select("slug, title, visibility, is_listed, published_at, data_as_of, source_name, owner_department").single();
  if (updateError || !updatedMap) return error("PUBLISH_FAILED", updateError?.message ?? "지도 발행에 실패했습니다.", 500);

  await sb.from("upload_jobs").update({ review_confirmed_at: reviewConfirmed ? now : null, publish_confirmed_at: now, updated_at: now }).eq("id", job.id);
  const version = await tryCaptureMapVersion({ mapId: job.map_id, reason: "초기 지도 발행", actorToken: token });
  await recordAudit({ action: "map.publish", mapId: job.map_id, req, details: { slug: job.slug, visibility, review_confirmed: reviewConfirmed, source_confirmed: sourceConfirmed, as_of_confirmed: asOfConfirmed, sensitive_confirmed: sensitiveConfirmed, included_review_count: includedReviewCount, failed_count: job.failed_count ?? 0, version_number: version?.version_number ?? null } });
  return NextResponse.json({ ok: true, map: updatedMap, public_url: `/m/${job.slug}`, manage_url: `/manage/${job.slug}` });
}
