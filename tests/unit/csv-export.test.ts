import { describe, expect, it } from "vitest";
import { markersToCsv } from "@/lib/export/csv";

describe("CSV export", () => {
  it("escapes commas, quotes, new lines, and extra fields", () => {
    const csv = markersToCsv([
      {
        row_index: 2,
        address_raw: "서울, 테스트로 1",
        address_normalized: "서울 테스트로 1",
        lat: 37.5,
        lng: 127.1,
        name: '기관 "A"',
        value: 100,
        category: "복지",
        extra: { 담당부서: "정책\n팀", 비고: "공개" },
        geocoder_used: "kakao",
      },
    ]);

    expect(csv.split("\n")[0]).toBe("행번호,주소,정규화주소,위도,경도,이름,대표값,분류,지오코더,담당부서,비고");
    expect(csv).toContain('"서울, 테스트로 1"');
    expect(csv).toContain('"기관 ""A"""');
    expect(csv).toContain('"정책\n팀"');
  });
});
