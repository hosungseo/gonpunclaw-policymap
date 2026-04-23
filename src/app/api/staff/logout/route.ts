import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { STAFF_COOKIE } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const res = NextResponse.redirect(new URL("/staff/audit", req.url), { status: 303 });
  res.cookies.set({
    name: STAFF_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
