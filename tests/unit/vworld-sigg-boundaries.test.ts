import { describe, expect, it, vi } from "vitest";
import {
  buildVWorldSiggBoundaryUrl,
  fetchVWorldSiggBoundaries,
  parseVWorldSiggBoundaryResponse,
} from "@/lib/boundary/vworld-sigg";

const sampleFeature = {
  type: "Feature",
  properties: {
    sig_cd: "11650",
    full_nm: "서울특별시 서초구",
    sig_kor_nm: "서초구",
  },
  geometry: {
    type: "Polygon",
    coordinates: [[
      [127, 37],
      [127.1, 37],
      [127.1, 37.1],
      [127, 37.1],
      [127, 37],
    ]],
  },
};

const okResponse = {
  response: {
    status: "OK",
    result: {
      featureCollection: {
        type: "FeatureCollection",
        features: [sampleFeature],
      },
    },
  },
};

describe("VWorld 시군구 경계 API", () => {
  it("builds a Data API 2.0 GetFeature URL for LT_C_ADSIGG_INFO", () => {
    const url = buildVWorldSiggBoundaryUrl({
      apiKey: "KEY",
      bbox: [126.9, 37.4, 127.2, 37.7],
    });

    expect(url.origin + url.pathname).toBe("https://api.vworld.kr/req/data");
    expect(url.searchParams.get("service")).toBe("data");
    expect(url.searchParams.get("request")).toBe("GetFeature");
    expect(url.searchParams.get("version")).toBe("2.0");
    expect(url.searchParams.get("data")).toBe("LT_C_ADSIGG_INFO");
    expect(url.searchParams.get("geomFilter")).toBe("BOX(126.9,37.4,127.2,37.7)");
    expect(url.searchParams.get("geometry")).toBe("true");
    expect(url.searchParams.get("attribute")).toBe("true");
    expect(url.searchParams.get("crs")).toBe("EPSG:4326");
    expect(url.searchParams.get("key")).toBe("KEY");
  });

  it("parses GeoJSON features from VWorld Data API responses", () => {
    const parsed = parseVWorldSiggBoundaryResponse(okResponse);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.featureCollection.features).toHaveLength(1);
    expect(parsed.featureCollection.features[0].properties?.full_nm).toBe("서울특별시 서초구");
  });

  it("reports disabled when no VWorld API key is configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await fetchVWorldSiggBoundaries({
      apiKey: "",
      bbox: [126.9, 37.4, 127.2, 37.7],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("DISABLED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports VWorld error codes", () => {
    const parsed = parseVWorldSiggBoundaryResponse({
      response: {
        status: "ERROR",
        error: { code: "INVALID_KEY", text: "등록되지 않은 인증키입니다." },
      },
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("INVALID_KEY");
  });

  it("retries over HTTP when the HTTPS upstream returns a gateway error", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(okResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    const result = await fetchVWorldSiggBoundaries({
      apiKey: "KEY",
      bbox: [126.9, 37.4, 127.2, 37.7],
    });

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/^https:\/\/api\.vworld\.kr/);
    expect(String(fetchSpy.mock.calls[1][0])).toMatch(/^http:\/\/api\.vworld\.kr/);
  });
});
