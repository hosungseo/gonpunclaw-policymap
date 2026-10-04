import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit";
import { isStaffAuthorized } from "@/lib/staff-auth";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ErrPayload = { ok: false; error: { code: string; message: string } };
const REASON_MAX = 300;

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json<ErrPayload>({ ok: false, error: { code, message } }, { status });
}

// Checkbox "on" is intentionally rejected: the staff page submits a hidden "0"/"1" input.
function parseHidden(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

// Validate the resolved URL rather than the raw string so encoded traversal or absolute URLs cannot escape /staff/.
function sanitizeReturnTarget(raw: unknown, baseUrl: string): string {
  const fallback = "/staff/reports";
  if (typeof raw !== "string") return fallback;
  try {
    const url = new URL(raw.trim(), baseUrl);
    if (url.origin !== new URL(baseUrl).origin || !url.pathname.startsWith("/staff/")) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

async function parseBody(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    return {
      mapId: typeof form.get("map_id") === "string" ? String(form.get("map_id")).trim() : "",
      hidden: parseHidden(form.get("hidden")),
      reason: typeof form.get("reason") === "string" ? String(form.get("reason")).trim().slice(0, REASON_MAX) : "",
      returnTo: sanitizeReturnTarget(form.get("return_to"), req.url),
      isForm: true,
    };
  }
  const body = (await req.json().catch(() => null)) as { map_id?: unknown; hidden?: unknown; reason?: unknown; return_to?: unknown } | null;
  return {
    mapId: typeof body?.map_id === "string" ? body.map_id.trim() : "",
    hidden: parseHidden(body?.hidden),
    reason: typeof body?.reason === "string" ? body.reason.trim().slice(0, REASON_MAX) : "",
    returnTo: sanitizeReturnTarget(body?.return_to, req.url),
    isForm: false,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isStaffAuthorized())) return jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);

  const { mapId, hidden, reason, returnTo, isForm } = await parseBody(req);
  if (!mapId) return jsonError("BAD_MAP_ID", "지도 ID가 올바르지 않습니다.", 400);
  if (hidden === null) return jsonError("BAD_HIDDEN", "hidden 값은 true/false 여야 합니다.", 400);

  const sb = supabaseServer();
  const { data: map } = await sb.from("maps").select("id, slug, directory_hidden").eq("id", mapId).maybeSingle();
  if (!map) return jsonError("NOT_FOUND", "지도를 찾을 수 없습니다.", 404);

  const now = new Date().toISOString();
  const { error } = await sb.from("maps").update({
    directory_hidden: hidden,
    directory_hidden_at: hidden ? now : null,
    directory_hidden_reason: hidden ? (reason || null) : null,
    updated_at: now,
  }).eq("id", mapId);
  if (error) return jsonError("UPDATE_FAILED", error.message, 500);

  await recordAudit({
    action: hidden ? "map.directory_hide" : "map.directory_show",
    mapId,
    req,
    details: { slug: map.slug, reason: hidden ? reason || null : null, was_hidden: Boolean(map.directory_hidden) },
  });

  if (isForm) return NextResponse.redirect(new URL(returnTo, req.url), { status: 303 });
  return NextResponse.json({ ok: true, map_id: mapId, directory_hidden: hidden });
}
