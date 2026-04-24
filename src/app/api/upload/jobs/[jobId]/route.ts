import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { verifyUploadJobToken } from "@/lib/upload/job-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadJobErr = { ok: false; error: { code: string; message: string } };

export async function GET(
  req: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const { data: job, error } = await supabaseServer()
    .from("upload_jobs")
    .select("id, slug, status, total_rows, processed_rows, inserted_count, failed_count, geocoder_stats, failure_preview, error_message, job_token_hash")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json<UploadJobErr>(
      { ok: false, error: { code: "JOB_NOT_FOUND", message: "업로드 작업을 찾을 수 없습니다." } },
      { status: 404 },
    );
  }

  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  if (!pepper) {
    return NextResponse.json<UploadJobErr>(
      { ok: false, error: { code: "SERVER_MISCONFIG", message: "Server pepper not configured." } },
      { status: 500 },
    );
  }
  const url = new URL(req.url);
  const token = req.headers.get("x-upload-job-token")?.trim() || url.searchParams.get("job_token")?.trim() || "";
  if (!token || !job.job_token_hash || !verifyUploadJobToken(token, job.job_token_hash, pepper)) {
    return NextResponse.json<UploadJobErr>(
      { ok: false, error: { code: "BAD_JOB_TOKEN", message: "업로드 작업 토큰을 확인할 수 없습니다." } },
      { status: 401 },
    );
  }

  return NextResponse.json({
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
  });
}
