import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { ManageForm, type ManagedMap } from "@/app/manage/[slug]/ManageForm";

let root: ReturnType<typeof createRoot> | null = null;

const initial: ManagedMap = {
  title: "테스트 지도",
  description: "설명",
  value_label: "대표값",
  value_unit: "건",
  category_label: "분류",
  is_listed: true,
};

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
});

describe("ManageForm UI", () => {
  test("explains token storage, private mode, and permanent deletion", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(<ManageForm slug="sample-map" initial={initial} />);
    });

    expect(document.body.textContent).toContain("관리 토큰은 지도 소유자만 보관하세요.");
    expect(document.body.textContent).toContain("비공개로 전환하면 공개 링크 접속만 막고 데이터는 보관됩니다.");
    expect(document.body.textContent).toContain("영구 삭제는 공개 링크, 마커 데이터, 관리 페이지를 복구할 수 없게 제거합니다.");
    expect(document.body.textContent).toContain("삭제 대신 임시로 숨기려면 공개 체크를 해제하세요.");
    expect(document.body.textContent).toContain("엑셀 데이터 교체");
    expect(document.body.textContent).toContain("기존 마커를 새 엑셀 내용으로 교체합니다.");
    expect(document.body.textContent).toContain("관리 토큰과 공개 링크는 그대로 유지됩니다.");
  });
});
