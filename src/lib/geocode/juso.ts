import type { Geocoder, GeocodeResult } from "./types";
import proj4 from "proj4";

proj4.defs(
  "EPSG:5179",
  "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs"
);

const NORM_URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do";
const COORD_URL = "https://business.juso.go.kr/addrlink/addrCoordApi.do";

interface JusoNormItem {
  roadAddr: string;
  jibunAddr: string;
  admCd: string;
  rnMgtSn: string;
  udrtYn: string;
  buldMnnm: number;
  buldSlno: number;
}
interface JusoNormResponse {
  results: {
    common: { errorCode: string; totalCount: string };
    juso: JusoNormItem[];
  };
}
interface JusoCoordResponse {
  results: {
    common: { errorCode: string };
    juso: Array<{ entX: string; entY: string }>;
  };
}

export class JusoGeocoder implements Geocoder {
  readonly name = "juso" as const;
  readonly enabled: boolean;
  constructor(private readonly apiKey: string) {
    this.enabled = !!apiKey;
  }

  async geocode(address: string): Promise<GeocodeResult> {
    if (!this.enabled) return { ok: false, reason: "DISABLED" };

    // Step 1: normalize
    const normQ = new URLSearchParams({
      confmKey: this.apiKey,
      currentPage: "1",
      countPerPage: "1",
      keyword: address,
      resultType: "json",
    });
    let res: Response;
    try {
      res = await fetch(`${NORM_URL}?${normQ.toString()}`);
    } catch (e) {
      return { ok: false, reason: `NETWORK:${(e as Error).message}` };
    }
    if (!res.ok) return { ok: false, reason: `HTTP:${res.status}` };
    const norm = (await res.json()) as JusoNormResponse;
    if (norm.results.common.errorCode !== "0") {
      return { ok: false, reason: `JUSO:${norm.results.common.errorCode}` };
    }
    const hit = norm.results.juso[0];
    if (!hit) return { ok: false, reason: "NO_MATCH" };

    // Step 2: coord
    const coordQ = new URLSearchParams({
      confmKey: this.apiKey,
      admCd: hit.admCd,
      rnMgtSn: hit.rnMgtSn,
      udrtYn: hit.udrtYn,
      buldMnnm: String(hit.buldMnnm),
      buldSlno: String(hit.buldSlno),
      resultType: "json",
    });
    let coordRes: Response;
    try {
      coordRes = await fetch(`${COORD_URL}?${coordQ.toString()}`);
    } catch (e) {
      return { ok: false, reason: `COORD_NETWORK:${(e as Error).message}` };
    }
    if (!coordRes.ok) return { ok: false, reason: `COORD_HTTP:${coordRes.status}` };
    const cj = (await coordRes.json()) as JusoCoordResponse;
    const pt = cj.results.juso?.[0];
    if (!pt) return { ok: false, reason: "NO_COORD" };

    const [lng, lat] = proj4("EPSG:5179", "WGS84", [Number(pt.entX), Number(pt.entY)]);
    return {
      ok: true,
      lat,
      lng,
      address_normalized: hit.roadAddr,
      provider: "juso",
    };
  }
}
