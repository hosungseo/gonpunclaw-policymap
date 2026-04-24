import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { UploadForm } from "@/app/upload/UploadForm";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("UploadForm UI", () => {
  test("shows progress and then public map, manage page, and token actions after successful upload job", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        job_id: "job-1",
        job_token: "job-token-123",
        status: "pending",
        slug: "sample-map",
        admin_token: "admin-token-123",
        total: 3,
        processed: 0,
        inserted: 0,
        failed: 0,
        geocoder_stats: {},
        failure_preview: [],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        job_id: "job-1",
        status: "processing",
        slug: "sample-map",
        total: 3,
        processed: 2,
        inserted: 2,
        failed: 0,
        geocoder_stats: { kakao: 2 },
        failure_preview: [],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        job_id: "job-1",
        status: "completed",
        slug: "sample-map",
        total: 3,
        processed: 3,
        inserted: 2,
        failed: 1,
        geocoder_stats: { kakao: 2 },
        failure_preview: [
          {
            row_index: 4,
            address_raw: "없는 주소 123",
            reason: "ALL_FAILED",
            attempted: ["kakao", "vworld"],
          },
        ],
      })));
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(<UploadForm />);
    });

    const title = document.querySelector<HTMLInputElement>("#title");
    const file = document.querySelector<HTMLInputElement>("input[type=file]");
    const form = document.querySelector("form");
    expect(title).not.toBeNull();
    expect(file).not.toBeNull();
    expect(form).not.toBeNull();

    act(() => {
      title!.value = "테스트 지도";
      title!.dispatchEvent(new Event("input", { bubbles: true }));
      Object.defineProperty(file!, "files", {
        configurable: true,
        value: [new File(["x"], "sample.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })],
      });
      file!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/upload/jobs", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/upload/jobs/job-1/process", expect.objectContaining({
      method: "POST",
      headers: { "x-upload-job-token": "job-token-123" },
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/upload/jobs/job-1/process", expect.objectContaining({
      method: "POST",
      headers: { "x-upload-job-token": "job-token-123" },
    }));
    expect(document.body.textContent).toContain("지도가 생성되었습니다");
    expect(document.body.textContent).toContain("/m/sample-map");
    expect(document.body.textContent).toContain("/manage/sample-map");
    expect(document.body.textContent).toContain("토큰 복사");
    expect(document.body.textContent).toContain("다음 단계");
    expect(document.body.textContent).toContain("1. 공개 지도 확인");
    expect(document.body.textContent).toContain("2. 공개 링크 공유");
    expect(document.body.textContent).toContain("3. 관리 토큰 저장");
    expect(document.body.textContent).toContain("공개 지도 링크는 외부에 공유해도 됩니다.");
    expect(document.body.textContent).toContain("관리 페이지와 관리 토큰은 내부에만 보관하세요.");
    expect(document.body.textContent).toContain("변환 실패 주소");
    expect(document.body.textContent).toContain("4행");
    expect(document.body.textContent).toContain("없는 주소 123");
  });

  test("resets required inputs when starting a new map after success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
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
    }))));

    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(<UploadForm />);
    });

    const title = document.querySelector<HTMLInputElement>("#title");
    const file = document.querySelector<HTMLInputElement>("input[type=file]");
    const form = document.querySelector("form");

    act(() => {
      title!.value = "테스트 지도";
      title!.dispatchEvent(new Event("input", { bubbles: true }));
      Object.defineProperty(file!, "files", {
        configurable: true,
        value: [new File(["x"], "sample.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })],
      });
      file!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const newMapButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "새 지도 만들기");
    expect(newMapButton).toBeDefined();

    act(() => {
      newMapButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const resetTitle = document.querySelector<HTMLInputElement>("#title");
    const submit = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "지도 생성");
    expect(resetTitle?.value).toBe("");
    expect(document.body.textContent).not.toContain("sample.xlsx");
    expect(submit?.hasAttribute("disabled")).toBe(true);
  });
});
