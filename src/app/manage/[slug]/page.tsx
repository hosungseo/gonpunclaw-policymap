import { supabaseServer } from "@/lib/supabase/server";
import { ManageForm, type ManagedMap } from "./ManageForm";

export const dynamic = "force-dynamic";

async function loadMap(slug: string): Promise<ManagedMap | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("maps")
    .select("title, description, value_label, value_unit, category_label, is_listed")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  return {
    title: data.title,
    description: data.description ?? "",
    value_label: data.value_label ?? "",
    value_unit: data.value_unit ?? "",
    category_label: data.category_label ?? "",
    is_listed: data.is_listed,
  };
}

export default async function ManagePage(props: PageProps<"/manage/[slug]">) {
  const { slug } = await props.params;
  const map = await loadMap(slug);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Manage PolicyMap</p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              지도 수정 및 삭제
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              업로드 시 받은 관리 토큰이 있어야 수정하거나 삭제할 수 있습니다.
            </p>
          </div>
          <ManageForm slug={slug} initial={map} />
        </div>
      </main>
    </div>
  );
}
