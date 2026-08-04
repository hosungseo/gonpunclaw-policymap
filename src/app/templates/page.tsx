import Link from "next/link";
import { loadPolicyTemplates } from "@/lib/templates/catalog";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "정책업무 템플릿 · GonpunClaw PolicyMap",
  description: "지자체 정책업무별 권장 열과 공개 주의사항을 담은 PolicyMap 업로드 템플릿입니다.",
};

export default async function TemplatesPage() {
  const templates = await loadPolicyTemplates();
  return (
    <main className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <Link href="/" className="text-sm font-semibold tracking-tight">GonpunClaw PolicyMap</Link>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">정책업무 템플릿</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/guide" className="hidden min-h-10 items-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold sm:inline-flex dark:border-zinc-700">사용법</Link>
            <Link href="/upload" className="inline-flex min-h-10 items-center rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white dark:bg-white dark:text-zinc-950">지도 만들기</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">반복 업무를 위한 시작점</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">업무에 맞는 엑셀 구조로 바로 시작하세요</h1>
          <p className="mt-4 text-base leading-7 text-zinc-600 dark:text-zinc-300">
            권장 열, 예시 행, 공개 금지 항목을 함께 내려받습니다. 기존 파일이 있다면 템플릿에 맞추지 않고
            그대로 업로드해 열 연결 마법사를 사용할 수도 있습니다.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <article key={template.slug} className="flex flex-col border-t-2 border-zinc-900 bg-white px-5 py-5 dark:border-white dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">{template.audience}</p>
                  <h2 className="mt-2 text-lg font-semibold">{template.title}</h2>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{template.columns.length}개 열</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{template.description}</p>
              <div className="mt-4 flex-1">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">권장 열</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {template.columns.map((column) => (
                    <span key={column.header} className={`rounded-full px-2 py-1 text-xs ${column.publicByDefault ? "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200" : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>
                      {column.header}{column.publicByDefault ? "" : " · 공개 확인"}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-4 border-l-2 border-amber-400 pl-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{template.guidance}</p>
              <a
                href={`/api/templates/${template.slug}/download`}
                className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-600"
              >
                XLSX 다운로드
              </a>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
