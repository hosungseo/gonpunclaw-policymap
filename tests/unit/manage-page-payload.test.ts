import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockLoadSummary = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: (table: string) => ({
      select: (cols: string) => ({ eq: (key: string, value: unknown) => ({ maybeSingle: () => mockSelect({ table, cols, key, value }) }) }),
    }),
  }),
}));
vi.mock("@/lib/reviews/service", () => ({ loadReviewSummary: (...a: unknown[]) => mockLoadSummary(...a) }));

const row = {
  id: "m1",
  title: "테스트 지도",
  description: null,
  value_label: null,
  value_unit: null,
  category_label: null,
  is_listed: true,
  visibility: "public",
  source_name: "원래 출처",
  source_url: null,
  data_as_of: "2026-01-01",
  owner_department: "지역경제과",
  contact: null,
  license: null,
  refresh_cycle: null,
  next_review_at: null,
  last_data_update_at: null,
  directory_hidden: true,
  // Even if the row carried the reason, the page must not forward it.
  directory_hidden_reason: "신고 확인",
};

describe("manage page SSR payload", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockLoadSummary.mockReset();
  });

  it("does not select the hide reason and ships only the review summary", async () => {
    mockSelect.mockResolvedValue({ data: row, error: null });
    mockLoadSummary.mockResolvedValue({ required: true, hasToken: true, status: "rejected", currentVersionNumber: 2 });
    const { loadMap } = await import("@/app/manage/[slug]/page");
    const map = await loadMap("abc123");

    const { cols } = mockSelect.mock.calls[0][0];
    expect(cols).toContain("directory_hidden");
    expect(cols).not.toContain("directory_hidden_reason");
    expect(mockLoadSummary).toHaveBeenCalledWith("m1");

    expect(map?.directory).toEqual({ hidden: true });
    expect(map?.review).toEqual({ required: true, hasToken: true, status: "rejected", currentVersionNumber: 2 });
    const serialized = JSON.stringify(map);
    for (const leak of ["reason", "comment", "reviewer_label", "request_note", "latest", "approvedVersionNumber", "신고 확인"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("returns null for an unknown slug without loading review state", async () => {
    mockSelect.mockResolvedValue({ data: null, error: null });
    const { loadMap } = await import("@/app/manage/[slug]/page");
    expect(await loadMap("nope")).toBeNull();
    expect(mockLoadSummary).not.toHaveBeenCalled();
  });
});
