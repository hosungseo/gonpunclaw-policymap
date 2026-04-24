type ReportStatus = "pending" | "reviewed" | "dismissed" | "resolved";
const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "대기",
  reviewed: "검토 중",
  dismissed: "기각",
  resolved: "해결",
};

export function reportStatusLabel(status: string) {
  return STATUS_LABELS[status as ReportStatus] ?? status;
}
