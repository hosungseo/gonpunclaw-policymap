import type { Geocoder, GeocodeResult } from "./types";

export class KakaoGeocoder implements Geocoder {
  readonly name = "kakao" as const;
  readonly enabled: boolean;
  constructor(private readonly apiKey: string) {
    this.enabled = !!apiKey;
  }

  async geocode(address: string): Promise<GeocodeResult> {
    if (!this.enabled) return { ok: false, reason: "DISABLED" };
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}&size=1`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `KakaoAK ${this.apiKey}` } });
    } catch (e) {
      return { ok: false, reason: `NETWORK:${(e as Error).message}` };
    }
    if (!res.ok) return { ok: false, reason: `HTTP:${res.status}` };
    const json = (await res.json()) as { documents?: Array<{ x: string; y: string; address_name: string }> };
    const doc = json.documents?.[0];
    if (!doc) return { ok: false, reason: "NO_MATCH" };
    return {
      ok: true,
      lat: Number(doc.y),
      lng: Number(doc.x),
      address_normalized: doc.address_name,
      provider: "kakao",
    };
  }
}
