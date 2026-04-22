export interface GeocodeOk {
  ok: true;
  lat: number;
  lng: number;
  address_normalized: string;
  provider: "kakao" | "vworld" | "juso";
}
export interface GeocodeFail { ok: false; reason: string; }
export type GeocodeResult = GeocodeOk | GeocodeFail;

export interface Geocoder {
  readonly name: "kakao" | "vworld" | "juso";
  readonly enabled: boolean;
  geocode(address: string): Promise<GeocodeResult>;
}
