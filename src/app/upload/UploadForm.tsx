"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { parseWorkbook, type ParsedRow } from "@/lib/excel/parse";

async function copyText(text: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type UploadResponse =
  | {
      ok: true;
      slug: string;
      admin_token: string;
      inserted: number;
      failed: number;
      geocoder_stats: Record<string, number>;
      failure_preview?: FailurePreviewItem[];
    }
  | { ok: false; error: { code: string; message: string } };

type FailurePreviewItem = {
  row_index: number;
  address_raw: string;
  reason: string;
  attempted: string[];
};

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
      failurePreview: FailurePreviewItem[];
    };

type FilePreview =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; rows: ParsedRow[]; totalRows: number; skipped: number[]; sensitiveHeaders: string[] }
  | { kind: "error"; message: string };

const SENSITIVE_HEADER_PATTERN = /개인|주민|생년|전화|연락처|휴대폰|핸드폰|이메일|email|e-mail|카톡|계좌|주소상세|상세주소/i;

function detectSensitiveHeaders(headers: string[]) {
  return headers.map((header) => header.trim()).filter((header) => header && SENSITIVE_HEADER_PATTERN.test(header));
}

export function UploadForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [title, setTitle] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [filePreview, setFilePreview] = useState<FilePreview>({ kind: "idle" });
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleCopy(key: string, text: string) {
    const ok = await copyText(text);
    setCopiedField(ok ? key : null);
    if (ok) window.setTimeout(() => setCopiedField((current) => (current === key ? null : current)), 1500);
  }

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
      failurePreview: json.failure_preview ?? [],
    });
  }

  function clearSelectedFile() {
    setSelectedFileName("");
    setFilePreview({ kind: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(file: File | undefined) {
    setSelectedFileName(file?.name ?? "");
    if (!file) {
      setFilePreview({ kind: "idle" });
      return;
    }

    setFilePreview({ kind: "loading" });
    try {
      const parsed = parseWorkbook(await file.arrayBuffer());
      if (!parsed.ok) {
        setFilePreview({ kind: "error", message: parsed.error.message });
        return;
      }
      setFilePreview({
        kind: "ready",
        rows: parsed.rows.slice(0, 5),
        totalRows: parsed.rows.length,
        skipped: parsed.skipped_empty_address,
        sensitiveHeaders: detectSensitiveHeaders(parsed.headers),
      });
    } catch {
      setFilePreview({ kind: "error", message: "파일 미리보기를 만들 수 없습니다." });
    }
  }

  if (status.kind === "success") {
    const url = `/m/${status.slug}`;
    const manageUrl = `/manage/${status.slug}`;
    const hasStats = Object.keys(status.stats).length > 0;

    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">생성 완료</p>
            <h2 className="mt-2 text-2xl font-semibold">지도가 생성되었습니다</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {status.inserted.toLocaleString()}개 마커 등록, {status.failed.toLocaleString()}개 주소 변환 실패
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setStatus({ kind: "idle" });
              setTitle("");
              setSelectedFileName("");
              setFilePreview({ kind: "idle" });
            }}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            새 지도 만들기
          </button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ResultLink
            title="공개 지도"
            description="공유받은 사용자가 지도와 표를 볼 수 있습니다."
            href={url}
            copied={copiedField === "public"}
            onCopy={() => handleCopy("public", `${window.location.origin}${url}`)}
          />
          <ResultLink
            title="관리 페이지"
            description="관리 토큰으로 제목, 설명, 공개 여부를 수정합니다."
            href={manageUrl}
            copied={copiedField === "manage"}
            onCopy={() => handleCopy("manage", `${window.location.origin}${manageUrl}`)}
          />
        </div>

        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">관리 토큰</p>
              <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200">
                이 토큰은 한 번만 표시됩니다. 잃어버리면 지도를 수정하거나 삭제할 수 없습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy("token", status.adminToken)}
              className="inline-flex min-h-9 items-center justify-center rounded-md bg-amber-900 px-3 text-xs font-semibold text-white hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950"
            >
              {copiedField === "token" ? "복사됨" : "토큰 복사"}
            </button>
          </div>
          <code className="mt-3 block break-all rounded-md border border-amber-200 bg-white px-3 py-2 font-mono text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-100">
            {status.adminToken}
          </code>
        </div>

        {hasStats && (
          <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-semibold">지오코딩 처리</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(status.stats).map(([name, count]) => (
                <span
                  key={name}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  {name}: {count.toLocaleString()}
                </span>
              ))}
            </div>
          </div>
        )}

        {status.failurePreview.length > 0 && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
            <p className="text-sm font-semibold text-red-900 dark:text-red-100">변환 실패 주소</p>
            <p className="mt-1 text-xs leading-5 text-red-800 dark:text-red-200">
              아래 주소는 지도에 표시되지 않았습니다. 원본 파일에서 행 번호와 주소를 확인해 다시 업로드하세요.
            </p>
            <div className="mt-3 space-y-2">
              {status.failurePreview.map((item) => (
                <div
                  key={`${item.row_index}-${item.address_raw}`}
                  className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs dark:border-red-900 dark:bg-red-900/30"
                >
                  <p className="font-semibold text-red-950 dark:text-red-100">{item.row_index}행</p>
                  <p className="mt-1 break-words text-red-900 dark:text-red-100">{item.address_raw}</p>
                  <p className="mt-1 text-red-700 dark:text-red-200">
                    {item.reason} · {item.attempted.join(", ") || "시도한 지오코더 없음"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  const disabled = status.kind === "uploading";
  const canSubmit = !disabled && Boolean(title.trim()) && Boolean(selectedFileName) && filePreview.kind === "ready";

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-7">
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">지도 기본 정보</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                공개 지도 상단에 표시될 제목과 설명입니다.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="title">
                지도 제목 <span className="text-red-600">*</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={120}
                placeholder="예: 2026 서울 청년정책 거점"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="description">
                설명
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                maxLength={500}
                placeholder="지도에 담긴 데이터의 기준일, 대상, 출처를 적어 주세요."
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
          </section>

          <section className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <div>
              <h2 className="text-base font-semibold">엑셀 컬럼 표시 이름</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                공개 지도 필터와 팝업에 표시될 이름입니다. 비워 두면 기본값을 사용합니다.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <LabelInput id="value_label" name="value_label" label="C열 대표값" placeholder="예: 예산" />
              <LabelInput id="value_unit" name="value_unit" label="단위" placeholder="예: 원" />
              <LabelInput id="category_label" name="category_label" label="D열 분류" placeholder="예: 대상" />
            </div>
          </section>

          {status.kind === "error" && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {status.message}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {disabled ? "주소를 좌표로 변환하는 중..." : "지도 생성"}
          </button>
          {!canSubmit && !disabled && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              지도 제목과 엑셀 파일을 모두 입력하면 지도를 생성할 수 있습니다.
            </p>
          )}
        </div>

        <aside className="space-y-5">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">파일 형식</p>
            <div className="mt-2 space-y-1 text-xs leading-5 text-blue-800 dark:text-blue-200">
              <p>한 행은 지도에 표시될 위치 1개입니다.</p>
              <p>첫 번째 시트만 읽습니다.</p>
              <p>A열 주소, B열 이름, C열 값, D열 분류를 읽습니다.</p>
              <p>E열 이후는 공개 지도 팝업에 추가 정보로 표시됩니다.</p>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold">엑셀 작성 예시</h2>
            <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
              엑셀 한 줄이 지도 위치 1개가 됩니다.
            </p>
            <div className="mt-3 overflow-x-auto rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="min-w-[560px] text-left text-xs">
                <thead className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  <tr>
                    <th className="px-3 py-2 font-semibold">A열 주소</th>
                    <th className="px-3 py-2 font-semibold">B열 이름</th>
                    <th className="px-3 py-2 font-semibold">C열 대표값</th>
                    <th className="px-3 py-2 font-semibold">D열 분류</th>
                    <th className="px-3 py-2 font-semibold">E열 이후</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">서울 서초구 반포대로 58</td>
                    <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">예시복지관</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">48</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">복지</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">담당부서, 비고</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
              이 행은 지도에서 예시복지관 위치 1개로 표시됩니다.
            </p>
          </div>

          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">공개 전 확인</p>
            <p className="mt-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
              업로드한 내용은 공개 지도에 그대로 표시됩니다.
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200">
              개인정보나 민감정보가 들어 있는 열은 올리기 전에 제거하세요.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor={fileInputId}>
              엑셀 파일 <span className="text-red-600">*</span>
            </label>
            <label
              htmlFor={fileInputId}
              className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-blue-500 dark:hover:bg-blue-950"
            >
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {selectedFileName || "파일 선택"}
              </span>
              <span className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                최대 10,000행 / 3MB. XLSX, XLS, CSV를 지원합니다.
              </span>
            </label>
            <input
              ref={fileInputRef}
              id={fileInputId}
              name="file"
              type="file"
              accept=".xlsx,.xls,.csv"
              required
              onChange={(e) => void handleFileChange(e.target.files?.[0])}
              className="sr-only"
            />
            {selectedFileName && (
              <button
                type="button"
                onClick={clearSelectedFile}
                className="text-xs font-medium text-zinc-600 underline hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                파일 선택 해제
              </button>
            )}
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              템플릿은 <a href="/template.xlsx" className="font-medium underline">여기</a>서 받을 수 있습니다.
            </p>
          </div>

          <FilePreviewPanel preview={filePreview} />

          {disabled && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div className="h-full w-2/3 rounded-full bg-blue-700" />
              </div>
              <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                주소 수와 외부 지오코더 응답에 따라 잠시 걸릴 수 있습니다. 창을 닫지 마세요.
              </p>
            </div>
          )}
        </aside>
      </div>
    </form>
  );
}

function FilePreviewPanel({ preview }: { preview: FilePreview }) {
  if (preview.kind === "idle") {
    return null;
  }

  if (preview.kind === "loading") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        파일 구조를 확인하는 중입니다.
      </div>
    );
  }

  if (preview.kind === "error") {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-xs leading-5 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        <p className="font-semibold">파일을 확인해 주세요</p>
        <p className="mt-1">{preview.message}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">미리보기</p>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          {preview.totalRows.toLocaleString()}개 위치
        </span>
      </div>
      {preview.skipped.length > 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          주소가 비어 있는 {preview.skipped.length.toLocaleString()}개 행은 제외됩니다.
        </p>
      )}
      {preview.sensitiveHeaders.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-semibold">공개 전 삭제 권장 컬럼</p>
          <p className="mt-1">{preview.sensitiveHeaders.join(", ")}</p>
          <p className="mt-1 text-amber-800 dark:text-amber-200">
            해당 열은 공개 지도 팝업에 표시될 수 있습니다.
          </p>
        </div>
      )}
      <div className="mt-3 space-y-2">
        {preview.rows.map((row) => (
          <div
            key={row.row_index}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{row.name || row.address_raw}</p>
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">{row.address_raw}</p>
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">
              {[row.category, row.value != null ? row.value.toLocaleString() : null].filter(Boolean).join(" · ") || "분류/값 없음"}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        화면에는 최대 5개 행만 표시됩니다. 전체 데이터는 업로드 후 지도에서 확인할 수 있습니다.
      </p>
    </div>
  );
}

function LabelInput({ id, name, label, placeholder }: { id: string; name: string; label: string; placeholder: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </div>
  );
}

function ResultLink({
  title,
  description,
  href,
  copied,
  onCopy,
}: {
  title: string;
  description: string;
  href: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{description}</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex min-h-8 shrink-0 items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <Link
        href={href}
        className="mt-3 block break-all rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-sm text-blue-700 underline dark:border-zinc-800 dark:bg-zinc-900 dark:text-blue-300"
      >
        {href}
      </Link>
    </div>
  );
}
