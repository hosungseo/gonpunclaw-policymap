export type SensitiveSeverity = "block" | "warn";

export interface SensitiveFinding {
  header: string;
  severity: SensitiveSeverity;
  kind: "resident_id" | "account" | "personal_contact" | "detail_address" | "generic_personal";
  row_count: number;
}

const BLOCKING_HEADER_PATTERNS: Array<[RegExp, SensitiveFinding["kind"]]> = [
  [/주민(?:등록)?번호|주민번호|생년월일|비밀번호|password|개인식별/, "resident_id"],
  [/계좌|카드번호|통장|비밀번호/, "account"],
  [/상세주소|거주지|자택주소|개인주소/, "detail_address"],
];

const CONTACT_HEADER_PATTERN = /전화|연락처|휴대폰|핸드폰|이메일|email|e-mail|카톡|메신저/i;
const GENERIC_PERSONAL_PATTERN = /개인|성명|수급자|대상자|보호자|담당자/;
const PHONE_VALUE_PATTERN = /(?:01[016789]|02|0[3-6][1-5])[-.\s]?\d{3,4}[-.\s]?\d{4}/;
const EMAIL_VALUE_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const RESIDENT_ID_VALUE_PATTERN = /\b\d{6}[- ]?[1-8]\d{6}\b/;
const ACCOUNT_VALUE_PATTERN = /\b\d{2,6}[- ]?\d{2,6}[- ]?\d{2,8}\b/;

function isLikelyOrganizationalContact(header: string): boolean {
  return /대표|기관|부서|문의|공공|담당부서/.test(header) && !/개인|담당자|휴대|핸드폰/.test(header);
}

function headerKind(header: string): SensitiveFinding["kind"] | null {
  for (const [pattern, kind] of BLOCKING_HEADER_PATTERNS) if (pattern.test(header)) return kind;
  if (CONTACT_HEADER_PATTERN.test(header)) return "personal_contact";
  if (GENERIC_PERSONAL_PATTERN.test(header)) return "generic_personal";
  return null;
}

/**
 * Scan headers and preview values without returning or logging the values themselves.
 * This is deliberately conservative: high-risk identifiers block publishing, while
 * organization contact columns can proceed after an explicit warning confirmation.
 */
export function scanSensitiveData(headers: string[], rows: unknown[][] = [], includedIndices?: number[]): SensitiveFinding[] {
  const findings: SensitiveFinding[] = [];
  const included = includedIndices ? new Set(includedIndices) : null;
  headers.forEach((rawHeader, index) => {
    if (included && !included.has(index)) return;
    const header = rawHeader.trim();
    if (!header) return;
    const kind = headerKind(header);
    const values = rows.map((row) => (row[index] == null ? "" : String(row[index]))).filter(Boolean);
    let severity: SensitiveSeverity | null = null;
    if (BLOCKING_HEADER_PATTERNS.some(([pattern]) => pattern.test(header))) {
      severity = "block";
    } else if (kind === "personal_contact" || kind === "generic_personal") {
      const hasStrongPattern = values.some((value) => PHONE_VALUE_PATTERN.test(value) || EMAIL_VALUE_PATTERN.test(value) || RESIDENT_ID_VALUE_PATTERN.test(value) || ACCOUNT_VALUE_PATTERN.test(value));
      severity = kind === "generic_personal" || !isLikelyOrganizationalContact(header) || hasStrongPattern ? "warn" : "warn";
      if (values.some((value) => RESIDENT_ID_VALUE_PATTERN.test(value) || ACCOUNT_VALUE_PATTERN.test(value))) severity = "block";
      // A personal-looking phone/e-mail column is not safe to publish even when
      // the header is generic. Existing workflows therefore get a hard stop.
      if ((PHONE_VALUE_PATTERN.test(values.join(" ")) || EMAIL_VALUE_PATTERN.test(values.join(" "))) && !isLikelyOrganizationalContact(header)) severity = "block";
    }
    if (severity) findings.push({ header, severity, kind: kind ?? "generic_personal", row_count: values.filter(Boolean).length });
  });
  return findings;
}

/** Backwards-compatible header-only helper used by the legacy upload path. */
export function detectSensitiveHeaders(headers: string[]) {
  return headers.map((header) => header.trim()).filter((header) => header && (CONTACT_HEADER_PATTERN.test(header) || GENERIC_PERSONAL_PATTERN.test(header) || BLOCKING_HEADER_PATTERNS.some(([pattern]) => pattern.test(header))));
}

export function sensitiveHeadersMessage(headers: string[]) {
  return `공개 지도에 표시될 수 있는 민감 컬럼이 있습니다: ${headers.join(", ")}. 해당 열을 제거한 뒤 다시 업로드해 주세요.`;
}

export function sensitiveFindingsMessage(findings: SensitiveFinding[]) {
  const blocking = findings.filter((finding) => finding.severity === "block");
  if (blocking.length > 0) return `주민번호·계좌·개인 연락처처럼 공개하면 안 되는 정보가 발견되었습니다: ${blocking.map((finding) => finding.header).join(", ")}. 해당 열을 공개 대상에서 제외하거나 원본에서 삭제해 주세요.`;
  return `공개 전에 확인이 필요한 컬럼이 있습니다: ${findings.map((finding) => finding.header).join(", ")}. 조직 대표 연락처 등 공개 가능한 정보인지 확인해 주세요.`;
}
