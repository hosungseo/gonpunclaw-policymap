import { beforeEach, describe, expect, it, vi } from "vitest";

const mapRow = {
  id: "map-1", slug: "abc123", title: "T", description: "D", value_label: null, value_unit: null, category_label: null,
  is_listed: true, visibility: "public", source_name: "S", source_url: null, data_as_of: "2026-01-01", owner_department: "O",
  contact: null, license: null, refresh_cycle: null, next_review_at: null, published_at: "2026-01-02T00:00:00Z",
  last_data_update_at: null, updated_at: "2026-01-03T00:00:00Z", review_required: false, approved_version_id: null,
  current_version_id: "v-1", directory_hidden: false,
};
const markerRows = [
  { id: "m1", lat: 1, lng: 2, name: "A", value: 3, category: "c", address_normalized: "addr", extra: { x: 1 }, quality_status: "success", included: true },
  { id: "m2", lat: 1, lng: 2, name: "B", value: null, category: null, address_normalized: null, extra: {}, quality_status: "review", included: false },
];

const mockMapMaybeSingle = vi.fn();
const mockVersionMaybeSingle = vi.fn();
const mockReviewMaybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      if (table === "maps") return { select: () => ({ eq: () => ({ maybeSingle: mockMapMaybeSingle }) }) };
      if (table === "markers") return { select: () => ({ eq: () => Promise.resolve({ data: markerRows }) }) };
      if (table === "geocode_failures") return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: "f1" }] }) }) };
      if (table === "map_versions") return { select: () => ({ eq: () => ({ maybeSingle: mockVersionMaybeSingle }) }) };
      if (table === "map_reviews") return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: mockReviewMaybeSingle }) }) }) }) }) }) };
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

describe("loadPublicMapRecord / toMapClientProps", () => {
  beforeEach(() => {
    mockMapMaybeSingle.mockReset();
    mockVersionMaybeSingle.mockReset().mockResolvedValue({ data: { version_number: 3 } });
    mockReviewMaybeSingle.mockReset().mockResolvedValue({ data: null });
  });

  it("returns null for private maps unless allowPrivate", async () => {
    const { loadPublicMapRecord } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: { ...mapRow, visibility: "private" } });
    expect(await loadPublicMapRecord("abc123")).toBeNull();
    expect(await loadPublicMapRecord("abc123", { allowPrivate: true })).not.toBeNull();
  });

  it("maps rows into MapClient props with only included markers and a quality summary", async () => {
    const { loadPublicMapRecord, toMapClientProps } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: mapRow });
    const record = (await loadPublicMapRecord("abc123"))!;
    expect(record.versionNumber).toBe(3);
    const props = toMapClientProps(record);
    expect(props.markers.map((m) => m.id)).toEqual(["m1"]);
    expect(props.qualitySummary).toEqual({ total: 2, review: 1, excluded: 1, failed: 1 });
    expect(props.reviewBadge).toBeNull();
  });

  it("exposes an approved review badge when approved version matches current", async () => {
    const { loadPublicMapRecord, toMapClientProps } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: { ...mapRow, review_required: true, approved_version_id: "v-1" } });
    mockReviewMaybeSingle.mockResolvedValue({ data: { decided_at: "2026-02-01T00:00:00Z" } });
    const props = toMapClientProps((await loadPublicMapRecord("abc123"))!);
    expect(props.reviewBadge).toEqual({ status: "approved", versionNumber: 3, decidedAt: "2026-02-01T00:00:00Z" });
  });

  it("exposes a pending badge when review is required but not approved for the current version", async () => {
    const { loadPublicMapRecord, toMapClientProps } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: { ...mapRow, review_required: true, approved_version_id: "v-0" } });
    const props = toMapClientProps((await loadPublicMapRecord("abc123"))!);
    expect(props.reviewBadge?.status).toBe("pending");
  });
});
