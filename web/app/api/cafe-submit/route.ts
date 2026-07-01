import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

const s = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const b = await req.json();
    const name = s(b.name, 80);
    if (!name) return NextResponse.json({ ok: false, error: "카페 이름은 필수입니다." }, { status: 400 });

    const area = s(b.area, 40);
    const address = s(b.address, 200);
    const phone = s(b.phone, 30);
    const hours = s(b.hours, 120);
    const beans = s(b.beans, 300);
    const signature = s(b.signature, 200);
    const vibe = s(b.vibe, 120);
    const note = s(b.note, 400);
    const price_hint = s(b.price_hint, 120);
    const roasts_own = !!b.roasts_own;
    const uses = Array.isArray(b.uses) ? b.uses.slice(0, 6).join(",") : "";

    // 감사수리: register의 supplementId(기존 카페 보완 모드)가 무시돼 무조건 신규 INSERT → 중복 카페 행 생성.
    //   유효한 기존 카페면 신규 INSERT 없이 보완 제보로만 기록(cafes의 published 등 어떤 상태도 변경하지 않음).
    const supplementId = Number(b.supplementId);
    if (Number.isInteger(supplementId) && supplementId > 0) {
      const target = (await sql`SELECT id, name FROM cafes WHERE id=${supplementId} LIMIT 1`)[0] as any;
      if (target) {
        await sql`CREATE TABLE IF NOT EXISTS cafe_supplements (
          id SERIAL PRIMARY KEY, target_cafe_id INT REFERENCES cafes(id) ON DELETE CASCADE,
          payload JSONB, status TEXT DEFAULT 'new', created_at TIMESTAMPTZ DEFAULT now()
        )`;
        await sql`INSERT INTO cafe_supplements (target_cafe_id, payload)
          VALUES (${supplementId}, ${JSON.stringify({ name, area, address, phone, hours, beans, signature, vibe, note, price_hint, roasts_own, uses })})`;
        return NextResponse.json({ ok: true, supplement: true, cafeId: supplementId, cafeName: target.name, message: "보완 제보 접수" });
      }
    }

    // 사장님 제출은 검수 전이라 published=false. 새 카페 id 반환 → 이어서 7일 체험 신청에 사용.
    const row = (await sql`
      INSERT INTO cafes (name, area, address, phone, hours, roasts_own,
        beans, signature, uses, vibe, note, price_hint, source, published)
      VALUES (${name}, ${area}, ${address}, ${phone}, ${hours}, ${roasts_own},
        ${beans}, ${signature}, ${uses}, ${vibe}, ${note}, ${price_hint}, 'owner', false)
      RETURNING id
    `)[0] as any;
    return NextResponse.json({ ok: true, cafeId: row?.id ?? null, cafeName: name });
  } catch (e) {
    console.error("cafe-submit error:", e);
    return NextResponse.json({ ok: false, error: "잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
