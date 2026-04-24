import { supabaseServer } from "@/lib/supabase/server";
import { isStaffAuthorized, staffAuthConfig } from "@/lib/staff-auth";
import { ALLOWED_REPORT_STATUSES, type ReportStatus } from "@/app/api/staff/reports/update/route";
import { reportStatusLabel } from "@/lib/reports/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportRow = {
  id: string;
  created_at: string;
  status: string;
  map_id: string | null;
  map: { title: string; slug: string } | null;
  reporter_ip_hash: string | null;
  reason: string;
};

type RawReportRow = Omit<ReportRow, "map"> & {
  map: { title: string; slug: string } | Array<{ title: string; slug: string }> | null;
};

const DEFAULT_LIMIT = 100;
const MIN_LIMIT = 1;
const MAX_LIMIT = 500;
const REASON_PREVIEW = 240;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, n));
}

function parseStatus(raw: string | null): ReportStatus | null {
  if (!raw) return null;
  return (ALLOWED_REPORT_STATUSES as readonly string[]).includes(raw)
    ? (raw as ReportStatus)
    : null;
}

function buildReturnTo(status: ReportStatus | null, limit: number): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (limit !== DEFAULT_LIMIT) params.set("limit", String(limit));
  const qs = params.toString();
  return qs ? `/staff/reports?${qs}` : "/staff/reports";
}

async function loadRows(status: ReportStatus | null, limit: number): Promise<ReportRow[]> {
  const sb = supabaseServer();
  let q = sb
    .from("reports")
    .select("id, created_at, status, map_id, reporter_ip_hash, reason, map:maps(title, slug)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawReportRow[]).map((row) => ({
    ...row,
    map: Array.isArray(row.map) ? row.map[0] ?? null : row.map,
  }));
}

export default async function StaffReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const cfg = staffAuthConfig();
  if (!cfg.ok) return <ConfigError reason={cfg.reason} />;

  const sp = await searchParams;
  const authed = await isStaffAuthorized();
  if (!authed) return <LoginView err={firstParam(sp.err)} />;

  const status = parseStatus(firstParam(sp.status));
  const limit = parseLimit(firstParam(sp.limit));
  let rows: ReportRow[] = [];
  let loadError: string | null = null;
  try {
    rows = await loadRows(status, limit);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "신고를 불러오지 못했습니다.";
  }

  return <ReportsView rows={rows} status={status} limit={limit} loadError={loadError} />;
}

function ConfigError({ reason }: { reason: "MISSING_TOKEN" | "MISSING_PEPPER" }) {
  const message =
    reason === "MISSING_TOKEN"
      ? "STAFF_DASHBOARD_TOKEN 환경 변수가 설정되어 있지 않습니다."
      : "ADMIN_TOKEN_PEPPER 환경 변수가 설정되어 있지 않습니다.";
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        <h1 className="mb-2 text-lg font-semibold">운영 페이지를 사용할 수 없습니다</h1>
        <p>{message}</p>
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          서버 환경 변수를 확인한 후 다시 시도해 주세요.
        </p>
      </div>
    </main>
  );
}

function LoginView({ err }: { err: string | null }) {
  const message =
    err === "auth"
      ? "토큰이 올바르지 않습니다."
      : err === "rate"
        ? "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
        : err === "config"
          ? "서버 설정이 올바르지 않습니다."
          : null;
  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <div className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Staff</p>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">신고 관리</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            운영 토큰을 입력하면 접수된 신고를 확인할 수 있습니다.
          </p>
        </div>
        <form method="POST" action="/api/staff/login" className="space-y-4">
          <input type="hidden" name="redirect_to" value="/staff/reports" />
          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="token">
              운영 토큰
            </label>
            <input
              id="token"
              name="token"
              type="password"
              autoComplete="off"
              required
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          {message && (
            <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {message}
            </p>
          )}
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            로그인
          </button>
        </form>
      </div>
    </main>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  reviewed:
    "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100",
  dismissed:
    "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  resolved:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
};

function ReportsView({
  rows,
  status,
  limit,
  loadError,
}: {
  rows: ReportRow[];
  status: ReportStatus | null;
  limit: number;
  loadError: string | null;
}) {
  const returnTo = buildReturnTo(status, limit);
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Staff</p>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">신고 관리</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            최근 신고 {rows.length}건 {status ? `· 상태 ${reportStatusLabel(status)}` : "· 모든 상태"} · 최대 {limit}건
          </p>
          <nav className="pt-1 text-xs text-zinc-500">
            <a className="underline hover:text-zinc-900 dark:hover:text-zinc-200" href="/staff/audit">
              감사 로그로 이동
            </a>
          </nav>
        </div>
        <form method="POST" action="/api/staff/logout">
          <button
            type="submit"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            로그아웃
          </button>
        </form>
      </div>

      <form
        method="GET"
        className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="status">
            상태
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">(전체)</option>
            {ALLOWED_REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {reportStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="limit">
            Limit ({MIN_LIMIT}-{MAX_LIMIT})
          </label>
          <input
            id="limit"
            name="limit"
            type="number"
            min={MIN_LIMIT}
            max={MAX_LIMIT}
            defaultValue={limit}
            className="w-28 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          적용
        </button>
      </form>

      {loadError && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          로드 실패: {loadError}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2">created_at</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">지도</th>
              <th className="px-3 py-2">reporter_ip_hash</th>
              <th className="px-3 py-2">사유</th>
              <th className="px-3 py-2">처리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  신고가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => <ReportRowView key={row.id} row={row} returnTo={returnTo} />)
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function ReportRowView({ row, returnTo }: { row: ReportRow; returnTo: string }) {
  const reason = row.reason ?? "";
  const reasonTruncated = reason.length > REASON_PREVIEW ? `${reason.slice(0, REASON_PREVIEW)}…` : reason;
  const ipShort = row.reporter_ip_hash ? `${row.reporter_ip_hash.slice(0, 12)}…` : "";
  const statusClass =
    STATUS_STYLES[row.status] ??
    "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
  return (
    <tr className="align-top">
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-300">
        {new Date(row.created_at).toISOString().replace("T", " ").slice(0, 19)}
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <span
          className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs ${statusClass}`}
        >
          {reportStatusLabel(row.status)}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">
        {row.map?.slug ? (
          <a className="font-medium text-blue-700 underline dark:text-blue-400" href={`/m/${row.map.slug}`}>
            {row.map.title || row.map.slug}
          </a>
        ) : (
          <span className="font-mono text-zinc-500">{row.map_id ?? "—"}</span>
        )}
        {row.map?.slug && <p className="mt-1 font-mono text-[11px] text-zinc-500">{row.map.slug}</p>}
      </td>
      <td
        className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400"
        title={row.reporter_ip_hash ?? ""}
      >
        {ipShort || "—"}
      </td>
      <td className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300" title={reason || undefined}>
        <p className="max-w-md whitespace-pre-wrap break-words">{reasonTruncated || "—"}</p>
      </td>
      <td className="px-3 py-2">
        <form
          method="POST"
          action="/api/staff/reports/update"
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <label className="sr-only" htmlFor={`status-${row.id}`}>
            새 상태
          </label>
          <select
            id={`status-${row.id}`}
            name="status"
            defaultValue={row.status}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            {ALLOWED_REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {reportStatusLabel(s)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            적용
          </button>
        </form>
      </td>
    </tr>
  );
}
