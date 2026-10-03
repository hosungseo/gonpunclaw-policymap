import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SharePanel } from "@/components/map/SharePanel";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
});

function render(props: Partial<Parameters<typeof SharePanel>[0]> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <SharePanel
        slug="abc123"
        title="테스트 지도"
        search="view=table"
        origin="https://example.test"
        apiAvailable
        {...props}
      />,
    );
  });
  return container;
}

describe("SharePanel", () => {
  test("opens and copies the current view link including filters", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const container = render();
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    await act(async () => { toggle.click(); });
    const copyLink = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("현재 보기 링크"))!;
    await act(async () => { copyLink.click(); });
    expect(writeText).toHaveBeenCalledWith("https://example.test/m/abc123?view=table");
  });

  test("copies an iframe snippet pointing at the embed route", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const container = render();
    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!.click(); });
    const copyEmbed = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("임베드 코드"))!;
    await act(async () => { copyEmbed.click(); });
    expect(writeText.mock.calls[0][0]).toContain('src="https://example.test/embed/abc123?view=table"');
  });

  test("hides the API link when the map is not API-accessible", async () => {
    const container = render({ apiAvailable: false });
    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!.click(); });
    expect(container.textContent).not.toContain("데이터 API");
  });
});
