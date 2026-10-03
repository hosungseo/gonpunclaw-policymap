import { NextResponse } from "next/server";
import { queryDirectory } from "@/lib/directory/query";
import { publicApiHeaders, requestOrigin } from "@/lib/maps/public-api";
import { publicApiError, publicApiOptions } from "@/lib/maps/public-api-route";
import { LIMITS, rateLimitRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = await rateLimitRequest(req, "public-api", LIMITS.publicApi);
  if (!limit.allowed) {
    return publicApiError("RATE_LIMITED", "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.", 429, { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) });
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  try {
    const result = await queryDirectory({ q, page: Number.isFinite(page) ? page : 1 });
    const origin = requestOrigin(req);
    return NextResponse.json(
      {
        ok: true,
        maps: result.entries.map((entry) => ({
          ...entry,
          api: {
            json: `${origin}/api/public/maps/${entry.slug}`,
            geojson: `${origin}/api/public/maps/${entry.slug}/geojson`,
            map: `${origin}/m/${entry.slug}`,
            embed: `${origin}/embed/${entry.slug}`,
          },
        })),
        total: result.total,
        page: result.page,
        page_size: result.pageSize,
        total_pages: result.totalPages,
      },
      { headers: publicApiHeaders() },
    );
  } catch {
    return publicApiError("UPSTREAM", "목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }
}

export async function OPTIONS() {
  return publicApiOptions();
}
