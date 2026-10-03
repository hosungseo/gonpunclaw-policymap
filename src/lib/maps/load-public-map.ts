import { supabaseServer } from "@/lib/supabase/server";
import type { MapClientProps } from "@/app/m/[slug]/MapClient";
import type { Visibility } from "@/lib/maps/metadata";
import { reviewStatus, type ReviewStatus } from "@/lib/reviews/gate";

export const PUBLIC_MAP_FIELDS =
  "id, slug, title, description, value_label, value_unit, category_label, is_listed, visibility, source_name, source_url, data_as_of, owner_department, contact, license, refresh_cycle, next_review_at, published_at, last_data_update_at, updated_at, review_required, approved_version_id, current_version_id, directory_hidden";

export interface PublicMapRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  value_label: string | null;
  value_unit: string | null;
  category_label: string | null;
  is_listed: boolean;
  visibility: Visibility | null;
  source_name: string | null;
  source_url: string | null;
  data_as_of: string | null;
  owner_department: string | null;
  contact: string | null;
  license: string | null;
  refresh_cycle: string | null;
  next_review_at: string | null;
  published_at: string | null;
  last_data_update_at: string | null;
  updated_at: string | null;
  review_required: boolean | null;
  approved_version_id: string | null;
  current_version_id: string | null;
  directory_hidden: boolean | null;
}

export interface PublicMarkerRow {
  id: string;
  lat: number;
  lng: number;
  name: string | null;
  value: number | null;
  category: string | null;
  address_normalized: string | null;
  extra: Record<string, unknown> | null;
  quality_status: string | null;
  included: boolean | null;
}

export interface PublicMapRecord {
  map: PublicMapRow;
  /** All markers, including excluded ones (callers filter). */
  markers: PublicMarkerRow[];
  failedCount: number;
  versionNumber: number | null;
  review: { status: ReviewStatus; decidedAt: string | null };
}

export function effectiveVisibility(map: Pick<PublicMapRow, "visibility" | "is_listed">): Visibility {
  return map.visibility ?? (map.is_listed ? "public" : "private");
}

export async function loadPublicMapRecord(slug: string, opts?: { allowPrivate?: boolean }): Promise<PublicMapRecord | null> {
  const sb = supabaseServer();
  const { data: map } = await sb.from("maps").select(PUBLIC_MAP_FIELDS).eq("slug", slug).maybeSingle();
  if (!map) return null;
  const row = map as unknown as PublicMapRow;
  if (effectiveVisibility(row) === "private" && !opts?.allowPrivate) return null;

  const status = reviewStatus(row);
  const [{ data: markers }, { data: failures }, versionResult, reviewResult] = await Promise.all([
    sb.from("markers").select("id, lat, lng, name, value, category, address_normalized, extra, quality_status, included").eq("map_id", row.id),
    sb.from("geocode_failures").select("id").eq("map_id", row.id),
    row.current_version_id
      ? sb.from("map_versions").select("version_number").eq("id", row.current_version_id).maybeSingle()
      : Promise.resolve({ data: null as { version_number: number } | null }),
    status === "approved" && row.approved_version_id
      ? sb.from("map_reviews").select("decided_at").eq("map_id", row.id).eq("status", "approved").eq("version_id", row.approved_version_id).order("decided_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null as { decided_at: string | null } | null }),
  ]);

  return {
    map: row,
    markers: (markers ?? []) as PublicMarkerRow[],
    failedCount: failures?.length ?? 0,
    versionNumber: versionResult.data?.version_number ?? null,
    review: { status, decidedAt: reviewResult.data?.decided_at ?? null },
  };
}

export function toMapClientProps(record: PublicMapRecord): MapClientProps {
  const { map, markers } = record;
  return {
    slug: map.slug,
    title: map.title,
    description: map.description ?? "",
    valueLabel: map.value_label ?? null,
    valueUnit: map.value_unit ?? null,
    categoryLabel: map.category_label ?? null,
    visibility: effectiveVisibility(map),
    sourceName: map.source_name ?? null,
    sourceUrl: map.source_url ?? null,
    dataAsOf: map.data_as_of ?? null,
    ownerDepartment: map.owner_department ?? null,
    contact: map.contact ?? null,
    license: map.license ?? null,
    refreshCycle: map.refresh_cycle ?? null,
    nextReviewAt: map.next_review_at ?? null,
    lastDataUpdateAt: map.last_data_update_at ?? null,
    qualitySummary: {
      total: markers.length,
      review: markers.filter((m) => m.quality_status === "review").length,
      excluded: markers.filter((m) => m.included === false).length,
      failed: record.failedCount,
    },
    reviewBadge: record.review.status === "none"
      ? null
      : { status: record.review.status, versionNumber: record.versionNumber, decidedAt: record.review.decidedAt },
    markers: markers.filter((m) => m.included !== false).map((m) => ({
      id: m.id,
      lat: m.lat,
      lng: m.lng,
      name: m.name,
      value: m.value,
      category: m.category,
      address_normalized: m.address_normalized,
      extra: m.extra ?? {},
    })),
  };
}
