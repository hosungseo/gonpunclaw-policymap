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
