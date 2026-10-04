import { supabaseServer } from "@/lib/supabase/server";

export const DIRECTORY_PAGE_SIZE = 24;
const QUERY_MAX = 80;

export interface DirectoryEntry {
  slug: string;
  title: string;
  description: string;
  source_name: string | null;
  owner_department: string | null;
  data_as_of: string | null;
  published_at: string | null;
  last_data_update_at: string | null;
  marker_count: number;
  reviewed: boolean;
}

export interface DirectoryPage {
  entries: DirectoryEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type ViewRow = Omit<DirectoryEntry, "reviewed" | "marker_count" | "description"> & {
  description: string | null;
  review_required: boolean | null;
  current_version_id: string | null;
  approved_version_id: string | null;
  marker_count: number | string | null;
};

/** PostgREST error code for a `range` that starts past the last row. */
const RANGE_NOT_SATISFIABLE = "PGRST103";

/** Strip characters that would break the PostgREST `or(... ilike ...)` filter syntax or act as wildcards. */
export function sanitizeDirectoryQuery(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/[,()%_\\"*]/g, "").trim().slice(0, QUERY_MAX);
}

export function directoryPageBounds(pageInput: number): { page: number; from: number; to: number } {
  const page = Number.isFinite(pageInput) && pageInput >= 1 ? Math.floor(pageInput) : 1;
  const from = (page - 1) * DIRECTORY_PAGE_SIZE;
  return { page, from, to: from + DIRECTORY_PAGE_SIZE - 1 };
}

export async function queryDirectory({ q, page }: { q: string; page: number }): Promise<DirectoryPage> {
  const search = sanitizeDirectoryQuery(q);
  const bounds = directoryPageBounds(page);
  const base = supabaseServer()
    .from("public_directory_maps")
    .select("slug, title, description, source_name, owner_department, data_as_of, published_at, last_data_update_at, review_required, current_version_id, approved_version_id, marker_count", { count: "exact" });
  const query = search
    ? base.or(`title.ilike.%${search}%,description.ilike.%${search}%,owner_department.ilike.%${search}%`)
    : base;
  const { data, count, error } = await query
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .range(bounds.from, bounds.to);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
  if (error) {
    // Paging past the end is a normal client request, not an outage: answer with an empty page.
    if (error.code === RANGE_NOT_SATISFIABLE) {
      return { entries: [], total, page: bounds.page, pageSize: DIRECTORY_PAGE_SIZE, totalPages };
    }
    throw new Error(error.message);
  }
  return {
    entries: ((data ?? []) as ViewRow[]).map((row) => ({
      slug: row.slug,
      title: row.title,
      description: row.description ?? "",
      source_name: row.source_name,
      owner_department: row.owner_department,
      data_as_of: row.data_as_of,
      published_at: row.published_at,
      last_data_update_at: row.last_data_update_at,
      marker_count: Number(row.marker_count ?? 0),
      // Reviewed only when the approved version is the live version (mirrors reviewStatus === "approved").
      reviewed: Boolean(row.review_required && row.approved_version_id && row.approved_version_id === row.current_version_id),
    })),
    total,
    page: bounds.page,
    pageSize: DIRECTORY_PAGE_SIZE,
    totalPages,
  };
}
