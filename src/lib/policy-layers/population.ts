import regionIndex from "@/data/population-region-index-with-codes.json";

export type PopulationRegionType = "decline" | "interest";

export interface PopulationRegion {
  province: string;
  normalizedProvince: string;
  name: string;
  regionType: PopulationRegionType;
  sourceNotice: string;
  lawdCd: string;
}

export interface PolicyLayerMeta {
  slug: string;
  title: string;
  description: string;
  sourceName: string;
  sourceUrl: string;
  sourceUrls: { decline: string; interest: string };
  dataAsOf: string;
  version: string;
  regionCount: number;
}

export const POPULATION_LAYER_META: PolicyLayerMeta = {
  slug: "population-decline-2026",
  title: "인구감소지역 기준 레이어",
  description: "행정안전부 고시 기준 인구감소지역과 인구감소관심지역을 시군구 경계에 겹쳐 봅니다.",
  sourceName: "행정안전부 인구감소지역·인구감소관심지역 지정 고시",
  sourceUrl: "https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000236722",
  sourceUrls: {
    decline: "https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000236722",
    interest: "https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000270632",
  },
  dataAsOf: "2026-01-01",
  version: "2024-15 · 2025-78",
  regionCount: regionIndex.summary.total,
};

export const POPULATION_REGIONS = regionIndex.regions as PopulationRegion[];

export function regionTypeLabel(type: PopulationRegionType): string {
  return type === "decline" ? "인구감소지역" : "인구감소관심지역";
}

export function regionByCode(code: string | null | undefined): PopulationRegion | null {
  if (!code) return null;
  return POPULATION_REGIONS.find((region) => region.lawdCd === code) ?? null;
}
