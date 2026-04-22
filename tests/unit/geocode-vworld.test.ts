import { describe, it, expect, vi, beforeEach } from "vitest";
import { VWorldGeocoder } from "@/lib/geocode/vworld";

beforeEach(() => vi.restoreAllMocks());

const resJson = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

const okRoad = {
  response: {
    status: "OK",
    result: {
      crs: "EPSG:4326",
      type: "ADDRESS",
      items: [
        {
          id: "1",
          address: { road: "서울특별시 중구 세종대로 110", parcel: "서울 중구 태평로1가 31", category: "road" },
          point: { x: "127.0", y: "37.5" },
        },
      ],
    },
  },
};

const notFound = { response: { status: "NOT_FOUND" } };

describe("VWorldGeocoder (Search API)", () => {
  it("parses road-address success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(resJson(okRoad));
    const r = await new VWorldGeocoder("KEY").geocode("서울특별시 중구 세종대로 110");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lat).toBe(37.5);
    expect(r.lng).toBe(127.0);
    expect(r.provider).toBe("vworld");
    expect(r.address_normalized).toMatch(/세종대로/);
  });

  it("falls back to parcel when road returns NOT_FOUND", async () => {
    const okParcel = {
      response: {
        status: "OK",
        result: {
          items: [{ address: { parcel: "서울 중구 태평로1가 31", category: "parcel" }, point: { x: "127.1", y: "37.6" } }],
        },
      },
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(resJson(notFound))
      .mockResolvedValueOnce(resJson(okParcel));
    const r = await new VWorldGeocoder("KEY").geocode("서울 중구 태평로1가 31");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lat).toBe(37.6);
  });

  it("fails when both road and parcel miss", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(resJson(notFound))
      .mockResolvedValueOnce(resJson(notFound));
    const r = await new VWorldGeocoder("KEY").geocode("없음");
    expect(r.ok).toBe(false);
  });

  it("reports INVALID_KEY as failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      resJson({ response: { status: "ERROR", error: { code: "INVALID_KEY", text: "등록되지 않은 인증키" } } })
    );
    const r = await new VWorldGeocoder("KEY").geocode("x");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/INVALID_KEY/);
  });

  it("reports enabled=false without API key", () => {
    expect(new VWorldGeocoder("").enabled).toBe(false);
  });
});
