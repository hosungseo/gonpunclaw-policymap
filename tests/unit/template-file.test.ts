import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import path from "node:path";

const templatePaths = [
  "public/template.xlsx",
  "docs/sample-upload-template.xlsx",
];

function readWorkbook(relativePath: string) {
  return XLSX.read(readFileSync(path.resolve(process.cwd(), relativePath)), { type: "buffer" });
}

describe("spreadsheet templates", () => {
  it.each(templatePaths)("%s explains how rows become map locations", (relativePath) => {
    const workbook = readWorkbook(relativePath);
    expect(workbook.SheetNames).toEqual(["데이터", "사용법"]);

    const guideRows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["사용법"], { header: 1, defval: "" });
    const guideText = guideRows.flat().join("\n");
    expect(guideText).toContain("한 행은 지도에 표시될 위치 1개입니다.");
    expect(guideText).toContain("첫 번째 시트만 읽습니다.");
    expect(guideText).toContain("E열 이후는 공개 지도 팝업에 추가 정보로 표시됩니다.");

    const dataRows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["데이터"], { header: 1, defval: "" });
    expect(dataRows[0]).toEqual(["주소", "이름", "대표값", "분류", "비고"]);
    expect(dataRows[1]).toEqual(["서울 서초구 반포대로 58", "예시복지관", 48, "복지", "담당부서, 비고"]);
  });
});
