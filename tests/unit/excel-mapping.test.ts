import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { defaultColumnMapping, parseWorkbook, inspectWorkbook } from "@/lib/excel/parse";

function workbookBuffer() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["시설명", "정원", "소재지", "시설유형", "담당자", "비고"],
    ["청년센터", "120", "서울특별시 중구 세종대로 1", "청년", "공개하지 않음", "1층"],
  ]), "복지시설");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["이름", "주소"], ["두 번째 센터", "부산광역시 해운대구 센텀로 10"],
  ]), "다른 시트");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("PolicyMap workbook mapping", () => {
  it("inspects multiple sheets and recommends roles by header", () => {
    const result = inspectWorkbook(workbookBuffer(), "sample.xlsx");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inspection.sheets.map((sheet) => sheet.name)).toEqual(["복지시설", "다른 시트"]);
    const mapping = defaultColumnMapping(result.inspection.sheets[0].headers, result.inspection.sheets[0].sampleRows);
    expect(mapping.address).toBe(2);
    expect(mapping.name).toBe(0);
    expect(mapping.value).toBe(1);
    expect(mapping.category).toBe(3);
  });

  it("parses arbitrary column order and stores only selected extras", () => {
    const result = parseWorkbook(workbookBuffer(), {
      sheetName: "복지시설",
      mapping: { address: 2, name: 0, value: 1, category: 3, extra: [5] },
      publicExtraColumns: [5],
      allowArbitraryAddressColumn: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({ address_raw: "서울특별시 중구 세종대로 1", name: "청년센터", value: 120, category: "청년", extra: { 비고: "1층" } });
    expect(result.rows[0].extra).not.toHaveProperty("담당자");
  });
});
