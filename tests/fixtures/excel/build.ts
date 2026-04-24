import * as XLSX from "xlsx";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const here = __dirname;
mkdirSync(here, { recursive: true });

function write(name: string, rows: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  XLSX.writeFile(wb, path.join(here, name));
}

write("valid_small.xlsx", [
  ["주소", "이름", "값", "분류", "비고"],
  ["서울 서초구 반포대로 58", "서초복지관", 500000, "종합", ""],
  ["부산 해운대구 센텀로 10", "해운대센터", 300000, "청년", "테스트"],
]);
write("bad_header.xlsx", [
  ["location", "name"], ["서울", "x"],
]);
write("empty.xlsx", [["주소", "이름", "값", "분류"]]);
write("oversize.xlsx",
  [["주소", "이름"]].concat(
    Array.from({ length: 10_001 }, (_, i) => [`서울 row ${i}`, `n${i}`])
  )
);

console.log("fixtures written");
