import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";
import { supabaseServer } from "@/lib/supabase/server";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 500;
const LABEL_MAX = 40;

type UpdateBody = {
  admin_token?: string;
  title?: string;
  description?: string;
  value_label?: string | null;
  value_unit?: string | null;
  category_label?: string | null;
  is_listed?: boolean;
};

type UpdateOk = {
  ok: true;
  map: {
    slug: string;
    title: string;
    description: string;
    value_label: string | null;
    value_unit: string | null;
    category_label: string | null;
    is_listed: boolean;
  };
};
type UpdateErr = { ok: false; error: { code: string; message: string } };

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json<UpdateErr>({ ok: false, error: { code, message } }, { status });
}

function normalizeOptional(input: unknown, field: string, max: number): string | null | { error: string } {
  if (input === undefined || input === null) return null;
  if (typeof input !== "string") return { error: `${field} 값이 올바르지 않습니다.` };
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) return { error: `${field}은(는) ${max}자 이하로 입력해 주세요.` };
  return trimmed;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse<UpdateOk | UpdateErr>> {
  const { slug } = await context.params;

  const limit = await rateLimitRequest(req, "admin-update", LIMITS.adminAttempt);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요." } },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  let body: UpdateBody | null = null;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return jsonError("BAD_JSON", "요청 형식이 올바르지 않습니다.", 400);
  }

  const token = body?.admin_token?.trim();
  if (!token) {
    return jsonError("NO_TOKEN", "관리 토큰을 입력해 주세요.", 400);
  }

  const auth = await verifyAdminTokenForMap(slug, token);
  if (!auth.ok) {
    if (auth.reason === "NOT_FOUND") {
      await recordAudit({
        action: "admin.auth_fail",
        mapId: null,
        req,
        details: { slug, route: "update" },
      });
    }
    const message =
      auth.reason === "MISSING_PEPPER"
        ? "서버 설정이 올바르지 않습니다."
        : "지도 또는 관리 토큰을 확인할 수 없습니다.";
    const status = auth.reason === "MISSING_PEPPER" ? 500 : 404;
    return jsonError(auth.reason, message, status);
  }

  const update: Record<string, unknown> = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string") return jsonError("BAD_TITLE", "제목이 올바르지 않습니다.", 400);
    const title = body.title.trim();
    if (title.length === 0) return jsonError("NO_TITLE", "지도 제목을 입력해 주세요.", 400);
    if (title.length > TITLE_MAX) return jsonError("TITLE_TOO_LONG", `제목은 ${TITLE_MAX}자 이하로 입력해 주세요.`, 400);
    update.title = title;
  }

  if (body.description !== undefined) {
    if (typeof body.description !== "string") return jsonError("BAD_DESCRIPTION", "설명이 올바르지 않습니다.", 400);
    const description = body.description.trim();
    if (description.length > DESCRIPTION_MAX) {
      return jsonError("DESCRIPTION_TOO_LONG", `설명은 ${DESCRIPTION_MAX}자 이하로 입력해 주세요.`, 400);
    }
    update.description = description;
  }

  for (const field of ["value_label", "value_unit", "category_label"] as const) {
    if (body[field] !== undefined) {
      const result = normalizeOptional(body[field], field, LABEL_MAX);
      if (typeof result === "object" && result !== null && "error" in result) {
        return jsonError("BAD_FIELD", result.error, 400);
      }
      update[field] = result;
    }
  }

  if (body.is_listed !== undefined) {
    if (typeof body.is_listed !== "boolean") return jsonError("BAD_IS_LISTED", "공개 여부 값이 올바르지 않습니다.", 400);
    update.is_listed = body.is_listed;
  }

  if (Object.keys(update).length === 0) {
    return jsonError("NO_FIELDS", "변경할 필드를 지정해 주세요.", 400);
  }

  update.updated_at = new Date().toISOString();

  const sb = supabaseServer();

  let previousIsListed: boolean | null = null;
  if (body.is_listed !== undefined) {
    const { data: prev } = await sb
      .from("maps")
      .select("is_listed")
      .eq("id", auth.mapId)
      .single();
    if (prev) previousIsListed = prev.is_listed;
  }

  const { data, error } = await sb
    .from("maps")
    .update(update)
    .eq("id", auth.mapId)
    .select("slug, title, description, value_label, value_unit, category_label, is_listed")
    .single();

  if (error || !data) {
    return jsonError("UPDATE_FAILED", error?.message ?? "지도 수정에 실패했습니다.", 500);
  }

  const changedFields = Object.keys(update).filter((k) => k !== "updated_at");
  const auditDetails: Record<string, unknown> = {
    slug: data.slug,
    changed_fields: changedFields,
  };
  if (body.is_listed !== undefined && previousIsListed !== null && previousIsListed !== data.is_listed) {
    auditDetails.is_listed_before = previousIsListed;
    auditDetails.is_listed_after = data.is_listed;
  }
  await recordAudit({
    action: "map.update",
    mapId: auth.mapId,
    req,
    details: auditDetails,
  });

  return NextResponse.json<UpdateOk>({
    ok: true,
    map: {
      slug: data.slug,
      title: data.title,
      description: data.description ?? "",
      value_label: data.value_label ?? null,
      value_unit: data.value_unit ?? null,
      category_label: data.category_label ?? null,
      is_listed: data.is_listed,
    },
  });
}
