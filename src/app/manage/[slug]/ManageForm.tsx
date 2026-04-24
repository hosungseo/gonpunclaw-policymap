"use client";

import Link from "next/link";
import { useState } from "react";

export type ManagedMap = {
  title: string;
  description: string;
  value_label: string;
  value_unit: string;
  category_label: string;
  is_listed: boolean;
};

type EditStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "saved" };

type DeleteStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "success" };

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 500;
const LABEL_MAX = 40;

export function ManageForm({ slug, initial }: { slug: string; initial: ManagedMap | null }) {
  const [token, setToken] = useState("");

  if (!initial) {
    return (
      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">지도를 찾을 수 없습니다</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          이미 삭제되었거나 잘못된 슬러그일 수 있습니다.
        </p>
        <Link href="/upload" className="text-sm text-blue-700 underline">새 지도 만들기</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="admin_token">
          관리 토큰
        </label>
        <input
          id="admin_token"
          name="admin_token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          수정과 삭제 모두 같은 관리 토큰을 사용합니다.
        </p>
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          관리 토큰은 지도 소유자만 보관하세요. 외부에는 공개 지도 링크만 공유하면 됩니다.
        </p>
      </div>

      <EditSection slug={slug} initial={initial} token={token} />
      <DeleteSection slug={slug} title={initial.title} token={token} />
    </div>
  );
}

function EditSection({ slug, initial, token }: { slug: string; initial: ManagedMap; token: string }) {
  const [values, setValues] = useState<ManagedMap>(initial);
  const [status, setStatus] = useState<EditStatus>({ kind: "idle" });

  function update<K extends keyof ManagedMap>(key: K, value: ManagedMap[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (status.kind === "saved" || status.kind === "error") setStatus({ kind: "idle" });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token.trim()) {
      setStatus({ kind: "error", message: "관리 토큰을 입력해 주세요." });
      return;
    }
    const title = values.title.trim();
    if (!title) {
      setStatus({ kind: "error", message: "제목을 입력해 주세요." });
      return;
    }

    setStatus({ kind: "submitting" });
    let res: Response;
    try {
      res = await fetch(`/api/maps/${slug}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_token: token,
          title,
          description: values.description.trim(),
          value_label: values.value_label.trim() || null,
          value_unit: values.value_unit.trim() || null,
          category_label: values.category_label.trim() || null,
          is_listed: values.is_listed,
        }),
      });
    } catch {
      setStatus({ kind: "error", message: "네트워크 오류가 발생했습니다." });
      return;
    }

    const json = (await res.json().catch(() => null)) as
      | { ok: true; map: ManagedMap & { slug: string } }
      | { ok: false; error?: { message?: string } }
      | null;

    if (!res.ok || !json?.ok) {
      const message = json && json.ok === false ? json.error?.message ?? "수정에 실패했습니다." : "수정에 실패했습니다.";
      setStatus({ kind: "error", message });
      return;
    }

    setValues({
      title: json.map.title,
      description: json.map.description ?? "",
      value_label: json.map.value_label ?? "",
      value_unit: json.map.value_unit ?? "",
      category_label: json.map.category_label ?? "",
      is_listed: json.map.is_listed,
    });
    setStatus({ kind: "saved" });
  }

  const submitting = status.kind === "submitting";

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">지도 정보 수정</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          제목과 설명, 컬럼 라벨, 공개 여부를 수정할 수 있습니다. 슬러그와 마커 데이터는 변경되지 않습니다.
        </p>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="title">
          지도 제목 <span className="text-red-600">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={values.title}
          onChange={(e) => update("title", e.target.value)}
          required
          maxLength={TITLE_MAX}
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="description">
          설명
        </label>
        <textarea
          id="description"
          rows={2}
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          maxLength={DESCRIPTION_MAX}
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="value_label">값 컬럼 라벨</label>
          <input
            id="value_label"
            type="text"
            value={values.value_label}
            onChange={(e) => update("value_label", e.target.value)}
            maxLength={LABEL_MAX}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="value_unit">단위</label>
          <input
            id="value_unit"
            type="text"
            value={values.value_unit}
            onChange={(e) => update("value_unit", e.target.value)}
            maxLength={LABEL_MAX}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="category_label">분류 컬럼 라벨</label>
          <input
            id="category_label"
            type="text"
            value={values.category_label}
            onChange={(e) => update("category_label", e.target.value)}
            maxLength={LABEL_MAX}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.is_listed}
          onChange={(e) => update("is_listed", e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-zinc-800 dark:text-zinc-200">공개 (체크 해제 시 공개 지도 접근이 차단됩니다)</span>
      </label>
      <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
        비공개로 전환하면 공개 링크 접속만 막고 데이터는 보관됩니다. 다시 공개로 바꾸면 같은 링크를 사용할 수 있습니다.
      </p>

      {status.kind === "error" && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {status.message}
        </p>
      )}
      {status.kind === "saved" && (
        <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          변경 사항이 저장되었습니다.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {submitting ? "저장 중..." : "변경 저장"}
        </button>
        <Link href={`/m/${slug}`} className="inline-flex items-center justify-center rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
          공개 지도 보기
        </Link>
      </div>
    </form>
  );
}

function DeleteSection({ slug, title, token }: { slug: string; title: string; token: string }) {
  const [confirmText, setConfirmText] = useState("");
  const [status, setStatus] = useState<DeleteStatus>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token.trim()) {
      setStatus({ kind: "error", message: "관리 토큰을 입력해 주세요." });
      return;
    }
    if (confirmText !== slug) {
      setStatus({ kind: "error", message: `삭제 확인용으로 슬러그 '${slug}'를 정확히 입력해 주세요.` });
      return;
    }

    setStatus({ kind: "submitting" });
    let res: Response;
    try {
      res = await fetch(`/api/maps/${slug}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_token: token }),
      });
    } catch {
      setStatus({ kind: "error", message: "네트워크 오류가 발생했습니다." });
      return;
    }

    const json = (await res.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; error?: { message?: string } }
      | null;

    if (!res.ok || !json?.ok) {
      setStatus({ kind: "error", message: json?.ok === false ? json.error?.message ?? "삭제에 실패했습니다." : "삭제에 실패했습니다." });
      return;
    }

    setStatus({ kind: "success" });
  }

  if (status.kind === "success") {
    return (
      <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950">
        <h2 className="text-xl font-semibold text-emerald-900 dark:text-emerald-100">지도를 삭제했습니다</h2>
        <p className="text-sm text-emerald-800 dark:text-emerald-200">
          공개 주소와 마커 데이터가 제거되었습니다. 같은 슬러그는 다시 사용할 수 없습니다.
        </p>
        <Link href="/upload" className="text-sm text-emerald-900 underline dark:text-emerald-100">
          새 지도 만들기
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-lg border border-red-200 bg-white p-6 dark:border-red-900/60 dark:bg-zinc-950">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">지도 삭제</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{title}</span> 지도를 삭제합니다. 삭제 후 복구할 수 없습니다.
        </p>
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          영구 삭제는 공개 링크, 마커 데이터, 관리 페이지를 복구할 수 없게 제거합니다. 삭제 대신 임시로 숨기려면 공개 체크를 해제하세요.
        </p>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="confirm_text">
          삭제 확인 문구
        </label>
        <input
          id="confirm_text"
          name="confirm_text"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={slug}
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          실수 방지를 위해 <code className="font-mono">{slug}</code> 를 그대로 입력해 주세요.
        </p>
      </div>

      {status.kind === "error" && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {status.message}
        </p>
      )}

      <button
        type="submit"
        disabled={status.kind === "submitting"}
        className="inline-flex items-center justify-center rounded bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {status.kind === "submitting" ? "삭제 중..." : "영구 삭제"}
      </button>
    </form>
  );
}
