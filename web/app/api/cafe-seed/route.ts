import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

const SEED = [
  {
    place_id: "ChIJk7kKwKqxfDUR8P7olbf0B4I",
    name: "커피볶는아침", area: "강동역",
    address: "서울 강동구 성안로 163 1층",
    lat: 37.5377141, lng: 127.1352606,
    hours: "평일 07:30–20:00 / 주말 단축", phone: "02-483-7860",
    rating: 4.6, rating_count: 94,
    roasts_own: true,
    beans: "코스타리카, 인도네시아 만델링, 예멘 모카 등 수십 종(산지별 선택)",
    signature: "원두 골라 내리는 핸드드립·아메리카노",
    uses: "혼자,작업,단골",
    vibe: "동네 골목, 주인이 직접 볶고 추천해주는 곳",
    note: "원두를 직접 골라 마실 수 있는 동네 로스터리. '삼촌'이라 불러달라는 주인장의 추천 안목이 좋고 가격도 합리적.",
    price_hint: "아메리카노 합리적 가격대",
    source: "seed",
  },
];

export async function GET() {
  try {
    await ensureSchema();
    for (const c of SEED) {
      await sql`
        INSERT INTO cafes (place_id, name, area, address, lat, lng, hours, phone,
          rating, rating_count, roasts_own, beans, signature, uses, vibe, note, price_hint, source)
        VALUES (${c.place_id}, ${c.name}, ${c.area}, ${c.address}, ${c.lat}, ${c.lng},
          ${c.hours}, ${c.phone}, ${c.rating}, ${c.rating_count}, ${c.roasts_own},
          ${c.beans}, ${c.signature}, ${c.uses}, ${c.vibe}, ${c.note}, ${c.price_hint}, ${c.source})
        ON CONFLICT (place_id) DO UPDATE SET
          name=EXCLUDED.name, area=EXCLUDED.area, address=EXCLUDED.address,
          lat=EXCLUDED.lat, lng=EXCLUDED.lng, hours=EXCLUDED.hours, phone=EXCLUDED.phone,
          rating=EXCLUDED.rating, rating_count=EXCLUDED.rating_count,
          roasts_own=EXCLUDED.roasts_own, beans=EXCLUDED.beans, signature=EXCLUDED.signature,
          uses=EXCLUDED.uses, vibe=EXCLUDED.vibe, note=EXCLUDED.note,
          price_hint=EXCLUDED.price_hint, source=EXCLUDED.source, updated_at=now()
      `;
    }
    const count = await sql`SELECT COUNT(*)::int AS n FROM cafes`;
    return NextResponse.json({ ok: true, seeded: SEED.length, total: count[0].n });
  } catch (e) {
    console.error("cafe-seed error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
