import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockVerifyAdmin = vi.fn();
const mockVerifyReview = vi.fn();
const mockRecordAudit = vi.fn();
const mockUpdateSettings = vi.fn();
const mockRequest = vi.fn();
const mockDecide = vi.fn();

vi.mock("@/lib/admin-auth", () => ({ verifyAdminTokenForMap: (...a: unknown[]) => mockVerifyAdmin(...a) }));
vi.mock("@/lib/reviews/tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reviews/tokens")>();
  return { ...actual, verifyReviewTokenForMap: (...a: unknown[]) => mockVerifyReview(...a) };
});
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => mockRecordAudit(...a) }));
vi.mock("@/lib/reviews/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reviews/service")>();
  return {
    ...actual,
    updateReviewSettings: (...a: unknown[]) => mockUpdateSettings(...a),
    requestReview: (...a: unknown[]) => mockRequest(...a),
    decideReview: (...a: unknown[]) => mockDecide(...a),
  };
});

// Each request gets its own client IP so the in-memory rate limiter (5 per bucket) never trips across tests.
let ipCounter = 0;
function post(path: string, body: unknown): NextRequest {
  ipCounter += 1;
  return new Request(`http://localhost${path}`, {
    method: "POST",
    // x-forwarded-proto keeps requestOrigin() on http for the localhost host in review_url.
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`, "x-forwarded-proto": "http" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}
const ctx = { params: Promise.resolve({ slug: "abc123" }) };

describe("review routes", () => {
  beforeEach(() => {
    for (const m of [mockVerifyAdmin, mockVerifyReview, mockRecordAudit, mockUpdateSettings, mockRequest, mockDecide]) m.mockReset();
    mockRecordAudit.mockResolvedValue(undefined);
  });

  describe("settings", () => {
    it("rejects without admin token", async () => {
      const { POST } = await import("@/app/api/maps/[slug]/review/settings/route");
      const res = await POST(post("/api/maps/abc123/review/settings", { review_required: true }), ctx);
      expect(res.status).toBe(400);
    });

    it("enables review and returns a one-time token + review url", async () => {
      mockVerifyAdmin.mockResolvedValue({ ok: true, mapId: "m1" });
      mockUpdateSettings.mockResolvedValue({ review_required: true, review_token: "tok", rotated: true });
      const { POST } = await import("@/app/api/maps/[slug]/review/settings/route");
      const res = await POST(post("/api/maps/abc123/review/settings", { admin_token: "t", review_required: true }), ctx);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.review_token).toBe("tok");
      expect(json.review_url).toBe("http://localhost/review/abc123?t=tok");
      expect(mockRecordAudit.mock.calls[0][0]).toMatchObject({ action: "map.review_settings", mapId: "m1" });
    });

    it("returns 404 and audits on bad token", async () => {
      mockVerifyAdmin.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
      const { POST } = await import("@/app/api/maps/[slug]/review/settings/route");
      const res = await POST(post("/api/maps/abc123/review/settings", { admin_token: "bad", review_required: true }), ctx);
      expect(res.status).toBe(404);
      expect(mockRecordAudit.mock.calls[0][0].action).toBe("admin.auth_fail");
    });
  });

  describe("request", () => {
    it("creates a pending review", async () => {
      mockVerifyAdmin.mockResolvedValue({ ok: true, mapId: "m1" });
      mockRequest.mockResolvedValue({ ok: true, review: { id: "r1", status: "pending", version_number: 2 } });
      const { POST } = await import("@/app/api/maps/[slug]/review/request/route");
      const res = await POST(post("/api/maps/abc123/review/request", { admin_token: "t", note: "확인 부탁" }), ctx);
      expect(res.status).toBe(200);
      expect(mockRequest).toHaveBeenCalledWith({ mapId: "m1", note: "확인 부탁", actorToken: "t" });
      expect(mockRecordAudit.mock.calls[0][0].action).toBe("map.review_request");
    });

    it("surfaces REVIEW_NOT_ENABLED as 409", async () => {
      mockVerifyAdmin.mockResolvedValue({ ok: true, mapId: "m1" });
      mockRequest.mockResolvedValue({ ok: false, code: "REVIEW_NOT_ENABLED", message: "먼저 검토 필수를 켜 주세요." });
      const { POST } = await import("@/app/api/maps/[slug]/review/request/route");
      const res = await POST(post("/api/maps/abc123/review/request", { admin_token: "t" }), ctx);
      expect(res.status).toBe(409);
    });
  });

  describe("decide", () => {
    const all = { source: true, as_of: true, sensitive: true, visibility: true };

    it("approves with a complete checklist", async () => {
      mockVerifyReview.mockResolvedValue({ ok: true, mapId: "m1" });
      mockDecide.mockResolvedValue({ ok: true, review: { id: "r1", status: "approved" } });
      const { POST } = await import("@/app/api/maps/[slug]/review/decide/route");
      const res = await POST(post("/api/maps/abc123/review/decide", { review_token: "rt", decision: "approve", checklist: all, reviewer_label: "검토자" }), ctx);
      expect(res.status).toBe(200);
      expect(mockDecide.mock.calls[0][0]).toMatchObject({ mapId: "m1", decision: "approve", reviewerLabel: "검토자" });
      expect(mockRecordAudit.mock.calls[0][0].action).toBe("map.review_approve");
    });

    it("rejects an incomplete checklist before touching the service", async () => {
      mockVerifyReview.mockResolvedValue({ ok: true, mapId: "m1" });
      const { POST } = await import("@/app/api/maps/[slug]/review/decide/route");
      const res = await POST(post("/api/maps/abc123/review/decide", { review_token: "rt", decision: "approve", checklist: { ...all, visibility: false } }), ctx);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("CHECKLIST_INCOMPLETE");
      expect(mockDecide).not.toHaveBeenCalled();
    });

    it("returns 409 when there is no pending review", async () => {
      mockVerifyReview.mockResolvedValue({ ok: true, mapId: "m1" });
      mockDecide.mockResolvedValue({ ok: false, code: "NO_PENDING_REVIEW", message: "대기 중인 검토 요청이 없습니다." });
      const { POST } = await import("@/app/api/maps/[slug]/review/decide/route");
      const res = await POST(post("/api/maps/abc123/review/decide", { review_token: "rt", decision: "reject", comment: "x" }), ctx);
      expect(res.status).toBe(409);
    });

    it("returns 404 and audits on bad review token", async () => {
      mockVerifyReview.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
      const { POST } = await import("@/app/api/maps/[slug]/review/decide/route");
      const res = await POST(post("/api/maps/abc123/review/decide", { review_token: "bad", decision: "approve", checklist: all }), ctx);
      expect(res.status).toBe(404);
      expect(mockRecordAudit.mock.calls[0][0]).toMatchObject({ action: "review.auth_fail", details: { slug: "abc123", route: "review.decide" } });
    });

    it("maps ALREADY_DECIDED and VERSION_CHANGED to 409", async () => {
      mockVerifyReview.mockResolvedValue({ ok: true, mapId: "m1" });
      const { POST } = await import("@/app/api/maps/[slug]/review/decide/route");
      mockDecide.mockResolvedValueOnce({ ok: false, code: "ALREADY_DECIDED", message: "이미 결정된 검토 요청입니다." });
      const first = await POST(post("/api/maps/abc123/review/decide", { review_token: "rt", decision: "approve", checklist: all }), ctx);
      expect(first.status).toBe(409);
      expect((await first.json()).error.code).toBe("ALREADY_DECIDED");
      expect(mockRecordAudit).not.toHaveBeenCalled();
      mockDecide.mockResolvedValueOnce({ ok: false, code: "VERSION_CHANGED", message: "요청 이후 데이터가 바뀌었습니다.", review: { id: "r1", version_id: "v1" } });
      const second = await POST(post("/api/maps/abc123/review/decide", { review_token: "rt", decision: "approve", checklist: all }), ctx);
      expect(second.status).toBe(409);
      expect((await second.json()).error.code).toBe("VERSION_CHANGED");
      // The auto-rejection is a real decision and must show up in the audit trail.
      expect(mockRecordAudit).toHaveBeenCalledTimes(1);
      expect(mockRecordAudit.mock.calls[0][0]).toMatchObject({
        action: "map.review_reject",
        mapId: "m1",
        details: { slug: "abc123", auto_reason: "version_changed", review_id: "r1", version_id: "v1" },
      });
    });
  });
});
