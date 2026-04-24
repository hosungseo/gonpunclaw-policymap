import { describe, expect, test } from "vitest";
import { filterMarkersForDisplay } from "@/components/map/filterMarkers";
import type { MarkerData } from "@/components/map/MarkerLayer";

const markers = [
  marker({ id: "youth", name: "청년 센터", category: "청년", value: 10 }),
  marker({ id: "welfare", name: "복지관", category: "복지", value: 30 }),
  marker({ id: "uncategorized", name: "분류 없음", category: null, value: 50 }),
  marker({ id: "no-value", name: "값 없음", category: "청년", value: null }),
];

describe("filterMarkersForDisplay", () => {
  test("excludes uncategorized markers when a category filter is active", () => {
    const result = filterMarkersForDisplay(markers, {
      selectedCategories: new Set(["청년"]),
      valueRange: null,
      searchQuery: "",
    });

    expect(result.map((item) => item.id)).toEqual(["youth", "no-value"]);
  });

  test("returns no markers when every category is cleared", () => {
    const result = filterMarkersForDisplay(markers, {
      selectedCategories: new Set(),
      valueRange: null,
      searchQuery: "",
    });

    expect(result).toEqual([]);
  });

  test("excludes markers without numeric values when a value range is active", () => {
    const result = filterMarkersForDisplay(markers, {
      selectedCategories: null,
      valueRange: [20, 60],
      searchQuery: "",
    });

    expect(result.map((item) => item.id)).toEqual(["welfare", "uncategorized"]);
  });
});

function marker(overrides: Partial<MarkerData> & Pick<MarkerData, "id">): MarkerData {
  return {
    id: overrides.id,
    lat: 37,
    lng: 127,
    name: overrides.name ?? null,
    value: overrides.value ?? null,
    category: overrides.category ?? null,
    address_normalized: "서울특별시",
    extra: {},
  };
}
