import { describe, expect, it } from "vitest";
import { etagFor, publicApiHeaders, publicMapMeta, publicMarker, toGeoJson } from "@/lib/maps/public-api";
import type { PublicMapRecord } from "@/lib/maps/load-public-map";

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

  it("derives a weak etag from the last data update and emits cache/cors headers", () => {
    const etag = etagFor(record);
    expect(etag).toBe('W/"2026-01-05T00:00:00Z"');
    const headers = publicApiHeaders(etag);
    expect(headers["Cache-Control"]).toBe("public, s-maxage=300, stale-while-revalidate=3600");
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers.ETag).toBe(etag);
  });

  it("falls back to updated_at for the etag", () => {
    expect(etagFor({ ...record, map: { ...record.map, last_data_update_at: null } })).toBe('W/"2026-01-06T00:00:00Z"');
  });
});
