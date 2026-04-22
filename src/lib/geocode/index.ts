import type { Geocoder, GeocodeOk } from "./types";
import { KakaoGeocoder } from "./kakao";
import { VWorldGeocoder } from "./vworld";
import { JusoGeocoder } from "./juso";
import { cacheGet, cacheSet } from "./cache";

export type ChainResult =
  | GeocodeOk
  | { ok: false; reason: string; attempted: Array<Geocoder["name"]> };

export class GeocoderChain {
  constructor(private readonly providers: Geocoder[]) {}

  async geocode(address: string, useCache = true): Promise<ChainResult> {
    if (useCache) {
      const cached = await cacheGet(address);
      if (cached) return cached;
    }
    const attempted: Array<Geocoder["name"]> = [];
    for (const p of this.providers) {
      if (!p.enabled) continue;
      attempted.push(p.name);
      const r = await p.geocode(address);
      if (r.ok) {
        if (useCache) await cacheSet(address, r);
        return r;
      }
    }
    return { ok: false, reason: "ALL_FAILED", attempted };
  }
}

export function defaultChainFromEnv(): GeocoderChain {
  const priority = (process.env.GEOCODER_PRIORITY ?? "kakao,vworld,juso")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const all: Record<string, Geocoder> = {
    kakao: new KakaoGeocoder(process.env.KAKAO_REST_API_KEY ?? ""),
    vworld: new VWorldGeocoder(process.env.VWORLD_API_KEY ?? ""),
    juso: new JusoGeocoder(process.env.JUSO_API_KEY ?? ""),
  };
  const ordered = priority.map((n) => all[n]).filter(Boolean);
  return new GeocoderChain(ordered);
}
