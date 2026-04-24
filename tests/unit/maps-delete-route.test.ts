import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockVerify = vi.fn();
const mockDeletedSlugUpsert = vi.fn();
const mockMapDeleteEq = vi.fn();
const mockRecordAudit = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminTokenForMap: (...args: unknown[]) => mockVerify(...args),
}));

vi.mock("@/lib/audit", () => ({
  recordAudit: (...args: unknown[]) => mockRecordAudit(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      if (table === "deleted_slugs") {
        return { upsert: mockDeletedSlugUpsert };
      }
      if (table === "maps") {
        return {
          delete: () => ({
            eq: mockMapDeleteEq,
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

function makeRequest(body: unknown, ip = "203.0.113.10"): NextRequest {
  return new Request("http://localhost/api/maps/s/delete", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

async function callRoute(body: unknown, ip?: string) {
  const { POST } = await import("@/app/api/maps/[slug]/delete/route");
  return POST(makeRequest(body, ip), { params: Promise.resolve({ slug: "testslug" }) });
}

describe("POST /api/maps/[slug]/delete", () => {
  beforeEach(() => {
    vi.resetModules();
    mockVerify.mockReset();
    mockDeletedSlugUpsert.mockReset();
    mockMapDeleteEq.mockReset();
    mockRecordAudit.mockReset();
    mockVerify.mockResolvedValue({ ok: true, mapId: "map-1" });
    mockDeletedSlugUpsert.mockResolvedValue({ error: null });
    mockMapDeleteEq.mockResolvedValue({ error: null });
    mockRecordAudit.mockResolvedValue(undefined);
  });

  it("rate limits repeated delete attempts from the same IP", async () => {
    const ip = "198.51.100.44";
    for (let i = 0; i < 5; i++) {
      const res = await callRoute({ admin_token: "token" }, ip);
      expect(res.status).toBe(200);
    }

    const res = await callRoute({ admin_token: "token" }, ip);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("RATE_LIMITED");
  });
});
