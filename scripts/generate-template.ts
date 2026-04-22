// scripts/generate-template.ts
import * as XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rows = [
  ["주소", "이름", "값", "분류", "비고"],
  ["서울 서초구 반포대로 58", "서초복지관", 500000, "종합", "2026-04 개관"],
  ["부산 해운대구 센텀로 10", "해운대청년센터", 300000, "청년", ""],
  ["대전 유성구 대학로 99", "유성노인복지관", 420000, "노인", "리모델링 예정"],
];

const ws = XLSX.utils.aoa_to_sheet(rows);
ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 20 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "데이터");

const outDir = path.resolve(__dirname, "../public");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "template.xlsx");
XLSX.writeFile(wb, out);
console.log("Wrote", out);
