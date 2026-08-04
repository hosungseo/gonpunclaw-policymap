import { describe, expect, it } from "vitest";
import { pointInGeometry } from "@/lib/policy-layers/geometry";
import { POPULATION_LAYER_META, POPULATION_REGIONS, regionTypeLabel } from "@/lib/policy-layers/population";

describe("R2 정책 기준 레이어", () => {
  it("ships the shared 107-region index with source metadata", () => {
    expect(POPULATION_REGIONS).toHaveLength(107);
    expect(POPULATION_REGIONS.filter((region) => region.regionType === "decline")).toHaveLength(89);
    expect(POPULATION_REGIONS.filter((region) => region.regionType === "interest")).toHaveLength(18);
    expect(POPULATION_LAYER_META.sourceUrl).toMatch(/^https:\/\//);
    expect(regionTypeLabel("interest")).toBe("인구감소관심지역");
  });

  it("selects markers inside a policy polygon and excludes holes", () => {
    const geometry: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]]],
    };
    expect(pointInGeometry([1, 1], geometry)).toBe(true);
    expect(pointInGeometry([3, 3], geometry)).toBe(false);
    expect(pointInGeometry([11, 1], geometry)).toBe(false);
  });
});
