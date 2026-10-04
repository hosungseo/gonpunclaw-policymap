import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRange = vi.fn();
const chain = {
  select: vi.fn(() => chain),
  or: vi.fn(() => chain),
  order: vi.fn(() => chain),
  range: (...args: unknown[]) => mockRange(...args),
};
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: () => ({ from: () => chain }) }));

describe("directory query helpers", () => {
  beforeEach(() => {
    chain.select.mockClear();
    chain.or.mockClear();
    chain.order.mockClear();
    mockRange.mockReset();
  });

  it("sanitizes search input", async () => {
    const { sanitizeDirectoryQuery } = await import("@/lib/directory/query");
    expect(sanitizeDirectoryQuery("  복지,(시설)%_  ")).toBe("복지시설");
    expect(sanitizeDirectoryQuery('도서"관*')).toBe("도서관");
    expect(sanitizeDirectoryQuery("a".repeat(100))).toHaveLength(80);
    expect(sanitizeDirectoryQuery(undefined)).toBe("");
  });

  it("computes page bounds and clamps the page", async () => {
    const { directoryPageBounds, DIRECTORY_PAGE_SIZE } = await import("@/lib/directory/query");
    expect(directoryPageBounds(1)).toEqual({ page: 1, from: 0, to: DIRECTORY_PAGE_SIZE - 1 });
    expect(directoryPageBounds(3)).toEqual({ page: 3, from: 48, to: 71 });
    expect(directoryPageBounds(0).page).toBe(1);
    expect(directoryPageBounds(Number.NaN).page).toBe(1);
  });

  it("queries the view with search, ordering and range, and derives reviewed", async () => {
    mockRange.mockResolvedValue({
      data: [
        { slug: "a", title: "A", description: "", source_name: "S", owner_department: "O", data_as_of: "2026-01-01", published_at: "2026-01-02", last_data_update_at: null, review_required: true, current_version_id: "v1", approved_version_id: "v1", marker_count: 12 },
        { slug: "b", title: "B", description: "", source_name: null, owner_department: null, data_as_of: null, published_at: null, last_data_update_at: null, review_required: true, current_version_id: "v2", approved_version_id: "v1", marker_count: 0 },
      ],
      count: 30,
      error: null,
    });
    const { queryDirectory } = await import("@/lib/directory/query");
    const result = await queryDirectory({ q: "복지", page: 2 });
    expect(chain.or).toHaveBeenCalledWith("title.ilike.%복지%,description.ilike.%복지%,owner_department.ilike.%복지%");
    expect(mockRange).toHaveBeenCalledWith(24, 47);
    expect(result.total).toBe(30);
    expect(result.totalPages).toBe(2);
    expect(result.entries[0]).toMatchObject({ slug: "a", marker_count: 12, reviewed: true });
    expect(result.entries[1].reviewed).toBe(false);
  });

  it("skips the search clause when q is empty", async () => {
    mockRange.mockResolvedValue({ data: [], count: 0, error: null });
    const { queryDirectory } = await import("@/lib/directory/query");
    await queryDirectory({ q: "", page: 1 });
    expect(chain.or).not.toHaveBeenCalled();
  });

  it("skips the search clause when q consists only of stripped characters", async () => {
    mockRange.mockResolvedValue({ data: [], count: 0, error: null });
    const { queryDirectory } = await import("@/lib/directory/query");
    await queryDirectory({ q: '%%%"*', page: 1 });
    expect(chain.or).not.toHaveBeenCalled();
  });

  it("returns an empty page instead of throwing when the page is past the end", async () => {
    mockRange.mockResolvedValue({ data: null, count: 30, error: { code: "PGRST103", message: "Requested range not satisfiable" } });
    const { queryDirectory } = await import("@/lib/directory/query");
    const result = await queryDirectory({ q: "", page: 9 });
    expect(result).toEqual({ entries: [], total: 30, page: 9, pageSize: 24, totalPages: 2 });
  });

  it("throws on other query errors", async () => {
    mockRange.mockResolvedValue({ data: null, count: null, error: { code: "42P01", message: "relation does not exist" } });
    const { queryDirectory } = await import("@/lib/directory/query");
    await expect(queryDirectory({ q: "", page: 1 })).rejects.toThrow("relation does not exist");
  });
});
