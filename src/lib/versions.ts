import { createHash } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";

export type VersionMarkerSnapshot = {
  row_index: number;
  address_raw: string;
  address_normalized: string | null;
  lat: number;
  lng: number;
  name: string | null;
  value: number | null;
  category: string | null;
  extra: Record<string, unknown>;
  geocoder_used: string;
  quality_status: "success" | "review" | "manual";
  quality_reason: string | null;
  included: boolean;
  original_address: string | null;
  manual_corrected: boolean;
};

export type VersionFailureSnapshot = {
  row_index: number;
  address_raw: string;
  address_current: string | null;
  reason: string;
  attempted_providers: string[];
  included: boolean;
  quality_status: "failed";
};

export type MapVersionSnapshot = {
  map: Record<string, unknown>;
  markers: VersionMarkerSnapshot[];
  failures: VersionFailureSnapshot[];
};

export type VersionChangeSummary = {
  reason: string;
  added: number;
  deleted: number;
  updated: number;
  coordinateChanged: number;
  includedChanged: number;
  changedRows: number[];
};

const MAP_SNAPSHOT_FIELDS = [
  "slug", "title", "description", "value_label", "value_unit", "category_label", "visibility", "is_listed",
  "source_name", "source_url", "data_as_of", "owner_department", "contact", "license", "refresh_cycle",
  "next_review_at", "public_extra_columns", "column_mapping",
] as const;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

function snapshotMarker(marker: Record<string, unknown>): VersionMarkerSnapshot {
  return {
    row_index: Number(marker.row_index),
    address_raw: String(marker.address_raw ?? ""),
    address_normalized: typeof marker.address_normalized === "string" ? marker.address_normalized : null,
    lat: Number(marker.lat),
    lng: Number(marker.lng),
    name: typeof marker.name === "string" ? marker.name : null,
    value: typeof marker.value === "number" ? marker.value : marker.value == null ? null : Number(marker.value),
    category: typeof marker.category === "string" ? marker.category : null,
    extra: (marker.extra as Record<string, unknown>) ?? {},
    geocoder_used: String(marker.geocoder_used ?? ""),
    quality_status: marker.quality_status === "manual" ? "manual" : marker.quality_status === "review" ? "review" : "success",
    quality_reason: typeof marker.quality_reason === "string" ? marker.quality_reason : null,
    included: marker.included !== false,
    original_address: typeof marker.original_address === "string" ? marker.original_address : null,
    manual_corrected: marker.manual_corrected === true,
  };
}

function snapshotFailure(failure: Record<string, unknown>): VersionFailureSnapshot {
  return {
    row_index: Number(failure.row_index),
    address_raw: String(failure.address_raw ?? ""),
    address_current: typeof failure.address_current === "string" ? failure.address_current : null,
    reason: String(failure.reason ?? ""),
    attempted_providers: Array.isArray(failure.attempted_providers) ? failure.attempted_providers.map(String) : [],
    included: failure.included === true,
    quality_status: "failed",
  };
}

export function diffVersionSnapshots(previous: MapVersionSnapshot | null, current: MapVersionSnapshot): VersionChangeSummary {
  const before = new Map((previous?.markers ?? []).map((marker) => [marker.row_index, marker]));
  const after = new Map(current.markers.map((marker) => [marker.row_index, marker]));
  let added = 0;
  let deleted = 0;
  let updated = 0;
  let coordinateChanged = 0;
  let includedChanged = 0;
  const changedRows: number[] = [];

  for (const [rowIndex, marker] of after) {
    const old = before.get(rowIndex);
    if (!old) {
      added += 1;
      changedRows.push(rowIndex);
      continue;
    }
    const coordinateChangedHere = old.lat !== marker.lat || old.lng !== marker.lng;
    const includedChangedHere = old.included !== marker.included;
    const contentChanged = stableJson({
      address_raw: old.address_raw,
      address_normalized: old.address_normalized,
      name: old.name,
      value: old.value,
      category: old.category,
      extra: old.extra,
      quality_status: old.quality_status,
      quality_reason: old.quality_reason,
      manual_corrected: old.manual_corrected,
    }) !== stableJson({
      address_raw: marker.address_raw,
      address_normalized: marker.address_normalized,
      name: marker.name,
      value: marker.value,
      category: marker.category,
      extra: marker.extra,
      quality_status: marker.quality_status,
      quality_reason: marker.quality_reason,
      manual_corrected: marker.manual_corrected,
    });
    if (coordinateChangedHere) coordinateChanged += 1;
    if (includedChangedHere) includedChanged += 1;
    if (coordinateChangedHere || includedChangedHere || contentChanged) {
      updated += 1;
      changedRows.push(rowIndex);
    }
  }
  for (const rowIndex of before.keys()) {
    if (!after.has(rowIndex)) {
      deleted += 1;
      changedRows.push(rowIndex);
    }
  }

  return {
    reason: "",
    added,
    deleted,
    updated,
    coordinateChanged,
    includedChanged,
    changedRows: Array.from(new Set(changedRows)).sort((a, b) => a - b).slice(0, 100),
  };
}

export function actorHash(token: string | null | undefined): string | null {
  if (!token) return null;
  return createHash("sha256").update(token).digest("hex");
}

export async function captureMapVersion({
  mapId,
  reason,
  actorToken,
}: {
  mapId: string;
  reason: string;
  actorToken?: string | null;
}) {
  const sb = supabaseServer();
  const [{ data: map, error: mapError }, { data: markers, error: markerError }, { data: failures, error: failureError }, { data: previous }] = await Promise.all([
    sb.from("maps").select(MAP_SNAPSHOT_FIELDS.join(", ")).eq("id", mapId).single(),
    sb.from("markers").select("row_index, address_raw, address_normalized, lat, lng, name, value, category, extra, geocoder_used, quality_status, quality_reason, included, original_address, manual_corrected").eq("map_id", mapId).order("row_index"),
    sb.from("geocode_failures").select("row_index, address_raw, address_current, reason, attempted_providers, included, quality_status").eq("map_id", mapId).order("row_index"),
    sb.from("map_versions").select("version_number, snapshot").eq("map_id", mapId).order("version_number", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (mapError || !map) throw new Error(mapError?.message ?? "지도 버전의 기준 지도를 찾을 수 없습니다.");
  if (markerError) throw new Error(markerError.message);
  if (failureError) throw new Error(failureError.message);

  const snapshot: MapVersionSnapshot = {
    map: Object.fromEntries(MAP_SNAPSHOT_FIELDS.map((field) => [field, (map as unknown as Record<string, unknown>)[field]])),
    markers: (markers ?? []).map((marker) => snapshotMarker(marker as Record<string, unknown>)),
    failures: (failures ?? []).map((failure) => snapshotFailure(failure as Record<string, unknown>)),
  };
  const previousSnapshot = previous?.snapshot && typeof previous.snapshot === "object" ? previous.snapshot as MapVersionSnapshot : null;
  const changeSummary = { ...diffVersionSnapshots(previousSnapshot, snapshot), reason };
  const nextVersion = Number(previous?.version_number ?? 0) + 1;
  const mapRecord = map as unknown as Record<string, unknown>;
  const visibility = mapRecord.visibility === "public" || (mapRecord.visibility == null && mapRecord.is_listed === true) ? "published" : "draft";
  const now = new Date().toISOString();
  const { data: version, error: versionError } = await sb.from("map_versions").insert({
    map_id: mapId,
    version_number: nextVersion,
    status: visibility,
    reason,
    change_summary: changeSummary,
    snapshot,
    created_by_hash: actorHash(actorToken),
    published_at: visibility === "published" ? now : null,
  }).select("id, version_number, status, reason, change_summary, created_at, published_at").single();
  if (versionError || !version) throw new Error(versionError?.message ?? "지도 버전 저장에 실패했습니다.");
  await sb.from("maps").update({ current_version_id: version.id, updated_at: now }).eq("id", mapId);
  return version;
}

export async function tryCaptureMapVersion(input: { mapId: string; reason: string; actorToken?: string | null }) {
  try {
    return await captureMapVersion(input);
  } catch (error) {
    console.error("[map-version] capture failed", error);
    return null;
  }
}
