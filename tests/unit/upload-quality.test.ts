import { describe, expect, it } from "vitest";
import { classifyGeocodeQuality } from "@/lib/upload/quality";

const base = {
  addressRaw: "서울특별시 중구 세종대로 1",
  addressNormalized: "서울특별시 중구 세종대로 1",
  lat: 37.5665,
  lng: 126.978,
};

describe("classifyGeocodeQuality", () => {
  it("accepts a matching geocode result", () => {
    expect(classifyGeocodeQuality(base)).toEqual({ status: "success", reason: null });
  });

  it("requires review when the administrative area changes", () => {
    expect(classifyGeocodeQuality({ ...base, addressNormalized: "부산광역시 중구 세종대로 1" })).toEqual({
      status: "review",
      reason: "ADMIN_AREA_MISMATCH",
    });
  });

  it("requires review for duplicate coordinates", () => {
    expect(classifyGeocodeQuality({ ...base, duplicateCoordinateCount: 2 })).toEqual({
      status: "review",
      reason: "DUPLICATE_COORDINATE",
    });
  });
});
