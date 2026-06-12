import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";
const authed = (req: NextRequest) => req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const flags = await sql`SELECT cafe_id, cafe_name, issue, detail, flagged_at, resolved FROM audit_flags WHERE issue != 'audit_complete' ORDER BY flagged_at DESC LIMIT 50`;
    const [last] = await sql`SELECT detail, flagged_at FROM audit_flags WHERE issue = 'audit_complete' ORDER BY flagged_at DESC LIMIT 1`;
    return NextResponse.json({ ok: true, flags, lastAudit: last?.detail, lastAuditAt: last?.flagged_at });
  } catch { return NextResponse.json({ ok: true, flags: [], lastAudit: null }); }
}
