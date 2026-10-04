import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import type { MapClientProps } from "@/app/m/[slug]/MapClient";
import { formatKoreanDate, type Visibility } from "@/lib/maps/metadata";
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

/** Supabase query result shape; `error` is surfaced instead of being treated as an empty result. */
interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function unwrap<T>(result: QueryResult<T>): T | null {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/**
 * Loads a map with its markers for the viewer, embed, reviewer and public API.
 * Memoized per request with React `cache` so `generateMetadata` and the page share one fetch.
 * Query errors throw so an outage or an unapplied migration fails loudly rather than rendering an empty map.
 */
export const loadPublicMapRecord = cache(async (slug: string, allowPrivate = false): Promise<PublicMapRecord | null> => {
  const sb = supabaseServer();
  const map = unwrap<PublicMapRow>(await sb.from("maps").select(PUBLIC_MAP_FIELDS).eq("slug", slug).maybeSingle() as unknown as QueryResult<PublicMapRow>);
  if (!map) return null;
  if (effectiveVisibility(map) === "private" && !allowPrivate) return null;

  const status = reviewStatus(map);
  const [markersResult, failuresResult, versionResult, reviewResult] = await Promise.all([
    sb.from("markers").select("id, lat, lng, name, value, category, address_normalized, extra, quality_status, included").eq("map_id", map.id) as unknown as Promise<QueryResult<PublicMarkerRow[]>>,
    sb.from("geocode_failures").select("id").eq("map_id", map.id) as unknown as Promise<QueryResult<{ id: string }[]>>,
    map.current_version_id
      ? (sb.from("map_versions").select("version_number").eq("id", map.current_version_id).maybeSingle() as unknown as Promise<QueryResult<{ version_number: number }>>)
      : Promise.resolve<QueryResult<{ version_number: number }>>({ data: null, error: null }),
    status === "approved" && map.approved_version_id
      ? (sb.from("map_reviews").select("decided_at").eq("map_id", map.id).eq("status", "approved").eq("version_id", map.approved_version_id).order("decided_at", { ascending: false }).limit(1).maybeSingle() as unknown as Promise<QueryResult<{ decided_at: string | null }>>)
      : Promise.resolve<QueryResult<{ decided_at: string | null }>>({ data: null, error: null }),
  ]);

  return {
    map,
    markers: unwrap(markersResult) ?? [],
    failedCount: unwrap(failuresResult)?.length ?? 0,
    versionNumber: unwrap(versionResult)?.version_number ?? null,
    review: { status, decidedAt: unwrap(reviewResult)?.decided_at ?? null },
  };
});

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
    lastDataUpdateLabel: formatKoreanDate(map.last_data_update_at),
    qualitySummary: {
      total: markers.length,
      review: markers.filter((m) => m.quality_status === "review").length,
      excluded: markers.filter((m) => m.included === false).length,
      failed: record.failedCount,
    },
    reviewBadge: record.review.status === "none"
      ? null
      : { status: record.review.status, versionNumber: record.versionNumber, decidedAtLabel: formatKoreanDate(record.review.decidedAt) },
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
