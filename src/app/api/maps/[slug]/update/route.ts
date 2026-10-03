import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";
import { supabaseServer } from "@/lib/supabase/server";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { isIsoDate, isVisibility, metadataValidationErrors, type Visibility } from "@/lib/maps/metadata";
import { reviewGate } from "@/lib/reviews/gate";

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
  visibility?: Visibility;
  source_name?: string | null;
  source_url?: string | null;
  data_as_of?: string | null;
  owner_department?: string | null;
  contact?: string | null;
  license?: string | null;
  refresh_cycle?: string | null;
  next_review_at?: string | null;
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
    visibility?: Visibility;
    source_name?: string | null;
    source_url?: string | null;
    data_as_of?: string | null;
    owner_department?: string | null;
    contact?: string | null;
    license?: string | null;
    refresh_cycle?: string | null;
    next_review_at?: string | null;
    last_data_update_at?: string | null;
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
    if (body.visibility === undefined) update.visibility = body.is_listed ? "public" : "private";
  }

  if (body.visibility !== undefined) {
    if (!isVisibility(body.visibility)) return jsonError("BAD_VISIBILITY", "공개 범위 값이 올바르지 않습니다.", 400);
    update.visibility = body.visibility;
    update.is_listed = body.visibility === "public";
  }

  for (const field of ["source_name", "source_url", "data_as_of", "owner_department", "contact", "license", "refresh_cycle", "next_review_at"] as const) {
    if (body[field] !== undefined) {
      const result = normalizeOptional(body[field], field, field === "source_url" ? 500 : field === "data_as_of" || field === "next_review_at" ? 10 : 200);
      if (typeof result === "object" && result !== null && "error" in result) return jsonError("BAD_FIELD", result.error, 400);
      if (field === "source_url" && result && !/^https?:\/\//i.test(result)) return jsonError("BAD_SOURCE_URL", "출처 URL은 http:// 또는 https://로 시작해야 합니다.", 400);
      if ((field === "data_as_of" || field === "next_review_at") && result && !isIsoDate(result)) return jsonError("BAD_DATE", `${field}은(는) 유효한 YYYY-MM-DD 날짜여야 합니다.`, 400);
      update[field] = result;
    }
  }

  if (Object.keys(update).length === 0) {
    return jsonError("NO_FIELDS", "변경할 필드를 지정해 주세요.", 400);
  }

  update.updated_at = new Date().toISOString();

  const sb = supabaseServer();

  let previousIsListed: boolean | null = null;
  let previousMap: Record<string, unknown> = {};
  const metadataFields = ["source_name", "source_url", "data_as_of", "owner_department"] as const;
  if (body.is_listed !== undefined || body.visibility !== undefined || metadataFields.some((field) => body[field] !== undefined)) {
    const { data: prev } = await sb
      .from("maps")
      .select("is_listed, visibility, title, description, source_name, source_url, data_as_of, owner_department, review_required, approved_version_id, current_version_id")
      .eq("id", auth.mapId)
      .single();
    if (prev) {
      previousIsListed = prev.is_listed;
      previousMap = prev as Record<string, unknown>;
    }
  }

  const currentVisibility = isVisibility(previousMap.visibility) ? previousMap.visibility : previousMap.is_listed ? "public" : "private";
  const nextVisibility = body.visibility ?? (body.is_listed !== undefined ? (body.is_listed ? "public" : "private") : (Object.keys(previousMap).length > 0 ? currentVisibility : null));
  if (nextVisibility && nextVisibility !== "private") {
    const merged = (field: string) => Object.prototype.hasOwnProperty.call(update, field) ? update[field] : previousMap[field];
    const validation = metadataValidationErrors({
      title: String(update.title ?? previousMap.title ?? ""),
      description: String(update.description ?? previousMap.description ?? ""),
      source_name: String(merged("source_name") ?? "") || null,
      source_url: String(merged("source_url") ?? "") || null,
      data_as_of: String(merged("data_as_of") ?? "") || null,
      owner_department: String(merged("owner_department") ?? "") || null,
      visibility: nextVisibility,
    });
    if (validation.length > 0) return jsonError("METADATA_REQUIRED", `공개 범위로 전환하려면 다음 항목이 필요합니다: ${validation.join(", ")}`, 400);
    // Opt-in review gate: rejects the whole request before any write when private → public/unlisted is unapproved.
    const gate = reviewGate({
      review_required: Boolean(previousMap.review_required),
      approved_version_id: (previousMap.approved_version_id as string | null) ?? null,
      current_version_id: (previousMap.current_version_id as string | null) ?? null,
      visibility: currentVisibility,
    }, nextVisibility);
    if (!gate.ok) return jsonError(gate.code, gate.message, 409);
  }

  const { data, error } = await sb
    .from("maps")
    .update(update)
    .eq("id", auth.mapId)
    .select("slug, title, description, value_label, value_unit, category_label, is_listed, visibility, source_name, source_url, data_as_of, owner_department, contact, license, refresh_cycle, next_review_at, last_data_update_at")
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
      visibility: data.visibility ?? (data.is_listed ? "public" : "private"),
      source_name: data.source_name ?? null,
      source_url: data.source_url ?? null,
      data_as_of: data.data_as_of ?? null,
      owner_department: data.owner_department ?? null,
      contact: data.contact ?? null,
      license: data.license ?? null,
      refresh_cycle: data.refresh_cycle ?? null,
      next_review_at: data.next_review_at ?? null,
      last_data_update_at: data.last_data_update_at ?? null,
    },
  });
}
