import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatKoreanDate } from "@/lib/maps/metadata";

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
const mockMarkersQuery = vi.fn();
const mockVersionsFrom = vi.fn();
const mockVersionMaybeSingle = vi.fn();
const mockReviewMaybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      if (table === "maps") return { select: () => ({ eq: () => ({ maybeSingle: mockMapMaybeSingle }) }) };
      if (table === "markers") return { select: () => ({ eq: mockMarkersQuery }) };
      if (table === "geocode_failures") return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: "f1" }], error: null }) }) };
      if (table === "map_versions") {
        mockVersionsFrom();
        return { select: () => ({ eq: () => ({ maybeSingle: mockVersionMaybeSingle }) }) };
      }
      if (table === "map_reviews") return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: mockReviewMaybeSingle }) }) }) }) }) }) };
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

// The loader is wrapped in React `cache`; use a fresh slug per call so memoization never crosses tests.
let counter = 0;
const nextSlug = () => `slug-${++counter}`;

describe("loadPublicMapRecord / toMapClientProps", () => {
  beforeEach(() => {
    mockMapMaybeSingle.mockReset();
    mockMarkersQuery.mockReset().mockResolvedValue({ data: markerRows, error: null });
    mockVersionsFrom.mockReset();
    mockVersionMaybeSingle.mockReset().mockResolvedValue({ data: { version_number: 3 }, error: null });
    mockReviewMaybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
  });

  it("returns null for private maps unless allowPrivate", async () => {
    const { loadPublicMapRecord } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: { ...mapRow, visibility: "private" }, error: null });
    expect(await loadPublicMapRecord(nextSlug())).toBeNull();
    expect(await loadPublicMapRecord(nextSlug(), true)).not.toBeNull();
  });

  it("lets unlisted maps through the public gate", async () => {
    const { loadPublicMapRecord, toMapClientProps } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: { ...mapRow, visibility: "unlisted" }, error: null });
    const record = await loadPublicMapRecord(nextSlug());
    expect(record).not.toBeNull();
    expect(toMapClientProps(record!).visibility).toBe("unlisted");
  });

  it("returns null when the map row is missing", async () => {
    const { loadPublicMapRecord } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadPublicMapRecord(nextSlug())).toBeNull();
  });

  it("throws when the maps query fails instead of pretending the map does not exist", async () => {
    const { loadPublicMapRecord } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: null, error: { message: "column maps.review_required does not exist" } });
    await expect(loadPublicMapRecord(nextSlug())).rejects.toThrow("review_required");
  });

  it("throws when the markers query fails", async () => {
    const { loadPublicMapRecord } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: mapRow, error: null });
    mockMarkersQuery.mockResolvedValue({ data: null, error: { message: "markers down" } });
    await expect(loadPublicMapRecord(nextSlug())).rejects.toThrow("markers down");
  });

  it("maps rows into MapClient props with only included markers and a quality summary", async () => {
    const { loadPublicMapRecord, toMapClientProps } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: mapRow, error: null });
    const record = (await loadPublicMapRecord(nextSlug()))!;
    expect(record.versionNumber).toBe(3);
    const props = toMapClientProps(record);
    expect(props.markers.map((m) => m.id)).toEqual(["m1"]);
    expect(props.qualitySummary).toEqual({ total: 2, review: 1, excluded: 1, failed: 1 });
    expect(props.reviewBadge).toBeNull();
    expect(props.lastDataUpdateLabel).toBeNull();
  });

  it("skips the version lookup when there is no current version", async () => {
    const { loadPublicMapRecord } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: { ...mapRow, current_version_id: null }, error: null });
    const record = (await loadPublicMapRecord(nextSlug()))!;
    expect(record.versionNumber).toBeNull();
    expect(mockVersionsFrom).not.toHaveBeenCalled();
  });

  it("normalizes a null extra column to an empty object", async () => {
    const { loadPublicMapRecord, toMapClientProps } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: mapRow, error: null });
    mockMarkersQuery.mockResolvedValue({ data: [{ ...markerRows[0], extra: null }], error: null });
    const props = toMapClientProps((await loadPublicMapRecord(nextSlug()))!);
    expect(props.markers[0].extra).toEqual({});
  });

  it("formats the last data update on the server", async () => {
    const { loadPublicMapRecord, toMapClientProps } = await import("@/lib/maps/load-public-map");
    const iso = "2026-03-15T20:00:00Z";
    mockMapMaybeSingle.mockResolvedValue({ data: { ...mapRow, last_data_update_at: iso }, error: null });
    const props = toMapClientProps((await loadPublicMapRecord(nextSlug()))!);
    expect(props.lastDataUpdateAt).toBe(iso);
    expect(props.lastDataUpdateLabel).toBe(formatKoreanDate(iso));
    // Asia/Seoul is UTC+9, so 20:00Z already belongs to the next day.
    expect(props.lastDataUpdateLabel).toContain("16");
  });

  it("exposes an approved review badge when approved version matches current", async () => {
    const { loadPublicMapRecord, toMapClientProps } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: { ...mapRow, review_required: true, approved_version_id: "v-1" }, error: null });
    mockReviewMaybeSingle.mockResolvedValue({ data: { decided_at: "2026-02-01T00:00:00Z" }, error: null });
    const props = toMapClientProps((await loadPublicMapRecord(nextSlug()))!);
    expect(props.reviewBadge).toEqual({ status: "approved", versionNumber: 3, decidedAtLabel: formatKoreanDate("2026-02-01T00:00:00Z") });
    expect(props.reviewBadge?.decidedAtLabel).toBeTruthy();
  });

  it("exposes a pending badge when review is required but not approved for the current version", async () => {
    const { loadPublicMapRecord, toMapClientProps } = await import("@/lib/maps/load-public-map");
    mockMapMaybeSingle.mockResolvedValue({ data: { ...mapRow, review_required: true, approved_version_id: "v-0" }, error: null });
    const props = toMapClientProps((await loadPublicMapRecord(nextSlug()))!);
    expect(props.reviewBadge).toEqual({ status: "pending", versionNumber: 3, decidedAtLabel: null });
  });
});
