import { describe, expect, it } from "vitest";
import { detectSensitiveHeaders, sensitiveHeadersMessage } from "@/lib/upload/sensitive";

describe("sensitive upload headers", () => {
  it("detects public extra columns that should not be uploaded", () => {
    expect(detectSensitiveHeaders(["주소", "이름", "대표값", "분류", "전화번호", "이메일", "비고"])).toEqual([
      "전화번호",
      "이메일",
    ]);
  });

  it("formats a user-facing rejection message", () => {
    expect(sensitiveHeadersMessage(["전화번호", "이메일"])).toBe(
      "공개 지도에 표시될 수 있는 민감 컬럼이 있습니다: 전화번호, 이메일. 해당 열을 제거한 뒤 다시 업로드해 주세요.",
    );
  });
});
