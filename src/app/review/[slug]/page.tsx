import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MapClient } from "@/app/m/[slug]/MapClient";
import { effectiveVisibility, loadPublicMapRecord, toMapClientProps } from "@/lib/maps/load-public-map";
import { formatKoreanDate, VISIBILITY_LABELS } from "@/lib/maps/metadata";
import { loadReviewState } from "@/lib/reviews/service";
import { verifyReviewTokenForMap } from "@/lib/reviews/tokens";
import { supabaseServer } from "@/lib/supabase/server";
import { detectSensitiveHeaders } from "@/lib/upload/sensitive";
import { ReviewDecisionForm } from "./ReviewClient";

export const dynamic = "force-dynamic";

// Review links carry a secret; keep the page out of search indexes.
export const metadata: Metadata = { title: "지도 검토 · GonpunClaw PolicyMap", robots: { index: false, follow: false } };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function loadPublicExtraColumns(mapId: string): Promise<string[]> {
  const { data } = await supabaseServer().from("maps").select("public_extra_columns").eq("id", mapId).single();
  return Array.isArray(data?.public_extra_columns) ? (data.public_extra_columns as string[]) : [];
}

export default async function ReviewPage(props: PageProps<"/review/[slug]">) {
  const [{ slug }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const token = first(searchParams.t).trim();
  // A missing or wrong token is a plain 404 so the page never reveals whether the map exists.
  if (!token) notFound();
  const auth = await verifyReviewTokenForMap(slug, token);
  if (!auth.ok) notFound();

  const [record, state, extraColumns] = await Promise.all([
    loadPublicMapRecord(slug, true), // second arg = allowPrivate; reviewers see maps before publication
    loadReviewState(auth.mapId),
    loadPublicExtraColumns(auth.mapId),
  ]);
  if (!record) notFound();

  const clientProps = toMapClientProps(record);
  const sensitive = detectSensitiveHeaders(extraColumns);
  const pending = state.latest?.status === "pending" ? state.latest : null;
  const visibility = effectiveVisibility(record.map);

  const metaRows: Array<[string, string | null]> = [
    ["자료 출처", record.map.source_name],
    ["출처 URL", record.map.source_url],
    ["자료 기준일", record.map.data_as_of],
    ["담당 부서", record.map.owner_department],
    ["문의처", record.map.contact],
    ["이용조건", record.map.license],
    ["갱신주기", record.map.refresh_cycle],
    ["현재 공개 범위", VISIBILITY_LABELS[visibility]],
  ];

  return (
    <main className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">Review</p>
          <h1 className="text-3xl font-semibold tracking-tight">{record.map.title}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {pending
              ? `검토 요청 버전 v${pending.version_number ?? "?"} · 요청일 ${formatKoreanDate(pending.created_at) ?? "-"}`
              : "대기 중인 요청 없음"}
            {" · "}현재 버전 v{state.currentVersionNumber ?? "?"}
          </p>
          {pending?.request_note && (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
              요청 메모: {pending.request_note}
            </p>
          )}
        </div>

        <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800" style={{ height: 520 }}>
          <MapClient {...clientProps} embed />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold">메타데이터</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {metaRows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-zinc-500">{label}</dt>
                  <dd className={`break-all text-right ${value ? "" : "text-red-600"}`}>{value ?? "미입력"}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-sm font-semibold">데이터 품질</h2>
              <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <li>표시 {clientProps.markers.length.toLocaleString()}건</li>
                <li className={clientProps.qualitySummary?.review ? "text-amber-700" : ""}>검수 필요 {clientProps.qualitySummary?.review ?? 0}건</li>
                <li className={clientProps.qualitySummary?.failed ? "text-red-700" : ""}>변환 실패 {clientProps.qualitySummary?.failed ?? 0}건</li>
                <li>제외 {clientProps.qualitySummary?.excluded ?? 0}건</li>
              </ul>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-sm font-semibold">공개 추가정보 열</h2>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{extraColumns.length > 0 ? extraColumns.join(", ") : "없음"}</p>
              {sensitive.length > 0 ? (
                <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                  민감 가능 열: {sensitive.join(", ")} — 공개 적절성을 확인하세요.
                </p>
              ) : (
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">민감 헤더 패턴이 발견되지 않았습니다.</p>
              )}
            </div>
          </div>
        </section>

        <ReviewDecisionForm slug={slug} reviewToken={token} pending={Boolean(pending)} />
      </div>
    </main>
  );
}
