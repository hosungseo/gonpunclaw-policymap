import { expect, test } from "@playwright/test";
import path from "node:path";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);
}

test.describe("public UI polish", () => {
  test("landing page keeps primary actions visible without horizontal overflow", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /엑셀 주소 목록/ })).toBeVisible();
    await expect(page.getByText("업무 흐름 그대로")).toBeVisible();
    await expect(page.getByRole("heading", { name: "데이터 준비", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "지도 검토", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "운영 관리", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "지도 만들기" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "샘플 지도 보기" })).toBeVisible();
    await expect(page.getByRole("link", { name: "엑셀 템플릿 받기" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expectNoHorizontalOverflow(page);
  });

  test("upload form disables submission until a file is selected and shows the selected filename", async ({ page }) => {
    await page.goto("/upload");

    const submit = page.getByRole("button", { name: "지도 생성" });
    await expect(submit).toBeDisabled();

    await page.getByLabel(/엑셀 파일/).setInputFiles(path.join(process.cwd(), "tests/fixtures/excel/valid_small.xlsx"));
    await expect(page.getByText("valid_small.xlsx")).toBeVisible();
    await expect(page.getByText("미리보기")).toBeVisible();
    await expect(page.getByText("2개 주소")).toBeVisible();
    await expect(page.getByText("서초복지관")).toBeVisible();
    await expect(page.getByText("해운대센터")).toBeVisible();
    await expect(submit).toBeDisabled();

    await page.getByLabel(/지도 제목/).fill("테스트 정책 지도");

    await expect(submit).toBeEnabled();
    await page.getByRole("button", { name: "파일 선택 해제" }).click();
    await expect(page.getByText("valid_small.xlsx")).toBeHidden();
    await expect(page.getByText("미리보기")).toBeHidden();
    await expect(submit).toBeDisabled();

    await page.getByLabel(/엑셀 파일/).setInputFiles(path.join(process.cwd(), "public/template.xlsx"));
    await expect(page.getByText("template.xlsx")).toBeVisible();
    await expect(submit).toBeEnabled();
    await expectNoHorizontalOverflow(page);
  });

  test("upload form explains invalid spreadsheets before submission", async ({ page }) => {
    await page.goto("/upload");

    const submit = page.getByRole("button", { name: "지도 생성" });
    await page.getByLabel(/지도 제목/).fill("헤더 오류 테스트");
    await page.getByLabel(/엑셀 파일/).setInputFiles(path.join(process.cwd(), "tests/fixtures/excel/bad_header.xlsx"));

    await expect(page.getByText("파일을 확인해 주세요")).toBeVisible();
    await expect(page.getByText("A열 헤더는 '주소' 또는 '소재지' 같은 주소 컬럼이어야 합니다.")).toBeVisible();
    await expect(submit).toBeDisabled();
  });

  test("demo map shows a sample result without uploading", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "샘플 지도 보기" }).click();

    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByRole("heading", { name: "샘플 정책지도" })).toBeVisible();
    await expect(page.getByText("샘플 데이터")).toBeVisible();

    await page.getByRole("button", { name: "표" }).click();
    await expect(page.getByRole("cell", { name: "서초복지관" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "해운대센터" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
