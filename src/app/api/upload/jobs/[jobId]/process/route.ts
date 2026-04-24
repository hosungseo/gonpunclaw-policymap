import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { processUploadJob, serializeUploadJob, type UploadJobOk } from "@/lib/upload/process-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadJobErr = { ok: false; error: { code: string; message: string } };

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json<UploadJobErr>({ ok: false, error: { code, message } }, { status });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> },
): Promise<NextResponse<UploadJobOk | UploadJobErr>> {
  const { jobId } = await context.params;
  const result = await processUploadJob(req, jobId, { auth: "token" });
  if (!result.ok) {
    return jsonError(result.code, result.message, result.status);
  }
  return NextResponse.json(serializeUploadJob(result.job));
}
