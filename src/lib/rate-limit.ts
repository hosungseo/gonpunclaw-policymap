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
  report: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5/hour
} as const;
