import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashUploadJobToken } from "@/lib/upload/job-token";

const pepper = "p".repeat(32);
const mockJobSingle = vi.fn();
const mockMapStateSingle = vi.fn();
const mockMapUpdate = vi.fn();
const mockRecordAudit = vi.fn();

vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => mockRecordAudit(...a) }));
vi.mock("@/lib/versions", () => ({ tryCaptureMapVersion: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      if (table === "upload_jobs") {
        return {
          select: () => ({ eq: () => ({ single: mockJobSingle }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "markers") {
        // Awaited directly (no .single): resolve the chain itself.
        return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) };
      }
      if (table === "maps") {
        return {
          select: () => ({ eq: () => ({ single: mockMapStateSingle }) }),
          update: (payload: unknown) => {
            mockMapUpdate(payload);
            return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { slug: "job-slug", visibility: "public" }, error: null }) }) }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

function publishRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/upload/jobs/j1/publish", {
    method: "POST",
    headers: { "content-type": "application/json", "x-upload-job-token": "job-token", "x-forwarded-for": "10.9.0.1" },
    body: JSON.stringify(body),
  });
}

const publicBody = {
  visibility: "public",
  title: "검토 지도",
  source_name: "출처",
  data_as_of: "2026-01-01",
  owner_department: "담당과",
  source_confirmed: true,
  as_of_confirmed: true,
  sensitive_confirmed: true,
};

describe("POST /api/upload/jobs/[jobId]/publish review gate", () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN_PEPPER = pepper;
    for (const m of [mockJobSingle, mockMapStateSingle, mockMapUpdate, mockRecordAudit]) m.mockReset();
    mockRecordAudit.mockResolvedValue(undefined);
    mockJobSingle.mockResolvedValue({
      data: { id: "j1", map_id: "m1", slug: "job-slug", status: "completed", job_token_hash: hashUploadJobToken("job-token", pepper), quality_review_count: 0, failed_count: 0, requested_visibility: "private" },
      error: null,
    });
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN_PEPPER;
  });

  it("returns 409 REVIEW_REQUIRED and writes nothing when review is required and unapproved", async () => {
    mockMapStateSingle.mockResolvedValue({ data: { visibility: "private", is_listed: false, review_required: true, approved_version_id: null, current_version_id: "v1" }, error: null });
    const { POST } = await import("@/app/api/upload/jobs/[jobId]/publish/route");
    const res = await POST(publishRequest(publicBody), { params: Promise.resolve({ jobId: "j1" }) });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("REVIEW_REQUIRED");
    expect(mockMapUpdate).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("publishes when review is not required", async () => {
    mockMapStateSingle.mockResolvedValue({ data: { visibility: "private", is_listed: false, review_required: false, approved_version_id: null, current_version_id: null }, error: null });
    const { POST } = await import("@/app/api/upload/jobs/[jobId]/publish/route");
    const res = await POST(publishRequest(publicBody), { params: Promise.resolve({ jobId: "j1" }) });
    expect(res.status).toBe(200);
    expect(mockMapUpdate.mock.calls[0][0]).toMatchObject({ visibility: "public", is_listed: true });
    expect(mockRecordAudit.mock.calls[0][0]).toMatchObject({ action: "map.publish", mapId: "m1" });
  });

  it("fails closed with 500 MAP_LOAD_FAILED when the stored map state cannot be read", async () => {
    mockMapStateSingle.mockResolvedValue({ data: null, error: { message: "timeout" } });
    const { POST } = await import("@/app/api/upload/jobs/[jobId]/publish/route");
    const res = await POST(publishRequest(publicBody), { params: Promise.resolve({ jobId: "j1" }) });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("MAP_LOAD_FAILED");
    expect(mockMapUpdate).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("lets a private publish through even when review is required", async () => {
    mockMapStateSingle.mockResolvedValue({ data: { visibility: "private", is_listed: false, review_required: true, approved_version_id: null, current_version_id: "v1" }, error: null });
    const { POST } = await import("@/app/api/upload/jobs/[jobId]/publish/route");
    const res = await POST(publishRequest({ ...publicBody, visibility: "private" }), { params: Promise.resolve({ jobId: "j1" }) });
    expect(res.status).toBe(200);
    expect(mockMapUpdate.mock.calls[0][0]).toMatchObject({ visibility: "private" });
  });
});
