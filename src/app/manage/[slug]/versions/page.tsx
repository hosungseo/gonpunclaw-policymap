import Link from "next/link";
import { VersionsClient } from "./VersionsClient";

export const dynamic = "force-dynamic";

export default async function VersionsPage(props: PageProps<"/manage/[slug]/versions">) {
  const { slug } = await props.params;
  return (
    <main className="min-h-dvh bg-zinc-50 px-6 py-10 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-4xl">
        <Link href={`/manage/${slug}`} className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100">← 관리 페이지</Link>
        <div className="mt-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">R2 데이터 이력</p>
          <h1 className="text-3xl font-semibold tracking-tight">버전과 변경점</h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            데이터 교체·초기 발행·복원 때 전체 스냅샷을 보존합니다. 복원은 기존 링크를 유지하면서 새 버전을 만드는 방식입니다.
          </p>
        </div>
        <div className="mt-8">
          <VersionsClient slug={slug} />
        </div>
      </div>
    </main>
  );
}
