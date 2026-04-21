# 공픈클로 폴리시맵 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public self-service web tool where central-government officials upload an Excel of addresses and get an immediately shareable, interactive map URL plus a private admin URL.

**Architecture:** Next.js App Router on Vercel with Supabase (Postgres + Storage) for persistence. Excel is parsed client-side (SheetJS); geocoding runs server-side with a fallback chain (Kakao → VWorld → Juso) and a cache table. Maps are rendered with MapLibre GL JS over OpenStreetMap tiles. No user accounts — each map is owned by a random `admin_token` embedded in the management URL.

**Tech Stack:** Next.js 16 (App Router, TS, RSC), Tailwind v4, SheetJS (`xlsx`), MapLibre GL JS, Supercluster, Supabase JS v2, Vitest, Playwright, Sentry, `@vercel/og`.

**Spec:** `docs/superpowers/specs/2026-04-22-gonpunclaw-policymap-design.md`

---

## File Structure

```
gonpunclaw-policymap/
├── .env.example
├── .gitignore
├── next.config.ts
├── package.json
├── tsconfig.json
├── postcss.config.mjs
├── eslint.config.mjs
├── vitest.config.ts
├── playwright.config.ts
├── README.md
├── docs/superpowers/{specs,plans}/...
├── supabase/migrations/
│   ├── 0001_initial_schema.sql
│   └── 0002_indexes.sql
├── public/
│   └── template.xlsx               # static download
├── scripts/
│   └── generate-template.ts        # builds template.xlsx
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                # home + gallery
│   │   ├── globals.css
│   │   ├── new/page.tsx            # create flow
│   │   ├── m/[slug]/page.tsx       # viewer
│   │   ├── m/[slug]/admin/[token]/page.tsx
│   │   ├── staff/page.tsx
│   │   └── api/
│   │       ├── maps/route.ts                     # POST create
│   │       ├── maps/[id]/route.ts                # PATCH, DELETE
│   │       ├── maps/[id]/replace/route.ts        # POST replace data
│   │       ├── maps/[id]/failures/route.ts       # GET failures CSV
│   │       ├── og/[slug]/route.tsx               # OG image
│   │       ├── report/route.ts                   # POST report
│   │       └── staff/reports/route.ts            # staff list/act
│   ├── lib/
│   │   ├── supabase/server.ts
│   │   ├── supabase/types.ts
│   │   ├── excel/parse.ts
│   │   ├── excel/template.ts
│   │   ├── geocode/index.ts
│   │   ├── geocode/types.ts
│   │   ├── geocode/cache.ts
│   │   ├── geocode/kakao.ts
│   │   ├── geocode/vworld.ts
│   │   ├── geocode/juso.ts
│   │   ├── tokens.ts
│   │   ├── rate-limit.ts
│   │   └── admin-auth.ts
│   ├── components/
│   │   ├── map/MapView.tsx
│   │   ├── map/MarkerLayer.tsx
│   │   ├── map/Legend.tsx
│   │   ├── map/Filters.tsx
│   │   ├── upload/Dropzone.tsx
│   │   ├── upload/Preview.tsx
│   │   ├── upload/Progress.tsx
│   │   ├── gallery/Card.tsx
│   │   └── ui/{Button,Input,Dialog,Toggle}.tsx
│   └── types/index.ts
└── tests/
    ├── unit/
    │   ├── tokens.test.ts
    │   ├── excel-parse.test.ts
    │   ├── geocode-kakao.test.ts
    │   ├── geocode-vworld.test.ts
    │   ├── geocode-juso.test.ts
    │   ├── geocode-chain.test.ts
    │   └── admin-auth.test.ts
    ├── fixtures/
    │   └── excel/{valid_small.xlsx, bad_header.xlsx, empty.xlsx, oversize.xlsx}
    └── e2e/
        └── create-and-view.spec.ts
```

---

## Stage 1 — Foundation

### Task 1: Scaffold Next.js 16 project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `tailwind.config.ts`, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.env.example`, `README.md`

- [ ] **Step 1: Read `node_modules/next/dist/docs/` before starting** (per AGENTS.md rule)

Command (after install):
```bash
ls node_modules/next/dist/docs/ 2>/dev/null | head
```

If missing, proceed with current Next.js 16 conventions but flag deprecations via `npm run lint`.

- [ ] **Step 2: Initialize with `create-next-app`**

```bash
cd /Users/seohoseong/gonpunclaw-policymap
npx create-next-app@16 . --ts --tailwind --eslint --app --src-dir --turbopack --import-alias "@/*" --no-git
```

Confirm overwrite into existing directory containing only `docs/`.

- [ ] **Step 3: Add runtime dependencies**

```bash
npm install @supabase/supabase-js xlsx maplibre-gl supercluster @vercel/og nanoid
npm install -D @types/supercluster vitest @vitest/ui happy-dom @playwright/test tsx
```

- [ ] **Step 4: Configure `next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "3mb" },
  },
  images: { formats: ["image/avif", "image/webp"] },
};

export default nextConfig;
```

- [ ] **Step 5: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/unit/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

Also create empty `tests/unit/setup.ts`:
```typescript
import { beforeEach, vi } from "vitest";
beforeEach(() => vi.resetAllMocks());
```

- [ ] **Step 6: Add npm scripts in `package.json`**

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "gen:template": "tsx scripts/generate-template.ts"
}
```

- [ ] **Step 7: Create `.env.example`**

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Geocoders (tomorrow: Kakao / VWorld / Juso)
KAKAO_REST_API_KEY=
VWORLD_API_KEY=
JUSO_API_KEY=
GEOCODER_PRIORITY=kakao,vworld,juso

# Server pepper for admin_token hashing (openssl rand -hex 32)
ADMIN_TOKEN_PEPPER=

# Staff dashboard token
STAFF_DASHBOARD_TOKEN=

# Sentry (optional)
SENTRY_DSN=
```

- [ ] **Step 8: Verify build**

```bash
npm run build
```

Expected: Next.js build succeeds with default page.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 project with Tailwind, Vitest, Playwright"
```

---

### Task 2: Supabase schema migration

**Files:**
- Create: `supabase/migrations/0001_initial_schema.sql`
- Create: `supabase/migrations/0002_indexes.sql`

- [ ] **Step 1: Write `0001_initial_schema.sql`**

```sql
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

create table maps (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  admin_token_hash text not null,
  title text not null,
  description text default '',
  value_label text,
  value_unit text,
  category_label text,
  is_listed boolean not null default false,
  source_file text,
  geocoder_stats jsonb not null default '{}'::jsonb,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table markers (
  id uuid primary key default uuid_generate_v4(),
  map_id uuid not null references maps(id) on delete cascade,
  row_index int not null,
  address_raw text not null,
  address_normalized text,
  lat double precision not null,
  lng double precision not null,
  name text,
  value numeric,
  category text,
  extra jsonb not null default '{}'::jsonb,
  geocoder_used text not null
);

create table geocode_failures (
  id uuid primary key default uuid_generate_v4(),
  map_id uuid not null references maps(id) on delete cascade,
  row_index int not null,
  address_raw text not null,
  reason text not null,
  attempted_providers text[] not null default '{}'
);

create table geocode_cache (
  address_raw text primary key,
  address_normalized text,
  lat double precision not null,
  lng double precision not null,
  provider text not null,
  cached_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  map_id uuid references maps(id) on delete set null,
  action text not null,
  ip_hash text,
  user_agent text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default uuid_generate_v4(),
  map_id uuid not null references maps(id) on delete cascade,
  reason text not null,
  reporter_ip_hash text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table deleted_slugs (
  slug text primary key,
  deleted_at timestamptz not null default now()
);
```

- [ ] **Step 2: Write `0002_indexes.sql`**

```sql
create index maps_is_listed_created_at_idx on maps (is_listed, created_at desc);
create index maps_title_trgm_idx on maps using gin (title gin_trgm_ops);
create index markers_map_id_idx on markers (map_id);
create index geocode_failures_map_id_idx on geocode_failures (map_id);
create index reports_status_idx on reports (status, created_at desc);
```

- [ ] **Step 3: Apply in Supabase**

Manually via Supabase SQL editor (project must be created ahead of time — note URL and service role key in `.env.local`).

Verify:
```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```
Expected: `audit_log, deleted_slugs, geocode_cache, geocode_failures, maps, markers, reports`.

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat(db): initial schema with 7 tables and indexes"
```

---

### Task 3: Supabase client and types

**Files:**
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/types.ts`

- [ ] **Step 1: Define types in `src/lib/supabase/types.ts`**

```typescript
export interface MapRow {
  id: string;
  slug: string;
  admin_token_hash: string;
  title: string;
  description: string;
  value_label: string | null;
  value_unit: string | null;
  category_label: string | null;
  is_listed: boolean;
  source_file: string | null;
  geocoder_stats: Record<string, number>;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface MarkerRow {
  id: string;
  map_id: string;
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
}

export interface GeocodeCacheRow {
  address_raw: string;
  address_normalized: string | null;
  lat: number;
  lng: number;
  provider: string;
  cached_at: string;
}
```

- [ ] **Step 2: Write `src/lib/supabase/server.ts`**

```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function supabaseServer(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/
git commit -m "feat(db): add Supabase service-role client and row types"
```

---

### Task 4: Token utilities (slug + admin_token)

**Files:**
- Create: `src/lib/tokens.ts`
- Create: `tests/unit/tokens.test.ts`

- [ ] **Step 1: Write failing test `tests/unit/tokens.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import {
  generateSlug,
  generateAdminToken,
  hashAdminToken,
  verifyAdminToken,
  isReservedSlug,
} from "@/lib/tokens";

describe("generateSlug", () => {
  it("returns 8 lowercase alphanumeric chars", () => {
    const s = generateSlug();
    expect(s).toMatch(/^[a-z0-9]{8}$/);
  });
  it("rejects reserved words", () => {
    for (const r of ["admin", "api", "new", "m", "staff", "template"]) {
      expect(isReservedSlug(r)).toBe(true);
    }
    expect(isReservedSlug("a3f7k2m9")).toBe(false);
  });
});

describe("admin token", () => {
  it("generates 32-char URL-safe token", () => {
    const t = generateAdminToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });

  it("hash and verify roundtrip", () => {
    const pepper = "test-pepper";
    const t = generateAdminToken();
    const h = hashAdminToken(t, pepper);
    expect(verifyAdminToken(t, h, pepper)).toBe(true);
    expect(verifyAdminToken("wrong", h, pepper)).toBe(false);
  });

  it("different pepper fails verification", () => {
    const t = generateAdminToken();
    const h = hashAdminToken(t, "p1");
    expect(verifyAdminToken(t, h, "p2")).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- tokens
```
Expected: FAIL (no module).

- [ ] **Step 3: Implement `src/lib/tokens.ts`**

```typescript
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const RESERVED = new Set([
  "admin", "api", "new", "m", "staff", "template",
  "about", "help", "privacy", "terms", "sitemap",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug.toLowerCase());
}

export function generateSlug(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // no 0/1/l/o
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = randomBytes(8);
    let out = "";
    for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
    if (!isReservedSlug(out)) return out;
  }
  throw new Error("Could not generate non-reserved slug");
}

export function generateAdminToken(): string {
  return randomBytes(24).toString("base64url"); // 32 chars
}

export function hashAdminToken(token: string, pepper: string): string {
  return createHmac("sha256", pepper).update(token).digest("hex");
}

export function verifyAdminToken(token: string, hash: string, pepper: string): boolean {
  const computed = hashAdminToken(token, pepper);
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- tokens
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tokens.ts tests/unit/tokens.test.ts
git commit -m "feat(tokens): slug generator and HMAC-SHA256 admin token"
```

---

### Task 5: Excel template generator

**Files:**
- Create: `scripts/generate-template.ts`
- Create: `public/template.xlsx` (generated)

- [ ] **Step 1: Write `scripts/generate-template.ts`**

```typescript
import * as XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const rows = [
  ["주소", "이름", "값", "분류", "비고"],
  ["서울 서초구 반포대로 58", "서초복지관", 500000, "종합", "2026-04 개관"],
  ["부산 해운대구 센텀로 10", "해운대청년센터", 300000, "청년", ""],
  ["대전 유성구 대학로 99", "유성노인복지관", 420000, "노인", "리모델링 예정"],
];

const ws = XLSX.utils.aoa_to_sheet(rows);
ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 20 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "데이터");

const outDir = path.resolve(__dirname, "../public");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "template.xlsx");
XLSX.writeFile(wb, out);
console.log("Wrote", out);
```

- [ ] **Step 2: Run generator**

```bash
npm run gen:template
```
Expected output: `Wrote .../public/template.xlsx`.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-template.ts public/template.xlsx
git commit -m "feat(template): generate starter Excel template"
```

---

### Task 6: Excel parser (header-positional)

**Files:**
- Create: `src/lib/excel/parse.ts`
- Create: `tests/unit/excel-parse.test.ts`
- Create: `tests/fixtures/excel/valid_small.xlsx` (via script)
- Create: `tests/fixtures/excel/bad_header.xlsx`, `empty.xlsx`, `oversize.xlsx`

- [ ] **Step 1: Create fixture-generator `tests/fixtures/excel/build.ts`**

```typescript
import * as XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const here = __dirname;
mkdirSync(here, { recursive: true });

function write(name: string, rows: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  XLSX.writeFile(wb, path.join(here, name));
}

write("valid_small.xlsx", [
  ["주소", "이름", "값", "분류", "비고"],
  ["서울 서초구 반포대로 58", "서초복지관", 500000, "종합", ""],
  ["부산 해운대구 센텀로 10", "해운대센터", 300000, "청년", "테스트"],
]);
write("bad_header.xlsx", [
  ["location", "name"], ["서울", "x"],
]);
write("empty.xlsx", [["주소", "이름", "값", "분류"]]);
write("oversize.xlsx",
  [["주소", "이름"]].concat(
    Array.from({ length: 10_001 }, (_, i) => [`서울 row ${i}`, `n${i}`])
  )
);

console.log("fixtures written");
```

Run: `npx tsx tests/fixtures/excel/build.ts`

- [ ] **Step 2: Write failing test `tests/unit/excel-parse.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { parseWorkbook, ParsedRow } from "@/lib/excel/parse";
import { readFileSync } from "node:fs";
import path from "node:path";

const f = (n: string) =>
  readFileSync(path.resolve(__dirname, "../fixtures/excel", n));

describe("parseWorkbook", () => {
  it("parses valid template", () => {
    const r = parseWorkbook(f("valid_small.xlsx"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.headers).toEqual(["주소", "이름", "값", "분류", "비고"]);
    expect(r.rows).toHaveLength(2);
    const first = r.rows[0] as ParsedRow;
    expect(first.address_raw).toBe("서울 서초구 반포대로 58");
    expect(first.name).toBe("서초복지관");
    expect(first.value).toBe(500000);
    expect(first.category).toBe("종합");
  });

  it("rejects missing address column A", () => {
    const r = parseWorkbook(f("bad_header.xlsx"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("BAD_HEADER");
  });

  it("rejects empty data rows", () => {
    const r = parseWorkbook(f("empty.xlsx"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("NO_DATA");
  });

  it("rejects over 10000 rows", () => {
    const r = parseWorkbook(f("oversize.xlsx"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("TOO_MANY_ROWS");
  });
});
```

- [ ] **Step 3: Run — expect fail**

```bash
npm test -- excel-parse
```

- [ ] **Step 4: Implement `src/lib/excel/parse.ts`**

```typescript
import * as XLSX from "xlsx";

export interface ParsedRow {
  row_index: number;
  address_raw: string;
  name: string | null;
  value: number | null;
  category: string | null;
  extra: Record<string, unknown>;
}

export type ParseResult =
  | {
      ok: true;
      headers: string[];
      rows: ParsedRow[];
      skipped_empty_address: number[];
    }
  | { ok: false; error: { code: string; message: string } };

const MAX_ROWS = 10_000;

export function parseWorkbook(buf: ArrayBuffer | Uint8Array | Buffer): ParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer" });
  } catch {
    return { ok: false, error: { code: "CORRUPT", message: "엑셀 파일을 읽을 수 없습니다." } };
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { ok: false, error: { code: "NO_SHEET", message: "시트가 없습니다." } };

  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false });

  if (aoa.length === 0) return { ok: false, error: { code: "NO_DATA", message: "데이터가 없습니다." } };

  const headers = (aoa[0] as (string | null)[]).map((h) => (h ?? "").toString().trim());
  if (!headers[0]) {
    return { ok: false, error: { code: "BAD_HEADER", message: "A열(주소)은 필수입니다." } };
  }
  // Reject if column A does not look like an address column
  if (!/주소|소재지|도로명|address/i.test(headers[0])) {
    return {
      ok: false,
      error: { code: "BAD_HEADER", message: "A열 헤더는 '주소' 또는 '소재지' 같은 주소 컬럼이어야 합니다." },
    };
  }

  const dataRows = aoa.slice(1);
  if (dataRows.length === 0) return { ok: false, error: { code: "NO_DATA", message: "데이터 행이 없습니다." } };
  if (dataRows.length > MAX_ROWS) {
    return {
      ok: false,
      error: { code: "TOO_MANY_ROWS", message: `최대 ${MAX_ROWS}행까지 지원합니다.` },
    };
  }

  const rows: ParsedRow[] = [];
  const skipped: number[] = [];

  dataRows.forEach((row, i) => {
    const rowIndex = i + 2; // 1-based including header
    const addr = (row[0] ?? "").toString().trim();
    if (!addr) {
      skipped.push(rowIndex);
      return;
    }
    const name = row[1] != null ? String(row[1]).trim() : null;
    const rawVal = row[2];
    const value = typeof rawVal === "number" ? rawVal : rawVal != null && !isNaN(Number(rawVal)) ? Number(rawVal) : null;
    const category = row[3] != null ? String(row[3]).trim() : null;
    const extra: Record<string, unknown> = {};
    for (let c = 4; c < headers.length; c++) {
      if (row[c] != null && row[c] !== "") extra[headers[c] || `col_${c}`] = row[c];
    }
    rows.push({ row_index: rowIndex, address_raw: addr, name, value, category, extra });
  });

  if (rows.length === 0) {
    return { ok: false, error: { code: "NO_DATA", message: "유효한 주소가 없습니다." } };
  }
  return { ok: true, headers, rows, skipped_empty_address: skipped };
}
```

- [ ] **Step 5: Run — expect pass**

```bash
npm test -- excel-parse
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/excel/ tests/fixtures/excel/ tests/unit/excel-parse.test.ts
git commit -m "feat(excel): header-positional workbook parser with validation"
```

---

## Stage 2 — Geocoding

### Task 7: Geocoder types and cache access

**Files:**
- Create: `src/lib/geocode/types.ts`
- Create: `src/lib/geocode/cache.ts`

- [ ] **Step 1: Write types**

```typescript
// src/lib/geocode/types.ts
export interface GeocodeOk {
  ok: true;
  lat: number;
  lng: number;
  address_normalized: string;
  provider: "kakao" | "vworld" | "juso";
}
export interface GeocodeFail { ok: false; reason: string; }
export type GeocodeResult = GeocodeOk | GeocodeFail;

export interface Geocoder {
  readonly name: "kakao" | "vworld" | "juso";
  readonly enabled: boolean;
  geocode(address: string): Promise<GeocodeResult>;
}
```

- [ ] **Step 2: Write cache accessor**

```typescript
// src/lib/geocode/cache.ts
import { supabaseServer } from "@/lib/supabase/server";
import type { GeocodeOk } from "./types";

export async function cacheGet(address: string): Promise<GeocodeOk | null> {
  const sb = supabaseServer();
  const { data } = await sb.from("geocode_cache").select("*").eq("address_raw", address).maybeSingle();
  if (!data) return null;
  return {
    ok: true,
    lat: data.lat,
    lng: data.lng,
    address_normalized: data.address_normalized ?? address,
    provider: data.provider as "kakao" | "vworld" | "juso",
  };
}

export async function cacheSet(address: string, result: GeocodeOk): Promise<void> {
  const sb = supabaseServer();
  await sb.from("geocode_cache").upsert({
    address_raw: address,
    address_normalized: result.address_normalized,
    lat: result.lat,
    lng: result.lng,
    provider: result.provider,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/geocode/types.ts src/lib/geocode/cache.ts
git commit -m "feat(geocode): shared result types and Supabase cache accessor"
```

---

### Task 8: Kakao geocoder

**Files:**
- Create: `src/lib/geocode/kakao.ts`
- Create: `tests/unit/geocode-kakao.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { KakaoGeocoder } from "@/lib/geocode/kakao";

beforeEach(() => vi.restoreAllMocks());

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

describe("KakaoGeocoder", () => {
  it("returns lat/lng on match", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      json({ documents: [{ x: "127.0", y: "37.5", address_name: "서울 중구 세종대로 110" }] })
    );
    const g = new KakaoGeocoder("KEY");
    const r = await g.geocode("서울 중구 세종대로 110");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lat).toBe(37.5);
    expect(r.lng).toBe(127.0);
    expect(r.provider).toBe("kakao");
  });

  it("returns failure on no documents", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ documents: [] }));
    const r = await new KakaoGeocoder("KEY").geocode("없는주소");
    expect(r.ok).toBe(false);
  });

  it("treats 401/429 as failure with reason", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ msg: "unauth" }, 401));
    const r = await new KakaoGeocoder("KEY").geocode("x");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/401|unauth/i);
  });

  it("reports enabled=false without API key", () => {
    const g = new KakaoGeocoder("");
    expect(g.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- geocode-kakao
```

- [ ] **Step 3: Implement `src/lib/geocode/kakao.ts`**

```typescript
import type { Geocoder, GeocodeResult } from "./types";

export class KakaoGeocoder implements Geocoder {
  readonly name = "kakao" as const;
  readonly enabled: boolean;
  constructor(private readonly apiKey: string) {
    this.enabled = !!apiKey;
  }

  async geocode(address: string): Promise<GeocodeResult> {
    if (!this.enabled) return { ok: false, reason: "DISABLED" };
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}&size=1`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `KakaoAK ${this.apiKey}` } });
    } catch (e) {
      return { ok: false, reason: `NETWORK:${(e as Error).message}` };
    }
    if (!res.ok) return { ok: false, reason: `HTTP:${res.status}` };
    const json = (await res.json()) as { documents?: Array<{ x: string; y: string; address_name: string }> };
    const doc = json.documents?.[0];
    if (!doc) return { ok: false, reason: "NO_MATCH" };
    return {
      ok: true,
      lat: Number(doc.y),
      lng: Number(doc.x),
      address_normalized: doc.address_name,
      provider: "kakao",
    };
  }
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- geocode-kakao
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/geocode/kakao.ts tests/unit/geocode-kakao.test.ts
git commit -m "feat(geocode): Kakao Local API geocoder"
```

---

### Task 9: VWorld geocoder

**Files:**
- Create: `src/lib/geocode/vworld.ts`
- Create: `tests/unit/geocode-vworld.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VWorldGeocoder } from "@/lib/geocode/vworld";

beforeEach(() => vi.restoreAllMocks());

const vworldOk = {
  response: {
    status: "OK",
    result: { point: { x: "127.0", y: "37.5" }, refined: { text: "서울 중구 세종대로 110" } },
  },
};

describe("VWorldGeocoder", () => {
  it("parses road-address success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(vworldOk), { status: 200 })
    );
    const r = await new VWorldGeocoder("KEY").geocode("서울 중구 세종대로 110");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.provider).toBe("vworld");
  });

  it("falls back type=parcel if road fails, then fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: { status: "NOT_FOUND" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: { status: "NOT_FOUND" } })));
    const r = await new VWorldGeocoder("KEY").geocode("없음");
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `src/lib/geocode/vworld.ts`**

```typescript
import type { Geocoder, GeocodeResult } from "./types";

export class VWorldGeocoder implements Geocoder {
  readonly name = "vworld" as const;
  readonly enabled: boolean;
  constructor(private readonly apiKey: string) {
    this.enabled = !!apiKey;
  }

  async geocode(address: string): Promise<GeocodeResult> {
    if (!this.enabled) return { ok: false, reason: "DISABLED" };
    for (const type of ["road", "parcel"] as const) {
      const q = new URLSearchParams({
        service: "address",
        request: "getcoord",
        version: "2.0",
        crs: "epsg:4326",
        type,
        address,
        format: "json",
        key: this.apiKey,
      });
      let res: Response;
      try {
        res = await fetch(`https://api.vworld.kr/req/address?${q.toString()}`);
      } catch (e) {
        return { ok: false, reason: `NETWORK:${(e as Error).message}` };
      }
      if (!res.ok) continue;
      const j = (await res.json()) as {
        response: { status: string; result?: { point: { x: string; y: string }; refined?: { text?: string } } };
      };
      if (j.response.status === "OK" && j.response.result) {
        const p = j.response.result.point;
        return {
          ok: true,
          lat: Number(p.y),
          lng: Number(p.x),
          address_normalized: j.response.result.refined?.text ?? address,
          provider: "vworld",
        };
      }
    }
    return { ok: false, reason: "NO_MATCH" };
  }
}
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/geocode/vworld.ts tests/unit/geocode-vworld.test.ts
git commit -m "feat(geocode): VWorld geocoder with road→parcel fallback"
```

---

### Task 10: Juso geocoder

**Files:**
- Create: `src/lib/geocode/juso.ts`
- Create: `tests/unit/geocode-juso.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { JusoGeocoder } from "@/lib/geocode/juso";

beforeEach(() => vi.restoreAllMocks());

// Juso returns JSON but only normalizes address; coordinates require second coordinate API
// We ship the "coord" API fetch after normalize succeeds.

describe("JusoGeocoder", () => {
  it("normalizes then fetches coords", async () => {
    const normResp = {
      results: {
        common: { errorCode: "0", totalCount: "1" },
        juso: [{ roadAddr: "서울특별시 중구 세종대로 110", jibunAddr: "서울 중구 태평로1가 31", admCd: "1114010200", rnMgtSn: "111404166036", udrtYn: "0", buldMnnm: 110, buldSlno: 0 }],
      },
    };
    const coordResp = {
      results: {
        common: { errorCode: "0" },
        juso: [{ entX: "953425.123", entY: "1952112.456" }],
      },
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(normResp)))
      .mockResolvedValueOnce(new Response(JSON.stringify(coordResp)));
    const r = await new JusoGeocoder("KEY").geocode("서울 중구 세종대로 110");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.provider).toBe("juso");
  });

  it("reports no match", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ results: { common: { errorCode: "0", totalCount: "0" }, juso: [] } }))
    );
    const r = await new JusoGeocoder("KEY").geocode("없음");
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `src/lib/geocode/juso.ts`**

```typescript
import type { Geocoder, GeocodeResult } from "./types";

// Juso returns coordinates in EPSG:5179 (Korean grid). Convert to WGS84.
// For MVP we use a simple proj4 conversion via a precomputed helper.
import proj4 from "proj4";
proj4.defs("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");

const NORM_URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do";
const COORD_URL = "https://business.juso.go.kr/addrlink/addrCoordApi.do";

export class JusoGeocoder implements Geocoder {
  readonly name = "juso" as const;
  readonly enabled: boolean;
  constructor(private readonly apiKey: string) {
    this.enabled = !!apiKey;
  }

  async geocode(address: string): Promise<GeocodeResult> {
    if (!this.enabled) return { ok: false, reason: "DISABLED" };

    const normQ = new URLSearchParams({
      confmKey: this.apiKey,
      currentPage: "1",
      countPerPage: "1",
      keyword: address,
      resultType: "json",
    });
    let res: Response;
    try {
      res = await fetch(`${NORM_URL}?${normQ.toString()}`);
    } catch (e) {
      return { ok: false, reason: `NETWORK:${(e as Error).message}` };
    }
    if (!res.ok) return { ok: false, reason: `HTTP:${res.status}` };
    const norm = (await res.json()) as {
      results: { common: { errorCode: string; totalCount: string }; juso: Array<{ roadAddr: string; admCd: string; rnMgtSn: string; udrtYn: string; buldMnnm: number; buldSlno: number }> };
    };
    if (norm.results.common.errorCode !== "0") return { ok: false, reason: `JUSO:${norm.results.common.errorCode}` };
    const hit = norm.results.juso[0];
    if (!hit) return { ok: false, reason: "NO_MATCH" };

    const coordQ = new URLSearchParams({
      confmKey: this.apiKey,
      admCd: hit.admCd,
      rnMgtSn: hit.rnMgtSn,
      udrtYn: hit.udrtYn,
      buldMnnm: String(hit.buldMnnm),
      buldSlno: String(hit.buldSlno),
      resultType: "json",
    });
    const coordRes = await fetch(`${COORD_URL}?${coordQ.toString()}`);
    if (!coordRes.ok) return { ok: false, reason: `COORD_HTTP:${coordRes.status}` };
    const cj = (await coordRes.json()) as {
      results: { common: { errorCode: string }; juso: Array<{ entX: string; entY: string }> };
    };
    const pt = cj.results.juso?.[0];
    if (!pt) return { ok: false, reason: "NO_COORD" };
    const [lng, lat] = proj4("EPSG:5179", "WGS84", [Number(pt.entX), Number(pt.entY)]);
    return { ok: true, lat, lng, address_normalized: hit.roadAddr, provider: "juso" };
  }
}
```

Install dependency: `npm install proj4 && npm install -D @types/proj4`

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/geocode/juso.ts tests/unit/geocode-juso.test.ts package.json package-lock.json
git commit -m "feat(geocode): Juso road-address + coord API geocoder"
```

---

### Task 11: Geocoder chain with fallback

**Files:**
- Create: `src/lib/geocode/index.ts`
- Create: `tests/unit/geocode-chain.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { GeocoderChain } from "@/lib/geocode";
import type { Geocoder } from "@/lib/geocode/types";

function fakeGeocoder(name: Geocoder["name"], behavior: "ok" | "fail"): Geocoder {
  return {
    name,
    enabled: true,
    async geocode() {
      return behavior === "ok"
        ? { ok: true, lat: 1, lng: 2, address_normalized: "x", provider: name }
        : { ok: false, reason: "NO_MATCH" };
    },
  };
}

describe("GeocoderChain", () => {
  it("returns first success without calling later providers", async () => {
    const a = fakeGeocoder("kakao", "ok");
    const b = fakeGeocoder("vworld", "ok");
    const spy = vi.spyOn(b, "geocode");
    const chain = new GeocoderChain([a, b]);
    const r = await chain.geocode("x");
    expect(r.ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("falls back when first fails", async () => {
    const a = fakeGeocoder("kakao", "fail");
    const b = fakeGeocoder("vworld", "ok");
    const r = await new GeocoderChain([a, b]).geocode("x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provider).toBe("vworld");
  });

  it("reports attempted providers when all fail", async () => {
    const a = fakeGeocoder("kakao", "fail");
    const b = fakeGeocoder("vworld", "fail");
    const r = await new GeocoderChain([a, b]).geocode("x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.attempted).toEqual(["kakao", "vworld"]);
  });

  it("skips disabled providers", async () => {
    const a: Geocoder = { ...fakeGeocoder("kakao", "ok"), enabled: false };
    const b = fakeGeocoder("vworld", "ok");
    const r = await new GeocoderChain([a, b]).geocode("x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provider).toBe("vworld");
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `src/lib/geocode/index.ts`**

```typescript
import type { Geocoder, GeocodeResult, GeocodeOk } from "./types";
import { KakaoGeocoder } from "./kakao";
import { VWorldGeocoder } from "./vworld";
import { JusoGeocoder } from "./juso";
import { cacheGet, cacheSet } from "./cache";

export type ChainResult =
  | GeocodeOk
  | { ok: false; reason: string; attempted: Array<Geocoder["name"]> };

export class GeocoderChain {
  constructor(private readonly providers: Geocoder[]) {}

  async geocode(address: string, useCache = true): Promise<ChainResult> {
    if (useCache) {
      const cached = await cacheGet(address);
      if (cached) return cached;
    }
    const attempted: Array<Geocoder["name"]> = [];
    for (const p of this.providers) {
      if (!p.enabled) continue;
      attempted.push(p.name);
      const r = await p.geocode(address);
      if (r.ok) {
        if (useCache) await cacheSet(address, r);
        return r;
      }
    }
    return { ok: false, reason: "ALL_FAILED", attempted };
  }
}

export function defaultChainFromEnv(): GeocoderChain {
  const priority = (process.env.GEOCODER_PRIORITY ?? "kakao,vworld,juso").split(",").map((s) => s.trim());
  const all: Record<string, Geocoder> = {
    kakao: new KakaoGeocoder(process.env.KAKAO_REST_API_KEY ?? ""),
    vworld: new VWorldGeocoder(process.env.VWORLD_API_KEY ?? ""),
    juso: new JusoGeocoder(process.env.JUSO_API_KEY ?? ""),
  };
  const ordered = priority.map((n) => all[n]).filter(Boolean);
  return new GeocoderChain(ordered);
}
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/geocode/index.ts tests/unit/geocode-chain.test.ts
git commit -m "feat(geocode): fallback chain with cache and env-ordered priority"
```

---

## Stage 3 — API

### Task 12: Admin auth middleware

**Files:**
- Create: `src/lib/admin-auth.ts`
- Create: `tests/unit/admin-auth.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { id: "mid", admin_token_hash: "HASH" },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

describe("verifyAdminTokenForMap", () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN_PEPPER = "pepper";
  });

  it("returns map when token matches", async () => {
    const { hashAdminToken } = await import("@/lib/tokens");
    const tok = "abcd1234";
    const h = hashAdminToken(tok, "pepper");
    // re-mock with matching hash
    vi.doMock("@/lib/supabase/server", () => ({
      supabaseServer: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { id: "mid", admin_token_hash: h }, error: null }),
            }),
          }),
        }),
      }),
    }));
    vi.resetModules();
    const mod = await import("@/lib/admin-auth");
    const r = await mod.verifyAdminTokenForMap("slug", tok);
    expect(r.ok).toBe(true);
  });

  it("returns not-found when hash mismatches", async () => {
    const r = await verifyAdminTokenForMap("slug", "wrong");
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `src/lib/admin-auth.ts`**

```typescript
import { supabaseServer } from "@/lib/supabase/server";
import { verifyAdminToken } from "@/lib/tokens";

export type AuthResult =
  | { ok: true; mapId: string }
  | { ok: false; reason: "NOT_FOUND" | "MISSING_PEPPER" };

export async function verifyAdminTokenForMap(slug: string, token: string): Promise<AuthResult> {
  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  if (!pepper) return { ok: false, reason: "MISSING_PEPPER" };
  const sb = supabaseServer();
  const { data } = await sb.from("maps").select("id, admin_token_hash").eq("slug", slug).single();
  if (!data) return { ok: false, reason: "NOT_FOUND" };
  const ok = verifyAdminToken(token, data.admin_token_hash, pepper);
  if (!ok) return { ok: false, reason: "NOT_FOUND" }; // do not reveal existence
  return { ok: true, mapId: data.id };
}
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-auth.ts tests/unit/admin-auth.test.ts
git commit -m "feat(auth): admin token verification middleware"
```

---

### Task 13: Rate limiting

**Files:**
- Create: `src/lib/rate-limit.ts`

- [ ] **Step 1: Implement (in-memory LRU, sufficient for Vercel per-instance MVP)**

```typescript
// src/lib/rate-limit.ts
type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

export interface RateLimit {
  limit: number;
  windowMs: number;
}

export function rateLimit(key: string, cfg: RateLimit): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + cfg.windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (existing.count >= cfg.limit) {
    return { allowed: false, retryAfterMs: existing.resetAt - now };
  }
  existing.count++;
  return { allowed: true, retryAfterMs: 0 };
}

export function ipKey(req: Request, prefix: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `${prefix}:${ip}`;
}

export const LIMITS = {
  upload: { limit: 3, windowMs: 60 * 60 * 1000 }, // 3/hour
  adminAttempt: { limit: 5, windowMs: 10 * 60 * 1000 }, // 5/10min
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/rate-limit.ts
git commit -m "feat(limits): in-memory IP rate limiter for uploads and admin attempts"
```

---

### Task 14: POST /api/maps — create map with SSE progress

**Files:**
- Create: `src/app/api/maps/route.ts`
- Create: `src/types/index.ts`

- [ ] **Step 1: Add shared types**

```typescript
// src/types/index.ts
export type CreateMapResponse = {
  slug: string;
  admin_token: string;
  public_url: string;
  admin_url: string;
  success_count: number;
  failure_count: number;
  skipped_rows: number[];
  value_label: string | null;
  category_label: string | null;
};

export type ProgressEvent =
  | { type: "progress"; processed: number; total: number; failed: number }
  | { type: "done"; result: CreateMapResponse }
  | { type: "error"; message: string };
```

- [ ] **Step 2: Implement `src/app/api/maps/route.ts`**

```typescript
import { NextRequest } from "next/server";
import { parseWorkbook } from "@/lib/excel/parse";
import { generateSlug, generateAdminToken, hashAdminToken } from "@/lib/tokens";
import { defaultChainFromEnv } from "@/lib/geocode";
import { supabaseServer } from "@/lib/supabase/server";
import { rateLimit, ipKey, LIMITS } from "@/lib/rate-limit";
import type { ProgressEvent, CreateMapResponse } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<Response> {
  const rl = rateLimit(ipKey(req, "upload"), LIMITS.upload);
  if (!rl.allowed) {
    return Response.json({ error: "RATE_LIMIT", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const title = (form.get("title") ?? "").toString().trim();
  const description = (form.get("description") ?? "").toString().trim();
  const isListed = form.get("is_listed") === "true";

  if (!(file instanceof File)) return Response.json({ error: "NO_FILE" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return Response.json({ error: "FILE_TOO_LARGE" }, { status: 413 });
  if (!title) return Response.json({ error: "TITLE_REQUIRED" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = parseWorkbook(buf);
  if (!parsed.ok) return Response.json({ error: parsed.error.code, message: parsed.error.message }, { status: 400 });

  const sb = supabaseServer();
  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  if (!pepper) return Response.json({ error: "MISSING_PEPPER" }, { status: 500 });

  const slug = generateSlug();
  const adminToken = generateAdminToken();
  const adminHash = hashAdminToken(adminToken, pepper);
  const filePath = `excel/${slug}.xlsx`;
  await sb.storage.from("uploads").upload(filePath, buf, { contentType: file.type, upsert: true });

  const { error: insErr, data: mapRow } = await sb
    .from("maps")
    .insert({
      slug,
      admin_token_hash: adminHash,
      title,
      description,
      is_listed: isListed,
      value_label: parsed.headers[2] ?? null,
      category_label: parsed.headers[3] ?? null,
      source_file: filePath,
    })
    .select("id")
    .single();
  if (insErr || !mapRow) return Response.json({ error: "DB_INSERT" }, { status: 500 });

  const chain = defaultChainFromEnv();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (ev: ProgressEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      let success = 0;
      let failed = 0;
      const markerBatch: Array<Record<string, unknown>> = [];
      const failureBatch: Array<Record<string, unknown>> = [];

      for (let i = 0; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        const r = await chain.geocode(row.address_raw);
        if (r.ok) {
          success++;
          markerBatch.push({
            map_id: mapRow.id,
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
        } else {
          failed++;
          failureBatch.push({
            map_id: mapRow.id,
            row_index: row.row_index,
            address_raw: row.address_raw,
            reason: r.reason,
            attempted_providers: "attempted" in r ? r.attempted : [],
          });
        }
        if (i % 20 === 0) {
          push({ type: "progress", processed: i + 1, total: parsed.rows.length, failed });
        }
      }

      if (markerBatch.length) await sb.from("markers").insert(markerBatch);
      if (failureBatch.length) await sb.from("geocode_failures").insert(failureBatch);

      const statsByProvider: Record<string, number> = {};
      for (const m of markerBatch) {
        const p = (m.geocoder_used as string) ?? "unknown";
        statsByProvider[p] = (statsByProvider[p] ?? 0) + 1;
      }
      statsByProvider.failed = failed;
      await sb.from("maps").update({ geocoder_stats: statsByProvider, updated_at: new Date().toISOString() }).eq("id", mapRow.id);

      const origin = new URL(req.url).origin;
      const result: CreateMapResponse = {
        slug,
        admin_token: adminToken,
        public_url: `${origin}/m/${slug}`,
        admin_url: `${origin}/m/${slug}/admin/${adminToken}`,
        success_count: success,
        failure_count: failed,
        skipped_rows: parsed.skipped_empty_address,
        value_label: parsed.headers[2] ?? null,
        category_label: parsed.headers[3] ?? null,
      };
      push({ type: "done", result });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 3: Create `uploads` bucket in Supabase dashboard (private)**

Supabase → Storage → new bucket `uploads`, private.

- [ ] **Step 4: Manual smoke test**

With Supabase env set and at least `KAKAO_REST_API_KEY` populated, run dev server and POST a small Excel via `curl`:

```bash
npm run dev &
sleep 5
curl -N -X POST http://localhost:3000/api/maps \
  -F "file=@tests/fixtures/excel/valid_small.xlsx" \
  -F "title=테스트" \
  -F "is_listed=false"
```

Expected: SSE stream ending with `data: {"type":"done",...}`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/maps/route.ts src/types/index.ts
git commit -m "feat(api): POST /api/maps with SSE progress, rate limit, storage upload"
```

---

### Task 15: PATCH / DELETE / replace endpoints

**Files:**
- Create: `src/app/api/maps/[id]/route.ts`
- Create: `src/app/api/maps/[id]/replace/route.ts`
- Create: `src/app/api/maps/[id]/failures/route.ts`

- [ ] **Step 1: Implement PATCH/DELETE (`[id]/route.ts`). `[id]` here is the slug for UX.**

```typescript
import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: slug } = await ctx.params;
  const body = await req.json() as { admin_token: string; title?: string; description?: string; is_listed?: boolean };
  const auth = await verifyAdminTokenForMap(slug, body.admin_token);
  if (!auth.ok) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.description === "string") patch.description = body.description.trim();
  if (typeof body.is_listed === "boolean") patch.is_listed = body.is_listed;

  const sb = supabaseServer();
  const { error } = await sb.from("maps").update(patch).eq("id", auth.mapId);
  if (error) return Response.json({ error: "DB" }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: slug } = await ctx.params;
  const token = new URL(req.url).searchParams.get("admin_token") ?? "";
  const auth = await verifyAdminTokenForMap(slug, token);
  if (!auth.ok) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const sb = supabaseServer();
  const { data: map } = await sb.from("maps").select("source_file").eq("id", auth.mapId).single();
  await sb.from("maps").delete().eq("id", auth.mapId);
  await sb.from("deleted_slugs").insert({ slug });
  if (map?.source_file) await sb.storage.from("uploads").remove([map.source_file]);
  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Implement replace endpoint (`[id]/replace/route.ts`)**

```typescript
import { NextRequest } from "next/server";
import { parseWorkbook } from "@/lib/excel/parse";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";
import { defaultChainFromEnv } from "@/lib/geocode";
import { supabaseServer } from "@/lib/supabase/server";
import type { ProgressEvent } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: slug } = await ctx.params;
  const form = await req.formData();
  const token = (form.get("admin_token") ?? "").toString();
  const file = form.get("file");
  if (!(file instanceof File) || file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "BAD_FILE" }, { status: 400 });
  }
  const auth = await verifyAdminTokenForMap(slug, token);
  if (!auth.ok) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = parseWorkbook(buf);
  if (!parsed.ok) return Response.json({ error: parsed.error.code, message: parsed.error.message }, { status: 400 });

  const sb = supabaseServer();
  await sb.from("markers").delete().eq("map_id", auth.mapId);
  await sb.from("geocode_failures").delete().eq("map_id", auth.mapId);
  await sb.storage.from("uploads").upload(`excel/${slug}.xlsx`, buf, { upsert: true });

  const chain = defaultChainFromEnv();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (ev: ProgressEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      let success = 0;
      let failed = 0;
      const markers: Array<Record<string, unknown>> = [];
      const failures: Array<Record<string, unknown>> = [];

      for (let i = 0; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        const r = await chain.geocode(row.address_raw);
        if (r.ok) {
          success++;
          markers.push({
            map_id: auth.mapId,
            row_index: row.row_index,
            address_raw: row.address_raw,
            address_normalized: r.address_normalized,
            lat: r.lat, lng: r.lng,
            name: row.name, value: row.value, category: row.category, extra: row.extra,
            geocoder_used: r.provider,
          });
        } else {
          failed++;
          failures.push({
            map_id: auth.mapId, row_index: row.row_index, address_raw: row.address_raw,
            reason: r.reason, attempted_providers: "attempted" in r ? r.attempted : [],
          });
        }
        if (i % 20 === 0) push({ type: "progress", processed: i + 1, total: parsed.rows.length, failed });
      }

      if (markers.length) await sb.from("markers").insert(markers);
      if (failures.length) await sb.from("geocode_failures").insert(failures);

      const stats: Record<string, number> = { failed };
      for (const m of markers) stats[(m.geocoder_used as string)] = (stats[m.geocoder_used as string] ?? 0) + 1;
      await sb
        .from("maps")
        .update({
          geocoder_stats: stats,
          value_label: parsed.headers[2] ?? null,
          category_label: parsed.headers[3] ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", auth.mapId);

      const origin = new URL(req.url).origin;
      push({
        type: "done",
        result: {
          slug,
          admin_token: token,
          public_url: `${origin}/m/${slug}`,
          admin_url: `${origin}/m/${slug}/admin/${token}`,
          success_count: success, failure_count: failed, skipped_rows: parsed.skipped_empty_address,
          value_label: parsed.headers[2] ?? null, category_label: parsed.headers[3] ?? null,
        },
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
```

- [ ] **Step 3: Implement failures CSV (`[id]/failures/route.ts`)**

```typescript
import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: slug } = await ctx.params;
  const token = new URL(req.url).searchParams.get("admin_token") ?? "";
  const auth = await verifyAdminTokenForMap(slug, token);
  if (!auth.ok) return new Response("Not Found", { status: 404 });

  const sb = supabaseServer();
  const { data } = await sb.from("geocode_failures").select("*").eq("map_id", auth.mapId).order("row_index");
  const rows = data ?? [];
  const header = "row_index,address_raw,reason,attempted_providers\n";
  const body = rows.map((r) =>
    [r.row_index, JSON.stringify(r.address_raw), r.reason, (r.attempted_providers ?? []).join("|")].join(",")
  ).join("\n");
  return new Response(header + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="failures-${slug}.csv"`,
    },
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/maps/
git commit -m "feat(api): PATCH/DELETE/replace/failures endpoints with admin auth"
```

---

## Stage 4 — Create UI

### Task 16: /new page — upload and stream progress

**Files:**
- Create: `src/app/new/page.tsx`
- Create: `src/components/upload/Dropzone.tsx`
- Create: `src/components/upload/Preview.tsx`
- Create: `src/components/upload/Progress.tsx`

- [ ] **Step 1: Dropzone component**

```tsx
"use client";
import { useRef, useState } from "react";

export function Dropzone({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragging(false);
        const f = e.dataTransfer.files[0]; if (f) onFile(f);
      }}
      className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition
        ${dragging ? "border-blue-500 bg-blue-50" : "border-zinc-300"}`}
      onClick={() => input.current?.click()}
    >
      <p className="text-zinc-700">여기에 엑셀 파일을 끌어다 놓거나 클릭해 선택</p>
      <p className="text-xs text-zinc-500 mt-2">최대 2MB · 최대 10,000행</p>
      <input
        ref={input} type="file" className="hidden"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Preview component**

```tsx
"use client";
import type { ParsedRow } from "@/lib/excel/parse";

export function Preview({ headers, rows }: { headers: string[]; rows: ParsedRow[] }) {
  const sample = rows.slice(0, 3);
  return (
    <div className="mt-4 rounded border border-zinc-200">
      <div className="px-4 py-2 border-b text-sm text-zinc-600">
        총 {rows.length.toLocaleString()}행 · 샘플 {sample.length}행
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead className="bg-zinc-50">
            <tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {sample.map((r) => (
              <tr key={r.row_index} className="border-t">
                <td className="px-3 py-2">{r.address_raw}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.value}</td>
                <td className="px-3 py-2">{r.category}</td>
                {headers.slice(4).map((h) => (
                  <td key={h} className="px-3 py-2">{String(r.extra[h] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Progress component (SSE reader)**

```tsx
"use client";
export function Progress({ processed, total, failed }: { processed: number; total: number; failed: number }) {
  const pct = total === 0 ? 0 : Math.floor((processed / total) * 100);
  return (
    <div className="mt-4">
      <div className="h-2 bg-zinc-200 rounded">
        <div className="h-2 bg-blue-500 rounded transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-zinc-600">
        {processed.toLocaleString()} / {total.toLocaleString()}건 · 실패 {failed}건
      </p>
    </div>
  );
}
```

- [ ] **Step 4: /new page wiring**

```tsx
"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { Dropzone } from "@/components/upload/Dropzone";
import { Preview } from "@/components/upload/Preview";
import { Progress } from "@/components/upload/Progress";
import { parseWorkbook, type ParsedRow } from "@/lib/excel/parse";
import type { CreateMapResponse, ProgressEvent } from "@/types";

type Stage = "idle" | "previewed" | "uploading" | "done" | "error";

export default function NewPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isListed, setIsListed] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(0);
  const [result, setResult] = useState<CreateMapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(f: File) {
    setFile(f); setError(null);
    const buf = await f.arrayBuffer();
    const r = parseWorkbook(buf);
    if (!r.ok) { setError(r.error.message); setStage("error"); return; }
    setHeaders(r.headers); setRows(r.rows); setStage("previewed");
  }

  async function submit() {
    if (!file || !title.trim()) return;
    setStage("uploading"); setProcessed(0); setTotal(rows.length); setFailed(0);
    const fd = new FormData();
    fd.append("file", file); fd.append("title", title); fd.append("description", description);
    fd.append("is_listed", String(isListed));
    const res = await fetch("/api/maps", { method: "POST", body: fd });
    if (!res.ok || !res.body) {
      const msg = res.status === 429 ? "잠시 후 다시 시도해 주세요." : "업로드 실패";
      setError(msg); setStage("error"); return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const idx = buffer.indexOf("\n\n"); if (idx < 0) break;
        const chunk = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const ev = JSON.parse(line.slice(6)) as ProgressEvent;
        if (ev.type === "progress") { setProcessed(ev.processed); setTotal(ev.total); setFailed(ev.failed); }
        else if (ev.type === "done") { setResult(ev.result); setStage("done"); }
        else if (ev.type === "error") { setError(ev.message); setStage("error"); }
      }
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">새 지도 만들기</h1>
      <p className="mt-1 text-sm text-zinc-600">
        엑셀 템플릿을 먼저 받아 주소를 채워 올려 주세요.{" "}
        <a href="/template.xlsx" className="text-blue-600 underline">템플릿 다운로드</a>
      </p>

      {stage === "idle" && <div className="mt-6"><Dropzone onFile={handleFile} /></div>}

      {stage === "previewed" && (
        <>
          <Preview headers={headers} rows={rows} />
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm">지도 제목 *</span>
              <input className="mt-1 w-full border rounded px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm">설명</span>
              <textarea className="mt-1 w-full border rounded px-3 py-2" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isListed} onChange={(e) => setIsListed(e.target.checked)} />
              <span className="text-sm">공개 갤러리에 노출</span>
            </label>
            <button onClick={submit} disabled={!title.trim()} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
              지도 만들기
            </button>
          </div>
        </>
      )}

      {stage === "uploading" && <Progress processed={processed} total={total} failed={failed} />}

      {stage === "done" && result && (
        <div className="mt-6 p-4 border rounded bg-green-50">
          <p>✅ {result.success_count.toLocaleString()}개 성공 / {result.failure_count}개 실패</p>
          <div className="mt-3 space-y-2 text-sm">
            <div><b>공유 URL:</b> <a href={result.public_url} className="text-blue-600 underline">{result.public_url}</a></div>
            <div><b>관리 URL (공유 금지):</b> <a href={result.admin_url} className="text-red-600 underline">{result.admin_url}</a></div>
            {result.failure_count > 0 && (
              <a className="text-blue-600 underline" href={`/api/maps/${result.slug}/failures?admin_token=${result.admin_token}`}>
                실패 주소 CSV 다운로드
              </a>
            )}
          </div>
        </div>
      )}

      {stage === "error" && error && <p className="mt-4 text-red-600">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 5: Manual verify**

```bash
npm run dev
# visit http://localhost:3000/new
# upload tests/fixtures/excel/valid_small.xlsx → see progress → see URLs
```

- [ ] **Step 6: Commit**

```bash
git add src/app/new src/components/upload
git commit -m "feat(ui): /new upload page with preview, SSE progress, result URLs"
```

---

## Stage 5 — Viewer

### Task 17: MapView component with markers and clustering

**Files:**
- Create: `src/components/map/MapView.tsx`
- Create: `src/components/map/MarkerLayer.tsx`

- [ ] **Step 1: MapView shell (MapLibre init)**

```tsx
"use client";
import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapViewProps {
  center?: [number, number];
  zoom?: number;
  onReady?: (map: MLMap) => void;
}

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
} as const;

export function MapView({ center = [127.77, 36.2], zoom = 6, onReady }: MapViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: OSM_STYLE as maplibregl.StyleSpecification,
      center, zoom,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("load", () => onReady?.(map));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [center, zoom, onReady]);

  return <div ref={ref} className="w-full h-full" />;
}
```

- [ ] **Step 2: MarkerLayer using MapLibre native cluster + colored circles**

```tsx
"use client";
import { useEffect } from "react";
import type { Map as MLMap } from "maplibre-gl";
import maplibregl from "maplibre-gl";

export interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  name: string | null;
  value: number | null;
  category: string | null;
  address_normalized: string | null;
  extra: Record<string, unknown>;
}

export interface MarkerLayerProps {
  map: MLMap | null;
  markers: MarkerData[];
  valueLabel: string | null;
  categoryLabel: string | null;
  filterCategories: Set<string> | null;
  valueRange: [number, number] | null;
}

const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b", "#a855f7", "#22c55e", "#3b82f6"];

export function MarkerLayer({ map, markers, valueLabel, categoryLabel, filterCategories, valueRange }: MarkerLayerProps) {
  useEffect(() => {
    if (!map) return;
    const srcId = "markers-src";
    const filtered = markers.filter((m) => {
      if (filterCategories && m.category && !filterCategories.has(m.category)) return false;
      if (valueRange && m.value != null && (m.value < valueRange[0] || m.value > valueRange[1])) return false;
      return true;
    });

    const categories = Array.from(new Set(markers.map((m) => m.category).filter((c): c is string => !!c)));
    const catColor: Record<string, string> = {};
    categories.forEach((c, i) => (catColor[c] = PALETTE[i % PALETTE.length]));

    const values = markers.map((m) => m.value ?? 0);
    const vMin = Math.min(...values, 0);
    const vMax = Math.max(...values, 1);
    const radius = (v: number | null) => {
      if (v == null || vMax === vMin) return 8;
      return 8 + ((v - vMin) / (vMax - vMin)) * 16;
    };

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: filtered.map((m) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [m.lng, m.lat] },
        properties: {
          id: m.id,
          name: m.name ?? "",
          address: m.address_normalized ?? "",
          value: m.value ?? null,
          category: m.category ?? "",
          color: m.category ? catColor[m.category] : "#2563eb",
          radius: radius(m.value),
          extra: JSON.stringify(m.extra ?? {}),
        },
      })),
    };

    const existing = map.getSource(srcId) as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(geojson);
    } else {
      map.addSource(srcId, { type: "geojson", data: geojson, cluster: true, clusterRadius: 40, clusterMaxZoom: 12 });
      map.addLayer({
        id: "clusters", type: "circle", source: srcId, filter: ["has", "point_count"],
        paint: {
          "circle-color": "#2563eb",
          "circle-radius": ["step", ["get", "point_count"], 16, 50, 22, 200, 28],
          "circle-opacity": 0.75,
        },
      });
      map.addLayer({
        id: "cluster-count", type: "symbol", source: srcId, filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
        paint: { "text-color": "#fff" },
      });
      map.addLayer({
        id: "points", type: "circle", source: srcId, filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["get", "radius"],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1,
        },
      });

      map.on("click", "points", (e) => {
        const f = e.features?.[0]; if (!f) return;
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        const p = f.properties as Record<string, string>;
        const extraObj = JSON.parse(p.extra || "{}") as Record<string, unknown>;
        const extraHtml = Object.entries(extraObj).map(([k, v]) => `<div><b>${k}:</b> ${String(v)}</div>`).join("");
        const valHtml = p.value && p.value !== "null" ? `<div><b>${valueLabel ?? "값"}:</b> ${Number(p.value).toLocaleString()}</div>` : "";
        const catHtml = p.category ? `<div><b>${categoryLabel ?? "분류"}:</b> ${p.category}</div>` : "";
        new maplibregl.Popup().setLngLat([lng, lat]).setHTML(
          `<div class="text-sm">
            <div class="font-semibold">${p.name || p.address}</div>
            <div class="text-zinc-500">${p.address}</div>
            ${valHtml}${catHtml}${extraHtml}
          </div>`
        ).addTo(map);
      });

      map.on("click", "clusters", (e) => {
        const f = e.features?.[0]; if (!f) return;
        const src = map.getSource(srcId) as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom((f.properties as { cluster_id: number }).cluster_id).then((zoom) => {
          map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
        });
      });
      map.on("mouseenter", "points", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "points", () => (map.getCanvas().style.cursor = ""));
    }

    if (filtered.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const m of filtered) bounds.extend([m.lng, m.lat]);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 500 });
    }
  }, [map, markers, valueLabel, categoryLabel, filterCategories, valueRange]);

  return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/map
git commit -m "feat(map): MapLibre MapView and clustered MarkerLayer with popups"
```

---

### Task 18: Filters and Legend

**Files:**
- Create: `src/components/map/Filters.tsx`
- Create: `src/components/map/Legend.tsx`

- [ ] **Step 1: Filters**

```tsx
"use client";
import { useMemo } from "react";

export function Filters({
  categories, valueRange, valueLabel, categoryLabel,
  selectedCategories, setSelectedCategories,
  currentValueRange, setCurrentValueRange,
  total,
}: {
  categories: { name: string; count: number }[];
  valueRange: [number, number] | null;
  valueLabel: string | null;
  categoryLabel: string | null;
  selectedCategories: Set<string> | null;
  setSelectedCategories: (s: Set<string> | null) => void;
  currentValueRange: [number, number] | null;
  setCurrentValueRange: (r: [number, number] | null) => void;
  total: number;
}) {
  const selected = useMemo(() => selectedCategories ?? new Set(categories.map((c) => c.name)), [selectedCategories, categories]);
  return (
    <div className="space-y-4">
      {categories.length > 0 && (
        <section>
          <h3 className="text-sm font-medium">{categoryLabel ?? "분류"}</h3>
          <ul className="mt-2 space-y-1">
            {categories.map((c) => (
              <li key={c.name}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.has(c.name)} onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(c.name); else next.delete(c.name);
                    setSelectedCategories(next.size === categories.length ? null : next);
                  }} />
                  <span>{c.name}</span>
                  <span className="ml-auto text-zinc-500">{c.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      {valueRange && (
        <section>
          <h3 className="text-sm font-medium">{valueLabel ?? "값"} 범위</h3>
          <div className="mt-2 text-xs text-zinc-600">
            {(currentValueRange ?? valueRange)[0].toLocaleString()} ~ {(currentValueRange ?? valueRange)[1].toLocaleString()}
          </div>
          <input type="range" min={valueRange[0]} max={valueRange[1]}
            value={(currentValueRange ?? valueRange)[0]}
            onChange={(e) => {
              const lo = Number(e.target.value); const hi = (currentValueRange ?? valueRange)[1];
              setCurrentValueRange([Math.min(lo, hi), hi]);
            }} className="w-full" />
          <input type="range" min={valueRange[0]} max={valueRange[1]}
            value={(currentValueRange ?? valueRange)[1]}
            onChange={(e) => {
              const hi = Number(e.target.value); const lo = (currentValueRange ?? valueRange)[0];
              setCurrentValueRange([lo, Math.max(lo, hi)]);
            }} className="w-full" />
        </section>
      )}
      <p className="text-xs text-zinc-500">총 {total.toLocaleString()}곳</p>
    </div>
  );
}
```

- [ ] **Step 2: Legend**

```tsx
"use client";
const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b", "#a855f7", "#22c55e", "#3b82f6"];
export function Legend({ categories, valueLabel }: { categories: string[]; valueLabel: string | null }) {
  return (
    <div className="space-y-2 text-xs">
      {categories.length > 0 && (
        <div className="space-y-1">
          {categories.map((c, i) => (
            <div key={c} className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}
      {valueLabel && <p>크기 = {valueLabel}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/map/Filters.tsx src/components/map/Legend.tsx
git commit -m "feat(map): category filter, value range slider, legend"
```

---

### Task 19: Viewer page `/m/[slug]`

**Files:**
- Create: `src/app/m/[slug]/page.tsx`

- [ ] **Step 1: Implement server-rendered viewer**

```tsx
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { MapView } from "@/components/map/MapView";
import { MarkerLayer, type MarkerData } from "@/components/map/MarkerLayer";
import { Filters } from "@/components/map/Filters";
import { Legend } from "@/components/map/Legend";
import type { Metadata } from "next";
import { ViewerShell } from "./viewer-shell";

async function loadMap(slug: string) {
  const sb = supabaseServer();
  const { data: map } = await sb.from("maps").select("id, slug, title, description, value_label, category_label, is_listed").eq("slug", slug).single();
  if (!map) return null;
  // fire-and-forget atomic increment via RPC (defined in migration 0003)
  void sb.rpc("increment_view_count", { p_map_id: map.id });
  const { data: markers } = await sb.from("markers").select("id, lat, lng, name, value, category, address_normalized, extra").eq("map_id", map.id);
  return { map, markers: (markers ?? []) as MarkerData[] };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadMap(slug);
  if (!loaded) return {};
  return {
    title: loaded.map.title,
    description: loaded.map.description ?? undefined,
    openGraph: { title: loaded.map.title, images: [{ url: `/api/og/${slug}` }] },
  };
}

export default async function ViewerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loaded = await loadMap(slug);
  if (!loaded) notFound();
  return <ViewerShell map={loaded.map} markers={loaded.markers} />;
}
```

- [ ] **Step 2: Client shell `src/app/m/[slug]/viewer-shell.tsx`**

```tsx
"use client";
import { useMemo, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { MapView } from "@/components/map/MapView";
import { MarkerLayer, type MarkerData } from "@/components/map/MarkerLayer";
import { Filters } from "@/components/map/Filters";
import { Legend } from "@/components/map/Legend";

export function ViewerShell({ map, markers }: {
  map: { slug: string; title: string; description: string; value_label: string | null; category_label: string | null };
  markers: MarkerData[];
}) {
  const [mlMap, setMlMap] = useState<MLMap | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string> | null>(null);
  const categoryStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const mk of markers) if (mk.category) m.set(mk.category, (m.get(mk.category) ?? 0) + 1);
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [markers]);
  const values = markers.map((m) => m.value).filter((v): v is number => v != null);
  const valueRange: [number, number] | null = values.length ? [Math.min(...values), Math.max(...values)] : null;
  const [currentValueRange, setCurrentValueRange] = useState<[number, number] | null>(null);

  return (
    <main className="h-dvh grid grid-cols-[320px_1fr] max-md:grid-cols-1">
      <aside className="p-4 border-r overflow-y-auto max-md:border-r-0 max-md:border-b">
        <h1 className="text-lg font-semibold">{map.title}</h1>
        {map.description && <p className="mt-1 text-sm text-zinc-600 whitespace-pre-line">{map.description}</p>}
        <div className="mt-4">
          <Filters
            categories={categoryStats}
            valueRange={valueRange}
            valueLabel={map.value_label}
            categoryLabel={map.category_label}
            selectedCategories={selectedCategories}
            setSelectedCategories={setSelectedCategories}
            currentValueRange={currentValueRange}
            setCurrentValueRange={setCurrentValueRange}
            total={markers.length}
          />
        </div>
        <div className="mt-6">
          <h3 className="text-sm font-medium">범례</h3>
          <Legend categories={categoryStats.map((c) => c.name)} valueLabel={map.value_label} />
        </div>
      </aside>
      <section className="relative">
        <MapView onReady={setMlMap} />
        <MarkerLayer map={mlMap} markers={markers} valueLabel={map.value_label} categoryLabel={map.category_label}
          filterCategories={selectedCategories} valueRange={currentValueRange} />
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Manual verify**

Create a map via `/new`, then open `/m/{slug}`. Verify markers render, filters work, popups show.

- [ ] **Step 4: Commit**

```bash
git add src/app/m
git commit -m "feat(ui): viewer page at /m/[slug] with SSR metadata and client shell"
```

---

### Task 20: OG image endpoint

**Files:**
- Create: `src/app/api/og/[slug]/route.tsx`

- [ ] **Step 1: Implement with `@vercel/og`**

```tsx
import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const sb = supabaseServer();
  const { data: map } = await sb.from("maps").select("id, title, description").eq("slug", slug).single();
  if (!map) return new Response("not found", { status: 404 });
  const { count } = await sb.from("markers").select("id", { count: "exact", head: true }).eq("map_id", map.id);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0f172a", color: "#fff", padding: 48 }}>
        <div style={{ fontSize: 24, color: "#93c5fd" }}>공픈클로 폴리시맵</div>
        <div style={{ fontSize: 56, marginTop: 16, fontWeight: 700 }}>{map.title}</div>
        {map.description && <div style={{ fontSize: 24, marginTop: 12, color: "#cbd5e1" }}>{map.description}</div>}
        <div style={{ marginTop: "auto", fontSize: 28, color: "#f59e0b" }}>마커 {count ?? 0}개</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/og
git commit -m "feat(og): /api/og/[slug] preview card"
```

---

## Stage 6 — Admin Page

### Task 21: Admin page `/m/[slug]/admin/[token]`

**Files:**
- Create: `src/app/m/[slug]/admin/[token]/page.tsx`

- [ ] **Step 1: Implement server + client wiring**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [token, setToken] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isListed, setIsListed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useState(() => {
    params.then(async (p) => {
      setSlug(p.slug); setToken(p.token);
      const res = await fetch(`/api/maps/${p.slug}/admin-view?admin_token=${encodeURIComponent(p.token)}`);
      if (!res.ok) { setMsg("관리 URL이 올바르지 않습니다."); return; }
      const data = await res.json() as { title: string; description: string; is_listed: boolean };
      setTitle(data.title); setDescription(data.description); setIsListed(data.is_listed);
    });
  });

  async function save() {
    const res = await fetch(`/api/maps/${slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ admin_token: token, title, description, is_listed: isListed }),
    });
    setMsg(res.ok ? "저장됨" : "저장 실패");
  }

  async function replace(file: File) {
    const fd = new FormData();
    fd.append("file", file); fd.append("admin_token", token);
    const res = await fetch(`/api/maps/${slug}/replace`, { method: "POST", body: fd });
    setMsg(res.ok ? "데이터 교체 완료" : "교체 실패");
  }

  async function del() {
    const res = await fetch(`/api/maps/${slug}?admin_token=${encodeURIComponent(token)}`, { method: "DELETE" });
    if (res.ok) router.push("/"); else setMsg("삭제 실패");
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <p className="text-sm bg-amber-100 border border-amber-300 rounded px-3 py-2">⚠️ 이 URL은 공유하지 마세요.</p>
      <h1 className="mt-4 text-2xl font-semibold">관리 페이지</h1>
      <a className="text-blue-600 underline text-sm" href={`/m/${slug}`} target="_blank">공개 지도 보기</a>

      <section className="mt-6 space-y-3">
        <label className="block"><span className="text-sm">제목</span>
          <input className="mt-1 w-full border rounded px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block"><span className="text-sm">설명</span>
          <textarea className="mt-1 w-full border rounded px-3 py-2" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isListed} onChange={(e) => setIsListed(e.target.checked)} />
          <span className="text-sm">공개 갤러리에 노출</span>
        </label>
        <button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded">저장</button>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-medium">데이터 교체</h2>
        <input type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) replace(f); }} />
        <p className="text-xs text-zinc-500">기존 마커를 새 파일로 덮어씁니다. 슬러그는 유지됩니다.</p>
      </section>

      <section className="mt-8">
        <a className="text-blue-600 underline text-sm" href={`/api/maps/${slug}/failures?admin_token=${encodeURIComponent(token)}`}>
          실패 주소 CSV 다운로드
        </a>
      </section>

      <section className="mt-8 p-4 border border-red-200 rounded">
        <h3 className="font-medium text-red-700">위험 구역</h3>
        {!confirmingDelete ? (
          <button onClick={() => setConfirmingDelete(true)} className="mt-2 px-3 py-1 border border-red-500 text-red-600 rounded">지도 삭제</button>
        ) : (
          <div className="mt-2 space-x-2">
            <span className="text-sm">정말 삭제하시겠어요?</span>
            <button onClick={del} className="px-3 py-1 bg-red-600 text-white rounded">예, 삭제</button>
            <button onClick={() => setConfirmingDelete(false)} className="px-3 py-1 border rounded">취소</button>
          </div>
        )}
      </section>

      {msg && <p className="mt-4 text-sm">{msg}</p>}
    </main>
  );
}
```

- [ ] **Step 2: Add `admin-view` read endpoint — `src/app/api/maps/[id]/admin-view/route.ts`**

```typescript
import { NextRequest } from "next/server";
import { verifyAdminTokenForMap } from "@/lib/admin-auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: slug } = await ctx.params;
  const token = new URL(req.url).searchParams.get("admin_token") ?? "";
  const auth = await verifyAdminTokenForMap(slug, token);
  if (!auth.ok) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const sb = supabaseServer();
  const { data } = await sb.from("maps").select("title, description, is_listed, geocoder_stats, created_at, updated_at").eq("id", auth.mapId).single();
  return Response.json(data ?? {});
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/m/[slug]/admin src/app/api/maps/[id]/admin-view
git commit -m "feat(ui): admin page with edit/replace/delete flows"
```

---

## Stage 7 — Home, Gallery, Reports

### Task 22: Home page with gallery

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/gallery/Card.tsx`

- [ ] **Step 1: Card component**

```tsx
import Link from "next/link";

export function GalleryCard({ slug, title, description, markerCount, updatedAt }: {
  slug: string; title: string; description: string; markerCount: number; updatedAt: string;
}) {
  return (
    <Link href={`/m/${slug}`} className="block border rounded-lg overflow-hidden hover:shadow">
      <div className="aspect-[2/1] bg-zinc-100">
        <img src={`/api/og/${slug}`} alt="" className="w-full h-full object-cover" loading="lazy" />
      </div>
      <div className="p-3">
        <div className="font-medium truncate">{title}</div>
        {description && <div className="text-xs text-zinc-500 truncate">{description}</div>}
        <div className="mt-1 text-xs text-zinc-500">마커 {markerCount.toLocaleString()} · {new Date(updatedAt).toLocaleDateString("ko-KR")}</div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Home page**

```tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { GalleryCard } from "@/components/gallery/Card";

async function loadGallery() {
  const sb = supabaseServer();
  const { data } = await sb
    .from("maps")
    .select("slug, title, description, updated_at, id")
    .eq("is_listed", true)
    .order("updated_at", { ascending: false })
    .limit(24);
  if (!data) return [];
  const ids = data.map((m) => m.id);
  const { data: counts } = await sb.rpc("marker_counts_by_map", { map_ids: ids }).catch(() => ({ data: [] as Array<{ map_id: string; n: number }> }));
  const countMap = new Map((counts ?? []).map((c: { map_id: string; n: number }) => [c.map_id, c.n]));
  return data.map((m) => ({ ...m, markerCount: countMap.get(m.id) ?? 0 }));
}

export default async function Home() {
  const maps = await loadGallery();
  return (
    <main className="max-w-6xl mx-auto p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">공픈클로 폴리시맵</h1>
        <Link href="/new" className="px-4 py-2 bg-blue-600 text-white rounded">새 지도 만들기</Link>
      </header>
      <section className="mt-10 text-center">
        <h2 className="text-3xl font-semibold">세상에 이슈가 생길 때마다, 주소만 있으면 지도가 됩니다.</h2>
        <div className="mt-6 flex gap-3 justify-center">
          <a href="/template.xlsx" className="px-4 py-2 border rounded">📥 엑셀 템플릿 받기</a>
          <Link href="/new" className="px-4 py-2 bg-blue-600 text-white rounded">🚀 지도 만들기</Link>
        </div>
      </section>

      <section className="mt-12">
        <h3 className="font-medium">최근 공개 지도</h3>
        {maps.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">공개된 지도가 아직 없습니다.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {maps.map((m) => (
              <GalleryCard key={m.slug} slug={m.slug} title={m.title} description={m.description} markerCount={m.markerCount} updatedAt={m.updated_at} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-12 text-sm text-zinc-600">
        <h3 className="font-medium text-zinc-900">이용 안내</h3>
        <ol className="mt-2 list-decimal pl-5 space-y-1">
          <li>엑셀 템플릿을 받아 주소를 채워 주세요.</li>
          <li>업로드하면 자동으로 지오코딩됩니다.</li>
          <li>공유 URL과 관리 URL을 받습니다. 관리 URL은 분실하면 복구할 수 없으니 잘 보관하세요.</li>
        </ol>
      </section>
      <footer className="mt-16 text-xs text-zinc-500 border-t pt-4">© 2026 공픈클로</footer>
    </main>
  );
}
```

- [ ] **Step 3: Add Postgres RPCs in migration `0003_rpc.sql`**

```sql
create or replace function marker_counts_by_map(map_ids uuid[])
returns table (map_id uuid, n bigint)
language sql stable as $$
  select map_id, count(*)::bigint as n
  from markers
  where map_id = any(map_ids)
  group by map_id
$$;

create or replace function increment_view_count(p_map_id uuid)
returns void
language sql as $$
  update maps set view_count = view_count + 1 where id = p_map_id
$$;
```

Apply in Supabase SQL editor.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/components/gallery supabase/migrations/0003_rpc.sql
git commit -m "feat(home): gallery of public maps with OG thumbnails"
```

---

### Task 23: Report + /staff moderation

**Files:**
- Create: `src/app/api/report/route.ts`
- Create: `src/app/staff/page.tsx`
- Create: `src/app/api/staff/reports/route.ts`

- [ ] **Step 1: Report submit endpoint**

```typescript
// src/app/api/report/route.ts
import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { createHash } from "node:crypto";

export async function POST(req: NextRequest): Promise<Response> {
  const { slug, reason } = await req.json() as { slug: string; reason: string };
  if (!slug || !reason || reason.length > 500) return Response.json({ error: "BAD_INPUT" }, { status: 400 });
  const sb = supabaseServer();
  const { data: map } = await sb.from("maps").select("id").eq("slug", slug).single();
  if (!map) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = createHash("sha256").update(ip).digest("hex");
  await sb.from("reports").insert({ map_id: map.id, reason, reporter_ip_hash: ipHash });
  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Staff list/act endpoint**

```typescript
// src/app/api/staff/reports/route.ts
import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function staffOk(req: NextRequest) {
  const t = req.headers.get("x-staff-token");
  return t && t === process.env.STAFF_DASHBOARD_TOKEN;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!staffOk(req)) return new Response("forbidden", { status: 403 });
  const sb = supabaseServer();
  const { data } = await sb.from("reports")
    .select("id, reason, status, created_at, map_id, maps ( slug, title, is_listed )")
    .eq("status", "pending")
    .order("created_at");
  return Response.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!staffOk(req)) return new Response("forbidden", { status: 403 });
  const { id, action } = await req.json() as { id: string; action: "unlist" | "delete" | "resolve" };
  const sb = supabaseServer();
  const { data: r } = await sb.from("reports").select("map_id").eq("id", id).single();
  if (!r) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (action === "unlist") await sb.from("maps").update({ is_listed: false }).eq("id", r.map_id);
  if (action === "delete") await sb.from("maps").delete().eq("id", r.map_id);
  await sb.from("reports").update({ status: "resolved" }).eq("id", id);
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Staff page**

```tsx
// src/app/staff/page.tsx
"use client";
import { useEffect, useState } from "react";

type Report = { id: string; reason: string; created_at: string; maps: { slug: string; title: string; is_listed: boolean } };

export default function Staff() {
  const [token, setToken] = useState("");
  const [reports, setReports] = useState<Report[] | null>(null);

  async function load() {
    const res = await fetch("/api/staff/reports", { headers: { "x-staff-token": token } });
    if (!res.ok) { setReports(null); return; }
    setReports((await res.json()) as Report[]);
  }

  async function act(id: string, action: "unlist" | "delete" | "resolve") {
    await fetch("/api/staff/reports", { method: "POST", headers: { "content-type": "application/json", "x-staff-token": token }, body: JSON.stringify({ id, action }) });
    load();
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold">Staff</h1>
      <div className="mt-3 flex gap-2">
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="staff token" className="border rounded px-3 py-2 flex-1" />
        <button onClick={load} className="px-3 py-2 bg-zinc-900 text-white rounded">Load</button>
      </div>
      <ul className="mt-6 space-y-3">
        {(reports ?? []).map((r) => (
          <li key={r.id} className="border rounded p-3">
            <div className="font-medium">{r.maps.title}</div>
            <a className="text-blue-600 text-sm" href={`/m/${r.maps.slug}`} target="_blank">/m/{r.maps.slug}</a>
            <p className="mt-1 text-sm">{r.reason}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => act(r.id, "unlist")} className="px-2 py-1 border rounded text-xs">비공개</button>
              <button onClick={() => act(r.id, "delete")} className="px-2 py-1 border border-red-500 text-red-600 rounded text-xs">삭제</button>
              <button onClick={() => act(r.id, "resolve")} className="px-2 py-1 border rounded text-xs">Resolve</button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Report button on viewer**

Edit `src/app/m/[slug]/viewer-shell.tsx` header area to add a report prompt: show dialog taking reason string, POST to `/api/report`. (Add minimal button + `window.prompt` flow for MVP.)

```tsx
// add near title in ViewerShell
<button
  onClick={async () => {
    const reason = window.prompt("신고 사유를 입력하세요 (500자 이내)");
    if (!reason) return;
    const res = await fetch("/api/report", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: map.slug, reason }),
    });
    alert(res.ok ? "신고가 접수되었습니다." : "신고 실패");
  }}
  className="ml-auto text-xs text-zinc-500 underline"
>
  신고
</button>
```

Also pass `slug` into `ViewerShell` props and include it in the viewer page passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/report src/app/api/staff src/app/staff src/app/m
git commit -m "feat(moderation): reports submission, /staff dashboard with token"
```

---

## Stage 8 — E2E and Deploy

### Task 24: Playwright E2E happy path

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/create-and-view.spec.ts`

- [ ] **Step 1: Playwright config**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "npm run dev", port: 3000, reuseExistingServer: true, timeout: 60_000 },
});
```

- [ ] **Step 2: Happy-path test**

```typescript
import { test, expect } from "@playwright/test";
import path from "node:path";

test("create a map, view public URL", async ({ page }) => {
  await page.goto("/new");
  await page.setInputFiles("input[type=file]", path.resolve(__dirname, "../fixtures/excel/valid_small.xlsx"));
  await page.getByLabel("지도 제목 *").fill("E2E 테스트");
  await page.getByRole("button", { name: "지도 만들기" }).click();

  const publicLink = page.locator("text=공유 URL").locator(".. >> a");
  await expect(publicLink).toBeVisible({ timeout: 60_000 });
  const href = await publicLink.getAttribute("href");
  expect(href).toMatch(/\/m\/[a-z0-9]{8}$/);

  await page.goto(href!);
  await expect(page.getByRole("heading", { name: "E2E 테스트" })).toBeVisible();
});
```

- [ ] **Step 3: Install Playwright browsers and run**

```bash
npx playwright install chromium
npm run test:e2e
```

Expected: Test passes (requires Supabase + at least one geocoder env var).

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "test(e2e): happy-path create and view flow"
```

---

### Task 25: Vercel deploy config + README

**Files:**
- Modify: `README.md`
- Create: `vercel.json` (if needed)

- [ ] **Step 1: Write README with setup steps**

```markdown
# 공픈클로 폴리시맵

주소만 있으면 바로 공개 지도가 되는 웹 도구. 중앙부처 사무관용.

## 개발 환경

### 사전 준비
- Node 20+
- Supabase 프로젝트 (free tier)
  - SQL 편집기에서 `supabase/migrations/*.sql` 순서대로 실행
  - Storage에 `uploads` 버킷 생성 (private)
- 최소 하나의 지오코더 API 키:
  - Kakao Local (`developers.kakao.com`)
  - VWorld (`vworld.kr`)
  - Juso (`business.juso.go.kr`)

### 실행

\`\`\`bash
cp .env.example .env.local
# 환경변수 입력
npm install
npm run gen:template
npm run dev
\`\`\`

### 테스트

\`\`\`bash
npm test            # 단위
npm run test:e2e    # E2E
\`\`\`

## 배포

- Vercel에 이 repo 연결
- Environment Variables에 `.env.example` 키 전부 설정
- Build command: `next build`

## 아키텍처

`docs/superpowers/specs/2026-04-22-gonpunclaw-policymap-design.md` 참고.
```

- [ ] **Step 2: Push to GitHub**

```bash
# 사용자 수동: GitHub에서 gonpunclaw-policymap repo 생성
git remote add origin git@github.com:hosungseo/gonpunclaw-policymap.git
git branch -M main
git push -u origin main
```

- [ ] **Step 3: Connect to Vercel dashboard → import repo → add env vars → deploy**

- [ ] **Step 4: Smoke test on production URL**

Create a map, verify viewer loads, admin URL works, delete works.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README with setup, test, deploy instructions"
git push
```

---

## Completion Checklist

- [ ] All 25 tasks completed with green tests
- [ ] Manual smoke on deploy: create → view → edit → replace → delete
- [ ] Gallery shows at least one listed map
- [ ] Report flow works (submit + /staff resolve)
- [ ] Failure CSV downloads contain expected data
- [ ] README matches actual setup steps

## Out of Scope (deferred to v1.1+)

Timeline/history, choropleth, heatmap, iframe embed, filter URL sharing, multilingual, tag/category hierarchy, public-data-portal URL import, PDF/PNG export, admin-URL recovery.
