import { createHmac } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";

export type AuditAction =
  | "map.create"
  | "map.update"
  | "map.replace_data"
  | "map.delete"
  | "upload_job.create"
  | "upload_job.complete"
  | "admin.auth_fail"
  | "report.create"
  | "report.update";

export interface AuditInput {
  action: AuditAction;
  mapId: string | null;
  req: Request;
  details?: Record<string, unknown>;
}

const USER_AGENT_MAX = 512;

function extractClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first ? first : null;
}

export function hashIp(ip: string, pepper: string): string {
  return createHmac("sha256", pepper).update(ip).digest("hex");
}

export async function recordAudit({ action, mapId, req, details }: AuditInput): Promise<void> {
  try {
    const pepper = process.env.ADMIN_TOKEN_PEPPER;
    const ip = extractClientIp(req);
    const ipHash = pepper && ip ? hashIp(ip, pepper) : null;
    const ua = req.headers.get("user-agent")?.slice(0, USER_AGENT_MAX) ?? null;

    const sb = supabaseServer();
    const { error } = await sb.from("audit_log").insert({
      map_id: mapId,
      action,
      ip_hash: ipHash,
      user_agent: ua,
      details: details ?? {},
    });
    if (error) console.error("[audit] insert failed", action, error.message);
  } catch (err) {
    console.error("[audit]", action, err);
  }
}
