import { generateAdminToken, hashAdminToken, verifyAdminToken } from "@/lib/tokens";
import { supabaseServer } from "@/lib/supabase/server";

// Prefixing the token before hashing keeps review hashes in a different domain from admin hashes,
// so an admin token can never pass review verification or vice versa.
const DOMAIN = "review:";

export function generateReviewToken(): string {
  return generateAdminToken();
}

export function hashReviewToken(token: string, pepper: string): string {
  return hashAdminToken(DOMAIN + token, pepper);
}

export function verifyReviewToken(token: string, storedHash: string | null | undefined, pepper: string): boolean {
  // Guard before verifyAdminToken: it decodes the stored hash as hex without validating it.
  if (!storedHash || !/^[0-9a-f]{64}$/i.test(storedHash)) return false;
  return verifyAdminToken(DOMAIN + token, storedHash, pepper);
}

export type ReviewAuthResult =
  | { ok: true; mapId: string }
  | { ok: false; reason: "NOT_FOUND" | "MISSING_PEPPER" };

export async function verifyReviewTokenForMap(slug: string, token: string): Promise<ReviewAuthResult> {
  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  if (!pepper) return { ok: false, reason: "MISSING_PEPPER" };
  const { data } = await supabaseServer().from("maps").select("id, review_token_hash").eq("slug", slug).maybeSingle();
  // Do not reveal whether the map exists.
  if (!data || !verifyReviewToken(token, data.review_token_hash, pepper)) return { ok: false, reason: "NOT_FOUND" };
  return { ok: true, mapId: data.id };
}
