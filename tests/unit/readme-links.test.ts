import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("README links", () => {
  test("separates live app template download from repository template file", () => {
    const readme = readFileSync(path.resolve(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("앱에서 바로 받기");
    expect(readme).toContain("https://gonpunclaw-policymap.vercel.app/template.xlsx");
    expect(readme).toContain("저장소 파일");
    expect(readme).toContain("./docs/sample-upload-template.xlsx");
  });
});
