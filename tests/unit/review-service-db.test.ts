import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashReviewToken } from "@/lib/reviews/tokens";

// Minimal Supabase query-builder double: every chain records table / operation / payload / filters and
// resolves through a per-test responder, so each test states exactly what the database answers.
type Op = "select" | "insert" | "update" | "delete";
type Call = { table: string; op: Op; payload?: unknown; filters: Record<string, unknown>; selected?: string };
type Reply = { data?: unknown; error?: { code?: string; message: string } | null };

const calls: Call[] = [];
let responder: (call: Call) => Reply = () => ({ data: null, error: null });
const respond = (fn: (call: Call) => Reply | undefined) => {
  responder = (call) => fn(call) ?? { data: null, error: null };
};
const callsTo = (table: string, op: Op) => calls.filter((c) => c.table === table && c.op === op);

function builder(table: string) {
  const call: Call = { table, op: "select", filters: {} };
  const finish = () => Promise.resolve({ data: null, error: null, ...responder(call) });
  const chain = {
    select(cols?: string) {
      call.selected = cols;
      return chain;
    },
    insert(payload: unknown) {
      call.op = "insert";
      call.payload = payload;
      return chain;
    },
    update(payload: unknown) {
      call.op = "update";
      call.payload = payload;
      return chain;
    },
    delete() {
      call.op = "delete";
      return chain;
    },
    eq(key: string, value: unknown) {
      call.filters[key] = value;
      return chain;
    },
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    single: finish,
    maybeSingle: finish,
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return finish().then(onFulfilled, onRejected);
    },
  };
  calls.push(call);
  return chain;
}

const mockCapture = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: () => ({ from: builder }) }));
vi.mock("@/lib/versions", () => ({ captureMapVersion: (...a: unknown[]) => mockCapture(...a) }));

const pepper = "p".repeat(32);

beforeEach(() => {
  calls.length = 0;
  responder = () => ({ data: null, error: null });
  mockCapture.mockReset();
  process.env.ADMIN_TOKEN_PEPPER = pepper;
});
afterEach(() => {
  delete process.env.ADMIN_TOKEN_PEPPER;
});

describe("verifyReviewTokenForMap", () => {
  it("accepts the token whose hash is stored on the map", async () => {
    const { verifyReviewTokenForMap } = await import("@/lib/reviews/tokens");
    respond(() => ({ data: { id: "m1", review_token_hash: hashReviewToken("good", pepper) } }));
    expect(await verifyReviewTokenForMap("abc", "good")).toEqual({ ok: true, mapId: "m1" });
    expect(calls[0]).toMatchObject({ table: "maps", op: "select", filters: { slug: "abc" } });
  });

  it("returns NOT_FOUND for a wrong token, a missing row and a map without a review token", async () => {
    const { verifyReviewTokenForMap } = await import("@/lib/reviews/tokens");
    respond(() => ({ data: { id: "m1", review_token_hash: hashReviewToken("good", pepper) } }));
    expect(await verifyReviewTokenForMap("abc", "wrong")).toEqual({ ok: false, reason: "NOT_FOUND" });
    respond(() => ({ data: null }));
    expect(await verifyReviewTokenForMap("abc", "good")).toEqual({ ok: false, reason: "NOT_FOUND" });
    respond(() => ({ data: { id: "m1", review_token_hash: null } }));
    expect(await verifyReviewTokenForMap("abc", "good")).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("returns MISSING_PEPPER without touching the database", async () => {
    const { verifyReviewTokenForMap } = await import("@/lib/reviews/tokens");
    delete process.env.ADMIN_TOKEN_PEPPER;
    expect(await verifyReviewTokenForMap("abc", "good")).toEqual({ ok: false, reason: "MISSING_PEPPER" });
    expect(calls).toHaveLength(0);
  });
});

describe("updateReviewSettings", () => {
  const withHash = (hash: string | null) => respond((c) => (c.table === "maps" && c.op === "select" ? { data: { review_token_hash: hash } } : undefined));
  const payload = () => callsTo("maps", "update")[0].payload as Record<string, unknown>;

  it("issues a token when enabling a map that has none", async () => {
    const { updateReviewSettings } = await import("@/lib/reviews/service");
    withHash(null);
    const result = await updateReviewSettings({ mapId: "m1", reviewRequired: true, rotate: false });
    expect(result.review_required).toBe(true);
    expect(result.rotated).toBe(true);
    expect(result.review_token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(payload()).toMatchObject({ review_required: true, review_token_hash: hashReviewToken(result.review_token as string, pepper) });
  });

  it("issues a fresh token when rotation is requested", async () => {
    const { updateReviewSettings } = await import("@/lib/reviews/service");
    withHash("old-hash");
    const result = await updateReviewSettings({ mapId: "m1", reviewRequired: true, rotate: true });
    expect(result.rotated).toBe(true);
    expect(result.review_token).not.toBeNull();
    expect(payload().review_token_hash).not.toBe("old-hash");
  });

  it("keeps the existing token when enabling without rotation", async () => {
    const { updateReviewSettings } = await import("@/lib/reviews/service");
    withHash("old-hash");
    const result = await updateReviewSettings({ mapId: "m1", reviewRequired: true, rotate: false });
    expect(result).toEqual({ review_required: true, review_token: null, rotated: false });
    expect(payload()).not.toHaveProperty("review_token_hash");
  });

  it("disables without touching the stored hash", async () => {
    const { updateReviewSettings } = await import("@/lib/reviews/service");
    withHash("old-hash");
    const result = await updateReviewSettings({ mapId: "m1", reviewRequired: false, rotate: true });
    expect(result).toEqual({ review_required: false, review_token: null, rotated: false });
    expect(payload()).toMatchObject({ review_required: false });
    expect(payload()).not.toHaveProperty("review_token_hash");
  });
});

describe("requestReview", () => {
  it("refuses when review is not enabled", async () => {
    const { requestReview } = await import("@/lib/reviews/service");
    respond((c) => (c.table === "maps" ? { data: { review_required: false, current_version_id: null } } : undefined));
    expect(await requestReview({ mapId: "m1", note: "", actorToken: "t" })).toMatchObject({ ok: false, code: "REVIEW_NOT_ENABLED" });
    expect(callsTo("map_reviews", "insert")).toHaveLength(0);
  });

  it("captures a version when the map has none, clears older pending rows and inserts one pending review", async () => {
    const { requestReview } = await import("@/lib/reviews/service");
    mockCapture.mockResolvedValue({ id: "v9", version_number: 1 });
    respond((c) => {
      if (c.table === "maps") return { data: { review_required: true, current_version_id: null } };
      if (c.table === "map_reviews" && c.op === "insert") return { data: { id: "r1" } };
      return undefined;
    });
    const result = await requestReview({ mapId: "m1", note: "  확인 부탁  ", actorToken: "t" });
    expect(result).toEqual({ ok: true, review: { id: "r1", status: "pending", version_number: 1 } });
    expect(mockCapture).toHaveBeenCalledWith({ mapId: "m1", reason: "검토 요청", actorToken: "t" });
    const [del] = callsTo("map_reviews", "delete");
    expect(del.filters).toEqual({ map_id: "m1", status: "pending" });
    expect(callsTo("map_reviews", "insert")[0].payload).toEqual({ map_id: "m1", version_id: "v9", status: "pending", request_note: "확인 부탁" });
  });

  it("reuses the current version and resolves its number when one exists", async () => {
    const { requestReview } = await import("@/lib/reviews/service");
    respond((c) => {
      if (c.table === "maps") return { data: { review_required: true, current_version_id: "v3" } };
      if (c.table === "map_versions") return { data: { version_number: 3 } };
      if (c.table === "map_reviews" && c.op === "insert") return { data: { id: "r2" } };
      return undefined;
    });
    const result = await requestReview({ mapId: "m1", note: "", actorToken: null });
    expect(result).toEqual({ ok: true, review: { id: "r2", status: "pending", version_number: 3 } });
    expect(mockCapture).not.toHaveBeenCalled();
    expect(callsTo("map_reviews", "insert")[0].payload).toMatchObject({ version_id: "v3" });
  });

  it("returns the existing pending review when the unique index rejects a concurrent insert", async () => {
    const { requestReview } = await import("@/lib/reviews/service");
    respond((c) => {
      if (c.table === "maps") return { data: { review_required: true, current_version_id: "v3" } };
      if (c.table === "map_versions") return { data: { version_number: 3 } };
      if (c.table === "map_reviews" && c.op === "insert") return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      if (c.table === "map_reviews" && c.op === "select") return { data: { id: "r-existing", version_id: "v3" } };
      return undefined;
    });
    const result = await requestReview({ mapId: "m1", note: "", actorToken: "t" });
    expect(result).toEqual({ ok: true, review: { id: "r-existing", status: "pending", version_number: 3 } });
  });

  it("reports VERSION_CAPTURE_FAILED when the snapshot cannot be taken", async () => {
    const { requestReview } = await import("@/lib/reviews/service");
    mockCapture.mockRejectedValue(new Error("snapshot exploded"));
    respond((c) => (c.table === "maps" ? { data: { review_required: true, current_version_id: null } } : undefined));
    expect(await requestReview({ mapId: "m1", note: "", actorToken: "t" })).toEqual({ ok: false, code: "VERSION_CAPTURE_FAILED", message: "snapshot exploded" });
    expect(callsTo("map_reviews", "delete")).toHaveLength(0);
    expect(callsTo("map_reviews", "insert")).toHaveLength(0);
  });
});

describe("decideReview", () => {
  const all = { source: true, as_of: true, sensitive: true, visibility: true };
  const input = { mapId: "m1", checklist: all, comment: "", reviewerLabel: " 검토자 ", reviewerIpHash: "iphash" };

  it("approves the pending review and pins approved_version_id to the reviewed version", async () => {
    const { decideReview } = await import("@/lib/reviews/service");
    respond((c) => {
      if (c.table === "map_reviews" && c.op === "select") return { data: { id: "r1", version_id: "v1" } };
      if (c.table === "maps" && c.op === "select") return { data: { current_version_id: "v1" } };
      if (c.table === "map_reviews" && c.op === "update") return { data: { id: "r1", version_id: "v1" } };
      return undefined;
    });
    const result = await decideReview({ ...input, decision: "approve" });
    expect(result).toEqual({ ok: true, review: { id: "r1", status: "approved", version_id: "v1" } });
    const [flip] = callsTo("map_reviews", "update");
    expect(flip.filters).toEqual({ id: "r1", status: "pending" });
    expect(flip.payload).toMatchObject({ status: "approved", checklist: all, comment: "", reviewer_label: "검토자", reviewer_ip_hash: "iphash" });
    const [pin] = callsTo("maps", "update");
    expect(pin.filters).toEqual({ id: "m1" });
    expect(pin.payload).toMatchObject({ approved_version_id: "v1" });
  });

  it("reports ALREADY_DECIDED when the conditional update matches no pending row", async () => {
    const { decideReview } = await import("@/lib/reviews/service");
    respond((c) => {
      if (c.table === "map_reviews" && c.op === "select") return { data: { id: "r1", version_id: "v1" } };
      if (c.table === "maps" && c.op === "select") return { data: { current_version_id: "v1" } };
      if (c.table === "map_reviews" && c.op === "update") return { data: null };
      return undefined;
    });
    expect(await decideReview({ ...input, decision: "approve" })).toMatchObject({ ok: false, code: "ALREADY_DECIDED" });
    expect(callsTo("maps", "update")).toHaveLength(0);
  });

  it("auto-rejects instead of approving when the live version moved on since the request", async () => {
    const { decideReview, VERSION_CHANGED_PREFIX } = await import("@/lib/reviews/service");
    respond((c) => {
      if (c.table === "map_reviews" && c.op === "select") return { data: { id: "r1", version_id: "v1" } };
      if (c.table === "maps" && c.op === "select") return { data: { current_version_id: "v2" } };
      if (c.table === "map_reviews" && c.op === "update") return { data: { id: "r1", version_id: "v1" } };
      return undefined;
    });
    expect(await decideReview({ ...input, decision: "approve", comment: "좋아요" })).toMatchObject({ ok: false, code: "VERSION_CHANGED", review: { id: "r1", version_id: "v1" } });
    const [flip] = callsTo("map_reviews", "update");
    expect(flip.filters).toEqual({ id: "r1", status: "pending" });
    expect(flip.payload).toMatchObject({ status: "rejected", comment: `${VERSION_CHANGED_PREFIX} 좋아요` });
    expect(callsTo("maps", "update")).toHaveLength(0);
  });

  it("rejects without consulting the live version and never pins an approval", async () => {
    const { decideReview } = await import("@/lib/reviews/service");
    respond((c) => {
      if (c.table === "map_reviews" && c.op === "select") return { data: { id: "r1", version_id: "v1" } };
      if (c.table === "map_reviews" && c.op === "update") return { data: { id: "r1", version_id: "v1" } };
      return undefined;
    });
    expect(await decideReview({ ...input, decision: "reject", comment: " 출처 깨짐 " })).toEqual({ ok: true, review: { id: "r1", status: "rejected", version_id: "v1" } });
    expect(callsTo("maps", "select")).toHaveLength(0);
    expect(callsTo("maps", "update")).toHaveLength(0);
    expect(callsTo("map_reviews", "update")[0].payload).toMatchObject({ status: "rejected", comment: "출처 깨짐" });
  });

  it("reports NO_PENDING_REVIEW when nothing is waiting", async () => {
    const { decideReview } = await import("@/lib/reviews/service");
    expect(await decideReview({ ...input, decision: "approve" })).toMatchObject({ ok: false, code: "NO_PENDING_REVIEW" });
    expect(callsTo("map_reviews", "update")).toHaveLength(0);
  });
});

describe("loadReviewSummary", () => {
  it("returns status fields only and never selects reviewer-written columns", async () => {
    const { loadReviewSummary } = await import("@/lib/reviews/service");
    respond((c) => {
      if (c.table === "maps") return { data: { review_required: true, review_token_hash: "h", approved_version_id: "v1", current_version_id: "v3" } };
      if (c.table === "map_reviews") return { data: { status: "rejected", comment: "leaked?", reviewer_label: "leaked?" } };
      if (c.table === "map_versions") return { data: { version_number: 3 } };
      return undefined;
    });
    const summary = await loadReviewSummary("m1");
    expect(summary).toEqual({ required: true, hasToken: true, status: "rejected", currentVersionNumber: 3 });
    // The SSR payload is built from this object as-is, so no detail key may slip through.
    expect(Object.keys(summary).sort()).toEqual(["currentVersionNumber", "hasToken", "required", "status"]);
    expect(callsTo("map_reviews", "select")[0].selected).toBe("status");
  });

  it("reports 'none' with no current version when review is off and the map has no versions", async () => {
    const { loadReviewSummary } = await import("@/lib/reviews/service");
    respond((c) => (c.table === "maps" ? { data: { review_required: false, review_token_hash: null, approved_version_id: null, current_version_id: null } } : undefined));
    expect(await loadReviewSummary("m1")).toEqual({ required: false, hasToken: false, status: "none", currentVersionNumber: null });
    expect(callsTo("map_versions", "select")).toHaveLength(0);
  });
});
