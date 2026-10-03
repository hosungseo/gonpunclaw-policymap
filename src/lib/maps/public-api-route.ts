import { NextResponse } from "next/server";
import { loadPublicMapRecord, type PublicMapRecord } from "@/lib/maps/load-public-map";
import { PUBLIC_API_CORS, etagFor, publicApiHeaders } from "@/lib/maps/public-api";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";

type ErrBody = { ok: false; error: { code: string; message: string } };

export function publicApiError(code: string, message: string, status: number, extra?: Record<string, string>) {
  return NextResponse.json<ErrBody>({ ok: false, error: { code, message } }, { status, headers: { ...PUBLIC_API_CORS, ...(extra ?? {}) } });
}

export function publicApiOptions() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_API_CORS });
}

/**
 * Shared preamble: rate limit → load → 404 → conditional GET.
 * Returns either a ready response (error/304) or the record + headers to serialize.
 */
export async function preparePublicMapResponse(req: Request, slug: string): Promise<
  | { kind: "response"; response: NextResponse }
  | { kind: "record"; record: PublicMapRecord; headers: Record<string, string> }
> {
  const limit = await rateLimitRequest(req, "public-api", LIMITS.publicApi);
  if (!limit.allowed) {
    return { kind: "response", response: publicApiError("RATE_LIMITED", "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.", 429, { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) }) };
  }
  const record = await loadPublicMapRecord(slug);
  if (!record) return { kind: "response", response: publicApiError("NOT_FOUND", "지도를 찾을 수 없습니다.", 404) };
  const etag = etagFor(record);
  const headers = publicApiHeaders(etag);
  if (req.headers.get("if-none-match") === etag) {
    return { kind: "response", response: new NextResponse(null, { status: 304, headers }) };
  }
  return { kind: "record", record, headers };
}
