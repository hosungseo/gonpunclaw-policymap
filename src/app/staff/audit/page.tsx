import { supabaseServer } from "@/lib/supabase/server";
import { isStaffAuthorized, staffAuthConfig } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuditRow = {
  id: number;
  created_at: string;
  action: string;
  map_id: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  details: Record<string, unknown> | null;
};

const AUDIT_ACTIONS = [
  "map.create",
  "map.update",
  "map.replace_data",
  "map.delete",
  "upload_job.create",
  "upload_job.complete",
  "admin.auth_fail",
  "report.create",
  "report.update",
] as const;
const DEFAULT_LIMIT = 100;
const MIN_LIMIT = 1;
const MAX_LIMIT = 500;
const UA_PREVIEW = 80;

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

function parseAction(raw: string | null): string | null {
  if (!raw) return null;
  return (AUDIT_ACTIONS as readonly string[]).includes(raw) ? raw : null;
}

async function loadRows(action: string | null, limit: number): Promise<AuditRow[]> {
  const sb = supabaseServer();
  let q = sb
    .from("audit_log")
    .select("id, created_at, action, map_id, ip_hash, user_agent, details")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (action) q = q.eq("action", action);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditRow[];
}

export default async function StaffAuditPage({ searchParams }: { searchParams: SearchParams }) {
  const cfg = staffAuthConfig();
  if (!cfg.ok) return <ConfigError reason={cfg.reason} />;

  const sp = await searchParams;
  const authed = await isStaffAuthorized();
  if (!authed) return <LoginView err={firstParam(sp.err)} />;

  const action = parseAction(firstParam(sp.action));
  const limit = parseLimit(firstParam(sp.limit));
  let rows: AuditRow[] = [];
  let loadError: string | null = null;
  try {
    rows = await loadRows(action, limit);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "감사 로그를 불러오지 못했습니다.";
  }

  return <AuditView rows={rows} action={action} limit={limit} loadError={loadError} />;
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
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">운영 대시보드</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            운영 토큰을 입력하면 감사 로그를 열람할 수 있습니다.
          </p>
        </div>
        <form method="POST" action="/api/staff/login" className="space-y-4">
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

function AuditView({
  rows,
  action,
  limit,
  loadError,
}: {
  rows: AuditRow[];
  action: string | null;
  limit: number;
  loadError: string | null;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Staff</p>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">감사 로그</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            최근 기록 {rows.length}건 {action ? `· 필터 ${action}` : "· 모든 action"} · 최대 {limit}건
          </p>
          <nav className="pt-1 text-xs text-zinc-500">
            <a className="underline hover:text-zinc-900 dark:hover:text-zinc-200" href="/staff/reports">
              신고 관리로 이동
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
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="action">
            Action
          </label>
          <select
            id="action"
            name="action"
            defaultValue={action ?? ""}
            className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">(전체)</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
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
              <th className="px-3 py-2">action</th>
              <th className="px-3 py-2">map_id</th>
              <th className="px-3 py-2">ip_hash</th>
              <th className="px-3 py-2">user_agent</th>
              <th className="px-3 py-2">details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  기록이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => <AuditRowView key={row.id} row={row} />)
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function AuditRowView({ row }: { row: AuditRow }) {
  const ua = row.user_agent ?? "";
  const uaTruncated = ua.length > UA_PREVIEW ? `${ua.slice(0, UA_PREVIEW)}…` : ua;
  const ipShort = row.ip_hash ? `${row.ip_hash.slice(0, 12)}…` : "";
  const details = row.details && Object.keys(row.details).length > 0 ? JSON.stringify(row.details, null, 2) : "";
  return (
    <tr className="align-top">
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-300">
        {new Date(row.created_at).toISOString().replace("T", " ").slice(0, 19)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-800 dark:text-zinc-200">
        {row.action}
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
        {row.map_id ?? "—"}
      </td>
      <td
        className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400"
        title={row.ip_hash ?? ""}
      >
        {ipShort || "—"}
      </td>
      <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400" title={ua || undefined}>
        {uaTruncated || "—"}
      </td>
      <td className="px-3 py-2">
        {details ? (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {details}
          </pre>
        ) : (
          <span className="text-xs text-zinc-400">—</span>
        )}
      </td>
    </tr>
  );
}
