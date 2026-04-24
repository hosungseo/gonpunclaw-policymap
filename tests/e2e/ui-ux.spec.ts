import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
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
    await expect(page.getByRole("link", { name: "사용법 보기" })).toHaveAttribute("href", "/guide");
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expectNoHorizontalOverflow(page);
  });

  test("in-app guide explains the full publishing flow", async ({ page }) => {
    await page.goto("/guide");

    await expect(page.getByRole("heading", { name: "처음부터 끝까지 따라하기" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "1. 엑셀 준비" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "2. 지도 만들기" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "3. 공유와 관리" })).toBeVisible();
    await expect(page.getByText("주소는 필수이고, 숫자값과 분류는 선택입니다.")).toBeVisible();
    await expect(page.getByText("C열 숫자값은 지원한도처럼 비교할 숫자가 있을 때만 넣습니다.")).toBeVisible();
    await expect(page.getByText("공개 지도 링크만 외부에 공유하세요.")).toBeVisible();
    await expect(page.getByText("관리 페이지와 관리 토큰은 내부에만 보관합니다.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "템플릿 다운로드" })).toHaveAttribute("href", "/template.xlsx");
    await expect(page.getByRole("link", { name: "지도 만들기" }).first()).toHaveAttribute("href", "/upload");
    await expectNoHorizontalOverflow(page);
  });

  test("upload form disables submission until a file is selected and shows the selected filename", async ({ page }) => {
    await page.goto("/upload");

    const submit = page.getByRole("button", { name: "지도 생성" });
    await expect(page.getByRole("link", { name: "사용법 보기" })).toHaveAttribute("href", "/guide");
    await expect(page.getByText("한 행은 지도에 표시될 위치 1개입니다.")).toBeVisible();
    await expect(page.getByText("첫 번째 시트만 읽습니다.")).toBeVisible();
    await expect(page.getByText("A열 주소만 필수이고, B열 이름·C열 숫자값·D열 필터 분류는 선택입니다.")).toBeVisible();
    await expect(page.getByText("C열 단위는 숫자 뒤에 붙는 표시입니다. 예: 만원, 건, 명")).toBeVisible();
    await expect(page.getByLabel("C열 숫자값(선택)")).toBeVisible();
    await expect(page.getByLabel("C열 단위(선택)")).toBeVisible();
    await expect(page.getByLabel("D열 필터 분류(선택)")).toBeVisible();
    await expect(page.getByRole("heading", { name: "엑셀 작성 예시" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "A열 주소" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "C열 숫자값" })).toBeVisible();
    const exampleBox = await page.getByTestId("excel-example-card").boundingBox();
    expect(exampleBox?.width).toBeGreaterThan(560);
    await expect(page.getByText("이 행은 지도에서 예시복지관 위치 1개로 표시됩니다.")).toBeVisible();
    await expect(page.getByText("업로드한 내용은 공개 지도에 그대로 표시됩니다.")).toBeVisible();
    await expect(page.getByText("개인정보나 민감정보가 들어 있는 열은 올리기 전에 제거하세요.")).toBeVisible();
    await expect(submit).toBeDisabled();

    await page.getByLabel(/엑셀 파일/).setInputFiles(path.join(process.cwd(), "tests/fixtures/excel/valid_small.xlsx"));
    await expect(page.getByText("valid_small.xlsx")).toBeVisible();
    await expect(page.getByText("미리보기")).toBeVisible();
    await expect(page.getByText("2개 위치")).toBeVisible();
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

  test("upload form accepts spreadsheet files by drag and drop", async ({ page }) => {
    let uploadRequests = 0;
    await page.route("**/api/upload/jobs", async (route) => {
      uploadRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          job_id: "job-1",
          job_token: "job-token-123",
          status: "completed",
          slug: "sample-map",
          admin_token: "admin-token-123",
          total: 2,
          processed: 2,
          inserted: 2,
          failed: 0,
          geocoder_stats: { kakao: 2 },
          failure_preview: [],
        }),
      });
    });

    await page.goto("/upload");

    const filePath = path.join(process.cwd(), "tests/fixtures/excel/valid_small.xlsx");
    const fileBuffer = readFileSync(filePath);
    const dataTransfer = await page.evaluateHandle(
      async ({ name, mimeType, buffer }) => {
        const data = new Uint8Array(buffer);
        const file = new File([data], name, { type: mimeType });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        return transfer;
      },
      {
        name: "valid_small.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Array.from(fileBuffer),
      },
    );

    await page.getByTestId("file-drop-zone").dispatchEvent("dragenter", { dataTransfer });
    await expect(page.getByText("여기에 놓으면 파일이 선택됩니다.")).toBeVisible();
    await page.getByTestId("file-drop-zone").dispatchEvent("drop", { dataTransfer });

    await expect(page.getByText("valid_small.xlsx")).toBeVisible();
    await expect(page.getByText("미리보기")).toBeVisible();
    await expect(page.getByText("2개 위치")).toBeVisible();
    await expect(page.getByRole("button", { name: "지도 생성" })).toBeDisabled();
    await page.getByLabel(/지도 제목/).fill("드래그 업로드 테스트");
    await expect(page.getByRole("button", { name: "지도 생성" })).toBeEnabled();
    await page.getByRole("button", { name: "지도 생성" }).click();

    await expect(page.getByRole("heading", { name: "지도가 생성되었습니다" })).toBeVisible();
    expect(uploadRequests).toBe(1);
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

  test("upload preview warns about sensitive public columns", async ({ page }) => {
    await page.goto("/upload");

    await page.getByLabel(/엑셀 파일/).setInputFiles(path.join(process.cwd(), "tests/fixtures/excel/sensitive_columns.csv"));

    await expect(page.getByText("공개 전 삭제 권장 컬럼")).toBeVisible();
    await expect(page.getByText("전화번호, 이메일")).toBeVisible();
    await expect(page.getByText("해당 열은 공개 지도 팝업에 표시될 수 있습니다.")).toBeVisible();
  });

  test("upload success flow separates public sharing from private management", async ({ page }) => {
    await page.route("**/api/upload/jobs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          job_id: "job-1",
          job_token: "job-token-123",
          status: "pending",
          slug: "sample-map",
          admin_token: "admin-token-123",
          total: 2,
          processed: 0,
          inserted: 0,
          failed: 0,
          geocoder_stats: {},
          failure_preview: [],
        }),
      });
    });
    await page.route("**/api/upload/jobs/job-1/process", async (route) => {
      expect(route.request().headers()["x-upload-job-token"]).toBe("job-token-123");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          job_id: "job-1",
          status: "completed",
          slug: "sample-map",
          total: 2,
          processed: 2,
          inserted: 2,
          failed: 0,
          geocoder_stats: { kakao: 2 },
          failure_preview: [],
        }),
      });
    });

    await page.goto("/upload");
    await page.getByLabel(/지도 제목/).fill("테스트 정책 지도");
    await page.getByLabel(/엑셀 파일/).setInputFiles(path.join(process.cwd(), "tests/fixtures/excel/valid_small.xlsx"));
    await expect(page.getByText("2개 위치")).toBeVisible();

    await page.getByRole("button", { name: "지도 생성" }).click();

    await expect(page.getByRole("heading", { name: "지도가 생성되었습니다" })).toBeVisible();
    await expect(page.getByText("공개 지도 링크는 외부에 공유해도 됩니다.")).toBeVisible();
    await expect(page.getByText("관리 페이지와 관리 토큰은 내부에만 보관하세요.")).toBeVisible();
    await expect(page.getByRole("link", { name: "/m/sample-map" })).toBeVisible();
    await expect(page.getByRole("link", { name: "/manage/sample-map" })).toBeVisible();
    await expect(page.getByText("다음 단계")).toBeVisible();
    await expect(page.getByText("1. 공개 지도 확인")).toBeVisible();
    await expect(page.getByText("2. 공개 링크 공유")).toBeVisible();
    await expect(page.getByText("3. 관리 토큰 저장")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("demo map shows a sample result without uploading", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "샘플 지도 보기" }).click();

    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByRole("heading", { name: "샘플 정책지도" })).toBeVisible();
    await expect(page.getByText("샘플 데이터")).toBeVisible();
    await expect(page.getByText("검색으로 기관명이나 주소를 찾고, 분류와 값 범위로 좁힌 뒤 표로 확인할 수 있습니다.")).toBeVisible();

    await page.getByRole("button", { name: "표" }).click();
    await expect(page.getByRole("cell", { name: "서초복지관" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "해운대센터" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("demo map can request sigungu boundary data", async ({ page }) => {
    await page.route("**/data/sigg-boundaries.geojson", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "FeatureCollection",
          features: [],
        }),
      });
    });

    await page.goto("/demo");
    const requestPromise = page.waitForRequest("**/data/sigg-boundaries.geojson");
    await page.getByLabel("시군구 경계 표시").check();

    const request = await requestPromise;
    expect(new URL(request.url()).pathname).toBe("/data/sigg-boundaries.geojson");
    await expectNoHorizontalOverflow(page);
  });

  test("demo map explains when sigungu boundaries are unavailable", async ({ page }) => {
    await page.route("**/data/sigg-boundaries.geojson", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { code: "STATIC_DATA_ERROR", message: "missing" } }),
      });
    });

    await page.goto("/demo");
    await page.getByLabel("시군구 경계 표시").check();

    await expect(page.getByText("경계 데이터를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("mobile map lets users open and close search filters", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/demo");

    await expect(page.getByRole("button", { name: "검색·필터 열기" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "지도 사용법" })).toBeHidden();

    await page.getByRole("button", { name: "검색·필터 열기" }).click();
    await expect(page.getByRole("button", { name: "검색·필터 닫기" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "지도 사용법" })).toBeVisible();

    await page.getByRole("button", { name: "검색·필터 닫기" }).click();
    await expect(page.getByRole("heading", { name: "지도 사용법" })).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });
});
