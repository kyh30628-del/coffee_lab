import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

const ENRICH: Record<string, { acidity: number; body: number; sweet: number; taste_pick: string; tone: string }> = {
  "커피볶는아침":   { acidity: 0.6, body: 0.6, sweet: 0.5, taste_pick: "뭘 좋아하든 OK — 수십 종 중 골라 삼촌이 맞춰 내려줘요", tone: "amber" },
  "애크로매틱 커피": { acidity: 0.3, body: 0.7, sweet: 0.6, taste_pick: "산미 부담스러우면 여기 — 부드럽고 단맛 도는 에스프레소", tone: "brown" },
  "피에로 커피":     { acidity: 0.6, body: 0.5, sweet: 0.7, taste_pick: "달콤·고소한 라떼파라면 — 과일향 원두 플랫화이트", tone: "rose" },
  "커피몽타주 성내": { acidity: 0.3, body: 0.8, sweet: 0.6, taste_pick: "진하고 묵직한 거 좋아하면 — 다크초콜릿·카라멜 블렌드", tone: "dark" },
  "해브 로스터스":   { acidity: 0.7, body: 0.4, sweet: 0.5, taste_pick: "섬세한 핸드드립 좋아하면 — 오전에 가야 만나요", tone: "green" },
  "커피레시피":     { acidity: 0.8, body: 0.5, sweet: 0.6, taste_pick: "산미·꽃향 좋아하면 여기 게이샤 — 단, 영업 짧아요", tone: "gold" },
  "러스터앤코 명일": { acidity: 0.6, body: 0.7, sweet: 0.5, taste_pick: "맛+분위기+사진 다 챙기고 싶을 때 — Probat 로스팅 에스프레소", tone: "steel" },
  "카페이유":       { acidity: 0.4, body: 0.6, sweet: 0.8, taste_pick: "달달한 거 좋아하면 — 바닐라빈 라떼", tone: "cream" },
};

export async function GET() {
  try {
    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS acidity REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS body REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS sweet REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS taste_pick TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS tone TEXT`;

    let n = 0;
    for (const [name, e] of Object.entries(ENRICH)) {
      await sql`
        UPDATE cafes SET acidity=${e.acidity}, body=${e.body}, sweet=${e.sweet},
          taste_pick=${e.taste_pick}, tone=${e.tone}, updated_at=now()
        WHERE name=${name}`;
      n++;
    }
    return NextResponse.json({ ok: true, enriched: n });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
