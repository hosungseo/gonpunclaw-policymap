import { describe, expect, it } from "vitest";
import { isIsoDate, metadataValidationErrors, mapVisibilityToListed } from "@/lib/maps/metadata";

describe("map publication metadata", () => {
  it("requires provenance for public and unlisted maps but not private drafts", () => {
    const draft = metadataValidationErrors({ title: "초안", visibility: "private" });
    expect(draft).toEqual([]);
    const publicErrors = metadataValidationErrors({ title: "공개 지도", visibility: "public" });
    expect(publicErrors).toEqual(expect.arrayContaining(["자료 출처", "자료 기준일", "담당 부서 또는 관리 주체"]));
  });

  it("only public maps are listed", () => {
    expect(mapVisibilityToListed("public")).toBe(true);
    expect(mapVisibilityToListed("unlisted")).toBe(false);
    expect(mapVisibilityToListed("private")).toBe(false);
  });

  it("rejects impossible calendar dates", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
  });
});
