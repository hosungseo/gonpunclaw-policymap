// Serializers and HTTP helpers for the read-only public map API.
import { effectiveVisibility, type PublicMapRecord, type PublicMarkerRow } from "@/lib/maps/load-public-map";
import type { Visibility } from "@/lib/maps/metadata";
import type { ReviewStatus } from "@/lib/reviews/gate";
import { SITE_ORIGIN, buildApiUrl, buildEmbedUrl, buildGeoJsonUrl, buildMapUrl } from "@/lib/share/embed";

export interface PublicApiLinks {
  json: string;
  geojson: string;
  map: string;
  embed: string;
}

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
  api: PublicApiLinks;
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

/** Absolute links for one map; shared by the detail serializer and the directory list. */
export function publicApiLinks(origin: string, slug: string): PublicApiLinks {
  return {
    json: buildApiUrl(origin, slug),
    geojson: buildGeoJsonUrl(origin, slug),
    map: buildMapUrl(origin, slug),
    embed: buildEmbedUrl(origin, slug),
  };
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
    api: publicApiLinks(origin, map.slug),
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

/**
 * Weak ETag covering everything the response body depends on: map metadata (updated_at),
 * data freshness, live version, review status and the number of markers actually served.
 */
export function etagFor(record: PublicMapRecord): string {
  const includedCount = record.markers.filter((m) => m.included !== false).length;
  const parts = [
    record.map.updated_at ?? "",
    record.map.last_data_update_at ?? "",
    record.versionNumber ?? "",
    record.review.status,
    includedCount,
  ];
  return `W/"${parts.join(":")}"`;
}

export const PUBLIC_API_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "If-None-Match",
  "Access-Control-Expose-Headers": "ETag, Retry-After",
};

export function publicApiHeaders(etag?: string): Record<string, string> {
  return {
    ...PUBLIC_API_CORS,
    // Short stale window: a map can be switched to private and should drop out of caches quickly.
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
    ...(etag ? { ETag: etag } : {}),
  };
}

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1)(:\d+)?$/;
const HOST_SHAPE_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*(:\d+)?$/;

function isLocalHost(host: string): boolean {
  return LOCAL_HOST_RE.test(host);
}

/** Hosts we are willing to echo back in absolute links: the site itself, Vercel previews and local dev. */
function isAllowedHost(host: string): boolean {
  if (!HOST_SHAPE_RE.test(host)) return false;
  return host === new URL(SITE_ORIGIN).host || host.endsWith(".vercel.app") || isLocalHost(host);
}

function firstHeaderValue(req: Request, name: string): string | null {
  const value = req.headers.get(name)?.split(",")[0]?.trim().toLowerCase();
  return value ? value : null;
}

/**
 * Origin used for absolute links in responses. Forwarded/host headers are attacker-controlled,
 * so they are only honoured for an allowlisted host; anything else falls back to SITE_ORIGIN.
 */
export function requestOrigin(req: Request): string {
  const headerHost = firstHeaderValue(req, "x-forwarded-host") ?? firstHeaderValue(req, "host");
  if (!headerHost) {
    const url = new URL(req.url);
    return isAllowedHost(url.host.toLowerCase()) ? url.origin : SITE_ORIGIN;
  }
  if (!isAllowedHost(headerHost)) return SITE_ORIGIN;
  const forwardedProto = firstHeaderValue(req, "x-forwarded-proto");
  const proto = forwardedProto === "http" && isLocalHost(headerHost) ? "http" : "https";
  return `${proto}://${headerHost}`;
}
