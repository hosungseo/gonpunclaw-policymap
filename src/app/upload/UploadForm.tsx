"use client";

import { useState } from "react";
import Link from "next/link";

type UploadResponse =
  | {
      ok: true;
      slug: string;
      admin_token: string;
      inserted: number;
      failed: number;
      geocoder_stats: Record<string, number>;
    }
  | { ok: false; error: { code: string; message: string } };

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "error"; message: string }
  | {
      kind: "success";
      slug: string;
      adminToken: string;
      inserted: number;
      failed: number;
      stats: Record<string, number>;
    };

export function UploadForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setStatus({ kind: "uploading" });
    let res: Response;
    try {
      res = await fetch("/api/upload", { method: "POST", body: fd });
    } catch {
      setStatus({ kind: "error", message: "네트워크 오류가 발생했습니다." });
      return;
    }
    let json: UploadResponse;
    try {
      json = (await res.json()) as UploadResponse;
    } catch {
      setStatus({ kind: "error", message: `서버 응답이 올바르지 않습니다 (${res.status}).` });
      return;
    }
    if (!json.ok) {
      setStatus({ kind: "error", message: json.error.message });
      return;
    }
    setStatus({
      kind: "success",
      slug: json.slug,
      adminToken: json.admin_token,
      inserted: json.inserted,
      failed: json.failed,
      stats: json.geocoder_stats,
    });
  }

  if (status.kind === "success") {
    const url = `/m/${status.slug}`;
    const manageUrl = `/manage/${status.slug}`;
    return (
      <div className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h2 className="text-xl font-semibold">지도가 생성되었습니다</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {status.inserted.toLocaleString()}개 마커 등록, {status.failed.toLocaleString()}개 실패
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">공개 지도 주소</p>
          <Link href={url} className="block break-all rounded border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-blue-700 underline dark:border-zinc-800 dark:bg-zinc-900">
            {url}
          </Link>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">관리 페이지</p>
          <Link href={manageUrl} className="block break-all rounded border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-blue-700 underline dark:border-zinc-800 dark:bg-zinc-900">
            {manageUrl}
          </Link>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            위 페이지에서 관리 토큰을 입력하면 지도를 삭제할 수 있습니다.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">관리 토큰 (한 번만 표시됩니다)</p>
          <code className="block break-all rounded border border-amber-300 bg-amber-50 px-3 py-2 font-mono text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {status.adminToken}
          </code>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            이 토큰을 잃어버리면 지도를 수정하거나 삭제할 수 없습니다. 안전한 곳에 보관해 주세요.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setStatus({ kind: "idle" })}
          className="text-sm text-blue-700 underline"
        >
          새 지도 만들기
        </button>
      </div>
    );
  }

  const disabled = status.kind === "uploading";

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="title">
          지도 제목 <span className="text-red-600">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={120}
          placeholder="예: 2026 서울 청년정책 거점"
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="description">
          설명
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          maxLength={500}
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="value_label">
            값 컬럼 라벨
          </label>
          <input
            id="value_label"
            name="value_label"
            type="text"
            placeholder="예: 예산"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="value_unit">
            단위
          </label>
          <input
            id="value_unit"
            name="value_unit"
            type="text"
            placeholder="예: 원"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="category_label">
            분류 컬럼 라벨
          </label>
          <input
            id="category_label"
            name="category_label"
            type="text"
            placeholder="예: 대상"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="file">
          엑셀 파일 <span className="text-red-600">*</span>
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,.xls,.csv"
          required
          className="block w-full text-sm"
        />
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          A열 주소, B열 이름, C열 값, D열 분류, E열 이후 임의. 최대 10,000행 / 3MB.
          템플릿은 <a href="/template.xlsx" className="underline">여기</a>서 받을 수 있습니다.
        </p>
      </div>

      {status.kind === "error" && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {status.message}
        </p>
      )}

      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center justify-center rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {disabled ? "지오코딩 중..." : "지도 생성"}
      </button>
    </form>
  );
}
