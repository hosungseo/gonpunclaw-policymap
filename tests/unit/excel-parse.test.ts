import { describe, it, expect } from "vitest";
import { parseWorkbook, ParsedRow } from "@/lib/excel/parse";
import { readFileSync } from "node:fs";
import path from "node:path";

const f = (n: string) =>
  readFileSync(path.resolve(__dirname, "../fixtures/excel", n));

describe("parseWorkbook", () => {
  it("parses valid template", () => {
    const r = parseWorkbook(f("valid_small.xlsx"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.headers).toEqual(["주소", "이름", "값", "분류", "비고"]);
    expect(r.rows).toHaveLength(2);
    const first = r.rows[0] as ParsedRow;
    expect(first.address_raw).toBe("서울 서초구 반포대로 58");
    expect(first.name).toBe("서초복지관");
    expect(first.value).toBe(500000);
    expect(first.category).toBe("종합");
  });

  it("rejects missing address column A", () => {
    const r = parseWorkbook(f("bad_header.xlsx"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("BAD_HEADER");
  });

  it("rejects empty data rows", () => {
    const r = parseWorkbook(f("empty.xlsx"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("NO_DATA");
  });

  it("rejects over 10000 rows", () => {
    const r = parseWorkbook(f("oversize.xlsx"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("TOO_MANY_ROWS");
  });
});
