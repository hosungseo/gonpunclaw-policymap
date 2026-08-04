import * as XLSX from "xlsx";

export const MAX_ROWS = 10_000;

export type CoreColumnRole = "address" | "name" | "value" | "category";

export interface ColumnMapping {
  address: number;
  name: number | null;
  value: number | null;
  category: number | null;
  extra: number[];
}

export interface ParsedRow {
  row_index: number;
  address_raw: string;
  name: string | null;
  value: number | null;
  category: string | null;
  extra: Record<string, unknown>;
  /** Original row values are kept only during preview; never persist them on a job. */
  raw?: unknown[];
}

export interface SheetInspection {
  name: string;
  headers: string[];
  dataRowCount: number;
  emptyRowCount: number;
  duplicateCandidateCount: number;
  sampleRows: unknown[][];
  error?: string;
}

export interface WorkbookInspection {
  sheets: SheetInspection[];
  fileType: "xlsx" | "xls" | "csv" | "unknown";
}

export type ParseResult =
  | {
      ok: true;
      sheetName: string;
      headers: string[];
      mapping: ColumnMapping;
      rows: ParsedRow[];
      skipped_empty_address: number[];
      empty_row_count: number;
      duplicate_candidate_count: number;
      value_stats: { selected: number; converted: number; failed: number; examples: number[] };
    }
  | { ok: false; error: { code: string; message: string } };

export interface ParseOptions {
  sheetName?: string;
  mapping?: Partial<ColumnMapping>;
  /** Explicitly selected public extra columns. Defaults to all columns after D for legacy uploads. */
  publicExtraColumns?: number[];
  /** Allow arbitrary address column when the caller has confirmed a mapping. */
  allowArbitraryAddressColumn?: boolean;
  /** Keep raw row cells for an in-memory preview/sensitivity scan. Never persist this field. */
  includeRaw?: boolean;
}

function cellText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function normalizeHeader(value: unknown): string {
  return cellText(value).replace(/\s+/g, " ");
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return null;
  const normalized = String(value)
    .trim()
    .replace(/[₩원,\s]/g, "")
    .replace(/%$/, "");
  if (!normalized || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function headerScore(header: string, role: CoreColumnRole): number {
  const h = header.toLowerCase();
  const patterns: Record<CoreColumnRole, Array<[RegExp, number]>> = {
    address: [
      [/주소|소재지|위치|location|address|도로명|지번|소재/, 10],
      [/읍면동|시군구|행정구역/, 2],
    ],
    name: [[/시설명|기관명|사업명|명칭|이름|name|title|업체|상호/, 10]],
    value: [[/값|금액|예산|인원|정원|건수|수량|합계|value|amount|count|number/, 10]],
    category: [[/분류|유형|종류|구분|분야|category|type|종목/, 10]],
  };
  return patterns[role].reduce((score, [pattern, points]) => score + (pattern.test(h) ? points : 0), 0);
}

export function defaultColumnMapping(headers: string[], sampleRows: unknown[][] = []): ColumnMapping {
  const used = new Set<number>();
  const pick = (role: CoreColumnRole, required: boolean): number | null => {
    let best: { index: number; score: number } | null = null;
    for (const [index, header] of headers.entries()) {
      if (used.has(index)) continue;
      let score = headerScore(header, role);
      if (score === 0 && sampleRows.length > 0) {
        const values = sampleRows.slice(0, 5).map((row) => cellText(row[index])).join(" ");
        if (role === "address" && /시|도|구|군|읍|면|동|로|길|번지/.test(values)) score = 1;
        if (role === "value" && sampleRows.some((row) => numericValue(row[index]) != null)) score = 1;
      }
      if (score > 0 && (!best || score > best.score)) best = { index, score };
    }
    if (best) used.add(best.index);
    return best?.index ?? (required ? null : null);
  };

  const address = pick("address", true);
  const name = pick("name", false);
  const value = pick("value", false);
  const category = pick("category", false);
  const fallbackAddress = address ?? (headers.length > 0 ? 0 : 0);
  const core = new Set([fallbackAddress, name, value, category].filter((value): value is number => value != null));
  return {
    address: fallbackAddress,
    name,
    value,
    category,
    extra: headers.map((_, index) => index).filter((index) => !core.has(index)),
  };
}

function mappingFromOptions(headers: string[], sampleRows: unknown[][], options?: ParseOptions): ColumnMapping {
  const inferred = defaultColumnMapping(headers, sampleRows);
  if (!options?.mapping) return { ...inferred, extra: options?.publicExtraColumns ?? [0, 1, 2, 3, ...inferred.extra].filter((v, i, a) => a.indexOf(v) === i).filter((v) => v >= 4) };
  const mapping: ColumnMapping = {
    address: Number.isInteger(options.mapping.address) ? Number(options.mapping.address) : inferred.address,
    name: options.mapping.name === null ? null : Number.isInteger(options.mapping.name) ? Number(options.mapping.name) : inferred.name,
    value: options.mapping.value === null ? null : Number.isInteger(options.mapping.value) ? Number(options.mapping.value) : inferred.value,
    category: options.mapping.category === null ? null : Number.isInteger(options.mapping.category) ? Number(options.mapping.category) : inferred.category,
    extra: Array.isArray(options.publicExtraColumns)
      ? options.publicExtraColumns
      : Array.isArray(options.mapping.extra)
        ? options.mapping.extra
        : inferred.extra,
  };
  const core = [mapping.address, mapping.name, mapping.value, mapping.category].filter((value): value is number => value != null);
  mapping.extra = Array.from(new Set(mapping.extra)).filter((index) => index >= 0 && index < headers.length && !core.includes(index));
  return mapping;
}

function getWorkbook(buf: ArrayBuffer | Uint8Array | Buffer): XLSX.WorkBook | null {
  try {
    return XLSX.read(buf, { type: "buffer", codepage: 65001, cellDates: false });
  } catch {
    return null;
  }
}

function sheetRows(wb: XLSX.WorkBook, sheetName: string): unknown[][] | null {
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false });
}

function duplicateCount(rows: unknown[][], addressIndex: number): number {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = cellText(row[addressIndex]).toLocaleLowerCase();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.values()).reduce((total, count) => total + (count > 1 ? count - 1 : 0), 0);
}

export function inspectWorkbook(buf: ArrayBuffer | Uint8Array | Buffer, fileName = ""): { ok: true; inspection: WorkbookInspection } | { ok: false; error: { code: string; message: string } } {
  const wb = getWorkbook(buf);
  if (!wb) return { ok: false, error: { code: "CORRUPT", message: "파일을 읽을 수 없습니다. 엑셀에서 다시 저장한 뒤 시도해 주세요." } };
  if (wb.SheetNames.length === 0) return { ok: false, error: { code: "NO_SHEET", message: "사용할 수 있는 시트가 없습니다." } };
  const sheets: SheetInspection[] = wb.SheetNames.map((name) => {
    const rows = sheetRows(wb, name) ?? [];
    const headers = (rows[0] ?? []).map(normalizeHeader);
    const dataRows = rows.slice(1);
    const sampleRows = dataRows.filter((row) => row.some((cell) => cellText(cell))).slice(0, 5);
    const emptyRowCount = dataRows.filter((row) => !row.some((cell) => cellText(cell))).length;
    const mapping = defaultColumnMapping(headers, sampleRows);
    return {
      name,
      headers,
      dataRowCount: dataRows.length,
      emptyRowCount,
      duplicateCandidateCount: duplicateCount(dataRows, mapping.address),
      sampleRows,
      error: headers.length === 0 ? "헤더 행이 없습니다." : undefined,
    };
  });
  const fileType = /\.csv$/i.test(fileName) ? "csv" : /\.xls$/i.test(fileName) ? "xls" : /\.xlsx$/i.test(fileName) ? "xlsx" : "unknown";
  return { ok: true, inspection: { sheets, fileType } };
}

export function parseWorkbook(buf: ArrayBuffer | Uint8Array | Buffer, options?: ParseOptions): ParseResult {
  const wb = getWorkbook(buf);
  if (!wb) return { ok: false, error: { code: "CORRUPT", message: "엑셀 파일을 읽을 수 없습니다." } };
  const sheetName = options?.sheetName ?? wb.SheetNames[0];
  if (!sheetName) return { ok: false, error: { code: "NO_SHEET", message: "시트가 없습니다." } };
  const aoa = sheetRows(wb, sheetName);
  if (!aoa || aoa.length === 0) return { ok: false, error: { code: "NO_DATA", message: "데이터가 없습니다." } };

  const headers = (aoa[0] ?? []).map(normalizeHeader);
  if (headers.length === 0 || headers.every((header) => !header)) {
    return { ok: false, error: { code: "BAD_HEADER", message: "첫 행에 헤더가 필요합니다." } };
  }
  const dataRows = aoa.slice(1);
  if (dataRows.length === 0) return { ok: false, error: { code: "NO_DATA", message: "데이터 행이 없습니다." } };
  if (dataRows.length > MAX_ROWS) {
    return { ok: false, error: { code: "TOO_MANY_ROWS", message: `최대 ${MAX_ROWS.toLocaleString()}행까지 지원합니다.` } };
  }

  const mapping = mappingFromOptions(headers, dataRows.filter((row) => row.some((cell) => cellText(cell))).slice(0, 5), options);
  const addressHeader = headers[mapping.address] ?? "";
  if (!options?.allowArbitraryAddressColumn && !/주소|소재지|도로명|지번|address/i.test(addressHeader)) {
    return { ok: false, error: { code: "BAD_HEADER", message: "주소 열을 선택해 주세요. '주소' 또는 '소재지' 같은 열이어야 합니다." } };
  }
  const coreIndexes = [mapping.address, mapping.name, mapping.value, mapping.category].filter((value): value is number => value != null);
  if (new Set(coreIndexes).size !== coreIndexes.length || coreIndexes.some((index) => index < 0 || index >= headers.length)) {
    return { ok: false, error: { code: "BAD_MAPPING", message: "주소·이름·대표값·분류는 서로 다른 열에 연결해야 합니다." } };
  }

  const rows: ParsedRow[] = [];
  const skipped: number[] = [];
  let emptyRowCount = 0;
  let duplicateCandidateCount = 0;
  const seenAddresses = new Map<string, number>();
  let selectedValues = 0;
  let convertedValues = 0;
  let failedValues = 0;
  const valueExamples: number[] = [];

  dataRows.forEach((row, i) => {
    const rowIndex = i + 2;
    if (!row.some((cell) => cellText(cell))) {
      emptyRowCount += 1;
      return;
    }
    const address = cellText(row[mapping.address]);
    if (!address) {
      skipped.push(rowIndex);
      return;
    }
    const addressKey = address.toLocaleLowerCase();
    const seen = seenAddresses.get(addressKey) ?? 0;
    if (seen > 0) duplicateCandidateCount += 1;
    seenAddresses.set(addressKey, seen + 1);

    let value: number | null = null;
    if (mapping.value != null) {
      selectedValues += 1;
      const rawValue = row[mapping.value];
      value = numericValue(rawValue);
      if (rawValue != null && rawValue !== "") {
        if (value == null) {
          failedValues += 1;
          if (valueExamples.length < 5) valueExamples.push(rowIndex);
        } else convertedValues += 1;
      }
    }
    const extra: Record<string, unknown> = {};
    for (const index of mapping.extra) {
      if (index === mapping.address || index < 0 || index >= headers.length) continue;
      if (row[index] != null && row[index] !== "") extra[headers[index] || `col_${index + 1}`] = row[index];
    }
    rows.push({
      row_index: rowIndex,
      address_raw: address,
      name: mapping.name == null ? null : cellText(row[mapping.name]) || null,
      value,
      category: mapping.category == null ? null : cellText(row[mapping.category]) || null,
      extra,
      ...(options?.includeRaw ? { raw: [...row] } : {}),
    });
  });

  if (rows.length === 0) return { ok: false, error: { code: "NO_DATA", message: "유효한 주소가 없습니다." } };
  return {
    ok: true,
    sheetName,
    headers,
    mapping,
    rows,
    skipped_empty_address: skipped,
    empty_row_count: emptyRowCount,
    duplicate_candidate_count: duplicateCandidateCount,
    value_stats: { selected: selectedValues, converted: convertedValues, failed: failedValues, examples: valueExamples },
  };
}

/** Reconstruct only the selected public columns for a full-file sensitivity scan. */
export function parsedRowsForSensitiveScan(parsed: Extract<ParseResult, { ok: true }>): unknown[][] {
  return parsed.rows.map((row) => {
    if (row.raw) return row.raw;
    const values = Array.from({ length: parsed.headers.length }, () => null as unknown);
    values[parsed.mapping.address] = row.address_raw;
    if (parsed.mapping.name != null) values[parsed.mapping.name] = row.name;
    if (parsed.mapping.value != null) values[parsed.mapping.value] = row.value;
    if (parsed.mapping.category != null) values[parsed.mapping.category] = row.category;
    for (const index of parsed.mapping.extra) values[index] = row.extra[parsed.headers[index]];
    return values;
  });
}
