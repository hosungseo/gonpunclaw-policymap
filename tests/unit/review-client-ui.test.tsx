import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ReviewDecisionForm } from "@/app/review/[slug]/ReviewClient";

let root: ReturnType<typeof createRoot> | null = null;

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
    root?.render(<ReviewDecisionForm slug="abc123" reviewToken="rt" pending {...props} />);
  });
  return container;
}

function okResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("ReviewDecisionForm", () => {
  test("disables approve until all four checklist items are checked", async () => {
    const container = render();
    const approve = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "승인")!;
    expect(approve.disabled).toBe(true);
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes).toHaveLength(4);
    for (const box of boxes) await act(async () => { box.click(); });
    expect(approve.disabled).toBe(false);
  });

  test("posts the decision with the review token and shows the result", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse({ ok: true, review: { id: "r1", status: "rejected" } }));
    const container = render();
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "출처 URL이 열리지 않습니다");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const reject = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "반려")!;
    await act(async () => { reject.click(); });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/maps/abc123/review/decide");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({ review_token: "rt", decision: "reject", comment: "출처 URL이 열리지 않습니다" });
    expect(container.textContent).toContain("반려 처리되었습니다");
  });

  test("requires a comment before rejecting and does not call the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const container = render();
    const reject = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "반려")!;
    await act(async () => { reject.click(); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("반려할 때는 의견을 입력해 주세요");
  });

  test("surfaces 409 conflict messages (ALREADY_DECIDED / VERSION_CHANGED) in the error slot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      okResponse({ ok: false, error: { code: "VERSION_CHANGED", message: "요청 이후 데이터가 바뀌었습니다. 소유자에게 검토 재요청을 부탁해 주세요." } }, 409),
    );
    const container = render();
    for (const box of container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) await act(async () => { box.click(); });
    const approve = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "승인")!;
    await act(async () => { approve.click(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("요청 이후 데이터가 바뀌었습니다");
    expect(container.textContent).not.toContain("승인 처리되었습니다");
    // The form stays usable so the reviewer can read the message; the buttons are re-enabled.
    expect(approve.disabled).toBe(false);
  });

  test("strips the review token from the address bar on mount and keeps it out of the DOM", () => {
    const secret = "rt_secret_token_9f8e7d";
    window.history.replaceState(null, "", `/review/abc123?t=${secret}&view=table`);
    const replaceState = vi.spyOn(window.history, "replaceState");
    const container = render({ reviewToken: secret });
    expect(replaceState).toHaveBeenCalledTimes(1);
    const nextUrl = String(replaceState.mock.calls[0][2]);
    expect(nextUrl).not.toContain("t=");
    expect(nextUrl).not.toContain(secret);
    expect(nextUrl).toContain("view=table");
    expect(window.location.search).not.toContain("t=");
    // The token is posted from state; it must never be echoed into the markup (e.g. a hidden input).
    expect(container.innerHTML).not.toContain(secret);
  });

  test("does not touch history when the URL carries no token", () => {
    window.history.replaceState(null, "", "/review/abc123");
    const replaceState = vi.spyOn(window.history, "replaceState");
    render();
    expect(replaceState).not.toHaveBeenCalled();
  });

  test("shows a notice instead of the form when nothing is pending", () => {
    const container = render({ pending: false });
    expect(container.textContent).toContain("대기 중인 검토 요청이 없습니다");
    expect(container.querySelector("textarea")).toBeNull();
  });
});
