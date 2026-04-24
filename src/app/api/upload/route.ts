import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseWorkbook } from "@/lib/excel/parse";
import { defaultChainFromEnv } from "@/lib/geocode";
import { supabaseServer } from "@/lib/supabase/server";
import { generateAdminToken, generateSlug, hashAdminToken } from "@/lib/tokens";
import { LIMITS, ipKey, rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { detectSensitiveHeaders, sensitiveHeadersMessage } from "@/lib/upload/sensitive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const GEOCODE_CONCURRENCY = 8;

interface UploadOk {
  ok: true;
  slug: string;
  admin_token: string;
  inserted: number;
  failed: number;
  geocoder_stats: Record<string, number>;
  failure_preview: Array<{ row_index: number; address_raw: string; reason: string; attempted: string[] }>;
}
interface UploadErr {
  ok: false;
  error: { code: string; message: string };
}

export async function POST(req: NextRequest): Promise<NextResponse<UploadOk | UploadErr>> {
  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  if (!pepper) {
    return NextResponse.json(
      { ok: false, error: { code: "SERVER_MISCONFIG", message: "Server pepper not configured." } },
      { status: 500 },
    );
  }

  const limit = rateLimit(ipKey(req, "upload"), LIMITS.upload);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "업로드 한도를 초과했습니다. 잠시 후 다시 시도해 주세요." } },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_FORM", message: "폼 데이터를 읽을 수 없습니다." } },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { ok: false, error: { code: "NO_FILE", message: "파일을 선택해 주세요." } },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: { code: "FILE_TOO_LARGE", message: "파일 크기는 3MB를 초과할 수 없습니다." } },
      { status: 413 },
    );
  }

  const title = String(form.get("title") ?? "").trim();
  if (!title) {
    return NextResponse.json(
      { ok: false, error: { code: "NO_TITLE", message: "지도 제목을 입력해 주세요." } },
      { status: 400 },
    );
  }
  const description = String(form.get("description") ?? "").trim();
  const valueLabel = String(form.get("value_label") ?? "").trim() || null;
  const valueUnit = String(form.get("value_unit") ?? "").trim() || null;
  const categoryLabel = String(form.get("category_label") ?? "").trim() || null;

  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = parseWorkbook(buf);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const sensitiveHeaders = detectSensitiveHeaders(parsed.headers);
  if (sensitiveHeaders.length > 0) {
    return NextResponse.json(
      { ok: false, error: { code: "SENSITIVE_HEADERS", message: sensitiveHeadersMessage(sensitiveHeaders) } },
      { status: 400 },
    );
  }

  const chain = defaultChainFromEnv();
  type Geocoded = {
    row_index: number;
    address_raw: string;
    address_normalized: string | null;
    lat: number;
    lng: number;
    name: string | null;
    value: number | null;
    category: string | null;
    extra: Record<string, unknown>;
    geocoder_used: string;
  };
  const successes: Geocoded[] = [];
  const failures: Array<{ row_index: number; address_raw: string; reason: string; attempted: string[] }> = [];
  const stats: Record<string, number> = {};

  // Bounded-concurrency geocoding pool over parsed.rows.
  const rows = parsed.rows;
  const total = rows.length;
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= total) return;
      const row = rows[i];
      const r = await chain.geocode(row.address_raw);
      if (r.ok) {
        successes.push({
          row_index: row.row_index,
          address_raw: row.address_raw,
          address_normalized: r.address_normalized,
          lat: r.lat,
          lng: r.lng,
          name: row.name,
          value: row.value,
          category: row.category,
          extra: row.extra,
          geocoder_used: r.provider,
        });
        stats[r.provider] = (stats[r.provider] ?? 0) + 1;
      } else {
        failures.push({
          row_index: row.row_index,
          address_raw: row.address_raw,
          reason: r.reason,
          attempted: r.attempted,
        });
      }
    }
  }
  await Promise.all(Array.from({ length: GEOCODE_CONCURRENCY }, () => worker()));

  if (successes.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "ALL_GEOCODE_FAILED",
          message: "모든 주소의 지오코딩에 실패했습니다. API 키와 주소 형식을 확인해 주세요.",
        },
      },
      { status: 422 },
    );
  }

  const sb = supabaseServer();
  const slug = generateSlug();
  const adminToken = generateAdminToken();
  const adminHash = hashAdminToken(adminToken, pepper);

  const { data: mapRow, error: mapErr } = await sb
    .from("maps")
    .insert({
      slug,
      admin_token_hash: adminHash,
      title,
      description,
      value_label: valueLabel,
      value_unit: valueUnit,
      category_label: categoryLabel,
      is_listed: true,
      source_file: file.name,
      geocoder_stats: stats,
    })
    .select("id")
    .single();

  if (mapErr || !mapRow) {
    return NextResponse.json(
      { ok: false, error: { code: "DB_INSERT_MAP", message: mapErr?.message ?? "지도 저장에 실패했습니다." } },
      { status: 500 },
    );
  }

  const mapId: string = mapRow.id;
  const markersPayload = successes.map((s) => ({ ...s, map_id: mapId }));

  // Insert markers in chunks to keep payload sizes reasonable.
  const CHUNK = 500;
  for (let i = 0; i < markersPayload.length; i += CHUNK) {
    const slice = markersPayload.slice(i, i + CHUNK);
    const { error } = await sb.from("markers").insert(slice);
    if (error) {
      // Roll back by deleting the map (cascades to any inserted markers).
      await sb.from("maps").delete().eq("id", mapId);
      return NextResponse.json(
        { ok: false, error: { code: "DB_INSERT_MARKERS", message: error.message } },
        { status: 500 },
      );
    }
  }

  if (failures.length > 0) {
    const failPayload = failures.map((f) => ({
      map_id: mapId,
      row_index: f.row_index,
      address_raw: f.address_raw,
      reason: f.reason,
      attempted_providers: f.attempted,
    }));
    for (let i = 0; i < failPayload.length; i += CHUNK) {
      await sb.from("geocode_failures").insert(failPayload.slice(i, i + CHUNK));
    }
  }

  await recordAudit({
    action: "map.create",
    mapId,
    req,
    details: {
      slug,
      inserted: successes.length,
      failed: failures.length,
      source_file: file.name,
      geocoder_stats: stats,
    },
  });

  return NextResponse.json({
    ok: true,
    slug,
    admin_token: adminToken,
    inserted: successes.length,
    failed: failures.length,
    geocoder_stats: stats,
    failure_preview: failures.slice(0, 10),
  });
}
