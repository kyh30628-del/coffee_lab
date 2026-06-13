import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

// 익명 복구코드 ↔ 기기 매핑 (개인정보 0, 코드는 난수)
async function ensure() {
  await sql`CREATE TABLE IF NOT EXISTS recovery_codes (
    code TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
}
// 헷갈리는 글자 제외(O,0,I,1,L 등)
const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function gen(n: number) {
  let s = ""; for (let i = 0; i < n; i++) s += ALPH[Math.floor(Math.random() * ALPH.length)];
  return s;
}

// POST: 기기 → 복구코드 발급(있으면 기존 반환)
export async function POST(req: NextRequest) {
  await ensure();
  const { device } = await req.json();
  if (!device) return NextResponse.json({ ok: false, error: "device 필요" }, { status: 400 });
  const [exist] = await sql`SELECT code FROM recovery_codes WHERE device_id = ${device} LIMIT 1` as any[];
  if (exist) return NextResponse.json({ ok: true, code: exist.code });
  // 중복 안 나게 생성
  let code = "";
  for (let t = 0; t < 5; t++) {
    code = `COFFEE-${gen(4)}`;
    const [c] = await sql`SELECT 1 FROM recovery_codes WHERE code = ${code} LIMIT 1` as any[];
    if (!c) break;
  }
  await sql`INSERT INTO recovery_codes (code, device_id) VALUES (${code}, ${device})`;
  return NextResponse.json({ ok: true, code });
}

// GET ?code=COFFEE-XXXX : 코드 → 기기 식별자(복원용)
export async function GET(req: NextRequest) {
  await ensure();
  const code = (req.nextUrl.searchParams.get("code") || "").trim().toUpperCase();
  if (!code) return NextResponse.json({ ok: false }, { status: 400 });
  const [row] = await sql`SELECT device_id FROM recovery_codes WHERE code = ${code} LIMIT 1` as any[];
  if (!row) return NextResponse.json({ ok: false, error: "코드를 찾을 수 없어요" }, { status: 404 });
  return NextResponse.json({ ok: true, device: row.device_id });
}
