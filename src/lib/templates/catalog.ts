import { supabaseServer } from "@/lib/supabase/server";

export type TemplateColumnRole = "address" | "name" | "value" | "category" | "extra";

export interface PolicyTemplateColumn {
  header: string;
  role: TemplateColumnRole;
  publicByDefault: boolean;
  description: string;
  example: string;
}

export interface PolicyTemplate {
  slug: string;
  title: string;
  audience: string;
  description: string;
  guidance: string;
  prohibitedColumns: string[];
  columns: PolicyTemplateColumn[];
  exampleRows: Array<Record<string, string | number>>;
}

export const STATIC_POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    slug: "welfare-facilities",
    title: "복지시설",
    audience: "복지·돌봄 담당 부서",
    description: "복지관, 돌봄기관, 상담·지원시설의 위치와 이용 정보를 지도화합니다.",
    guidance: "운영시간이나 대표 연락처는 공개 가능 여부를 먼저 확인하고, 이용 대상과 신청 방법은 공개 추가정보로 선택하세요.",
    prohibitedColumns: ["주민등록번호", "개인 휴대전화", "상세 거주지", "사례관리 메모"],
    columns: [
      { header: "주소", role: "address", publicByDefault: true, description: "시설 위치", example: "서울특별시 중구 세종대로 110" },
      { header: "시설명", role: "name", publicByDefault: true, description: "시설 이름", example: "중구 복지센터" },
      { header: "수용인원", role: "value", publicByDefault: true, description: "비교할 수용 규모", example: "120" },
      { header: "시설유형", role: "category", publicByDefault: true, description: "복지·돌봄 등 분류", example: "복지관" },
      { header: "운영시간", role: "extra", publicByDefault: true, description: "방문 전 확인 정보", example: "평일 09:00~18:00" },
      { header: "문의처", role: "extra", publicByDefault: false, description: "대표 문의 정보", example: "02-0000-0000" },
    ],
    exampleRows: [{ 주소: "서울특별시 중구 세종대로 110", 시설명: "중구 복지센터", 수용인원: 120, 시설유형: "복지관", 운영시간: "평일 09:00~18:00", 문의처: "02-0000-0000" }],
  },
  {
    slug: "living-soc",
    title: "생활SOC",
    audience: "지역·생활 인프라 담당 부서",
    description: "도서관, 체육관, 문화센터 등 생활SOC 현황을 주민에게 공유합니다.",
    guidance: "시설의 위치와 운영 상태를 기준일과 함께 입력하고, 휴관·공사 여부는 공개 추가정보로 관리하세요.",
    prohibitedColumns: ["담당자 개인 연락처", "출입 비밀번호", "내부 점검 메모"],
    columns: [
      { header: "주소", role: "address", publicByDefault: true, description: "시설 위치", example: "세종특별자치시 도움6로 11" },
      { header: "시설명", role: "name", publicByDefault: true, description: "시설 이름", example: "한솔동 도서관" },
      { header: "좌석수", role: "value", publicByDefault: true, description: "좌석·수용 규모", example: "180" },
      { header: "시설유형", role: "category", publicByDefault: true, description: "도서관·체육관 등", example: "도서관" },
      { header: "운영현황", role: "extra", publicByDefault: true, description: "운영·휴관 상태", example: "정상 운영" },
    ],
    exampleRows: [{ 주소: "세종특별자치시 도움6로 11", 시설명: "한솔동 도서관", 좌석수: 180, 시설유형: "도서관", 운영현황: "정상 운영" }],
  },
  {
    slug: "social-economy",
    title: "사회적경제기업",
    audience: "사회적경제·기업지원 담당 부서",
    description: "사회적기업, 협동조합, 마을기업의 위치와 사업 분야를 정리합니다.",
    guidance: "기업 대표자 개인 연락처 대신 기관 대표 연락처와 공개 가능한 사업 정보만 선택하세요.",
    prohibitedColumns: ["대표자 주민등록번호", "대표자 개인 전화", "비공개 투자·매출 정보"],
    columns: [
      { header: "사업장 주소", role: "address", publicByDefault: true, description: "사업장 위치", example: "전라남도 나주시 빛가람로 719" },
      { header: "기업명", role: "name", publicByDefault: true, description: "기업·조직 이름", example: "나주마을협동조합" },
      { header: "고용인원", role: "value", publicByDefault: true, description: "공개 가능한 고용 규모", example: "14" },
      { header: "기업유형", role: "category", publicByDefault: true, description: "사회적기업·협동조합 등", example: "사회적기업" },
      { header: "주요사업", role: "extra", publicByDefault: true, description: "사업 분야", example: "로컬푸드 유통" },
    ],
    exampleRows: [{ "사업장 주소": "전라남도 나주시 빛가람로 719", 기업명: "나주마을협동조합", 고용인원: 14, 기업유형: "사회적기업", 주요사업: "로컬푸드 유통" }],
  },
  {
    slug: "vacant-spaces",
    title: "빈집·유휴공간",
    audience: "도시재생·인구정책 담당 부서",
    description: "빈집과 공공 유휴공간의 위치, 활용 가능성, 담당 사업을 지도화합니다.",
    guidance: "소유자 식별정보와 내부 출입정보는 공개하지 말고, 공개 가능한 외부 위치와 활용 상태만 입력하세요.",
    prohibitedColumns: ["소유자 이름", "소유자 연락처", "열쇠·출입 코드", "내부 보안 메모"],
    columns: [
      { header: "공간 주소", role: "address", publicByDefault: true, description: "공간 위치", example: "강원특별자치도 태백시 황지로 25" },
      { header: "공간명", role: "name", publicByDefault: true, description: "공간 이름", example: "황지동 빈집 1" },
      { header: "면적㎡", role: "value", publicByDefault: true, description: "공개 가능한 면적", example: "82" },
      { header: "활용상태", role: "category", publicByDefault: true, description: "활용·정비 상태", example: "활용 검토" },
      { header: "사업명", role: "extra", publicByDefault: true, description: "연계 사업", example: "청년 정착 공간" },
    ],
    exampleRows: [{ "공간 주소": "강원특별자치도 태백시 황지로 25", 공간명: "황지동 빈집 1", "면적㎡": 82, 활용상태: "활용 검토", 사업명: "청년 정착 공간" }],
  },
  {
    slug: "safety-inspections",
    title: "안전점검",
    audience: "재난·안전관리 담당 부서",
    description: "시설물 안전점검 대상과 조치 상태를 주민에게 설명 가능한 범위로 공개합니다.",
    guidance: "취약시설의 구체적인 보안 취약점이나 개인 식별정보는 제외하고, 점검일·등급·조치 상태 중심으로 관리하세요.",
    prohibitedColumns: ["보안 취약점 상세", "출입 취약 시간", "담당자 개인 연락처"],
    columns: [
      { header: "대상 주소", role: "address", publicByDefault: true, description: "점검 대상 위치", example: "충청북도 제천시 의림대로 120" },
      { header: "대상명", role: "name", publicByDefault: true, description: "시설 이름", example: "의림교" },
      { header: "점검점수", role: "value", publicByDefault: true, description: "점검 결과 점수", example: "86" },
      { header: "점검등급", role: "category", publicByDefault: true, description: "등급·상태", example: "양호" },
      { header: "최근점검일", role: "extra", publicByDefault: true, description: "기준일", example: "2026-06-30" },
    ],
    exampleRows: [{ "대상 주소": "충청북도 제천시 의림대로 120", 대상명: "의림교", 점검점수: 86, 점검등급: "양호", 최근점검일: "2026-06-30" }],
  },
  {
    slug: "tourism-resources",
    title: "관광자원",
    audience: "관광·문화 담당 부서",
    description: "관광지, 문화공간, 지역축제 거점의 위치와 방문 정보를 공유합니다.",
    guidance: "방문객에게 도움이 되는 운영·편의 정보와 계절별 기준일을 함께 기록하세요.",
    prohibitedColumns: ["비공개 협상 메모", "개인 예약자 정보", "관리자 개인 연락처"],
    columns: [
      { header: "관광지 주소", role: "address", publicByDefault: true, description: "관광자원 위치", example: "전라남도 강진군 강진읍 영랑생가길 15" },
      { header: "관광자원명", role: "name", publicByDefault: true, description: "관광자원 이름", example: "영랑생가" },
      { header: "연간방문객", role: "value", publicByDefault: true, description: "기준기간 방문객 수", example: "34000" },
      { header: "자원유형", role: "category", publicByDefault: true, description: "역사·자연·축제 등", example: "문화유산" },
      { header: "운영정보", role: "extra", publicByDefault: true, description: "운영시간·휴무일", example: "화~일 09:00~18:00" },
    ],
    exampleRows: [{ "관광지 주소": "전라남도 강진군 강진읍 영랑생가길 15", 관광자원명: "영랑생가", 연간방문객: 34000, 자원유형: "문화유산", 운영정보: "화~일 09:00~18:00" }],
  },
];

function fromDatabase(row: Record<string, unknown>): PolicyTemplate | null {
  if (typeof row.slug !== "string" || typeof row.title !== "string") return null;
  return {
    slug: row.slug,
    title: row.title,
    audience: typeof row.audience === "string" ? row.audience : "정책 담당 부서",
    description: typeof row.description === "string" ? row.description : "",
    guidance: typeof row.guidance === "string" ? row.guidance : "",
    prohibitedColumns: Array.isArray(row.prohibited_columns) ? row.prohibited_columns.filter((item): item is string => typeof item === "string") : [],
    columns: Array.isArray(row.columns) ? row.columns as PolicyTemplateColumn[] : [],
    exampleRows: Array.isArray(row.example_rows) ? row.example_rows as PolicyTemplate["exampleRows"] : [],
  };
}

export async function loadPolicyTemplates(): Promise<PolicyTemplate[]> {
  try {
    const { data, error } = await supabaseServer().from("map_templates").select("slug, title, audience, description, guidance, prohibited_columns, columns, example_rows").eq("active", true).order("title");
    if (!error && data && data.length > 0) {
      const databaseTemplates = data.map((row) => fromDatabase(row as Record<string, unknown>)).filter((row): row is PolicyTemplate => row !== null);
      if (databaseTemplates.length > 0) return databaseTemplates;
    }
  } catch {
    // The static catalog keeps the templates usable before the R2 migration is applied.
  }
  return STATIC_POLICY_TEMPLATES;
}

export async function loadPolicyTemplate(slug: string): Promise<PolicyTemplate | null> {
  const templates = await loadPolicyTemplates();
  return templates.find((template) => template.slug === slug) ?? null;
}
