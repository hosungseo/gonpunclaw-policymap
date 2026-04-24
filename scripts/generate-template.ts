// scripts/generate-template.ts
import * as XLSX from "xlsx";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataRows = [
  ["주소", "이름", "대표값", "분류", "비고"],
  ["서울 서초구 반포대로 58", "예시복지관", 48, "복지", "담당부서, 비고"],
  ["부산 해운대구 센텀로 10", "예시청년센터", 36, "청년", "운영 중"],
  ["대전 유성구 대학로 99", "예시상담소", 22, "점검", "점검 예정"],
];

const guideRows = [
  ["GonpunClaw PolicyMap 템플릿 사용법"],
  [""],
  ["핵심 원칙", "한 행은 지도에 표시될 위치 1개입니다."],
  ["시트", "첫 번째 시트만 읽습니다. 데이터 시트 이름은 바꾸지 않는 편이 좋습니다."],
  ["A열 주소", "필수입니다. 도로명주소처럼 가능한 정확하게 입력하세요."],
  ["B열 이름", "지도와 표에 표시할 위치 이름입니다."],
  ["C열 대표값", "위치 1개에 붙일 숫자 1개입니다. 필터와 표에 사용됩니다."],
  ["D열 분류", "복지, 청년, 점검처럼 묶어 볼 기준입니다."],
  ["E열 이후", "E열 이후는 공개 지도 팝업에 추가 정보로 표시됩니다."],
  ["주의", "개인정보나 민감정보가 들어 있는 열은 업로드 전에 제거하세요."],
  [""],
  ["예시", "서울 서초구 반포대로 58 / 예시복지관 / 48 / 복지 / 담당부서, 비고"],
  ["결과", "위 예시 행은 지도에서 예시복지관 위치 1개로 표시됩니다."],
];

function buildWorkbook() {
  const dataSheet = XLSX.utils.aoa_to_sheet(dataRows);
  dataSheet["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 24 }];
  dataSheet["!autofilter"] = { ref: "A1:E1" };
  dataSheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideSheet["!cols"] = [{ wch: 18 }, { wch: 68 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, "데이터");
  XLSX.utils.book_append_sheet(workbook, guideSheet, "사용법");
  return workbook;
}

const outputs = [
  path.resolve(__dirname, "../public/template.xlsx"),
  path.resolve(__dirname, "../docs/sample-upload-template.xlsx"),
];

for (const out of outputs) {
  mkdirSync(path.dirname(out), { recursive: true });
  XLSX.writeFile(buildWorkbook(), out);
  console.log("Wrote", out);
}
