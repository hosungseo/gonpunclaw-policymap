import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Filters } from "@/components/map/Filters";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
});

function renderFilters(selectedCategories: Set<string> | null) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <Filters
        categories={[
          { name: "청년", count: 2 },
          { name: "복지", count: 1 },
        ]}
        valueRange={[0, 100]}
        valueLabel="예산"
        categoryLabel="대상"
        selectedCategories={selectedCategories}
        setSelectedCategories={vi.fn()}
        currentValueRange={null}
        setCurrentValueRange={vi.fn()}
        total={0}
      />,
    );
  });
}

describe("Filters UI", () => {
  test("explains when every category is cleared", () => {
    renderFilters(new Set());

    expect(document.body.textContent).toContain("선택된 분류가 없습니다");
  });
});
