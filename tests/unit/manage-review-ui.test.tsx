import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ReviewSection, type ManagedReview } from "@/app/manage/[slug]/ManageForm";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const base: ManagedReview = {
  required: false,
  hasToken: false,
  status: "none",
  latest: null,
  currentVersionNumber: 1,
  approvedVersionNumber: null,
};

function render(review: ManagedReview, token = "tok") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<ReviewSection slug="abc123" token={token} initial={review} />);
  });
  return container;
}

describe("ReviewSection", () => {
  test("enabling review posts settings and reveals the one-time review link", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, review_required: true, review_token: "rt", review_url: "http://localhost/review/abc123?t=rt" }), { status: 200 }),
    );
    const container = render(base);
    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => {
      toggle.click();
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({ admin_token: "tok", review_required: true, rotate_token: false });
    expect(container.textContent).toContain("http://localhost/review/abc123?t=rt");
    expect(container.textContent).toContain("한 번만 표시");
  });

  test("explains that the link is for the reviewer and when approvals are invalidated", () => {
    const container = render(base);
    expect(container.textContent).toContain("소유자가 직접 승인하면 검토의 의미가 없습니다");
    expect(container.textContent).toContain("출처·출처 URL·기준일·담당 부서");
  });

  test("shows stale warning when approved version differs from current", () => {
    const container = render({
      ...base,
      required: true,
      hasToken: true,
      status: "stale",
      approvedVersionNumber: 2,
      currentVersionNumber: 3,
      latest: { id: "r", status: "approved", version_id: "v2", request_note: "", checklist: {}, comment: "", reviewer_label: "검토자", created_at: "2026-01-01T00:00:00Z", decided_at: "2026-01-02T00:00:00Z", version_number: 2 },
    });
    expect(container.textContent).toContain("데이터가 바뀌어 재검토가 필요합니다");
    expect(container.textContent).toContain("검토자");
    expect(container.textContent).toContain("2026");
  });

  test("shows rejection comment", () => {
    const container = render({
      ...base,
      required: true,
      hasToken: true,
      status: "rejected",
      latest: { id: "r", status: "rejected", version_id: "v1", request_note: "", checklist: {}, comment: "출처 URL 오류", reviewer_label: null, created_at: "2026-01-01T00:00:00Z", decided_at: "2026-01-02T00:00:00Z", version_number: 1 },
    });
    expect(container.textContent).toContain("출처 URL 오류");
  });

  test("blocks actions without admin token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const container = render({ ...base, required: true, hasToken: true }, "");
    const request = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "검토 요청")!;
    await act(async () => {
      request.click();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("관리 토큰을 입력해 주세요.");
  });

  test("requesting a review posts the note and shows pending status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, review: { id: "r1", status: "pending", version_number: 4 } }), { status: 200 }),
    );
    const container = render({ ...base, required: true, hasToken: true });
    const request = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "검토 요청")!;
    await act(async () => {
      request.click();
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/maps/abc123/review/request");
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({ admin_token: "tok", note: "" });
    expect(container.textContent).toContain("검토 대기");
    expect(container.textContent).toContain("요청 버전 v4");
  });

  test("rotating the token posts rotate_token: true", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, review_required: true, review_token: "new", review_url: "http://localhost/review/abc123?t=new" }), { status: 200 }),
    );
    const container = render({ ...base, required: true, hasToken: true });
    const rotate = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "검토 링크 재발급")!;
    await act(async () => {
      rotate.click();
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({ admin_token: "tok", review_required: true, rotate_token: true });
    expect(container.textContent).toContain("http://localhost/review/abc123?t=new");
  });
});
