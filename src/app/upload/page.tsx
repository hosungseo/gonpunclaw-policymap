import Link from "next/link";
import { UploadForm } from "./UploadForm";

export const metadata = {
  title: "지도 만들기 · GonpunClaw PolicyMap",
  description: "엑셀 파일을 올려 정책 사업장이나 지원시설을 지도에 표시합니다.",
};

export default function UploadPage() {
  return (
    <main className="min-h-dvh bg-zinc-50 px-6 py-10 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8">
          <Link href="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100">
            ← 처음으로
          </Link>
          <div className="mt-5 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">새 정책 지도</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">엑셀 업로드로 지도 만들기</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                템플릿에 주소와 이름을 넣어 업로드하면 좌표 변환 후 공개 지도 링크와 관리 링크를
                발급합니다. XLSX 형식을 권장합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link
                href="/template.xlsx"
                className="inline-flex min-h-10 items-center rounded-lg border border-zinc-300 bg-white px-4 font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                템플릿 다운로드
              </Link>
              <Link
                href="https://github.com/hosungseo/gonpunclaw-policymap/blob/main/docs/USER-GUIDE-KO.md"
                className="inline-flex min-h-10 items-center rounded-lg border border-zinc-300 bg-white px-4 font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                target="_blank"
                rel="noreferrer"
              >
                사용법 보기
              </Link>
            </div>
          </div>
        </header>

        <div className="mb-6 grid gap-3 md:grid-cols-3">
          {["제목 입력", "엑셀 선택", "공개 링크 발급"].map((label, index) => (
            <div key={label} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">STEP {index + 1}</p>
              <p className="mt-1 text-sm font-semibold">{label}</p>
            </div>
          ))}
        </div>

        <UploadForm />
      </div>
    </main>
  );
}
