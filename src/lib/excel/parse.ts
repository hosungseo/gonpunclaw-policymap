import * as XLSX from "xlsx";

export interface ParsedRow {
  row_index: number;
  address_raw: string;
  name: string | null;
  value: number | null;
  category: string | null;
  extra: Record<string, unknown>;
}

export type ParseResult =
  | {
      ok: true;
      headers: string[];
      rows: ParsedRow[];
      skipped_empty_address: number[];
    }
  | { ok: false; error: { code: string; message: string } };

const MAX_ROWS = 10_000;

export function parseWorkbook(buf: ArrayBuffer | Uint8Array | Buffer): ParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer", codepage: 65001 });
  } catch {
    return { ok: false, error: { code: "CORRUPT", message: "엑셀 파일을 읽을 수 없습니다." } };
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { ok: false, error: { code: "NO_SHEET", message: "시트가 없습니다." } };

  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false });

  if (aoa.length === 0) return { ok: false, error: { code: "NO_DATA", message: "데이터가 없습니다." } };

  const headers = (aoa[0] as (string | null)[]).map((h) => (h ?? "").toString().trim());
  if (!headers[0]) {
    return { ok: false, error: { code: "BAD_HEADER", message: "A열(주소)은 필수입니다." } };
  }
  if (!/주소|소재지|도로명|address/i.test(headers[0])) {
    return {
      ok: false,
      error: { code: "BAD_HEADER", message: "A열 헤더는 '주소' 또는 '소재지' 같은 주소 컬럼이어야 합니다." },
    };
  }

  const dataRows = aoa.slice(1);
  if (dataRows.length === 0) return { ok: false, error: { code: "NO_DATA", message: "데이터 행이 없습니다." } };
  if (dataRows.length > MAX_ROWS) {
    return {
      ok: false,
      error: { code: "TOO_MANY_ROWS", message: `최대 ${MAX_ROWS}행까지 지원합니다.` },
    };
  }

  const rows: ParsedRow[] = [];
  const skipped: number[] = [];

  dataRows.forEach((row, i) => {
    const rowIndex = i + 2; // 1-based including header
    const addr = (row[0] ?? "").toString().trim();
    if (!addr) {
      skipped.push(rowIndex);
      return;
    }
    const name = row[1] != null ? String(row[1]).trim() : null;
    const rawVal = row[2];
    const value =
      typeof rawVal === "number"
        ? rawVal
        : rawVal != null && !isNaN(Number(rawVal))
        ? Number(rawVal)
        : null;
    const category = row[3] != null ? String(row[3]).trim() : null;
    const extra: Record<string, unknown> = {};
    for (let c = 4; c < headers.length; c++) {
      if (row[c] != null && row[c] !== "") extra[headers[c] || `col_${c}`] = row[c];
    }
    rows.push({ row_index: rowIndex, address_raw: addr, name, value, category, extra });
  });

  if (rows.length === 0) {
    return { ok: false, error: { code: "NO_DATA", message: "유효한 주소가 없습니다." } };
  }
  return { ok: true, headers, rows, skipped_empty_address: skipped };
}
