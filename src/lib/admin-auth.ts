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
