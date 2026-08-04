"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { defaultColumnMapping, inspectWorkbook, parseWorkbook, parsedRowsForSensitiveScan, type ColumnMapping, type ParsedRow, type SheetInspection } from "@/lib/excel/parse";
import { scanSensitiveData, type SensitiveFinding } from "@/lib/upload/sensitive";
import { VISIBILITY_LABELS, type Visibility } from "@/lib/maps/metadata";

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

type UploadJobResponse =
  | {
      ok: true;
      job_id: string;
      job_token?: string;
      status: "pending" | "processing" | "completed" | "failed";
      slug: string;
      admin_token?: string;
      total: number;
      processed: number;
      inserted: number;
      failed: number;
      geocoder_stats: Record<string, number>;
      failure_preview?: FailurePreviewItem[];
      error_message?: string | null;
      preflight?: Record<string, unknown>;
      quality_review_count?: number;
      excluded_count?: number;
      needs_review?: boolean;
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
  | {
      kind: "processing";
      slug: string;
      adminToken: string;
      processed: number;
      total: number;
      inserted: number;
      failed: number;
    }
  | { kind: "error"; message: string }
  | {
      kind: "success";
      slug: string;
      adminToken: string;
      inserted: number;
      failed: number;
      jobId: string;
      jobToken: string;
      published: boolean;
      stats: Record<string, number>;
      failurePreview: FailurePreviewItem[];
      qualityReviewCount: number;
      excludedCount: number;
      preflight: Record<string, unknown>;
    };

type FilePreview =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      rows: ParsedRow[];
      totalRows: number;
      skipped: number[];
      sensitiveHeaders: string[];
      sensitiveFindings: SensitiveFinding[];
      sheets: SheetInspection[];
      sheetName: string;
      headers: string[];
      scanRows: unknown[][];
      mapping: ColumnMapping;
      publicExtraColumns: number[];
      duplicateCandidateCount: number;
      emptyRowCount: number;
      valueStats: { selected: number; converted: number; failed: number; examples: number[] };
    }
  | { kind: "error"; message: string };

export function UploadForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [dataAsOf, setDataAsOf] = useState("");
  const [ownerDepartment, setOwnerDepartment] = useState("");
  const [contact, setContact] = useState("");
  const [license, setLicense] = useState("");
  const [refreshCycle, setRefreshCycle] = useState("");
  const [nextReviewAt, setNextReviewAt] = useState("");
  const [sensitiveConfirmed, setSensitiveConfirmed] = useState(false);
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const [asOfConfirmed, setAsOfConfirmed] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [filePreview, setFilePreview] = useState<FilePreview>({ kind: "idle" });
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleCopy(key: string, text: string) {
    const ok = await copyText(text);
    setCopiedField(ok ? key : null);
    if (ok) window.setTimeout(() => setCopiedField((current) => (current === key ? null : current)), 1500);
  }

  async function publishCurrentMap() {
    if (status.kind !== "success" || !status.jobToken || status.jobId === "legacy") return;
    if (status.qualityReviewCount > 0 && !reviewConfirmed) {
      setStatus({ kind: "error", message: "검수 필요 위치를 확인했거나 제외했다는 체크가 필요합니다." });
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch(`/api/upload/jobs/${status.jobId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-upload-job-token": status.jobToken },
        body: JSON.stringify({
          title,
          description,
          visibility,
          source_name: sourceName,
          source_url: sourceUrl,
          data_as_of: dataAsOf,
          owner_department: ownerDepartment,
          contact,
          license,
          refresh_cycle: refreshCycle,
          next_review_at: nextReviewAt,
          value_label: filePreview.kind === "ready" && filePreview.mapping.value != null ? filePreview.headers[filePreview.mapping.value] : null,
          category_label: filePreview.kind === "ready" && filePreview.mapping.category != null ? filePreview.headers[filePreview.mapping.category] : null,
          review_confirmed: reviewConfirmed,
          source_confirmed: sourceConfirmed,
          as_of_confirmed: asOfConfirmed,
          sensitive_confirmed: sensitiveConfirmed,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!res.ok || !json?.ok) {
        setStatus({ kind: "error", message: json?.error?.message ?? "지도 발행에 실패했습니다." });
        return;
      }
      setStatus((current) => current.kind === "success" ? { ...current, published: true } : current);
    } catch {
      setStatus({ kind: "error", message: "지도 발행 중 네트워크 오류가 발생했습니다." });
    } finally {
      setPublishing(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedFile || filePreview.kind !== "ready") {
      setStatus({ kind: "error", message: "엑셀 파일을 선택해 주세요." });
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set("file", selectedFile);
    fd.set("sheet_name", filePreview.sheetName);
    fd.set("mapping", JSON.stringify(filePreview.mapping));
    fd.set("public_extra_columns", JSON.stringify(filePreview.publicExtraColumns));
    fd.set("visibility", visibility);
    fd.set("source_name", sourceName);
    fd.set("source_url", sourceUrl);
    fd.set("data_as_of", dataAsOf);
    fd.set("owner_department", ownerDepartment);
    fd.set("contact", contact);
    fd.set("license", license);
    fd.set("refresh_cycle", refreshCycle);
    fd.set("next_review_at", nextReviewAt);
    fd.set("sensitive_confirmed", String(sensitiveConfirmed));
    fd.set("source_confirmed", String(sourceConfirmed));
    fd.set("as_of_confirmed", String(asOfConfirmed));
    setStatus({ kind: "uploading" });
    let res: Response;
    try {
      res = await fetch("/api/upload/jobs", { method: "POST", body: fd });
    } catch {
      setStatus({ kind: "error", message: "네트워크 오류가 발생했습니다." });
      return;
    }
    let json: UploadJobResponse | UploadResponse;
    try {
      json = (await res.json()) as UploadJobResponse | UploadResponse;
    } catch {
      setStatus({ kind: "error", message: `서버 응답이 올바르지 않습니다 (${res.status}).` });
      return;
    }
    if (!json.ok) {
      setStatus({ kind: "error", message: json.error.message });
      return;
    }
    if ("job_id" in json) {
      await runUploadJob(json);
      return;
    }
      setStatus({
        kind: "success",
        slug: json.slug,
        adminToken: json.admin_token,
        inserted: json.inserted,
        failed: json.failed,
        jobId: "legacy",
        jobToken: "",
        published: true,
        stats: json.geocoder_stats,
        failurePreview: json.failure_preview ?? [],
        qualityReviewCount: 0,
        excludedCount: 0,
        preflight: {},
      });
  }

  async function runUploadJob(initial: Extract<UploadJobResponse, { ok: true }>) {
    let current = initial;
    const adminToken = initial.admin_token ?? "";
    const jobToken = initial.job_token ?? "";
    while (current.status === "pending" || current.status === "processing") {
      setStatus({
        kind: "processing",
        slug: current.slug,
        adminToken,
        processed: current.processed,
        total: current.total,
        inserted: current.inserted,
        failed: current.failed,
      });

      let res: Response;
      try {
        res = await fetch(`/api/upload/jobs/${current.job_id}/process`, {
          method: "POST",
          headers: jobToken ? { "x-upload-job-token": jobToken } : undefined,
        });
      } catch {
        setStatus({ kind: "error", message: "주소 변환 중 네트워크 오류가 발생했습니다." });
        return;
      }

      let json: UploadJobResponse;
      try {
        json = (await res.json()) as UploadJobResponse;
      } catch {
        setStatus({ kind: "error", message: `작업 응답이 올바르지 않습니다 (${res.status}).` });
        return;
      }
      if (!json.ok) {
        setStatus({ kind: "error", message: json.error.message });
        return;
      }
      current = json;
    }

    if (current.status === "failed") {
      setStatus({ kind: "error", message: current.error_message ?? "주소 변환 작업에 실패했습니다." });
      return;
    }

    setStatus({
      kind: "success",
      slug: current.slug,
      adminToken,
        inserted: current.inserted,
        failed: current.failed,
        jobId: current.job_id,
        jobToken,
        published: false,
        stats: current.geocoder_stats,
        failurePreview: current.failure_preview ?? [],
        qualityReviewCount: current.quality_review_count ?? 0,
        excludedCount: current.excluded_count ?? 0,
        preflight: current.preflight ?? {},
      });
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    setSelectedFileName("");
    setFilePreview({ kind: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(file: File | undefined) {
    setSensitiveConfirmed(false);
    setSelectedFile(file ?? null);
    setSelectedFileName(file?.name ?? "");
    if (!file) {
      setFilePreview({ kind: "idle" });
      return;
    }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setFilePreview({ kind: "error", message: "XLSX, XLS 또는 CSV 파일만 업로드할 수 있습니다." });
      return;
    }

    setFilePreview({ kind: "loading" });
    try {
      const buffer = await file.arrayBuffer();
      const inspected = inspectWorkbook(buffer, file.name);
      if (!inspected.ok) {
        setFilePreview({ kind: "error", message: inspected.error.message });
        return;
      }
      const firstSheet = inspected.inspection.sheets[0];
      if (!firstSheet) {
        setFilePreview({ kind: "error", message: "사용할 시트가 없습니다." });
        return;
      }
      const mapping = defaultColumnMapping(firstSheet.headers, firstSheet.sampleRows);
      const parsed = parseWorkbook(buffer, {
        sheetName: firstSheet.name,
        mapping,
        publicExtraColumns: mapping.extra,
        allowArbitraryAddressColumn: true,
        includeRaw: true,
      });
      if (!parsed.ok) {
        setFilePreview({ kind: "error", message: parsed.error.message });
        return;
      }
      const findings = scanSensitiveData(parsed.headers, parsedRowsForSensitiveScan(parsed), [mapping.address, mapping.name, mapping.value, mapping.category, ...mapping.extra].filter((index): index is number => index != null));
      setFilePreview({
        kind: "ready",
        rows: parsed.rows.slice(0, 5),
        totalRows: parsed.rows.length,
        skipped: parsed.skipped_empty_address,
        sensitiveHeaders: findings.map((finding) => finding.header),
        sensitiveFindings: findings,
        sheets: inspected.inspection.sheets,
        sheetName: firstSheet.name,
        headers: parsed.headers,
        scanRows: parsedRowsForSensitiveScan(parsed),
        mapping: parsed.mapping,
        publicExtraColumns: parsed.mapping.extra,
        duplicateCandidateCount: parsed.duplicate_candidate_count,
        emptyRowCount: parsed.empty_row_count,
        valueStats: parsed.value_stats,
      });
    } catch {
      setFilePreview({ kind: "error", message: "파일 미리보기를 만들 수 없습니다." });
    }
  }

  async function handleSheetChange(sheetName: string) {
    if (!selectedFile || filePreview.kind !== "ready") return;
    const sheet = filePreview.sheets.find((candidate) => candidate.name === sheetName);
    if (!sheet) return;
    const buffer = await selectedFile.arrayBuffer();
    const mapping = defaultColumnMapping(sheet.headers, sheet.sampleRows);
    const parsed = parseWorkbook(buffer, { sheetName, mapping, publicExtraColumns: mapping.extra, allowArbitraryAddressColumn: true, includeRaw: true });
    if (!parsed.ok) {
      setStatus({ kind: "error", message: parsed.error.message });
      return;
    }
    const findings = scanSensitiveData(parsed.headers, parsedRowsForSensitiveScan(parsed), [mapping.address, mapping.name, mapping.value, mapping.category, ...mapping.extra].filter((index): index is number => index != null));
    setFilePreview({
      ...filePreview,
      sheetName,
      headers: parsed.headers,
      scanRows: parsedRowsForSensitiveScan(parsed),
      mapping: parsed.mapping,
      publicExtraColumns: parsed.mapping.extra,
      rows: parsed.rows.slice(0, 5),
      totalRows: parsed.rows.length,
      skipped: parsed.skipped_empty_address,
      sensitiveHeaders: findings.map((finding) => finding.header),
      sensitiveFindings: findings,
      duplicateCandidateCount: parsed.duplicate_candidate_count,
      emptyRowCount: parsed.empty_row_count,
      valueStats: parsed.value_stats,
    });
  }

  function hasDraggedFiles(e: React.DragEvent<HTMLElement>) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  function onFileDrag(e: React.DragEvent<HTMLLabelElement>) {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsDraggingFile(true);
  }

  function onFileDragLeave(e: React.DragEvent<HTMLLabelElement>) {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  }

  function onFileDrop(e: React.DragEvent<HTMLLabelElement>) {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    void handleFileChange(e.dataTransfer.files?.[0]);
  }

  if (status.kind === "processing") {
    const percent = status.total > 0 ? Math.round((status.processed / status.total) * 100) : 0;
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">주소 변환 진행 중</p>
        <h2 className="mt-2 text-2xl font-semibold">업로드 작업을 처리하고 있습니다</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {status.processed.toLocaleString()} / {status.total.toLocaleString()}개 주소 처리 · 성공 {status.inserted.toLocaleString()}개 · 실패 {status.failed.toLocaleString()}개
        </p>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${Math.max(4, percent)}%` }} />
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          창을 닫지 않으면 작업이 계속 진행됩니다. 완료되면 공개 지도 링크와 관리 토큰이 표시됩니다.
        </p>
      </section>
    );
  }

  if (status.kind === "success") {
    const url = `/m/${status.slug}`;
    const manageUrl = `/manage/${status.slug}`;
    const hasStats = Object.keys(status.stats).length > 0;
    const publicColumnNames = getPublicColumnNames(status.preflight);
    const mapLinkTitle = visibility === "public" ? "공개 지도" : visibility === "unlisted" ? "링크 보유자 지도" : "비공개 지도 링크";
    const mapLinkDescription = visibility === "public" ? "공개 지도 링크는 외부에 공유해도 됩니다." : visibility === "unlisted" ? "사이트·검색에는 노출되지 않고 링크를 가진 사람만 볼 수 있습니다." : "비공개 범위에서는 공개 지도 화면에 접근할 수 없습니다.";

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
              setDescription("");
              setVisibility("private");
              setSourceName("");
              setSourceUrl("");
              setDataAsOf("");
              setOwnerDepartment("");
              setContact("");
              setLicense("");
              setRefreshCycle("");
              setNextReviewAt("");
              setSensitiveConfirmed(false);
              setSourceConfirmed(false);
              setAsOfConfirmed(false);
              setReviewConfirmed(false);
              setPublishing(false);
              clearSelectedFile();
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
            title={mapLinkTitle}
            description={mapLinkDescription}
            href={url}
            copied={copiedField === "public"}
            onCopy={() => handleCopy("public", `${window.location.origin}${url}`)}
          />
          <ResultLink
            title="관리 페이지"
            description="관리 페이지와 관리 토큰은 내부에만 보관하세요."
            href={manageUrl}
            copied={copiedField === "manage"}
            onCopy={() => handleCopy("manage", `${window.location.origin}${manageUrl}`)}
          />
        </div>

        <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-semibold">다음 단계</p>
          <ol className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-3 dark:text-zinc-300">
            <li className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
              <span className="font-semibold text-zinc-950 dark:text-zinc-100">1. {visibility === "public" ? "공개 지도 확인" : "발행 범위 확인"}</span>
              <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">지도와 표에 데이터가 맞게 보이는지 확인합니다.</p>
            </li>
            <li className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
              <span className="font-semibold text-zinc-950 dark:text-zinc-100">2. {visibility === "public" ? "공개 링크 공유" : "링크·권한 관리"}</span>
              <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{visibility === "public" ? "외부 사용자에게는 공개 지도 링크만 전달합니다." : "링크 보유자·비공개 범위를 필요한 사람에게만 안내합니다."}</p>
            </li>
            <li className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
              <span className="font-semibold text-zinc-950 dark:text-zinc-100">3. 관리 토큰 저장</span>
              <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">수정과 삭제에 필요하므로 내부 보관함에 저장합니다.</p>
            </li>
          </ol>
        </div>

        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">관리 토큰</p>
              <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200">
                이 토큰은 한 번만 표시됩니다. 관리 페이지와 함께 내부에만 보관하세요. 잃어버리면 지도를 수정하거나 삭제할 수 없습니다.
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

        {status.jobId !== "legacy" && (
          <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-950 dark:text-blue-100">발행 전 품질 검수</p>
                <p className="mt-1 text-xs leading-5 text-blue-900 dark:text-blue-200">
                  검수 필요 {status.qualityReviewCount.toLocaleString()}건 · 주소 변환 실패 {status.failed.toLocaleString()}건 · 제외 {status.excludedCount.toLocaleString()}건
                </p>
              </div>
              {!status.published && (
                <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-blue-950 dark:text-blue-100">
                  <input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} />
                  검수 결과를 확인했습니다
                </label>
              )}
            </div>
            <ReviewPanel jobId={status.jobId} jobToken={status.jobToken} onChanged={() => setReviewConfirmed(false)} />
          </div>
        )}

        {status.jobId !== "legacy" && (
          <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs leading-5 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">발행 전 확인 요약</p>
            <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              <p>공개 범위: {VISIBILITY_LABELS[visibility]}</p>
              <p>자료 기준일: {dataAsOf || "미입력"}</p>
              <p>자료 출처: {sourceName || "미입력"}</p>
              <p>관리 주체: {ownerDepartment || "미입력"}</p>
              <p className="sm:col-span-2">공개 열: {publicColumnNames.length > 0 ? publicColumnNames.join(", ") : "주소·기본 열만 사용"}</p>
            </div>
          </div>
        )}

        {status.jobId !== "legacy" && !status.published && (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
            <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">이제 지도를 발행하세요</p>
            <p className="mt-1 text-xs leading-5 text-emerald-900 dark:text-emerald-200">현재 공개 범위는 {VISIBILITY_LABELS[visibility]}입니다. 발행 버튼을 누르기 전 메타데이터와 검수 결과를 다시 확인하세요.</p>
            <button type="button" onClick={() => void publishCurrentMap()} disabled={publishing} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-200 dark:text-emerald-950">
              {publishing ? "발행 중..." : `${VISIBILITY_LABELS[visibility]} 범위로 발행`}
            </button>
          </div>
        )}

        {status.published && (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            <p className="font-semibold">발행 완료 · {VISIBILITY_LABELS[visibility]}</p>
            <p className="mt-1 text-xs leading-5">출처와 기준일을 포함한 메타데이터가 공개 지도에 표시됩니다.</p>
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
  const publicMetadataReady = visibility === "private" || Boolean(sourceName.trim() && dataAsOf && ownerDepartment.trim() && sourceConfirmed && asOfConfirmed && sensitiveConfirmed);
  const sensitiveReady = filePreview.kind !== "ready" || filePreview.sensitiveFindings.length === 0 || sensitiveConfirmed;
  const mappingReady = filePreview.kind !== "ready" || new Set([filePreview.mapping.address, filePreview.mapping.name, filePreview.mapping.value, filePreview.mapping.category].filter((index): index is number => index != null)).size === [filePreview.mapping.address, filePreview.mapping.name, filePreview.mapping.value, filePreview.mapping.category].filter((index): index is number => index != null).length;
  const canSubmit = !disabled && Boolean(title.trim()) && Boolean(selectedFileName) && filePreview.kind === "ready" && publicMetadataReady && sensitiveReady && mappingReady;

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
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="지도에 담긴 데이터의 기준일, 대상, 출처를 적어 주세요."
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
          </section>

          <section className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <div>
              <h2 className="text-base font-semibold">출처·기준일·공개 범위</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                비공개로 먼저 검수할 수 있습니다. 공개 또는 링크 공개로 발행하려면 출처, 기준일, 담당 주체를 입력하세요.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormTextInput id="source_name" label="자료 출처" value={sourceName} onChange={(value) => { setSourceName(value); setSourceConfirmed(false); }} placeholder="예: ○○시 복지정책과" />
              <FormTextInput id="source_url" label="출처 URL(선택)" type="url" value={sourceUrl} onChange={(value) => { setSourceUrl(value); setSourceConfirmed(false); }} placeholder="https://..." />
              <FormTextInput id="data_as_of" label="자료 기준일" type="date" value={dataAsOf} onChange={(value) => { setDataAsOf(value); setAsOfConfirmed(false); }} />
              <FormTextInput id="owner_department" label="담당 부서 또는 관리 주체" value={ownerDepartment} onChange={(value) => { setOwnerDepartment(value); setSourceConfirmed(false); }} placeholder="예: 지역경제과" />
              <FormTextInput id="contact" label="문의처(선택)" value={contact} onChange={setContact} placeholder="대표 전화 또는 이메일" />
              <FormTextInput id="license" label="이용조건(선택)" value={license} onChange={setLicense} placeholder="예: 공공누리 제1유형" />
              <FormTextInput id="refresh_cycle" label="갱신주기(선택)" value={refreshCycle} onChange={setRefreshCycle} placeholder="예: 분기별" />
              <FormTextInput id="next_review_at" label="다음 점검일(선택)" type="date" value={nextReviewAt} onChange={setNextReviewAt} />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="visibility">공개 범위</label>
              <select id="visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950">
                {(Object.keys(VISIBILITY_LABELS) as Visibility[]).map((value) => <option key={value} value={value}>{VISIBILITY_LABELS[value]}{value === "public" ? " — 사이트·검색에 표시" : value === "unlisted" ? " — 링크를 아는 사람만" : " — 관리 토큰으로만 관리"}</option>)}
              </select>
            </div>
            {visibility !== "private" && (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <p className="font-semibold">발행 전 확인</p>
                <label className="flex gap-2"><input type="checkbox" checked={sourceConfirmed} onChange={(event) => setSourceConfirmed(event.target.checked)} /> 출처가 실제 자료를 가리키는지 확인했습니다.</label>
                <label className="flex gap-2"><input type="checkbox" checked={asOfConfirmed} onChange={(event) => setAsOfConfirmed(event.target.checked)} /> 기준일과 마지막 갱신 시점을 확인했습니다.</label>
                <label className="flex gap-2"><input type="checkbox" checked={sensitiveConfirmed} onChange={(event) => setSensitiveConfirmed(event.target.checked)} /> 공개할 열에 개인정보·민감정보가 없음을 확인했습니다.</label>
              </div>
            )}
            {visibility === "private" && filePreview.kind === "ready" && filePreview.sensitiveFindings.length > 0 && (
              <label className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <input type="checkbox" checked={sensitiveConfirmed} onChange={(event) => setSensitiveConfirmed(event.target.checked)} />
                민감 가능 열을 공개 대상에서 제외했거나, 공개 가능한 조직 대표 정보인지 확인했습니다.
              </label>
            )}
          </section>

          <section className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <div>
              <h2 className="text-base font-semibold">엑셀 컬럼 표시 이름</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                주소만 있어도 업로드할 수 있습니다. 숫자값과 분류가 있으면 지도에서 비교와 필터가 쉬워집니다.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <LabelInput id="value_label" name="value_label" label="대표값 이름(선택)" placeholder="예: 지원한도" />
              <LabelInput id="value_unit" name="value_unit" label="대표값 단위(선택)" placeholder="예: 만원" />
              <LabelInput id="category_label" name="category_label" label="분류 표시 이름(선택)" placeholder="예: 업종" />
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
              <p>주소 역할로 연결한 열만 필수이고, 이름·대표값·분류는 선택입니다.</p>
              <p className="mt-1">대표값은 지원한도나 예산처럼 비교할 숫자가 있을 때 연결합니다.</p>
              <p className="mt-1">대표값 단위는 숫자 뒤에 붙는 표시입니다. 예: 만원, 건, 명</p>
              <p className="mt-1">분류는 사용처를 나누는 기준입니다. 예: 주유소, 충전소, 물류·운송</p>
            </div>
          </section>

          <section
            data-testid="excel-example-card"
            className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div>
              <h2 className="text-base font-semibold">엑셀 작성 예시</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                엑셀 한 줄이 지도 위치 1개가 됩니다.
              </p>
            </div>
            <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="min-w-[560px] text-left text-xs">
                <thead className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  <tr>
                    <th className="px-3 py-2 font-semibold">주소 열</th>
                    <th className="px-3 py-2 font-semibold">이름 열</th>
                    <th className="px-3 py-2 font-semibold">대표값 열</th>
                    <th className="px-3 py-2 font-semibold">분류 열</th>
                    <th className="px-3 py-2 font-semibold">공개 추가정보</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">서울 서초구 반포대로 58</td>
                    <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">예시 사용처</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">15</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">주유소</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">지역, 사용가능항목, 비고</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              이 행은 지도에서 예시복지관 위치 1개로 표시됩니다.
            </p>
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
              지도 제목과 파일을 입력하고 공개 범위에 맞는 확인을 마치면 지도를 생성할 수 있습니다.
            </p>
          )}
        </div>

        <aside className="space-y-5">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">파일 형식</p>
            <div className="mt-2 space-y-1 text-xs leading-5 text-blue-800 dark:text-blue-200">
              <p>한 행은 지도에 표시될 위치 1개입니다.</p>
              <p>여러 시트 중 사용할 시트를 선택할 수 있습니다.</p>
              <p>주소 역할로 연결한 열만 필수입니다.</p>
              <p>이름·대표값·분류는 표본을 보고 추천하지만 직접 바꿀 수 있습니다.</p>
              <p>추가정보 열은 공개할 항목만 개별 선택합니다.</p>
              <p>검수 전에는 원본 파일을 처리 목적으로만 사용합니다.</p>
            </div>
          </div>

          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">공개 전 확인</p>
            <p className="mt-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
              선택한 공개 열과 좌표 결과만 발행 시 지도에 표시됩니다.
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200">
              개인정보나 민감정보가 들어 있는 열은 공개 대상에서 제외하거나 원본에서 제거하세요.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor={fileInputId}>
              엑셀 파일 <span className="text-red-600">*</span>
            </label>
            <label
              data-testid="file-drop-zone"
              htmlFor={fileInputId}
              onDragEnter={onFileDrag}
              onDragOver={onFileDrag}
              onDragLeave={onFileDragLeave}
              onDrop={onFileDrop}
              className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition ${
                isDraggingFile
                  ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200 dark:border-blue-400 dark:bg-blue-950 dark:ring-blue-900"
                  : "border-zinc-300 bg-zinc-50 hover:border-blue-400 hover:bg-blue-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-blue-500 dark:hover:bg-blue-950"
              }`}
            >
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {isDraggingFile ? "여기에 놓으면 파일이 선택됩니다." : selectedFileName || "파일 선택 또는 드래그 앤 드롭"}
              </span>
              <span className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                클릭해서 고르거나 엑셀 파일을 이 영역에 끌어다 놓으세요. 최대 10,000행 / 3MB.
              </span>
              <span className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                XLSX, XLS, CSV를 지원합니다.
              </span>
            </label>
            <input
              ref={fileInputRef}
              id={fileInputId}
              name="file"
              type="file"
              accept=".xlsx,.xls,.csv"
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

          <FilePreviewPanel preview={filePreview} onChange={(next) => { setFilePreview(next); setSensitiveConfirmed(false); }} onSheetChange={(sheetName) => { setSensitiveConfirmed(false); void handleSheetChange(sheetName); }} />

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

type ReviewMarker = {
  id: string;
  row_index: number;
  address_raw: string;
  address_normalized: string | null;
  lat: number;
  lng: number;
  name: string | null;
  quality_status: "success" | "review" | "manual";
  quality_reason: string | null;
  included: boolean;
  manual_corrected: boolean;
};

type ReviewFailure = {
  id: string;
  row_index: number;
  address_raw: string;
  address_current: string | null;
  reason: string;
  included: boolean;
};

function findingsForMapping(preview: Extract<FilePreview, { kind: "ready" }>, mapping: ColumnMapping, extra: number[]) {
  const publicIndices = [mapping.address, mapping.name, mapping.value, mapping.category, ...extra].filter((index): index is number => index != null);
  return scanSensitiveData(preview.headers, preview.scanRows, publicIndices);
}

function updateMapping(preview: Extract<FilePreview, { kind: "ready" }>, role: keyof ColumnMapping, value: number | null): Extract<FilePreview, { kind: "ready" }> {
  const mapping = { ...preview.mapping, [role]: value } as ColumnMapping;
  const core = [mapping.address, mapping.name, mapping.value, mapping.category].filter((item): item is number => item != null);
  const extra = preview.publicExtraColumns.filter((item) => !core.includes(item));
  const nextMapping = { ...mapping, extra };
  const findings = findingsForMapping(preview, nextMapping, extra);
  return { ...preview, mapping: nextMapping, publicExtraColumns: extra, sensitiveHeaders: findings.map((finding) => finding.header), sensitiveFindings: findings };
}

function MappingSelect({ label, value, headers, required = false, onChange }: { label: string; value: number | null; headers: string[]; required?: boolean; onChange: (value: number | null) => void }) {
  return (
    <label className="space-y-1 text-xs font-medium">
      <span className="block">{label}</span>
      <select value={value == null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} required={required} className="w-full rounded border border-zinc-300 bg-white px-2.5 py-2 text-sm font-normal dark:border-zinc-700 dark:bg-zinc-950">
        {!required && <option value="">사용하지 않음</option>}
        {headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header || `열 ${index + 1}`}</option>)}
      </select>
    </label>
  );
}

function ReviewPanel({ jobId, jobToken, onChanged }: { jobId: string; jobToken: string; onChanged?: () => void }) {
  const [markers, setMarkers] = useState<ReviewMarker[]>([]);
  const [failures, setFailures] = useState<ReviewFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [addressDrafts, setAddressDrafts] = useState<Record<number, string>>({});
  const [coordinateDrafts, setCoordinateDrafts] = useState<Record<number, { lat: string; lng: string }>>({});

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/upload/jobs/${jobId}/review`, { headers: { "x-upload-job-token": jobToken } });
      const json = (await response.json()) as { ok?: boolean; markers?: ReviewMarker[]; failures?: ReviewFailure[]; error?: { message?: string } };
      if (!response.ok || !json.ok) {
        setMessage(json.error?.message ?? "검수 목록을 불러오지 못했습니다.");
        return;
      }
      setMarkers(json.markers ?? []);
      setFailures(json.failures ?? []);
    } catch {
      setMessage("검수 목록을 불러오는 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
    // The job id/token are the only external inputs for this one-shot refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, jobToken]);

  async function act(body: Record<string, unknown>) {
    try {
      const response = await fetch(`/api/upload/jobs/${jobId}/review`, { method: "POST", headers: { "Content-Type": "application/json", "x-upload-job-token": jobToken }, body: JSON.stringify(body) });
      const json = (await response.json()) as { ok?: boolean; error?: { message?: string }; message?: string };
      if (!response.ok || !json.ok) {
        setMessage(json.error?.message ?? "검수 변경을 저장하지 못했습니다.");
        return;
      }
      setMessage(json.message ?? "검수 변경을 저장했습니다.");
      onChanged?.();
      await load();
    } catch {
      setMessage("검수 변경 중 네트워크 오류가 발생했습니다.");
    }
  }

  async function downloadReviewCsv() {
    try {
      const response = await fetch(`/api/upload/jobs/${jobId}/failures`, { headers: { "x-upload-job-token": jobToken } });
      if (!response.ok) return setMessage("검수 CSV를 내려받지 못했습니다.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${jobId}-review.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage("검수 CSV를 내려받는 중 오류가 발생했습니다.");
    }
  }

  if (loading) return <p className="mt-3 text-xs text-blue-800 dark:text-blue-200">검수 목록을 불러오는 중입니다.</p>;
  if (message && markers.length === 0 && failures.length === 0) return <p className="mt-3 text-xs text-red-700 dark:text-red-300">{message}</p>;
  const reviewMarkers = markers.filter((marker) => marker.quality_status === "review");
  return (
    <div className="mt-4 space-y-3">
      {reviewMarkers.length === 0 && failures.length === 0 ? (
        <p className="text-xs text-blue-800 dark:text-blue-200">현재 확인이 필요한 위치가 없습니다.</p>
      ) : (
        <>
          {reviewMarkers.map((marker) => {
            const coords = coordinateDrafts[marker.row_index] ?? { lat: String(marker.lat), lng: String(marker.lng) };
            return (
              <div key={marker.id} className="rounded-lg border border-amber-200 bg-white p-3 text-xs dark:border-amber-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">{marker.row_index}행 · {marker.name || "이름 없음"}</p>
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">{marker.address_raw}</p>
                    <p className="mt-1 text-amber-700 dark:text-amber-300">{marker.quality_reason === "DUPLICATE_COORDINATE" ? "여러 행이 같은 좌표로 변환되었습니다." : "주소·좌표를 확인해 주세요."}</p>
                  </div>
                  <button type="button" onClick={() => void act({ action: marker.included ? "exclude" : "include", row_index: marker.row_index })} className="rounded border border-zinc-300 px-2.5 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900">{marker.included ? "발행에서 제외" : "발행에 포함"}</button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input value={addressDrafts[marker.row_index] ?? marker.address_raw} onChange={(event) => setAddressDrafts((current) => ({ ...current, [marker.row_index]: event.target.value }))} className="min-w-0 rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" aria-label={`${marker.row_index}행 주소 수정`} />
                  <button type="button" onClick={() => void act({ action: "address_update", row_index: marker.row_index, address: addressDrafts[marker.row_index] ?? marker.address_raw })} className="rounded bg-zinc-900 px-3 py-1.5 font-semibold text-white dark:bg-white dark:text-zinc-900">주소 재변환</button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input value={coords.lat} onChange={(event) => setCoordinateDrafts((current) => ({ ...current, [marker.row_index]: { ...coords, lat: event.target.value } }))} className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" aria-label={`${marker.row_index}행 위도`} />
                  <input value={coords.lng} onChange={(event) => setCoordinateDrafts((current) => ({ ...current, [marker.row_index]: { ...coords, lng: event.target.value } }))} className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" aria-label={`${marker.row_index}행 경도`} />
                  <button type="button" onClick={() => void act({ action: "coordinate_update", row_index: marker.row_index, lat: Number(coords.lat), lng: Number(coords.lng) })} className="rounded border border-blue-300 px-3 py-1.5 font-semibold text-blue-800 dark:border-blue-700 dark:text-blue-200">좌표 저장</button>
                </div>
              </div>
            );
          })}
          {failures.map((failure) => (
            <div key={failure.id} className="rounded-lg border border-red-200 bg-white p-3 text-xs dark:border-red-900 dark:bg-zinc-950">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-red-900 dark:text-red-100">{failure.row_index}행 · 주소 변환 실패</p>
                  <p className="mt-1 text-red-800 dark:text-red-200">{failure.address_current || failure.address_raw}</p>
                  <p className="mt-1 text-red-700 dark:text-red-300">{failure.reason}</p>
                </div>
                <button type="button" onClick={() => void act({ action: "exclude", row_index: failure.row_index })} className="rounded border border-red-300 px-2.5 py-1.5 font-semibold text-red-800 dark:border-red-800 dark:text-red-200">제외 확인</button>
              </div>
              <div className="mt-3 flex gap-2">
                <input value={addressDrafts[failure.row_index] ?? failure.address_current ?? failure.address_raw} onChange={(event) => setAddressDrafts((current) => ({ ...current, [failure.row_index]: event.target.value }))} className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" aria-label={`${failure.row_index}행 실패 주소 수정`} />
                <button type="button" onClick={() => void act({ action: "address_update", row_index: failure.row_index, address: addressDrafts[failure.row_index] ?? failure.address_current ?? failure.address_raw })} className="rounded bg-zinc-900 px-3 py-1.5 font-semibold text-white dark:bg-white dark:text-zinc-900">재변환</button>
              </div>
            </div>
          ))}
        </>
      )}
      {message && <p className="text-xs text-blue-800 dark:text-blue-200">{message}</p>}
      {(reviewMarkers.length > 0 || failures.length > 0) && <button type="button" onClick={() => void downloadReviewCsv()} className="text-xs font-semibold text-blue-800 underline dark:text-blue-200">검수 필요·제외 행 CSV 내려받기</button>}
    </div>
  );
}

function FilePreviewPanel({ preview, onChange, onSheetChange }: { preview: FilePreview; onChange: (next: FilePreview) => void; onSheetChange: (sheetName: string) => void }) {
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
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium">
          <span className="block">사용할 시트</span>
          <select value={preview.sheetName} onChange={(event) => onSheetChange(event.target.value)} className="w-full rounded border border-zinc-300 bg-white px-2.5 py-2 text-sm font-normal dark:border-zinc-700 dark:bg-zinc-900">
            {preview.sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name} · {sheet.dataRowCount.toLocaleString()}행</option>)}
          </select>
        </label>
        <div className="rounded border border-zinc-200 bg-white px-3 py-2 text-xs leading-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p>빈 행 {preview.emptyRowCount.toLocaleString()}개 · 중복 가능 행 {preview.duplicateCandidateCount.toLocaleString()}개</p>
          <p>대표값 변환 성공 {preview.valueStats.converted.toLocaleString()}개 / 실패 {preview.valueStats.failed.toLocaleString()}개</p>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-blue-200 bg-white p-3 dark:border-blue-900 dark:bg-zinc-900">
        <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">열 연결 마법사</p>
        <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">표본과 헤더로 추천했지만, 실제 공개할 역할을 직접 확인하세요. 주소 열만 필수입니다.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <MappingSelect label="주소 · 필수" value={preview.mapping.address} headers={preview.headers} required onChange={(value) => onChange(updateMapping(preview, "address", value))} />
          <MappingSelect label="이름 · 선택" value={preview.mapping.name} headers={preview.headers} onChange={(value) => onChange(updateMapping(preview, "name", value))} />
          <MappingSelect label="대표값 · 숫자 선택" value={preview.mapping.value} headers={preview.headers} onChange={(value) => onChange(updateMapping(preview, "value", value))} />
          <MappingSelect label="분류 · 선택" value={preview.mapping.category} headers={preview.headers} onChange={(value) => onChange(updateMapping(preview, "category", value))} />
        </div>
        {new Set([preview.mapping.address, preview.mapping.name, preview.mapping.value, preview.mapping.category].filter((index): index is number => index != null)).size !== [preview.mapping.address, preview.mapping.name, preview.mapping.value, preview.mapping.category].filter((index): index is number => index != null).length && (
          <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">핵심 역할은 서로 다른 열에 연결해야 합니다.</p>
        )}
        <div className="mt-3">
          <p className="text-xs font-medium">공개 추가정보 열</p>
          <div className="mt-2 grid max-h-32 gap-2 overflow-y-auto sm:grid-cols-2">
            {preview.headers.map((header, index) => {
              const core = [preview.mapping.address, preview.mapping.name, preview.mapping.value, preview.mapping.category];
              if (core.includes(index)) return null;
              const checked = preview.publicExtraColumns.includes(index);
              return <label key={`${header}-${index}`} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={checked} onChange={() => {
                const extra = checked ? preview.publicExtraColumns.filter((item) => item !== index) : [...preview.publicExtraColumns, index];
                const mapping = { ...preview.mapping, extra };
                const findings = findingsForMapping(preview, mapping, extra);
                onChange({ ...preview, publicExtraColumns: extra, mapping, sensitiveHeaders: findings.map((finding) => finding.header), sensitiveFindings: findings });
              }} /> {header || `열 ${index + 1}`}</label>;
            })}
          </div>
        </div>
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

function FormTextInput({ id, label, value, onChange, placeholder, type = "text" }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="block font-medium">{label}</span>
      <input id={id} name={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
    </label>
  );
}

function getPublicColumnNames(preflight: Record<string, unknown>): string[] {
  const headers = Array.isArray(preflight.headers) ? preflight.headers.filter((value): value is string => typeof value === "string") : [];
  const mapping = preflight.mapping && typeof preflight.mapping === "object" ? preflight.mapping as { address?: unknown; name?: unknown; value?: unknown; category?: unknown; extra?: unknown } : {};
  const indices = [mapping.address, mapping.name, mapping.value, mapping.category, ...(Array.isArray(mapping.extra) ? mapping.extra : [])].filter((value): value is number => Number.isInteger(value));
  return Array.from(new Set(indices)).map((index) => headers[index]).filter((header): header is string => Boolean(header));
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
