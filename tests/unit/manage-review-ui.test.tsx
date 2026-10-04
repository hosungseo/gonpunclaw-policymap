import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ManageForm, type ManagedMap } from "@/app/manage/[slug]/ManageForm";
import { ReviewSection, type ManagedReview } from "@/app/manage/[slug]/ReviewSection";

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

const approved: ManagedReview = {
  required: true,
  hasToken: true,
  status: "approved",
  approvedVersionNumber: 2,
  currentVersionNumber: 2,
  latest: { status: "approved", version_number: 2, created_at: "2026-01-01T00:00:00Z", decided_at: "2026-01-02T00:00:00Z", reviewer_label: "검토자", comment: "" },
};

const mapFixture: ManagedMap = {
  title: "테스트 지도",
  description: "설명",
  value_label: "대표값",
  value_unit: "건",
  category_label: "분류",
  is_listed: false,
  visibility: "private",
  source_name: "원래 출처",
  source_url: "",
  data_as_of: "2026-01-01",
  owner_department: "지역경제과",
};

/** Mounts ReviewSection with its own state holder, as ManageForm does. */
function Harness({ initial, token }: { initial: ManagedReview; token: string }) {
  const [review, setReview] = useState<ManagedReview>(initial);
  return <ReviewSection slug="abc123" token={token} review={review} setReview={setReview} />;
}

function mount(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
  return container;
}

function render(review: ManagedReview, token = "tok") {
  return mount(<Harness initial={review} token={token} />);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Drives a React-controlled input the way a user would, so onChange fires. */
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function buttonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((b) => b.textContent === text)!;
}

function pillText(container: HTMLElement) {
  return container.querySelector("#review-section .rounded-full")?.textContent ?? "";
}

describe("ReviewSection", () => {
  test("enabling review posts settings and reveals the one-time review link", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ok: true, review_required: true, review_token: "rt", review_url: "http://localhost/review/abc123?t=rt" }),
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
    expect(container.textContent).toContain("검토 필수를 끄더라도 링크는 유지됩니다.");
  });

  test("settings failure leaves the checkbox unchecked and shows the error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: false, error: { code: "SETTINGS_FAILED", message: "설정을 저장하지 못했습니다." } }, 500));
    const container = render(base);
    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => {
      toggle.click();
    });
    expect(toggle.checked).toBe(false);
    expect(container.textContent).toContain("설정을 저장하지 못했습니다.");
    expect(container.textContent).not.toContain("한 번만 표시");
  });

  test("re-enabling with an existing token keeps the old link and shows no one-time box", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true, review_required: true, review_token: null, review_url: null }));
    const container = render({ ...base, hasToken: true });
    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => {
      toggle.click();
    });
    expect(toggle.checked).toBe(true);
    expect(container.textContent).not.toContain("한 번만 표시");
    expect(container.textContent).toContain("검토 필수를 켰습니다. 이전에 발급한 검토 링크가 계속 유효합니다. 새 링크가 필요하면 재발급하세요.");
  });

  test("copy button confirms, and falls back to a readonly input when the clipboard is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ok: true, review_required: true, review_token: "rt", review_url: "http://localhost/review/abc123?t=rt" }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const container = render(base);
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    });
    await act(async () => {
      buttonByText(container, "링크 복사").click();
    });
    expect(writeText).toHaveBeenCalledWith("http://localhost/review/abc123?t=rt");
    expect(container.textContent).toContain("복사됨");

    writeText.mockRejectedValue(new Error("denied"));
    // The button still reads "복사됨" until its reset timer fires.
    await act(async () => {
      buttonByText(container, "복사됨").click();
    });
    expect(container.textContent).toContain("링크를 직접 선택해 복사하세요");
    const fallback = container.querySelector<HTMLInputElement>('input[readonly]')!;
    expect(fallback.value).toBe("http://localhost/review/abc123?t=rt");
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  });

  test("explains that the link is for the reviewer and when approvals are invalidated", () => {
    const container = render(base);
    expect(container.textContent).toContain("소유자가 직접 승인하면 검토의 의미가 없습니다");
    expect(container.textContent).toContain("출처·출처 URL·기준일·담당 부서");
  });

  test("shows stale warning when approved version differs from current", () => {
    const container = render({ ...approved, status: "stale", currentVersionNumber: 3 });
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
      latest: { status: "rejected", version_number: 1, created_at: "2026-01-01T00:00:00Z", decided_at: "2026-01-02T00:00:00Z", reviewer_label: null, comment: "출처 URL 오류" },
    });
    expect(container.textContent).toContain("출처 URL 오류");
  });

  test("shows the request date while pending", () => {
    const container = render({
      ...base,
      required: true,
      hasToken: true,
      status: "pending",
      latest: { status: "pending", version_number: 1, created_at: "2026-03-05T00:00:00Z", decided_at: null, reviewer_label: null, comment: "" },
    });
    expect(container.textContent).toContain("요청 2026");
    expect(container.textContent).toContain("3");
  });

  test("blocks actions without admin token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const container = render({ ...base, required: true, hasToken: true }, "");
    await act(async () => {
      buttonByText(container, "검토 요청").click();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("관리 토큰을 입력해 주세요.");
  });

  test("requesting a review posts the note and shows pending status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true, review: { id: "r1", status: "pending", version_number: 4 } }));
    const container = render({ ...base, required: true, hasToken: true, currentVersionNumber: null });
    await act(async () => {
      buttonByText(container, "검토 요청").click();
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/maps/abc123/review/request");
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({ admin_token: "tok", note: "" });
    expect(pillText(container)).toBe("검토 대기");
    expect(container.textContent).toContain("요청 버전 v4");
    // A first request captured the map's first version; it becomes the current one.
    expect(container.textContent).toContain("현재 버전 v4");
  });

  test("rotating the token posts rotate_token: true", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ok: true, review_required: true, review_token: "new", review_url: "http://localhost/review/abc123?t=new" }),
    );
    const container = render({ ...base, required: true, hasToken: true });
    await act(async () => {
      buttonByText(container, "검토 링크 재발급").click();
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({ admin_token: "tok", review_required: true, rotate_token: true });
    expect(container.textContent).toContain("http://localhost/review/abc123?t=new");
  });
});

describe("ManageForm review integration", () => {
  function submitEdit(container: HTMLElement) {
    const form = container.querySelector("form")!;
    return act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  }

  function typeToken(container: HTMLElement) {
    act(() => {
      setInputValue(container.querySelector<HTMLInputElement>("#admin_token")!, "tok");
    });
  }

  test("renders the directory hidden notice with its reason", () => {
    const container = mount(<ManageForm slug="abc123" initial={{ ...mapFixture, directory: { hidden: true, reason: "신고 확인" } }} />);
    expect(container.textContent).toContain("이 지도는 공개 디렉터리에서 숨김 처리되어 있습니다.");
    expect(container.textContent).toContain("사유: 신고 확인");
  });

  test("scrolls to the review section when the update route answers REVIEW_REQUIRED", async () => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ok: false, error: { code: "REVIEW_REQUIRED", message: "공개 전 검토 승인이 필요합니다." } }, 409),
    );
    const container = mount(<ManageForm slug="abc123" initial={{ ...mapFixture, review: { ...base, required: true, hasToken: true } }} />);
    typeToken(container);
    await submitEdit(container);
    expect(container.textContent).toContain("공개 전 검토 승인이 필요합니다.");
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect((scrollSpy.mock.instances[0] as Element).id).toBe("review-section");
  });

  test("an edit that changes the source name turns an approval stale", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true, map: { ...mapFixture, slug: "abc123", source_name: "새 출처" } }));
    const container = mount(<ManageForm slug="abc123" initial={{ ...mapFixture, review: approved }} />);
    expect(pillText(container)).toBe("승인됨");
    typeToken(container);
    act(() => {
      setInputValue(container.querySelector<HTMLInputElement>('input[placeholder="예: ○○시 복지정책과"]')!, "새 출처");
    });
    await submitEdit(container);
    expect(container.textContent).toContain("변경 사항이 저장되었습니다.");
    expect(pillText(container)).toBe("재검토 필요");
  });

  test("an edit that leaves review-sensitive fields alone keeps the approval", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true, map: { ...mapFixture, slug: "abc123", title: "새 제목" } }));
    const container = mount(<ManageForm slug="abc123" initial={{ ...mapFixture, review: approved }} />);
    typeToken(container);
    act(() => {
      setInputValue(container.querySelector<HTMLInputElement>("#title")!, "새 제목");
    });
    await submitEdit(container);
    expect(container.textContent).toContain("변경 사항이 저장되었습니다.");
    expect(pillText(container)).toBe("승인됨");
  });
});
