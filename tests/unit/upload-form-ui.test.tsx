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
  test("shows public map, manage page, and token actions after successful upload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      slug: "sample-map",
      admin_token: "admin-token-123",
      inserted: 2,
      failed: 1,
      geocoder_stats: { kakao: 2 },
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

    expect(document.body.textContent).toContain("지도가 생성되었습니다");
    expect(document.body.textContent).toContain("/m/sample-map");
    expect(document.body.textContent).toContain("/manage/sample-map");
    expect(document.body.textContent).toContain("토큰 복사");
  });
});
