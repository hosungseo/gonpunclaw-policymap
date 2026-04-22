import { describe, it, expect, vi, beforeEach } from "vitest";
import { JusoGeocoder } from "@/lib/geocode/juso";

beforeEach(() => vi.restoreAllMocks());

describe("JusoGeocoder", () => {
  it("normalizes then fetches coords", async () => {
    const normResp = {
      results: {
        common: { errorCode: "0", totalCount: "1" },
        juso: [{
          roadAddr: "서울특별시 중구 세종대로 110",
          jibunAddr: "서울 중구 태평로1가 31",
          admCd: "1114010200",
          rnMgtSn: "111404166036",
          udrtYn: "0",
          buldMnnm: 110,
          buldSlno: 0,
        }],
      },
    };
    const coordResp = {
      results: {
        common: { errorCode: "0" },
        juso: [{ entX: "953425.123", entY: "1952112.456" }],
      },
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(normResp)))
      .mockResolvedValueOnce(new Response(JSON.stringify(coordResp)));
    const r = await new JusoGeocoder("KEY").geocode("서울 중구 세종대로 110");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.provider).toBe("juso");
    // Coordinates should be re-projected to WGS84 (lat around 37.x, lng around 126.9-127.x for Seoul)
    expect(r.lat).toBeGreaterThan(37);
    expect(r.lat).toBeLessThan(38);
    expect(r.lng).toBeGreaterThan(126);
    expect(r.lng).toBeLessThan(128);
  });

  it("reports no match when normalize returns 0 results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ results: { common: { errorCode: "0", totalCount: "0" }, juso: [] } }))
    );
    const r = await new JusoGeocoder("KEY").geocode("없음");
    expect(r.ok).toBe(false);
  });

  it("surfaces Juso error code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ results: { common: { errorCode: "E0009", totalCount: "0" }, juso: [] } }))
    );
    const r = await new JusoGeocoder("KEY").geocode("x");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/E0009/);
  });

  it("reports enabled=false without API key", () => {
    expect(new JusoGeocoder("").enabled).toBe(false);
  });
});
