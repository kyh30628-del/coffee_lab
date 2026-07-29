import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // 🔒 일회성 수리 라우트(파괴적 DELETE 포함) — 무인증 노출 금지(2026-07-29 보안감사).
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    // 1) 쓰레기 데이터 삭제 (__count__ 테스트로 잘못 적재된 것)
    const del = await sql`DELETE FROM cafes WHERE area = '__count__' RETURNING name`;
    // 2) 커피볶는아침 현재 상태 확인
    const cbm = await sql`SELECT name, area, published FROM cafes WHERE name ILIKE '%커피볶는아침%'`;
    // 3) 혹시 남아있을 역/동 이름 보정
    await sql`UPDATE cafes SET area='강동구' WHERE area='강동역'`;
    await sql`UPDATE cafes SET area='강동구' WHERE area IN ('성내동','천호동','명일동','암사동','둔촌동','고덕동','상일동')`;
    const after = await sql`SELECT name, area, published FROM cafes WHERE name ILIKE '%커피볶는아침%'`;
    return NextResponse.json({ ok: true, deleted: del.map((r:any)=>r.name), cbm_before: cbm, cbm_after: after });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
