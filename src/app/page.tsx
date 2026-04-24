import Link from "next/link";

const STEPS = [
  {
    number: "1",
    title: "엑셀 업로드",
    body: "주소가 있는 시트를 올리면 A열 주소, B열 이름, C열 값, D열 분류를 기준으로 자동 파싱합니다.",
  },
  {
    number: "2",
    title: "자동 지오코딩",
    body: "카카오, VWorld, Juso를 순서대로 시도해 좌표를 찾고, 실패 행은 제외한 뒤 지도를 만듭니다.",
  },
  {
    number: "3",
    title: "공개 링크 발급",
    body: "공개 지도 링크와 관리 링크를 즉시 발급해 공유하거나 수정, 삭제까지 직접 처리할 수 있습니다.",
  },
];

const EXAMPLES = [
  {
    title: "복지시설 분포 지도",
    body: "시설명, 주소, 시설유형, 정원을 올리면 분포와 규모를 한 화면에서 볼 수 있습니다.",
  },
  {
    title: "정책 거점기관 지도",
    body: "사업 거점, 협력기관, 운영기관을 분류별로 나눠 공개 지도 링크로 바로 공유할 수 있습니다.",
  },
  {
    title: "지원 대상 위치 현황",
    body: "현장 점검용 주소 목록을 업로드해 지역별 편중과 누락 지점을 빠르게 확인할 수 있습니다.",
  },
];

export default function Home() {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-5xl px-6 py-16">
        <section className="grid gap-8 rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-400">
                GonpunClaw PolicyMap
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
                엑셀로 만드는 정책 지도
              </h1>
              <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
                주소가 들어 있는 엑셀 파일을 올리기만 하면, 자동으로 좌표를 찾아 공개 지도를 만들어
                드립니다. 정책 사업장, 지원시설, 거점 데이터를 빠르게 시각화하고 공유하세요.
              </p>
            </div>

            <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
              <li>· 카카오 / VWorld / Juso 지오코더를 순서대로 시도하는 폴백 체인</li>
              <li>· 분류·값 범위 필터, 군집(클러스터링), 팝업 자동 생성</li>
              <li>· 한 번 발급되는 관리 토큰으로 본인만 수정·삭제</li>
            </ul>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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
              <a
                href="https://github.com/hosungseo/gonpunclaw-policymap/blob/main/docs/USER-GUIDE-KO.md"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                사용법 보기
              </a>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              업로드된 데이터는 익명으로 게시되며, 발급되는 관리 토큰으로 직접 수정하거나 삭제할 수 있습니다.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">이럴 때 잘 맞습니다</h2>
            <div className="mt-4 space-y-4">
              {EXAMPLES.map((example) => (
                <div key={example.title} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{example.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{example.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">3단계로 끝나는 지도 발행</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              처음 쓰는 사용자도 업로드부터 공개 링크 발급까지 바로 따라갈 수 있게 구성했습니다.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.number} className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-700 text-sm font-semibold text-white">
                  {step.number}
                </div>
                <h3 className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{step.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
