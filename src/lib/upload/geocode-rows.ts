import { defaultChainFromEnv } from "@/lib/geocode";
import type { ParsedRow } from "@/lib/excel/parse";

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
  return { successes, failures, stats };
}

export function mergeGeocoderStats(a: Record<string, number>, b: Record<string, number>) {
  const merged = { ...a };
  for (const [name, count] of Object.entries(b)) {
    merged[name] = (merged[name] ?? 0) + count;
  }
  return merged;
}
