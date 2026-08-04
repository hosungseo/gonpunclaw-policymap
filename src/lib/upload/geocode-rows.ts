import { defaultChainFromEnv } from "@/lib/geocode";
import type { ParsedRow } from "@/lib/excel/parse";
import { classifyGeocodeQuality } from "@/lib/upload/quality";

export type GeocodedRow = {
  row_index: number;
  address_raw: string;
  address_normalized: string | null;
  lat: number;
  lng: number;
  name: string | null;
  value: number | null;
  category: string | null;
  extra: Record<string, unknown>;
  geocoder_used: string;
  quality_status: "success" | "review";
  quality_reason: string | null;
  original_address: string;
  included: boolean;
  manual_corrected: boolean;
};

export type FailedGeocodeRow = {
  row_index: number;
  address_raw: string;
  reason: string;
  attempted: string[];
};

export type GeocodeRowsResult = {
  successes: GeocodedRow[];
  failures: FailedGeocodeRow[];
  stats: Record<string, number>;
};

export async function geocodeParsedRows(rows: ParsedRow[], concurrency: number): Promise<GeocodeRowsResult> {
  const chain = defaultChainFromEnv();
  const successes: GeocodedRow[] = [];
  const failures: FailedGeocodeRow[] = [];
  const stats: Record<string, number> = {};
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= rows.length) return;
      const row = rows[i];
      const result = await chain.geocode(row.address_raw);
      if (result.ok) {
        successes.push({
          row_index: row.row_index,
          address_raw: row.address_raw,
          address_normalized: result.address_normalized,
          lat: result.lat,
          lng: result.lng,
          name: row.name,
          value: row.value,
          category: row.category,
          extra: row.extra,
          geocoder_used: result.provider,
          quality_status: "success",
          quality_reason: null,
          original_address: row.address_raw,
          included: true,
          manual_corrected: false,
        });
        stats[result.provider] = (stats[result.provider] ?? 0) + 1;
      } else {
        failures.push({
          row_index: row.row_index,
          address_raw: row.address_raw,
          reason: result.reason,
          attempted: result.attempted,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, rows.length)) }, () => worker()));
  const coordinateCounts = new Map<string, number>();
  for (const row of successes) {
    const key = `${row.lat.toFixed(5)},${row.lng.toFixed(5)}`;
    coordinateCounts.set(key, (coordinateCounts.get(key) ?? 0) + 1);
  }
  for (const row of successes) {
    const key = `${row.lat.toFixed(5)},${row.lng.toFixed(5)}`;
    const quality = classifyGeocodeQuality({
      addressRaw: row.address_raw,
      addressNormalized: row.address_normalized,
      lat: row.lat,
      lng: row.lng,
      duplicateCoordinateCount: coordinateCounts.get(key),
    });
    row.quality_status = quality.status;
    row.quality_reason = quality.reason;
  }
  return { successes, failures, stats };
}

export function mergeGeocoderStats(a: Record<string, number>, b: Record<string, number>) {
  const merged = { ...a };
  for (const [name, count] of Object.entries(b)) {
    merged[name] = (merged[name] ?? 0) + count;
  }
  return merged;
}
