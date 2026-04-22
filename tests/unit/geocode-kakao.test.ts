import { describe, it, expect, vi, beforeEach } from "vitest";
import { KakaoGeocoder } from "@/lib/geocode/kakao";

beforeEach(() => vi.restoreAllMocks());

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

describe("KakaoGeocoder", () => {
  it("returns lat/lng on match", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      json({ documents: [{ x: "127.0", y: "37.5", address_name: "서울 중구 세종대로 110" }] })
    );
    const g = new KakaoGeocoder("KEY");
    const r = await g.geocode("서울 중구 세종대로 110");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lat).toBe(37.5);
    expect(r.lng).toBe(127.0);
    expect(r.provider).toBe("kakao");
  });

  it("returns failure on no documents", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ documents: [] }));
    const r = await new KakaoGeocoder("KEY").geocode("없는주소");
    expect(r.ok).toBe(false);
  });

  it("treats 401/429 as failure with reason", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ msg: "unauth" }, 401));
    const r = await new KakaoGeocoder("KEY").geocode("x");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/401|unauth/i);
  });

  it("reports enabled=false without API key", () => {
    const g = new KakaoGeocoder("");
    expect(g.enabled).toBe(false);
  });
});
