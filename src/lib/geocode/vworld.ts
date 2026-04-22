import type { Geocoder, GeocodeResult } from "./types";

interface VWorldSearchItem {
  id?: string;
  address?: { road?: string; parcel?: string; category?: string; bldnm?: string };
  point?: { x: string; y: string };
}
interface VWorldSearchResponse {
  response: {
    status: string;
    error?: { code: string; text: string };
    result?: { items?: VWorldSearchItem[] };
  };
}

export class VWorldGeocoder implements Geocoder {
  readonly name = "vworld" as const;
  readonly enabled: boolean;
  constructor(private readonly apiKey: string) {
    this.enabled = !!apiKey;
  }

  async geocode(address: string): Promise<GeocodeResult> {
    if (!this.enabled) return { ok: false, reason: "DISABLED" };

    for (const category of ["road", "parcel"] as const) {
      const q = new URLSearchParams({
        service: "search",
        request: "search",
        version: "2.0",
        crs: "EPSG:4326",
        size: "1",
        page: "1",
        query: address,
        type: "address",
        category,
        format: "json",
        key: this.apiKey,
      });

      let res: Response;
      try {
        res = await fetch(`https://api.vworld.kr/req/search?${q.toString()}`);
      } catch (e) {
        return { ok: false, reason: `NETWORK:${(e as Error).message}` };
      }
      if (!res.ok) continue;

      const j = (await res.json()) as VWorldSearchResponse;
      if (j.response.status === "ERROR") {
        return { ok: false, reason: `VWORLD:${j.response.error?.code ?? "UNKNOWN"}` };
      }
      const item = j.response.result?.items?.[0];
      if (j.response.status === "OK" && item?.point) {
        return {
          ok: true,
          lat: Number(item.point.y),
          lng: Number(item.point.x),
          address_normalized: item.address?.road ?? item.address?.parcel ?? address,
          provider: "vworld",
        };
      }
    }
    return { ok: false, reason: "NO_MATCH" };
  }
}
