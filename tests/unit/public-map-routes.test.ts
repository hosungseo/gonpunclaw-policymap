import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicMapRecord } from "@/lib/maps/load-public-map";
import { etagFor } from "@/lib/maps/public-api";

const mockLoad = vi.fn();
const mockRateLimit = vi.fn();

vi.mock("@/lib/maps/load-public-map", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/maps/load-public-map")>();
  return { ...actual, loadPublicMapRecord: (...args: unknown[]) => mockLoad(...args) };
});
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, rateLimitRequest: (...args: unknown[]) => mockRateLimit(...args) };
});

const record: PublicMapRecord = {
  map: {
    id: "map-1", slug: "abc123", title: "T", description: "", value_label: null, value_unit: null, category_label: null,
    is_listed: true, visibility: "unlisted", source_name: "S", source_url: null, data_as_of: "2026-01-01", owner_department: "O",
    contact: null, license: null, refresh_cycle: null, next_review_at: null, published_at: null, last_data_update_at: "2026-01-05T00:00:00Z",
    updated_at: "2026-01-06T00:00:00Z", review_required: false, approved_version_id: null, current_version_id: null, directory_hidden: false,
  },
  markers: [{ id: "m1", lat: 37.5, lng: 127, name: "A", value: null, category: null, address_normalized: null, extra: {}, quality_status: "success", included: true }],
  failedCount: 0,
  versionNumber: null,
  review: { status: "none", decidedAt: null },
};

// An allowlisted host so requestOrigin echoes it back in absolute links.
const HOST = "preview-r3.vercel.app";

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers: { host: HOST, "x-forwarded-proto": "https", ...headers } });
}
const ctx = { params: Promise.resolve({ slug: "abc123" }) };

describe("public map routes", () => {
  beforeEach(() => {
    mockLoad.mockReset();
    mockRateLimit.mockReset().mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  });

  it("returns JSON with meta, markers and cache/cors headers for unlisted maps", async () => {
    mockLoad.mockResolvedValue(record);
    const { GET } = await import("@/app/api/public/maps/[slug]/route");
    const res = await GET(req(`https://${HOST}/api/public/maps/abc123`), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=60");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-expose-headers")).toBe("ETag, Retry-After");
    expect(res.headers.get("etag")).toBe(etagFor(record));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.map.api.json).toBe(`https://${HOST}/api/public/maps/abc123`);
    expect(json.markers).toHaveLength(1);
    expect(mockLoad).toHaveBeenCalledWith("abc123");
  });

  it("returns 304 with ETag and Cache-Control when If-None-Match matches", async () => {
    mockLoad.mockResolvedValue(record);
    const { GET } = await import("@/app/api/public/maps/[slug]/route");
    const res = await GET(req(`https://${HOST}/api/public/maps/abc123`, { "if-none-match": etagFor(record) }), ctx);
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe(etagFor(record));
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=60");
  });

  it("returns 404 without Cache-Control for private or missing maps", async () => {
    mockLoad.mockResolvedValue(null);
    const { GET } = await import("@/app/api/public/maps/[slug]/route");
    const res = await GET(req(`https://${HOST}/api/public/maps/abc123`), ctx);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBeNull();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns 500 UPSTREAM with CORS headers when the loader fails (JSON)", async () => {
    mockLoad.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/public/maps/[slug]/route");
    const res = await GET(req(`https://${HOST}/api/public/maps/abc123`), ctx);
    errorSpy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBeNull();
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("UPSTREAM");
  });

  it("returns 500 UPSTREAM with CORS headers when the loader fails (GeoJSON)", async () => {
    mockLoad.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/public/maps/[slug]/geojson/route");
    const res = await GET(req(`https://${HOST}/api/public/maps/abc123/geojson`), ctx);
    errorSpy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect((await res.json()).error.code).toBe("UPSTREAM");
  });

  it("returns 429 with Retry-After when rate limited", async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 4000 });
    const { GET } = await import("@/app/api/public/maps/[slug]/route");
    const res = await GET(req(`https://${HOST}/api/public/maps/abc123`), ctx);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("4");
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("serves GeoJSON with the geo+json content type", async () => {
    mockLoad.mockResolvedValue(record);
    const { GET } = await import("@/app/api/public/maps/[slug]/geojson/route");
    const res = await GET(req(`https://${HOST}/api/public/maps/abc123/geojson`), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/geo+json");
    const fc = await res.json();
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features[0].geometry.coordinates).toEqual([127, 37.5]);
  });

  it("serves an empty feature list when no marker is included", async () => {
    mockLoad.mockResolvedValue({ ...record, markers: record.markers.map((m) => ({ ...m, included: false })) });
    const { GET } = await import("@/app/api/public/maps/[slug]/geojson/route");
    const res = await GET(req(`https://${HOST}/api/public/maps/abc123/geojson`), ctx);
    expect(res.status).toBe(200);
    const fc = await res.json();
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toEqual([]);
  });

  it("falls back to the canonical origin for links when the host is not allowlisted", async () => {
    mockLoad.mockResolvedValue(record);
    const { GET } = await import("@/app/api/public/maps/[slug]/route");
    const res = await GET(new Request("https://evil.example/api/public/maps/abc123", { headers: { host: "evil.example" } }), ctx);
    const json = await res.json();
    expect(json.map.api.json).toBe("https://gonpunclaw-policymap.vercel.app/api/public/maps/abc123");
  });

  it("answers OPTIONS preflight with 204", async () => {
    const { OPTIONS } = await import("@/app/api/public/maps/[slug]/route");
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
