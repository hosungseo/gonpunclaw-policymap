import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit";
import { isStaffAuthorized } from "@/lib/staff-auth";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const ALLOWED_REPORT_STATUSES = [
  "pending",
  "reviewed",
  "dismissed",
  "resolved",
] as const;
export type ReportStatus = (typeof ALLOWED_REPORT_STATUSES)[number];

type OkPayload = { ok: true; id: string; status: ReportStatus };
type ErrPayload = { ok: false; error: { code: string; message: string } };

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json<ErrPayload>({ ok: false, error: { code, message } }, { status });
}

function parseStatus(raw: unknown): ReportStatus | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return (ALLOWED_REPORT_STATUSES as readonly string[]).includes(v) ? (v as ReportStatus) : null;
}

function sanitizeReturnTarget(raw: unknown): string {
  if (typeof raw !== "string") return "/staff/reports";
  const v = raw.trim();
  if (!v.startsWith("/staff/reports")) return "/staff/reports";
  return v;
}

async function parseBody(req: NextRequest): Promise<{
  id: string | null;
  status: ReportStatus | null;
  returnTo: string;
  isForm: boolean;
}> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await req.formData();
    const id = typeof form.get("id") === "string" ? String(form.get("id")).trim() : null;
    const status = parseStatus(form.get("status"));
    const returnTo = sanitizeReturnTarget(form.get("return_to"));
    return { id: id && id.length > 0 ? id : null, status, returnTo, isForm: true };
  }
  const body = (await req.json().catch(() => null)) as {
    id?: unknown;
    status?: unknown;
    return_to?: unknown;
  } | null;
  const idRaw = typeof body?.id === "string" ? body.id.trim() : null;
  return {
    id: idRaw && idRaw.length > 0 ? idRaw : null,
    status: parseStatus(body?.status),
    returnTo: sanitizeReturnTarget(body?.return_to),
    isForm: false,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authed = await isStaffAuthorized();
  if (!authed) {
    return jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  }

  const { id, status, returnTo, isForm } = await parseBody(req);

  if (!id) {
    return jsonError("BAD_ID", "리포트 ID가 올바르지 않습니다.", 400);
  }
  if (!status) {
    return jsonError(
      "BAD_STATUS",
      `상태는 ${ALLOWED_REPORT_STATUSES.join(", ")} 중 하나여야 합니다.`,
      400,
    );
  }

  const sb = supabaseServer();
  const { data: prev } = await sb
    .from("reports")
    .select("id, status, map_id")
    .eq("id", id)
    .maybeSingle();
  if (!prev) {
    return jsonError("NOT_FOUND", "리포트를 찾을 수 없습니다.", 404);
  }

  if (prev.status !== status) {
    const { error } = await sb.from("reports").update({ status }).eq("id", id);
    if (error) {
      return jsonError("UPDATE_FAILED", error.message, 500);
    }
    await recordAudit({
      action: "report.update",
      mapId: prev.map_id ?? null,
      req,
      details: {
        report_id: id,
        status_before: prev.status,
        status_after: status,
      },
    });
  }

  if (isForm) {
    return NextResponse.redirect(new URL(returnTo, req.url), { status: 303 });
  }
  return NextResponse.json<OkPayload>({ ok: true, id, status });
}
