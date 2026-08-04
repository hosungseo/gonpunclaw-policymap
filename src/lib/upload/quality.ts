export type QualityStatus = "success" | "review";

export interface QualityInput {
  addressRaw: string;
  addressNormalized: string | null;
  lat: number;
  lng: number;
  duplicateCoordinateCount?: number;
}

export interface QualityResult {
  status: QualityStatus;
  reason: string | null;
}

function regionToken(address: string): string | null {
  return address.split(/\s+/).map((token) => token.replace(/[(),]/g, "")).find((token) => /(?:특별시|광역시|특별자치시|자치시|특별자치도|도)$/.test(token)) ?? null;
}

export function classifyGeocodeQuality(input: QualityInput): QualityResult {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return { status: "review", reason: "INVALID_COORDINATE" };
  if (!input.addressNormalized?.trim()) return { status: "review", reason: "LOW_MATCH" };
  if ((input.duplicateCoordinateCount ?? 0) > 1) return { status: "review", reason: "DUPLICATE_COORDINATE" };
  const rawRegion = regionToken(input.addressRaw);
  const normalizedRegion = regionToken(input.addressNormalized);
  if (rawRegion && normalizedRegion && rawRegion !== normalizedRegion) return { status: "review", reason: "ADMIN_AREA_MISMATCH" };
  if (input.addressRaw.trim().length >= 12 && input.addressNormalized.trim().length < 5) return { status: "review", reason: "LOW_MATCH" };
  return { status: "success", reason: null };
}
