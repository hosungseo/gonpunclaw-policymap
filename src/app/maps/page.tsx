import Link from "next/link";
import type { Metadata } from "next";
import { queryDirectory, sanitizeDirectoryQuery, type DirectoryPage } from "@/lib/directory/query";
import { formatKoreanDate } from "@/lib/maps/metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "공개 지도 · GonpunClaw PolicyMap",
  description: "출처와 기준일이 표시된 공개 정책지도를 검색하고 둘러봅니다.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function pageHref(q: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/maps?${qs}` : "/maps";
}

type Loaded = { ok: true; result: DirectoryPage } | { ok: false };

export default async function DirectoryPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = first(sp.q).slice(0, 80);
  // The query layer strips filter-breaking characters; echo that version so the count line matches what was searched.
  const searchTerm = sanitizeDirectoryQuery(q);
  const page = Number.parseInt(first(sp.page) || "1", 10) || 1;
  const loaded: Loaded = await queryDirectory({ q, page })
    .then((result) => ({ ok: true as const, result }))
    .catch(() => ({ ok: false as const }));
  const result = loaded.ok ? loaded.result : null;
  const loadError = !loaded.ok;

  return (
    <main className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">GonpunClaw PolicyMap</Link>
          <Link href="/upload" className="inline-flex min-h-10 items-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900">지도 만들기</Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">Public directory</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">공개 지도</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          공개 범위를 &lsquo;공개&rsquo;로 발행한 지도만 표시됩니다. 모든 지도에는 출처·기준일·관리 주체가 있습니다.
        </p>

        <form method="GET" className="mt-6 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="q">검색어</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="제목, 설명, 담당 부서 검색"
            className="min-h-11 w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button type="submit" className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">검색</button>
          {q && <Link href="/maps" className="inline-flex min-h-11 items-center px-2 text-sm text-zinc-600 underline dark:text-zinc-400">초기화</Link>}
        </form>

        {loadError && (
          <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}

        {result && (
          <>
            <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
              {searchTerm ? `‘${searchTerm}’ 검색 결과 ` : ""}{result.total.toLocaleString()}개 · {result.page}/{result.totalPages} 페이지
            </p>

            {result.entries.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-sm font-medium">아직 공개 지도가 없습니다.</p>
                <p className="mt-1 text-xs text-zinc-500">첫 지도를 만들어 보세요.</p>
                <Link href="/upload" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-600">지도 만들기</Link>
              </div>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {result.entries.map((entry) => (
                  <li key={entry.slug}>
                    <Link href={`/m/${entry.slug}`} aria-labelledby={`map-${entry.slug}`} className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-800">
                      <div className="flex items-start justify-between gap-2">
                        <h2 id={`map-${entry.slug}`} className="min-w-0 break-words text-base font-semibold leading-6">{entry.title}</h2>
                        {entry.reviewed && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">검토 완료</span>}
                      </div>
                      {entry.description && <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-300">{entry.description}</p>}
                      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <dt>위치</dt><dd className="text-right text-zinc-800 dark:text-zinc-200">{entry.marker_count.toLocaleString()}곳</dd>
                        {entry.source_name && (<><dt>출처</dt><dd className="truncate text-right">{entry.source_name}</dd></>)}
                        {entry.data_as_of && (<><dt>기준일</dt><dd className="text-right">{entry.data_as_of}</dd></>)}
                        {entry.owner_department && (<><dt>관리</dt><dd className="truncate text-right">{entry.owner_department}</dd></>)}
                        {formatKoreanDate(entry.last_data_update_at ?? entry.published_at) && (<><dt>갱신</dt><dd className="text-right">{formatKoreanDate(entry.last_data_update_at ?? entry.published_at)}</dd></>)}
                      </dl>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {result.totalPages > 1 && (
              <nav className="mt-8 flex items-center justify-center gap-3 text-sm" aria-label="페이지">
                {result.page > 1 ? <Link href={pageHref(q, result.page - 1)} className="rounded-lg border border-zinc-300 px-3 py-2 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">← 이전</Link> : <span className="px-3 py-2 text-zinc-400">← 이전</span>}
                <span className="text-zinc-600 dark:text-zinc-400">{result.page} / {result.totalPages}</span>
                {result.page < result.totalPages ? <Link href={pageHref(q, result.page + 1)} className="rounded-lg border border-zinc-300 px-3 py-2 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">다음 →</Link> : <span className="px-3 py-2 text-zinc-400">다음 →</span>}
              </nav>
            )}
          </>
        )}

        <p className="mt-10 text-xs text-zinc-500 dark:text-zinc-400">
          개발자용: <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">GET /api/public/maps</code> 로 같은 목록을 JSON으로 받을 수 있습니다. <Link href="/guide#api" className="underline">데이터 API 안내</Link>
        </p>
      </section>
    </main>
  );
}
