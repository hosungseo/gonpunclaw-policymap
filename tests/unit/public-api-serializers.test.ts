import { describe, expect, it } from "vitest";
import { PUBLIC_API_CORS, etagFor, publicApiHeaders, publicApiLinks, publicMapMeta, publicMarker, requestOrigin, toGeoJson } from "@/lib/maps/public-api";
import type { PublicMapRecord } from "@/lib/maps/load-public-map";
import { SITE_ORIGIN } from "@/lib/share/embed";

const record: PublicMapRecord = {
  map: {
    id: "map-1", slug: "abc123", title: "T", description: "D", value_label: "예산", value_unit: "만원", category_label: "분류",
    is_listed: true, visibility: "public", source_name: "S", source_url: "https://s", data_as_of: "2026-01-01", owner_department: "O",
    contact: "c", license: "CC BY", refresh_cycle: "분기", next_review_at: null, published_at: "2026-01-02T00:00:00Z",
    last_data_update_at: "2026-01-05T00:00:00Z", updated_at: "2026-01-06T00:00:00Z", review_required: true, approved_version_id: "v1",
    current_version_id: "v1", directory_hidden: false,
  },
  markers: [
    { id: "m1", lat: 37.5, lng: 127.0, name: "A", value: 3, category: "c", address_normalized: "addr", extra: { x: 1 }, quality_status: "success", included: true },
    { id: "m2", lat: 1, lng: 2, name: "B", value: null, category: null, address_normalized: null, extra: {}, quality_status: "review", included: false },
  ],
  failedCount: 0,
  versionNumber: 4,
  review: { status: "approved", decidedAt: "2026-01-07T00:00:00Z" },
};

/** Mirrors the documented ETag recipe so expectations follow the fixture instead of a frozen string. */
function expectedEtag(r: PublicMapRecord): string {
  const included = r.markers.filter((m) => m.included !== false).length;
  return `W/"${r.map.updated_at ?? ""}:${r.map.last_data_update_at ?? ""}:${r.versionNumber ?? ""}:${r.review.status}:${included}"`;
}

describe("public api serializers", () => {
  it("builds metadata with absolute links and review status", () => {
    const meta = publicMapMeta(record, "https://example.test");
    expect(meta.slug).toBe("abc123");
    expect(meta.version_number).toBe(4);
    expect(meta.review).toEqual({ required: true, status: "approved" });
    expect(meta.api).toEqual({
      json: "https://example.test/api/public/maps/abc123",
      geojson: "https://example.test/api/public/maps/abc123/geojson",
      map: "https://example.test/m/abc123",
      embed: "https://example.test/embed/abc123",
    });
    expect(meta.license).toBe("CC BY");
  });

  it("exposes the same link set through publicApiLinks and tolerates a trailing slash", () => {
    expect(publicApiLinks("https://example.test/", "abc123")).toEqual(publicMapMeta(record, "https://example.test").api);
  });

  it("serializes only included markers without internal fields", () => {
    const markers = record.markers.filter((m) => m.included !== false).map(publicMarker);
    expect(markers).toEqual([{ id: "m1", name: "A", category: "c", value: 3, address: "addr", lat: 37.5, lng: 127.0, extra: { x: 1 } }]);
  });

  it("produces a FeatureCollection with point geometry and meta at the top level", () => {
    const meta = publicMapMeta(record, "https://example.test");
    const fc = toGeoJson(meta, [publicMarker(record.markers[0])]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.properties.slug).toBe("abc123");
    expect(fc.features[0]).toEqual({
      type: "Feature",
      id: "m1",
      geometry: { type: "Point", coordinates: [127.0, 37.5] },
      properties: { id: "m1", name: "A", category: "c", value: 3, address: "addr", extra: { x: 1 } },
    });
  });

  it("derives a weak etag from every input the body depends on and emits cache/cors headers", () => {
    const etag = etagFor(record);
    expect(etag).toBe(expectedEtag(record));
    expect(etag).toBe('W/"2026-01-06T00:00:00Z:2026-01-05T00:00:00Z:4:approved:1"');
    const headers = publicApiHeaders(etag);
    expect(headers["Cache-Control"]).toBe("public, s-maxage=300, stale-while-revalidate=60");
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Access-Control-Expose-Headers"]).toBe("ETag, Retry-After");
    expect(PUBLIC_API_CORS["Access-Control-Expose-Headers"]).toBe("ETag, Retry-After");
    expect(headers.ETag).toBe(etag);
  });

  it("changes the etag when updated_at, data freshness, version, review or marker count change", () => {
    const base = etagFor(record);
    expect(etagFor({ ...record, map: { ...record.map, updated_at: "2026-02-01T00:00:00Z" } })).not.toBe(base);
    expect(etagFor({ ...record, map: { ...record.map, last_data_update_at: null } })).not.toBe(base);
    expect(etagFor({ ...record, versionNumber: 5 })).not.toBe(base);
    expect(etagFor({ ...record, review: { status: "pending", decidedAt: null } })).not.toBe(base);
    expect(etagFor({ ...record, markers: record.markers.map((m) => ({ ...m, included: true })) })).not.toBe(base);
  });

  it("writes empty segments for null inputs", () => {
    const sparse: PublicMapRecord = { ...record, map: { ...record.map, updated_at: null, last_data_update_at: null }, versionNumber: null, review: { status: "none", decidedAt: null }, markers: [] };
    expect(etagFor(sparse)).toBe(expectedEtag(sparse));
    expect(etagFor(sparse)).toBe('W/":::none:0"');
  });
});

describe("requestOrigin", () => {
  const siteHost = new URL(SITE_ORIGIN).host;
  // `host` is a forbidden header for the fetch Request constructor and is silently dropped,
  // so tests that need a host different from the URL set `x-forwarded-host` instead.
  const make = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

  it("prefers x-forwarded-host over host when both are allowlisted", () => {
    expect(requestOrigin(make("https://internal.local/x", { host: "preview-abc.vercel.app", "x-forwarded-host": siteHost, "x-forwarded-proto": "https" }))).toBe(SITE_ORIGIN);
  });

  it("falls back to SITE_ORIGIN for an unknown host", () => {
    expect(requestOrigin(make("https://evil.example/x", { host: "evil.example", "x-forwarded-proto": "https" }))).toBe(SITE_ORIGIN);
    expect(requestOrigin(make("https://evil.example/x", { host: siteHost, "x-forwarded-host": "evil.example" }))).toBe(SITE_ORIGIN);
    expect(requestOrigin(make("https://evil.example/x", { host: "notvercel.app" }))).toBe(SITE_ORIGIN);
    expect(requestOrigin(make("https://evil.example/x", { host: `${siteHost}.evil.example` }))).toBe(SITE_ORIGIN);
  });

  it("accepts Vercel preview hosts, ignores the URL host and defaults to https", () => {
    expect(requestOrigin(make("http://127.0.0.1/x", { "x-forwarded-host": "preview-abc.vercel.app" }))).toBe("https://preview-abc.vercel.app");
    expect(requestOrigin(make("http://127.0.0.1/x", { "x-forwarded-host": "preview-abc.vercel.app", "x-forwarded-proto": "http" }))).toBe("https://preview-abc.vercel.app");
  });

  it("respects http for localhost with a port", () => {
    expect(requestOrigin(make("http://localhost:3000/x", { "x-forwarded-host": "localhost:3000", "x-forwarded-proto": "http" }))).toBe("http://localhost:3000");
    expect(requestOrigin(make("http://localhost:3000/x", { "x-forwarded-host": "127.0.0.1:3000", "x-forwarded-proto": "http" }))).toBe("http://127.0.0.1:3000");
    expect(requestOrigin(make("http://localhost:3000/x", { "x-forwarded-host": "localhost:3000" }))).toBe("https://localhost:3000");
  });

  it("uses the request URL origin without a host header only when that host is allowlisted", () => {
    expect(requestOrigin(make("http://localhost:3000/api/public/maps"))).toBe("http://localhost:3000");
    expect(requestOrigin(make(`${SITE_ORIGIN}/api/public/maps`))).toBe(SITE_ORIGIN);
    expect(requestOrigin(make("https://evil.example/api/public/maps"))).toBe(SITE_ORIGIN);
  });
});
