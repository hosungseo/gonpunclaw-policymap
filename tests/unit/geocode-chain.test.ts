import { describe, it, expect, vi } from "vitest";
import { GeocoderChain } from "@/lib/geocode";
import type { Geocoder } from "@/lib/geocode/types";

// Mock cache module so tests don't touch Supabase
vi.mock("@/lib/geocode/cache", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

function fakeGeocoder(name: Geocoder["name"], behavior: "ok" | "fail"): Geocoder {
  return {
    name,
    enabled: true,
    async geocode() {
      return behavior === "ok"
        ? { ok: true as const, lat: 1, lng: 2, address_normalized: "x", provider: name }
        : { ok: false as const, reason: "NO_MATCH" };
    },
  };
}

describe("GeocoderChain", () => {
  it("returns first success without calling later providers", async () => {
    const a = fakeGeocoder("kakao", "ok");
    const b = fakeGeocoder("vworld", "ok");
    const spy = vi.spyOn(b, "geocode");
    const chain = new GeocoderChain([a, b]);
    const r = await chain.geocode("x");
    expect(r.ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("falls back when first fails", async () => {
    const a = fakeGeocoder("kakao", "fail");
    const b = fakeGeocoder("vworld", "ok");
    const r = await new GeocoderChain([a, b]).geocode("x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provider).toBe("vworld");
  });

  it("reports attempted providers when all fail", async () => {
    const a = fakeGeocoder("kakao", "fail");
    const b = fakeGeocoder("vworld", "fail");
    const r = await new GeocoderChain([a, b]).geocode("x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.attempted).toEqual(["kakao", "vworld"]);
  });

  it("skips disabled providers", async () => {
    const a: Geocoder = { ...fakeGeocoder("kakao", "ok"), enabled: false };
    const b = fakeGeocoder("vworld", "ok");
    const r = await new GeocoderChain([a, b]).geocode("x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provider).toBe("vworld");
  });
});
