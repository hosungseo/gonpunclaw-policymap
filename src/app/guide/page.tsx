import Link from "next/link";

export const metadata = {
  title: "사용법 · GonpunClaw PolicyMap",
  description: "엑셀 주소 목록으로 정책 지도를 만드는 방법을 단계별로 안내합니다.",
};

const QUICK_STEPS = [
  {
    title: "1. 엑셀 준비",
    body: "주소는 필수이고, 숫자값과 분류는 선택입니다. 위치가 여러 개면 헤더 아래에 행을 여러 개 추가합니다.",
  },
  {
    title: "2. 지도 만들기",
    body: "지도 제목을 입력하고 엑셀 파일을 선택한 뒤 미리보기에서 행 수와 민감 컬럼 경고를 확인합니다.",
  },
  {
    title: "3. 공유와 관리",
    body: "완료 화면에서 공개 지도 링크만 외부에 공유하고, 관리 페이지와 관리 토큰은 내부에만 보관합니다.",
  },
];

const COLUMN_GUIDE = [
  ["A열 주소", "필수", "지도에서 좌표로 바꿀 주소입니다.", "서울 서초구 반포대로 58"],
  ["B열 이름", "권장", "지도 팝업과 표에서 보이는 이름입니다.", "예시 사용처"],
  ["C열 숫자값", "선택", "지원한도처럼 비교할 숫자가 있을 때만 넣습니다.", "15"],
  ["C열 단위", "선택", "업로드 화면에 입력하는 표시값입니다. 숫자 뒤에 붙습니다.", "만원"],
  ["D열 필터 분류", "선택", "지도에서 색상과 필터로 나눌 기준입니다.", "주유소"],
  ["E열 이후", "선택", "공개 지도 팝업에 추가 정보로 표시됩니다.", "지역, 사용가능항목, 비고"],
];

const TROUBLESHOOTING = [
  {
    title: "주소 변환에 실패했을 때",
    body: "도로명 주소처럼 구체적으로 고치면 성공률이 올라갑니다. 관리 페이지에서 실패 주소만 다시 시도할 수 있습니다.",
  },
  {
    title: "민감 컬럼 경고가 보일 때",
    body: "전화번호, 이메일, 계좌, 주민번호, 상세주소처럼 공개하면 안 되는 열은 삭제한 뒤 업로드합니다.",
  },
  {
    title: "업로드 후 내용을 바꾸고 싶을 때",
    body: "관리 페이지에서 제목, 설명, 공개 여부를 바꾸거나 새 엑셀 파일로 전체 데이터를 교체할 수 있습니다.",
  },
];

export default function GuidePage() {
  return (
    <main className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-white">
            GonpunClaw PolicyMap
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/demo"
              className="hidden min-h-10 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 sm:inline-flex dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              샘플 지도
            </Link>
            <Link
              href="/upload"
              className="inline-flex min-h-10 items-center rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              지도 만들기
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1fr_360px] lg:py-14">
          <div>
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">사용법 보기</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              처음부터 끝까지 따라하기
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600 dark:text-zinc-300">
              주소가 들어 있는 엑셀만 준비하면 공개 지도와 관리 페이지를 만들 수 있습니다. 아래 순서대로
              진행하면 어떤 정보를 공유해야 하고, 어떤 정보는 내부에만 보관해야 하는지 헷갈리지 않습니다.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/upload"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                지도 만들기
              </Link>
              <Link
                href="/template.xlsx"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                템플릿 다운로드
              </Link>
              <Link
                href="/demo"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                샘플 지도 보기
              </Link>
            </div>
          </div>

          <aside className="rounded-lg border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">가장 중요한 구분</p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-blue-800 dark:text-blue-200">
              <p className="rounded-md bg-white px-3 py-2 dark:bg-blue-900/40">
                공개 지도 링크만 외부에 공유하세요.
              </p>
              <p className="rounded-md bg-white px-3 py-2 dark:bg-blue-900/40">
                관리 페이지와 관리 토큰은 내부에만 보관합니다.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <ol className="grid gap-4 md:grid-cols-3">
          {QUICK_STEPS.map((step) => (
            <li key={step.title} className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">{step.title}</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[360px_1fr]">
          <div>
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">엑셀 구조</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">한 행은 지도 위치 1개입니다</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              시설이나 사업장이 10개라면 헤더 아래에 데이터 행 10개를 넣습니다. 여러 시트가 있어도
              첫 번째 시트만 읽습니다.
            </p>
            <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm leading-6 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
              C열 숫자값은 지원한도처럼 비교할 숫자가 있을 때만 넣습니다. 단위는 업로드 화면에서
              만원, 건, 명처럼 따로 입력하면 됩니다.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="min-w-[640px] text-left text-sm">
              <thead className="bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">열</th>
                  <th className="px-4 py-3 font-semibold">필수 여부</th>
                  <th className="px-4 py-3 font-semibold">무엇에 쓰이나요</th>
                  <th className="px-4 py-3 font-semibold">예시</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-zinc-950">
                {COLUMN_GUIDE.map(([name, required, usage, example]) => (
                  <tr key={name} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-100">{name}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{required}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{usage}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="grid gap-4 lg:grid-cols-3">
          {TROUBLESHOOTING.map((item) => (
            <article key={item.title} className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-base font-semibold text-zinc-950 dark:text-white">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
