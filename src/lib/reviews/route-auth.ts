import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";
import { recordAudit } from "@/lib/audit";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";
import { verifyReviewTokenForMap } from "@/lib/reviews/tokens";

type ErrBody = { ok: false; error: { code: string; message: string } };

export function reviewJsonError(code: string, message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json<ErrBody>({ ok: false, error: { code, message } }, { status, headers });
}

type Authed = { ok: true; mapId: string; body: Record<string, unknown>; token: string };
type Denied = { ok: false; response: NextResponse };

/** Shared preamble: rate limit, parse body, verify the admin or review token (404 + audit on failure). */
async function authenticate(req: NextRequest, slug: string, route: string, tokenField: "admin_token" | "review_token"): Promise<Authed | Denied> {
  // Review links are shared with outsiders, so brute-force attempts are also bucketed per map slug.
  const limitPrefix = tokenField === "review_token" ? `review-${tokenField}-${slug}` : `review-${tokenField}`;
  const limit = await rateLimitRequest(req, limitPrefix, LIMITS.adminAttempt);
  if (!limit.allowed) {
    return { ok: false, response: reviewJsonError("RATE_LIMITED", "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.", 429, { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) }) };
  }
  const body = ((await req.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
  const token = typeof body[tokenField] === "string" ? (body[tokenField] as string).trim() : "";
  if (!token) return { ok: false, response: reviewJsonError("NO_TOKEN", tokenField === "admin_token" ? "관리 토큰을 입력해 주세요." : "검토 토큰이 없습니다.", 400) };

  const auth = tokenField === "admin_token" ? await verifyAdminTokenForMap(slug, token) : await verifyReviewTokenForMap(slug, token);
  if (!auth.ok) {
    if (auth.reason === "NOT_FOUND") {
      await recordAudit({ action: tokenField === "admin_token" ? "admin.auth_fail" : "review.auth_fail", mapId: null, req, details: { slug, route } });
    }
    const status = auth.reason === "MISSING_PEPPER" ? 500 : 404;
    const message = auth.reason === "MISSING_PEPPER" ? "서버 설정이 올바르지 않습니다." : "지도 또는 토큰을 확인할 수 없습니다.";
    return { ok: false, response: reviewJsonError(auth.reason, message, status) };
  }
  return { ok: true, mapId: auth.mapId, body, token };
}

export function withAdminToken(req: NextRequest, slug: string, route: string) {
  return authenticate(req, slug, route, "admin_token");
}

export function withReviewToken(req: NextRequest, slug: string, route: string) {
  return authenticate(req, slug, route, "review_token");
}
