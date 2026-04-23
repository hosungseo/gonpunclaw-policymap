import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const STAFF_COOKIE = "staff_session";
export const STAFF_SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

export type StaffAuthConfig =
  | { ok: true; expected: string }
  | { ok: false; reason: "MISSING_TOKEN" | "MISSING_PEPPER" };

function deriveSession(token: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`staff:${token}`).digest("hex");
}

export function staffAuthConfig(): StaffAuthConfig {
  const token = process.env.STAFF_DASHBOARD_TOKEN;
  const pepper = process.env.ADMIN_TOKEN_PEPPER;
  if (!token) return { ok: false, reason: "MISSING_TOKEN" };
  if (!pepper) return { ok: false, reason: "MISSING_PEPPER" };
  return { ok: true, expected: deriveSession(token, pepper) };
}

export function verifyStaffToken(input: string): boolean {
  const cfg = staffAuthConfig();
  if (!cfg.ok) return false;
  const token = process.env.STAFF_DASHBOARD_TOKEN!;
  const pepper = process.env.ADMIN_TOKEN_PEPPER!;
  const a = createHmac("sha256", pepper).update(input).digest();
  const b = createHmac("sha256", pepper).update(token).digest();
  return timingSafeEqual(a, b);
}

export function verifyStaffSessionCookie(cookieValue: string | undefined): boolean {
  const cfg = staffAuthConfig();
  if (!cfg.ok) return false;
  if (!cookieValue) return false;
  const a = Buffer.from(cookieValue, "utf8");
  const b = Buffer.from(cfg.expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function isStaffAuthorized(): Promise<boolean> {
  const store = await cookies();
  return verifyStaffSessionCookie(store.get(STAFF_COOKIE)?.value);
}
