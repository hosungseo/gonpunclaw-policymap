import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadJobErr = { ok: false; error: { code: string; message: string } };

export async function GET(
  _req: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const { data: job, error } = await supabaseServer()
    .from("upload_jobs")
    .select("id, slug, status, total_rows, processed_rows, inserted_count, failed_count, geocoder_stats, failure_preview, error_message")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json<UploadJobErr>(
      { ok: false, error: { code: "JOB_NOT_FOUND", message: "업로드 작업을 찾을 수 없습니다." } },
      { status: 404 },
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
