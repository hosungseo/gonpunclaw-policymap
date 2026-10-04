import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerify = vi.fn();
const mockVersionSingle = vi.fn();
const mockMapStateSingle = vi.fn();
const mockMapUpdate = vi.fn();
const mockMarkerDelete = vi.fn();
const mockMarkerInsert = vi.fn();
const mockFailureDelete = vi.fn();
const mockFailureInsert = vi.fn();
const mockCapture = vi.fn();
const mockRecordAudit = vi.fn();
const mockRateLimit = vi.fn();

vi.mock("@/lib/admin-auth", () => ({ verifyAdminTokenForMap: (...a: unknown[]) => mockVerify(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => mockRecordAudit(...a) }));
vi.mock("@/lib/versions", () => ({ tryCaptureMapVersion: (...a: unknown[]) => mockCapture(...a) }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, rateLimitRequest: (...a: unknown[]) => mockRateLimit(...a) };
});
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      if (table === "map_versions") {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: mockVersionSingle }) }) }) };
      }
      if (table === "maps") {
        return {
          select: () => ({ eq: () => ({ single: mockMapStateSingle }) }),
          update: (payload: unknown) => {
            mockMapUpdate(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      if (table === "markers") {
        return {
          delete: () => ({ eq: () => { mockMarkerDelete(); return Promise.resolve({ error: null }); } }),
          insert: (rows: unknown) => { mockMarkerInsert(rows); return Promise.resolve({ error: null }); },
        };
      }
      if (table === "geocode_failures") {
        return {
          delete: () => ({ eq: () => { mockFailureDelete(); return Promise.resolve({ error: null }); } }),
          insert: (rows: unknown) => { mockFailureInsert(rows); return Promise.resolve({ error: null }); },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const publicSnapshot = {
  map: { slug: "abc123", title: "복원 지도", description: "", visibility: "public", is_listed: true, source_name: "출처", data_as_of: "2026-01-01", owner_department: "담당과", public_extra_columns: [], column_mapping: {} },
  markers: [{ row_index: 2, address_raw: "서울", address_normalized: null, lat: 37.5, lng: 127, name: "A", value: null, category: null, extra: {}, quality_status: "success", included: true }],
  failures: [],
};

function restoreRequest() {
  return new Request("http://localhost/api/maps/abc123/versions/restore", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.9.1.1" },
    body: JSON.stringify({ admin_token: "admin", version_id: "v-old", confirmed: true }),
  });
}
const ctx = { params: Promise.resolve({ slug: "abc123" }) };

describe("POST /api/maps/[slug]/versions/restore review gate", () => {
  beforeEach(() => {
    for (const m of [mockVerify, mockVersionSingle, mockMapStateSingle, mockMapUpdate, mockMarkerDelete, mockMarkerInsert, mockFailureDelete, mockFailureInsert, mockCapture, mockRecordAudit, mockRateLimit]) m.mockReset();
    mockRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mockVerify.mockResolvedValue({ ok: true, mapId: "m1" });
    mockVersionSingle.mockResolvedValue({ data: { id: "v-old", version_number: 1, snapshot: publicSnapshot }, error: null });
    mockCapture.mockResolvedValue({ version_number: 3 });
    mockRecordAudit.mockResolvedValue(undefined);
  });

  it("returns 409 REVIEW_REQUIRED and writes nothing when a public snapshot is restored onto an unapproved private map", async () => {
    mockMapStateSingle.mockResolvedValue({ data: { visibility: "private", is_listed: false, review_required: true, approved_version_id: null, current_version_id: "v2" }, error: null });
    const { POST } = await import("@/app/api/maps/[slug]/versions/restore/route");
    const res = await POST(restoreRequest(), ctx);
    expect(res.status).toBe(409);
    const json = (await res.json()) as { ok: false; error: { code: string; message: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("REVIEW_REQUIRED");
    expect(json.error.message).toContain("검토");
    expect(mockMarkerDelete).not.toHaveBeenCalled();
    expect(mockFailureDelete).not.toHaveBeenCalled();
    expect(mockMarkerInsert).not.toHaveBeenCalled();
    expect(mockMapUpdate).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("restores the snapshot when review is not required", async () => {
    mockMapStateSingle.mockResolvedValue({ data: { visibility: "private", is_listed: false, review_required: false, approved_version_id: null, current_version_id: null }, error: null });
    const { POST } = await import("@/app/api/maps/[slug]/versions/restore/route");
    const res = await POST(restoreRequest(), ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: true; restored_version: number; new_version: number | null };
    expect(json.restored_version).toBe(1);
    expect(json.new_version).toBe(3);
    expect(mockMarkerDelete).toHaveBeenCalledTimes(1);
    expect(mockMarkerInsert).toHaveBeenCalledTimes(1);
    expect(mockMapUpdate.mock.calls[0][0]).toMatchObject({ visibility: "public", is_listed: true, title: "복원 지도" });
    expect(mockRecordAudit.mock.calls[0][0]).toMatchObject({ action: "map.version_restore", mapId: "m1" });
  });

  it("lets a private snapshot through even when review is required", async () => {
    mockMapStateSingle.mockResolvedValue({ data: { visibility: "private", is_listed: false, review_required: true, approved_version_id: null, current_version_id: "v2" }, error: null });
    mockVersionSingle.mockResolvedValue({ data: { id: "v-old", version_number: 1, snapshot: { ...publicSnapshot, map: { ...publicSnapshot.map, visibility: "private", is_listed: false } } }, error: null });
    const { POST } = await import("@/app/api/maps/[slug]/versions/restore/route");
    const res = await POST(restoreRequest(), ctx);
    expect(res.status).toBe(200);
    expect(mockMapUpdate.mock.calls[0][0]).toMatchObject({ visibility: "private", is_listed: false });
  });

  it("fails closed with 500 MAP_LOAD_FAILED when the stored map state cannot be read", async () => {
    mockMapStateSingle.mockResolvedValue({ data: null, error: { message: "timeout" } });
    const { POST } = await import("@/app/api/maps/[slug]/versions/restore/route");
    const res = await POST(restoreRequest(), ctx);
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("MAP_LOAD_FAILED");
    expect(mockMarkerDelete).not.toHaveBeenCalled();
    expect(mockMapUpdate).not.toHaveBeenCalled();
  });
});
