import Link from "next/link";

const CAPABILITIES = [
  {
    label: "주소 자동 좌표화",
    value: "3단계",
    body: "카카오, VWorld, Juso 순서로 좌표를 찾고 실패 행은 따로 집계합니다.",
  },
  {
    label: "공개 지도",
    value: "즉시",
    body: "업로드가 끝나면 공유 링크와 관리 링크가 바로 발급됩니다.",
  },
  {
    label: "탐색 도구",
    value: "검색·필터·표",
    body: "분류와 값 범위로 걸러 보고, 표에서 위치를 다시 지도에 띄울 수 있습니다.",
  },
];

const WORKFLOW = [
  {
    title: "데이터 준비",
    body: "템플릿에 주소, 이름, 값, 분류를 채웁니다. 현장 메모나 추가 컬럼도 함께 보관할 수 있습니다.",
  },
  {
    title: "지도 검토",
    body: "좌표 변환 후 공개 지도에서 검색, 분류 필터, 값 범위, 표 보기로 데이터 상태를 확인합니다.",
  },
  {
    title: "운영 관리",
    body: "관리 토큰으로 공개 여부와 설명을 수정하고, 운영자는 신고와 감사 로그를 추적합니다.",
  },
];

const USE_CASES = ["복지시설 분포", "정책 거점기관", "현장 점검 대상", "지원 대상 위치", "공공서비스 권역"];

const TABLE_ROWS = [
  ["청년정책센터", "청년", "120"],
  ["동부복지관", "복지", "48"],
  ["현장지원소", "점검", "16"],
];

export default function Home() {
  return (
    <main className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-white">
            GonpunClaw PolicyMap
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-medium text-zinc-600 md:flex dark:text-zinc-300">
            <a href="#workflow" className="hover:text-zinc-950 dark:hover:text-white">흐름</a>
            <a href="#capabilities" className="hover:text-zinc-950 dark:hover:text-white">기능</a>
            <Link href="/demo" className="hover:text-zinc-950 dark:hover:text-white">샘플</Link>
            <a
              href="https://github.com/hosungseo/gonpunclaw-policymap/blob/main/docs/USER-GUIDE-KO.md"
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-950 dark:hover:text-white"
            >
              가이드
            </a>
          </nav>
          <Link
            href="/upload"
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            지도 만들기
          </Link>
        </div>
      </section>

      <section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1fr_1.05fr] lg:py-16">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">업무 흐름 그대로</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-5xl">
              엑셀 주소 목록을 바로 공유 가능한 정책 지도로
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300">
              사업장, 지원시설, 거점기관처럼 주소가 있는 데이터를 업로드하면 좌표 변환부터 공개
              링크 발급까지 한 번에 처리합니다. 별도 GIS 도구 없이 정책 현황을 지도와 표로 함께
              확인할 수 있습니다.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">업로드</p>
                <p className="mt-1 text-lg font-semibold">XLSX 우선</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">탐색</p>
                <p className="mt-1 text-lg font-semibold">지도 + 표</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">관리</p>
                <p className="mt-1 text-lg font-semibold">토큰 기반</p>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/upload"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                지도 만들기
              </Link>
              <Link
                href="/demo"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white transition hover:bg-blue-600"
              >
                샘플 지도 보기
              </Link>
              <a
                href="/template.xlsx"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                엑셀 템플릿 받기
              </a>
              <a
                href="https://github.com/hosungseo/gonpunclaw-policymap/blob/main/docs/USER-GUIDE-KO.md"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                사용법 보기
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {USE_CASES.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div>
                <p className="text-sm font-semibold">정책 거점 지도</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">검색 결과 128곳</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                공개 중
              </span>
            </div>
            <div className="grid min-h-[380px] grid-cols-1 md:grid-cols-[210px_1fr]">
              <div className="border-b border-zinc-200 bg-white p-4 md:border-b-0 md:border-r dark:border-zinc-800 dark:bg-zinc-950">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  기관명, 주소 검색
                </div>
                <div className="mt-5">
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">분류</p>
                  <div className="mt-2 space-y-2">
                    {["청년", "복지", "점검"].map((category) => (
                      <div key={category} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                        <span>{category}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                          {category === "청년" ? 52 : category === "복지" ? 41 : 35}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5 rounded-lg bg-blue-700 px-3 py-2 text-center text-xs font-semibold text-white">
                  지도 맞춤
                </div>
              </div>
              <div className="grid min-h-[380px] grid-rows-[1fr_auto]">
                <div className="relative overflow-hidden bg-[linear-gradient(135deg,#dbeafe_0%,#f8fafc_45%,#dcfce7_100%)] dark:bg-[linear-gradient(135deg,#172554_0%,#18181b_50%,#064e3b_100%)]">
                  <div className="absolute inset-x-8 top-10 h-px bg-white/70 dark:bg-white/10" />
                  <div className="absolute inset-y-8 left-16 w-px bg-white/70 dark:bg-white/10" />
                  <div className="absolute left-[16%] top-[34%] h-8 w-8 rounded-full border-4 border-white bg-blue-600 shadow-lg" />
                  <div className="absolute left-[48%] top-[44%] h-10 w-10 rounded-full border-4 border-white bg-red-600 shadow-lg" />
                  <div className="absolute right-[18%] top-[23%] h-7 w-7 rounded-full border-4 border-white bg-emerald-600 shadow-lg" />
                  <div className="absolute bottom-5 right-5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                    지도 · 표 전환 가능
                  </div>
                </div>
                <div className="border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {TABLE_ROWS.map(([name, category, count]) => (
                      <div key={name} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                        <p className="truncate font-semibold">{name}</p>
                        <p className="mt-1 text-zinc-500 dark:text-zinc-400">{category} · {count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">발행 흐름</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">데이터 준비부터 운영 관리까지</h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                처음 쓰는 사용자도 템플릿 작성, 업로드, 지도 검토, 링크 공유 순서로 바로 따라갈 수 있습니다.
              </p>
            </div>
            <Link href="/upload" className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">
              업로드로 이동
            </Link>
          </div>

          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {WORKFLOW.map((step, index) => (
              <li key={step.title} className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                  STEP {index + 1}
                </span>
                <h3 className="mt-3 text-base font-semibold text-zinc-950 dark:text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="capabilities" className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="grid gap-4 md:grid-cols-3">
          {CAPABILITIES.map((item) => (
            <article
              key={item.label}
              className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-white">{item.value}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
