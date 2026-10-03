// Serializers and HTTP helpers for the read-only public map API.
import { effectiveVisibility, type PublicMapRecord, type PublicMarkerRow } from "@/lib/maps/load-public-map";
import type { Visibility } from "@/lib/maps/metadata";
import type { ReviewStatus } from "@/lib/reviews/gate";

export interface PublicMapMeta {
  slug: string;
  title: string;
  description: string;
  visibility: Visibility;
  source_name: string | null;
  source_url: string | null;
  data_as_of: string | null;
  owner_department: string | null;
  contact: string | null;
  license: string | null;
  refresh_cycle: string | null;
  published_at: string | null;
  last_data_update_at: string | null;
  version_number: number | null;
  review: { required: boolean; status: ReviewStatus };
  value_label: string | null;
  value_unit: string | null;
  category_label: string | null;
  api: { json: string; geojson: string; map: string; embed: string };
}

export interface PublicMarker {
  id: string;
  name: string | null;
  category: string | null;
  value: number | null;
  address: string | null;
  lat: number;
  lng: number;
  extra: Record<string, unknown>;
}

export function publicMapMeta(record: PublicMapRecord, origin: string): PublicMapMeta {
  const { map } = record;
  return {
    slug: map.slug,
    title: map.title,
    description: map.description ?? "",
    visibility: effectiveVisibility(map),
    source_name: map.source_name,
    source_url: map.source_url,
    data_as_of: map.data_as_of,
    owner_department: map.owner_department,
    contact: map.contact,
    license: map.license,
    refresh_cycle: map.refresh_cycle,
    published_at: map.published_at,
    last_data_update_at: map.last_data_update_at,
    version_number: record.versionNumber,
    review: { required: Boolean(map.review_required), status: record.review.status },
    value_label: map.value_label,
    value_unit: map.value_unit,
    category_label: map.category_label,
    api: {
      json: `${origin}/api/public/maps/${map.slug}`,
      geojson: `${origin}/api/public/maps/${map.slug}/geojson`,
      map: `${origin}/m/${map.slug}`,
      embed: `${origin}/embed/${map.slug}`,
    },
  };
}

export function publicMarker(m: PublicMarkerRow): PublicMarker {
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    value: m.value,
    address: m.address_normalized,
    lat: m.lat,
    lng: m.lng,
    extra: m.extra ?? {},
  };
}

export function includedPublicMarkers(record: PublicMapRecord): PublicMarker[] {
  return record.markers.filter((m) => m.included !== false).map(publicMarker);
}

export interface PublicFeatureCollection {
  type: "FeatureCollection";
  properties: PublicMapMeta;
  features: Array<{
    type: "Feature";
    id: string;
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Omit<PublicMarker, "lat" | "lng">;
  }>;
}

export function toGeoJson(meta: PublicMapMeta, markers: PublicMarker[]): PublicFeatureCollection {
  return {
    type: "FeatureCollection",
    properties: meta,
    features: markers.map(({ lat, lng, ...rest }) => ({
      type: "Feature",
      id: rest.id,
      // GeoJSON positions are [longitude, latitude].
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: rest,
    })),
  };
}

export function etagFor(record: PublicMapRecord): string {
  return `W/"${record.map.last_data_update_at ?? record.map.updated_at ?? record.map.slug}"`;
}

export const PUBLIC_API_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "If-None-Match",
};

export function publicApiHeaders(etag?: string): Record<string, string> {
  return {
    ...PUBLIC_API_CORS,
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    ...(etag ? { ETag: etag } : {}),
  };
}

export function requestOrigin(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) return `${proto ?? "https"}://${host}`;
  return new URL(req.url).origin;
}
