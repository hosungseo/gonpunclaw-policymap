import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { processUploadJob, serializeUploadJob } from "@/lib/upload/process-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_JOBS_PER_RUN = 5;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get("authorization")?.trim();
  const headerSecret = req.headers.get("x-cron-secret")?.trim();
  return bearer === `Bearer ${secret}` || headerSecret === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "크론 인증을 확인할 수 없습니다." } },
      { status: 401 },
    );
  }

  const sb = supabaseServer();
  const nowIso = new Date().toISOString();
  const { count: cleaned } = await sb
    .from("upload_jobs")
    .delete({ count: "exact" })
    .in("status", ["completed", "failed"])
    .lt("cleanup_after", nowIso);

  const { data: jobs, error } = await sb
    .from("upload_jobs")
    .select("id")
    .in("status", ["pending", "processing"])
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_RUN);

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "JOB_LOOKUP_FAILED", message: error.message } },
      { status: 500 },
    );
  }

  const results = [];
  for (const job of jobs ?? []) {
    const result = await processUploadJob(req, job.id, { auth: "cron" });
    results.push(
      result.ok
        ? { ok: true, job: serializeUploadJob(result.job) }
        : { ok: false, code: result.code, message: result.message, status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    cleaned: cleaned ?? 0,
    processed: results.length,
    results,
  });
}

export const GET = POST;
