import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { verifyUploadJobToken } from "@/lib/upload/job-token";
import { reviewRowsToCsv } from "@/lib/export/review-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const sb = supabaseServer();
  const { data: job } = await sb.from("upload_jobs").select("id, map_id, slug, job_token_hash").eq("id", jobId).single();
  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  const token = req.headers.get("x-upload-job-token")?.trim() ?? "";
  if (!job || !pepper || !token || !job.job_token_hash || !verifyUploadJobToken(token, job.job_token_hash, pepper)) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "업로드 작업 또는 토큰을 확인할 수 없습니다." } }, { status: 404 });
  const [{ data: failures }, { data: excluded }] = await Promise.all([
    sb.from("geocode_failures").select("row_index, address_raw, address_current, reason, included").eq("map_id", job.map_id),
    sb.from("markers").select("row_index, address_raw, quality_reason, included").eq("map_id", job.map_id).eq("included", false),
  ]);
  const rows = [
    ...(failures ?? []).map((row) => ({ ...row, status: "실패", reason: row.reason })),
    ...(excluded ?? []).map((row) => ({ row_index: row.row_index, status: "제외", address_raw: row.address_raw, address_current: row.address_raw, reason: row.quality_reason, included: row.included })),
  ].sort((a, b) => a.row_index - b.row_index);
  return new Response(reviewRowsToCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${job.slug}-review.csv"` } });
}
