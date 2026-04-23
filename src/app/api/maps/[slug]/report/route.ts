import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hashIp, recordAudit } from "@/lib/audit";
import { supabaseServer } from "@/lib/supabase/server";
import { LIMITS, ipKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASON_MIN = 10;
const REASON_MAX = 500;

type ReportOk = { ok: true };
type ReportErr = { ok: false; error: { code: string; message: string } };

function jsonError(code: string, message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json<ReportErr>(
    { ok: false, error: { code, message } },
    { status, headers },
  );
}

function extractFirstIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first ? first : null;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ReportOk | ReportErr>> {
  const { slug } = await context.params;

  const limit = rateLimit(ipKey(req, "report"), LIMITS.report);
  if (!limit.allowed) {
    return jsonError(
      "RATE_LIMITED",
      "신고 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
      429,
      { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
    );
  }

  let body: { reason?: unknown } | null = null;
  try {
    body = (await req.json()) as { reason?: unknown };
  } catch {
    return jsonError("BAD_JSON", "요청 형식이 올바르지 않습니다.", 400);
  }

  if (typeof body?.reason !== "string") {
    return jsonError("BAD_REASON", "신고 사유가 올바르지 않습니다.", 400);
  }
  const reason = body.reason.trim();
  if (reason.length < REASON_MIN) {
    return jsonError(
      "REASON_TOO_SHORT",
      `신고 사유를 ${REASON_MIN}자 이상 입력해 주세요.`,
      400,
    );
  }
  if (reason.length > REASON_MAX) {
    return jsonError(
      "REASON_TOO_LONG",
      `신고 사유는 ${REASON_MAX}자 이하로 입력해 주세요.`,
      400,
    );
  }

  const sb = supabaseServer();
  const { data: map } = await sb
    .from("maps")
    .select("id, is_listed")
    .eq("slug", slug)
    .maybeSingle();

  if (!map || !map.is_listed) {
    return jsonError("NOT_FOUND", "지도를 찾을 수 없습니다.", 404);
  }

  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  const rawIp = extractFirstIp(req);
  const reporterIpHash = pepper && rawIp ? hashIp(rawIp, pepper) : null;

  const { error } = await sb.from("reports").insert({
    map_id: map.id,
    reason,
    reporter_ip_hash: reporterIpHash,
  });

  if (error) {
    return jsonError("INSERT_FAILED", error.message, 500);
  }

  await recordAudit({
    action: "report.create",
    mapId: map.id,
    req,
    details: { slug, reason_length: reason.length },
  });

  return NextResponse.json<ReportOk>({ ok: true });
}
