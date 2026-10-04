import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ReviewDecisionForm } from "@/app/review/[slug]/ReviewClient";

let root: ReturnType<typeof createRoot> | null = null;

// The token is never a prop or DOM value: the form picks it up from the URL on mount and strips it
// there, so every test starts from a review link in the address bar.
beforeEach(() => {
  window.history.replaceState({}, "", "/review/abc123?t=rt&view=table");
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function render(props: Partial<Parameters<typeof ReviewDecisionForm>[0]> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<ReviewDecisionForm slug="abc123" pending {...props} />);
  });
  return container;
}

function okResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function button(container: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find((b) => b.textContent === text)!;
}

async function checkAll(container: HTMLElement) {
  for (const box of container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) await act(async () => { box.click(); });
}

async function typeInto(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ReviewDecisionForm", () => {
  test("disables approve until all four checklist items are checked", async () => {
    const container = render();
    const approve = button(container, "승인");
    expect(approve.disabled).toBe(true);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(4);
    await checkAll(container);
    expect(approve.disabled).toBe(false);
    expect(approve.getAttribute("aria-describedby")).toBe("review-approve-help");
    expect(container.querySelector("#review-approve-help")?.textContent).toContain("승인하려면 네 항목을 모두 확인해야 합니다");
  });

  test("posts the rejection with the review token from the URL and shows the result", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse({ ok: true, review: { id: "r1", status: "rejected" } }));
    const container = render();
    await typeInto(container.querySelector("textarea")!, "출처 URL이 열리지 않습니다");
    await act(async () => { button(container, "반려").click(); });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/maps/abc123/review/decide");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({ review_token: "rt", decision: "reject", comment: "출처 URL이 열리지 않습니다" });
    expect(container.textContent).toContain("반려 처리되었습니다");
  });

  test("posts an approval with the full checklist and reviewer label", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse({ ok: true, review: { id: "r1", status: "approved" } }));
    const container = render();
    await checkAll(container);
    await typeInto(container.querySelector<HTMLInputElement>("#review-label")!, "기획팀 검토");
    await act(async () => { button(container, "승인").click(); });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({
      review_token: "rt",
      decision: "approve",
      checklist: { source: true, as_of: true, sensitive: true, visibility: true },
      comment: "",
      reviewer_label: "기획팀 검토",
    });
    expect(container.textContent).toContain("승인 처리되었습니다");
  });

  test("requires a comment before rejecting and does not call the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const container = render();
    await act(async () => { button(container, "반려").click(); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("반려할 때는 의견을 입력해 주세요");
  });

  test("surfaces 409 conflict messages (ALREADY_DECIDED / VERSION_CHANGED) in the error slot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      okResponse({ ok: false, error: { code: "VERSION_CHANGED", message: "요청 이후 데이터가 바뀌었습니다. 소유자에게 검토 재요청을 부탁해 주세요." } }, 409),
    );
    const container = render();
    await checkAll(container);
    const approve = button(container, "승인");
    await act(async () => { approve.click(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("요청 이후 데이터가 바뀌었습니다");
    expect(container.textContent).not.toContain("승인 처리되었습니다");
    // The form stays usable so the reviewer can read the message; the buttons are re-enabled.
    expect(approve.disabled).toBe(false);
  });

  test("reports a network failure when fetch rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const container = render();
    await typeInto(container.querySelector("textarea")!, "의견");
    await act(async () => { button(container, "반려").click(); });
    expect(container.textContent).toContain("네트워크 오류가 발생했습니다.");
    expect(button(container, "반려").disabled).toBe(false);
  });

  test("reads the token from the URL, strips it on mount and keeps it out of the DOM", () => {
    const secret = "rt_secret_token_9f8e7d";
    window.history.replaceState({}, "", `/review/abc123?t=${secret}&view=table`);
    const replaceState = vi.spyOn(window.history, "replaceState");
    const container = render();
    expect(replaceState).toHaveBeenCalledTimes(1);
    const nextUrl = String(replaceState.mock.calls[0][2]);
    expect(nextUrl).not.toContain("t=");
    expect(nextUrl).not.toContain(secret);
    expect(nextUrl).toContain("view=table");
    expect(window.location.search).not.toContain("t=");
    // The token lives only in the URL (until the strip) and in component state; it is never rendered.
    expect(container.innerHTML).not.toContain(secret);
    expect(button(container, "반려").disabled).toBe(false);
  });

  test("shows a notice and disables the buttons when the URL carries no token", () => {
    window.history.replaceState({}, "", "/review/abc123");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const container = render();
    expect(replaceState).not.toHaveBeenCalled();
    expect(container.textContent).toContain("검토 링크를 다시 열어 주세요 (주소의 t 값이 필요합니다).");
    expect(button(container, "승인").disabled).toBe(true);
    expect(button(container, "반려").disabled).toBe(true);
  });

  test("shows a notice instead of the form when nothing is pending", () => {
    const container = render({ pending: false });
    expect(container.textContent).toContain("대기 중인 검토 요청이 없습니다");
    expect(container.querySelector("textarea")).toBeNull();
  });
});
