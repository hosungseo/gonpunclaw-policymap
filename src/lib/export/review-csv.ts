import { escapeCsvCell } from "@/lib/export/csv";

export interface ReviewCsvRow {
  row_index: number;
  status: string;
  address_raw: string;
  address_current?: string | null;
  reason?: string | null;
  included?: boolean;
}

export function reviewRowsToCsv(rows: ReviewCsvRow[]): string {
  const headers = ["행번호", "상태", "원주소", "현재주소", "사유", "발행포함"];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push([row.row_index, row.status, row.address_raw, row.address_current ?? "", row.reason ?? "", row.included === false ? "아니오" : "예"].map(escapeCsvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}
