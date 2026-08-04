import { describe, expect, it } from "vitest";
import { regionNameFromAddress, summarizeMarkers } from "@/lib/dashboard/insights";

describe("R2 지도 요약 대시보드", () => {
  it("calculates count, sum, median, category and region buckets", () => {
    const summary = summarizeMarkers([
      { name: "A", value: 10, category: "복지", address_normalized: "충북 제천시 의림대로 1" },
      { name: "B", value: 30, category: "복지", address_normalized: "충북 제천시 의림대로 2" },
      { name: "C", value: null, category: "문화", address_normalized: "강원 태백시 황지로 3" },
    ]);
    expect(summary.total).toBe(3);
    expect(summary.valueSum).toBe(40);
    expect(summary.valueMedian).toBe(20);
    expect(summary.categories[0]).toMatchObject({ name: "복지", count: 2, valueSum: 40 });
    expect(summary.regions[0]).toMatchObject({ name: "충북 제천시", count: 2 });
  });

  it("handles a short or missing address", () => {
    expect(regionNameFromAddress("제천시")).toBe("제천시");
    expect(regionNameFromAddress(null)).toBe("주소 미상");
  });
});
