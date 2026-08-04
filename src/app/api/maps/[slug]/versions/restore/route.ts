import { NextResponse } from "next/server";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";
import { recordAudit } from "@/lib/audit";
import { supabaseServer } from "@/lib/supabase/server";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";
import { tryCaptureMapVersion, type MapVersionSnapshot } from "@/lib/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INSERT_CHUNK = 500;

function error(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function POST(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const limit = await rateLimitRequest(req, "admin-version-restore", LIMITS.adminAttempt);
  if (!limit.allowed) return error("RATE_LIMITED", "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.", 429);
  const body = (await req.json().catch(() => null)) as { admin_token?: unknown; version_id?: unknown; confirmed?: unknown } | null;
  const token = typeof body?.admin_token === "string" ? body.admin_token.trim() : "";
  const versionId = typeof body?.version_id === "string" ? body.version_id.trim() : "";
  if (!token || !versionId) return error("BAD_REQUEST", "관리 토큰과 복원할 버전을 입력해 주세요.", 400);
  if (body?.confirmed !== true) return error("CONFIRMATION_REQUIRED", "복원 전 확인이 필요합니다.", 400);

  const auth = await verifyAdminTokenForMap(slug, token);
  if (!auth.ok) return error("BAD_TOKEN", "지도 또는 관리 토큰을 확인할 수 없습니다.", 404);
  const sb = supabaseServer();
  const { data: version, error: versionError } = await sb
    .from("map_versions")
    .select("id, version_number, snapshot")
    .eq("id", versionId)
    .eq("map_id", auth.mapId)
    .single();
  if (versionError || !version) return error("VERSION_NOT_FOUND", "복원할 버전을 찾을 수 없습니다.", 404);
  const snapshot = version.snapshot as MapVersionSnapshot;
  if (!snapshot || !Array.isArray(snapshot.markers) || !snapshot.map) return error("BAD_SNAPSHOT", "버전 스냅샷이 올바르지 않습니다.", 422);

  const { error: deleteFailuresError } = await sb.from("geocode_failures").delete().eq("map_id", auth.mapId);
  if (deleteFailuresError) return error("RESTORE_FAILED", deleteFailuresError.message, 500);
  const { error: deleteMarkersError } = await sb.from("markers").delete().eq("map_id", auth.mapId);
  if (deleteMarkersError) return error("RESTORE_FAILED", deleteMarkersError.message, 500);

  const markerPayload = snapshot.markers.map((marker) => ({ ...marker, map_id: auth.mapId }));
  for (let index = 0; index < markerPayload.length; index += INSERT_CHUNK) {
    const { error: insertError } = await sb.from("markers").insert(markerPayload.slice(index, index + INSERT_CHUNK));
    if (insertError) return error("RESTORE_FAILED", insertError.message, 500);
  }
  const failurePayload = snapshot.failures.map((failure) => ({ ...failure, map_id: auth.mapId }));
  for (let index = 0; index < failurePayload.length; index += INSERT_CHUNK) {
    const { error: insertError } = await sb.from("geocode_failures").insert(failurePayload.slice(index, index + INSERT_CHUNK));
    if (insertError) return error("RESTORE_FAILED", insertError.message, 500);
  }

  const mapSnapshot = snapshot.map;
  const now = new Date().toISOString();
  const { error: updateError } = await sb.from("maps").update({
    title: String(mapSnapshot.title ?? ""),
    description: String(mapSnapshot.description ?? ""),
    value_label: mapSnapshot.value_label ?? null,
    value_unit: mapSnapshot.value_unit ?? null,
    category_label: mapSnapshot.category_label ?? null,
    visibility: mapSnapshot.visibility ?? "private",
    is_listed: mapSnapshot.is_listed === true,
    source_name: mapSnapshot.source_name ?? null,
    source_url: mapSnapshot.source_url ?? null,
    data_as_of: mapSnapshot.data_as_of ?? null,
    owner_department: mapSnapshot.owner_department ?? null,
    contact: mapSnapshot.contact ?? null,
    license: mapSnapshot.license ?? null,
    refresh_cycle: mapSnapshot.refresh_cycle ?? null,
    next_review_at: mapSnapshot.next_review_at ?? null,
    public_extra_columns: mapSnapshot.public_extra_columns ?? [],
    column_mapping: mapSnapshot.column_mapping ?? {},
    last_data_update_at: now,
    updated_at: now,
  }).eq("id", auth.mapId);
  if (updateError) return error("RESTORE_FAILED", updateError.message, 500);

  const captured = await tryCaptureMapVersion({ mapId: auth.mapId, reason: `버전 ${version.version_number} 복원`, actorToken: token });
  await recordAudit({ action: "map.version_restore", mapId: auth.mapId, req, details: { slug, restored_version: version.version_number, marker_count: markerPayload.length, failed_count: failurePayload.length, captured_version: captured?.version_number ?? null } });
  return NextResponse.json({ ok: true, restored_version: version.version_number, new_version: captured?.version_number ?? null, public_url: `/m/${slug}` });
}
