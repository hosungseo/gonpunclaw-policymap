const SENSITIVE_HEADER_PATTERN = /개인|주민|생년|전화|연락처|휴대폰|핸드폰|이메일|email|e-mail|카톡|계좌|주소상세|상세주소/i;

export function detectSensitiveHeaders(headers: string[]) {
  return headers.map((header) => header.trim()).filter((header) => header && SENSITIVE_HEADER_PATTERN.test(header));
}

export function sensitiveHeadersMessage(headers: string[]) {
  return `공개 지도에 표시될 수 있는 민감 컬럼이 있습니다: ${headers.join(", ")}. 해당 열을 제거한 뒤 다시 업로드해 주세요.`;
}
