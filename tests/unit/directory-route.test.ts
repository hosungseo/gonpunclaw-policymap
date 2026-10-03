import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQuery = vi.fn();
const mockRateLimit = vi.fn();
vi.mock("@/lib/directory/query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/directory/query")>();
  return { ...actual, queryDirectory: (...args: unknown[]) => mockQuery(...args) };
});
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, rateLimitRequest: (...args: unknown[]) => mockRateLimit(...args) };
});

// An allowlisted host so requestOrigin echoes it back in absolute links.
const HOST = "preview-r3.vercel.app";
const emptyPage = { entries: [], total: 0, page: 1, pageSize: 24, totalPages: 1 };

function req(query: string) {
  return new Request(`https://${HOST}/api/public/maps${query}`, { headers: { host: HOST, "x-forwarded-proto": "https" } });
}

describe("GET /api/public/maps", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockRateLimit.mockReset().mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  });

  it("lists directory entries with absolute links", async () => {
    mockQuery.mockResolvedValue({ entries: [{ slug: "a", title: "A", description: "", source_name: null, owner_department: null, data_as_of: null, published_at: null, last_data_update_at: null, marker_count: 1, reviewed: false }], total: 1, page: 1, pageSize: 24, totalPages: 1 });
    const { GET } = await import("@/app/api/public/maps/route");
    const res = await GET(req("?q=x&page=1"));
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith({ q: "x", page: 1 });
    const json = await res.json();
    expect(json.maps[0].api).toEqual({
      json: `https://${HOST}/api/public/maps/a`,
      geojson: `https://${HOST}/api/public/maps/a/geojson`,
      map: `https://${HOST}/m/a`,
      embed: `https://${HOST}/embed/a`,
    });
    expect(json.total).toBe(1);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=60");
  });

  it("clamps non-numeric and negative pages to 1", async () => {
    mockQuery.mockResolvedValue(emptyPage);
    const { GET } = await import("@/app/api/public/maps/route");
    await GET(req("?page=abc"));
    expect(mockQuery).toHaveBeenLastCalledWith({ q: "", page: 1 });
    await GET(req("?page=-3"));
    expect(mockQuery).toHaveBeenLastCalledWith({ q: "", page: 1 });
  });

  it("returns 429 with Retry-After when rate limited", async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 1500 });
    const { GET } = await import("@/app/api/public/maps/route");
    const res = await GET(req(""));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("2");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 500 UPSTREAM when the query throws", async () => {
    mockQuery.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/public/maps/route");
    const res = await GET(new Request(`https://${HOST}/api/public/maps`));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("UPSTREAM");
  });
});
