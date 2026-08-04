export type Visibility = "public" | "unlisted" | "private";

export interface MapMetadataInput {
  title: string;
  description?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  data_as_of?: string | null;
  owner_department?: string | null;
  contact?: string | null;
  license?: string | null;
  refresh_cycle?: string | null;
  next_review_at?: string | null;
  value_label?: string | null;
  value_unit?: string | null;
  category_label?: string | null;
  visibility: Visibility;
}

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: "공개",
  unlisted: "링크 보유자",
  private: "비공개",
};

export function isVisibility(value: unknown): value is Visibility {
  return value === "public" || value === "unlisted" || value === "private";
}

export function normalizeVisibility(value: unknown, fallback: Visibility = "private"): Visibility {
  return isVisibility(value) ? value : fallback;
}

export function normalizeNullable(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function metadataValidationErrors(input: MapMetadataInput): string[] {
  const errors: string[] = [];
  if (!input.title.trim()) errors.push("제목");
  if (input.title.length > 120) errors.push("제목(120자 이내)");
  if (input.description && input.description.length > 1000) errors.push("설명(1,000자 이내)");
  if (input.visibility !== "private") {
    if (!input.source_name?.trim()) errors.push("자료 출처");
    if (!input.data_as_of?.trim() || !isIsoDate(input.data_as_of)) errors.push("자료 기준일");
    if (!input.owner_department?.trim()) errors.push("담당 부서 또는 관리 주체");
  }
  if (input.source_url && !/^https?:\/\//i.test(input.source_url)) errors.push("출처 URL(http/https)");
  if (input.next_review_at && !isIsoDate(input.next_review_at)) errors.push("다음 점검일");
  return errors;
}

export function mapVisibilityToListed(visibility: Visibility): boolean {
  return visibility === "public";
}
