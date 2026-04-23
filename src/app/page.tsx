import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-2xl px-6 py-24">
        <div className="space-y-8 rounded-xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-400">
              GonpunClaw PolicyMap
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              엑셀로 만드는 정책 지도
            </h1>
            <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
              주소가 들어 있는 엑셀 파일을 올리기만 하면, 자동으로 좌표를 찾아 공개 지도를 만들어
              드립니다. 정책 사업장, 지원시설, 거점 데이터를 빠르게 시각화하세요.
            </p>
          </div>

          <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            <li>· 카카오 / VWorld / Juso 지오코더를 순서대로 시도하는 폴백 체인</li>
            <li>· 분류·값 범위 필터, 군집(클러스터링), 팝업 자동 생성</li>
            <li>· 한 번 발급되는 관리 토큰으로 본인만 수정·삭제</li>
          </ul>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/upload"
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              지도 만들기
            </Link>
            <a
              href="/template.xlsx"
              className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              엑셀 템플릿 받기
            </a>
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            업로드된 데이터는 익명으로 게시되며, 발급되는 관리 토큰으로 직접 삭제할 수 있습니다.
          </p>
        </div>
      </main>
    </div>
  );
}
