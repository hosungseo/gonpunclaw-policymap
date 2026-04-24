import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchBoundaries = vi.fn();

vi.mock("@/lib/boundary/vworld-sigg", async () => {
  const actual = await vi.importActual<typeof import("@/lib/boundary/vworld-sigg")>("@/lib/boundary/vworld-sigg");
  return {
    ...actual,
    fetchVWorldSiggBoundaries: (...args: unknown[]) => mockFetchBoundaries(...args),
  };
});

async function callRoute(url: string) {
  const { GET } = await import("@/app/api/boundaries/sigg/route");
  return GET(new Request(url));
}

describe("GET /api/boundaries/sigg", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetchBoundaries.mockReset();
    process.env.VWORLD_API_KEY = "KEY";
  });

  it("rejects invalid bbox values", async () => {
    const res = await callRoute("http://localhost/api/boundaries/sigg?bbox=126,37,not-number,38");
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("BAD_BBOX");
    expect(mockFetchBoundaries).not.toHaveBeenCalled();
  });

  it("returns GeoJSON boundaries from VWorld", async () => {
    mockFetchBoundaries.mockResolvedValueOnce({
      ok: true,
      featureCollection: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { sig_cd: "11650", full_nm: "서울특별시 서초구" },
            geometry: { type: "Polygon", coordinates: [] },
          },
        ],
      },
    });

    const res = await callRoute("http://localhost/api/boundaries/sigg?bbox=126.9,37.4,127.2,37.7");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage");
    const json = (await res.json()) as { ok: true; count: number };
    expect(json.ok).toBe(true);
    expect(json.count).toBe(1);
    expect(mockFetchBoundaries).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "KEY",
      bbox: [126.9, 37.4, 127.2, 37.7],
    }));
  });

  it("reports disabled without failing the page when VWorld key is missing", async () => {
    process.env.VWORLD_API_KEY = "";
    mockFetchBoundaries.mockResolvedValueOnce({
      ok: false,
      code: "DISABLED",
      message: "VWorld API key is not configured.",
    });

    const res = await callRoute("http://localhost/api/boundaries/sigg?bbox=126.9,37.4,127.2,37.7");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: false; disabled: boolean; error: { code: string } };
    expect(json.disabled).toBe(true);
    expect(json.error.code).toBe("DISABLED");
  });
});
