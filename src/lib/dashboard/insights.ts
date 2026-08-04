export interface InsightMarker {
  name: string | null;
  value: number | null;
  category: string | null;
  address_normalized: string | null;
}

export interface InsightBucket {
  name: string;
  count: number;
  valueSum: number | null;
}

export interface MarkerInsights {
  total: number;
  valueCount: number;
  valueSum: number | null;
  valueMedian: number | null;
  categories: InsightBucket[];
  regions: InsightBucket[];
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function bucketKey(value: string | null, fallback: string): string {
  return value?.trim() || fallback;
}

export function regionNameFromAddress(address: string | null): string {
  const tokens = address?.trim().split(/\s+/).filter(Boolean) ?? [];
  return tokens.length >= 2 ? tokens.slice(0, 2).join(" ") : tokens[0] ?? "주소 미상";
}

function buildBuckets(values: Array<{ name: string; value: number | null }>): InsightBucket[] {
  const map = new Map<string, { count: number; valueSum: number }>();
  for (const item of values) {
    const current = map.get(item.name) ?? { count: 0, valueSum: 0 };
    current.count += 1;
    if (item.value != null) current.valueSum += item.value;
    map.set(item.name, current);
  }
  const hasValue = values.some((item) => item.value != null);
  return Array.from(map.entries())
    .map(([name, item]) => ({ name, count: item.count, valueSum: hasValue ? item.valueSum : null }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
}

export function summarizeMarkers(markers: InsightMarker[]): MarkerInsights {
  const numericValues = markers.map((marker) => marker.value).filter((value): value is number => value != null && Number.isFinite(value));
  return {
    total: markers.length,
    valueCount: numericValues.length,
    valueSum: numericValues.length > 0 ? numericValues.reduce((sum, value) => sum + value, 0) : null,
    valueMedian: median(numericValues),
    categories: buildBuckets(markers.map((marker) => ({ name: bucketKey(marker.category, "분류 미상"), value: marker.value }))),
    regions: buildBuckets(markers.map((marker) => ({ name: regionNameFromAddress(marker.address_normalized), value: marker.value }))),
  };
}

export function insightsToCsv(insights: MarkerInsights): string {
  const escape = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = [
    ["구분", "이름", "건수", "대표값 합계"],
    ...insights.categories.map((item) => ["분류", item.name, item.count, item.valueSum]),
    ...insights.regions.map((item) => ["행정구역", item.name, item.count, item.valueSum]),
  ];
  return `${rows.map((row) => row.map(escape).join(",")).join("\n")}\n`;
}
