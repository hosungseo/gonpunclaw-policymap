import Link from "next/link";
import { UploadForm } from "./UploadForm";

export const metadata = {
  title: "지도 만들기 · GonpunClaw PolicyMap",
  description: "엑셀 파일을 올려 정책 사업장이나 지원시설을 지도에 표시합니다.",
};

export default function UploadPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <header className="mb-8 space-y-2">
        <Link href="/" className="text-sm text-zinc-600 underline dark:text-zinc-400">
          ← 처음으로
        </Link>
        <h1 className="text-2xl font-semibold">지도 만들기</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          엑셀 파일을 올리면 주소를 자동으로 지오코딩하고 공개 지도를 만들어 드립니다.
        </p>
      </header>
      <UploadForm />
    </div>
  );
}
