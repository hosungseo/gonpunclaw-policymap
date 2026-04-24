import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";
import {
  STAFF_COOKIE,
  STAFF_SESSION_MAX_AGE,
  staffAuthConfig,
  verifyStaffToken,
} from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect(req: NextRequest, target: string): NextResponse {
  return NextResponse.redirect(new URL(target, req.url), { status: 303 });
}

const ALLOWED_REDIRECT_PREFIXES = ["/staff/audit", "/staff/reports"] as const;

function safeRedirect(raw: unknown, fallback = "/staff/audit"): string {
  if (typeof raw !== "string") return fallback;
  const v = raw.trim();
  if (!v.startsWith("/")) return fallback;
  return ALLOWED_REDIRECT_PREFIXES.some((p) => v === p || v.startsWith(`${p}?`) || v.startsWith(`${p}/`))
    ? v
    : fallback;
}

function withErr(target: string, err: string): string {
  const sep = target.includes("?") ? "&" : "?";
  return `${target}${sep}err=${err}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  let token = "";
  let redirectTarget = "/staff/audit";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const raw = form.get("token");
    if (typeof raw === "string") token = raw.trim();
    redirectTarget = safeRedirect(form.get("redirect_to"));
  } else {
    const body = (await req.json().catch(() => null)) as {
      token?: unknown;
      redirect_to?: unknown;
    } | null;
    if (typeof body?.token === "string") token = body.token.trim();
    redirectTarget = safeRedirect(body?.redirect_to);
  }

  const limit = await rateLimitRequest(req, "staff-login", LIMITS.adminAttempt);
  if (!limit.allowed) {
    return redirect(req, withErr(redirectTarget, "rate"));
  }

  const cfg = staffAuthConfig();
  if (!cfg.ok) {
    return redirect(req, withErr(redirectTarget, "config"));
  }

  if (!token || !verifyStaffToken(token)) {
    return redirect(req, withErr(redirectTarget, "auth"));
  }

  const res = redirect(req, redirectTarget);
  res.cookies.set({
    name: STAFF_COOKIE,
    value: cfg.expected,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STAFF_SESSION_MAX_AGE,
  });
  return res;
}
