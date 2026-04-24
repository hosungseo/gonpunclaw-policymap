type CsvMarker = {
  row_index: number;
  address_raw: string;
  address_normalized: string | null;
  lat: number;
  lng: number;
  name: string | null;
  value: number | string | null;
  category: string | null;
  extra: Record<string, unknown> | null;
  geocoder_used: string;
};

const BASE_HEADERS = ["행번호", "주소", "정규화주소", "위도", "경도", "이름", "대표값", "분류", "지오코더"];

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function markersToCsv(markers: CsvMarker[]): string {
  const extraKeys = Array.from(
    new Set(markers.flatMap((marker) => Object.keys(marker.extra ?? {}))),
  );
  const headers = [...BASE_HEADERS, ...extraKeys];
  const lines = [headers.map(escapeCsvCell).join(",")];

  for (const marker of markers) {
    const extra = marker.extra ?? {};
    const row = [
      marker.row_index,
      marker.address_raw,
      marker.address_normalized,
      marker.lat,
      marker.lng,
      marker.name,
      marker.value,
      marker.category,
      marker.geocoder_used,
      ...extraKeys.map((key) => extra[key]),
    ];
    lines.push(row.map(escapeCsvCell).join(","));
  }

  return `${lines.join("\n")}\n`;
}
