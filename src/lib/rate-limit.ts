// src/lib/rate-limit.ts
import { supabaseServer } from "@/lib/supabase/server";

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export interface RateLimit {
  limit: number;
  windowMs: number;
}

export function rateLimit(key: string, cfg: RateLimit): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  if (store.size > MAX_BUCKETS) {
    for (const [bucketKey, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(bucketKey);
    }
  }
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
  const ip =
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return `${prefix}:${ip}`;
}

type RateLimitResult = { allowed: boolean; retryAfterMs: number };

export async function rateLimitRequest(req: Request, prefix: string, cfg: RateLimit): Promise<RateLimitResult> {
  const key = ipKey(req, prefix);
  try {
    const { data, error } = await supabaseServer().rpc("take_rate_limit", {
      p_key: key,
      p_limit: cfg.limit,
      p_window_seconds: Math.ceil(cfg.windowMs / 1000),
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row && typeof row.allowed === "boolean") {
        return {
          allowed: row.allowed,
          retryAfterMs: Number(row.retry_after_ms ?? 0),
        };
      }
    }
  } catch {
    // Local tests and un-migrated environments fall back to the in-memory limiter.
  }
  return rateLimit(key, cfg);
}

export const LIMITS = {
  upload: { limit: 3, windowMs: 60 * 60 * 1000 }, // 3/hour
  adminAttempt: { limit: 5, windowMs: 10 * 60 * 1000 }, // 5/10min
  deleteMap: { limit: 5, windowMs: 10 * 60 * 1000 }, // 5/10min
  report: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5/hour
} as const;
