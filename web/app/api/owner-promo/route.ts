import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { generatePromo, hasPromoLLM } from "@/lib/promoAgent";
export const runtime = "nodejs";
export const maxDuration = 30;

// 사장님 쇼케이스: 사장님이 글·사진 저장 → Claude가 홍보 카피 생성 → 카페 상세 상단 배너.
let ready = false;
async function ensurePromo() {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS cafe_promos (
    cafe_id INT PRIMARY KEY,
    intro TEXT,
    photos JSONB,
    ai_headline TEXT, ai_tagline TEXT, ai_points JSONB,
    published BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT now()
  )`;
  ready = true;
}
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

// GET ?cafeId= : 공개 홍보 조회(소비자용). 관리자면 미공개도 반환(미리보기).
export async function GET(req: NextRequest) {
  try {
    await ensureSchema(); await ensurePromo();
    const cafeId = Number(req.nextUrl.searchParams.get("cafeId"));
    if (!cafeId) return NextResponse.json({ ok: false, error: "cafeId 필요" }, { status: 400 });
    const row = (await sql`SELECT * FROM cafe_promos WHERE cafe_id=${cafeId} LIMIT 1`)[0];
    if (!row || (!row.published && !authed(req))) return NextResponse.json({ ok: true, promo: null });
    return NextResponse.json({ ok: true, promo: row, llmAvailable: hasPromoLLM() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// POST (관리자): { cafeId, intro, photos[], publish, generate } — 저장 + (generate면 AI 카피 생성)
export async function POST(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema(); await ensurePromo();
    const body = await req.json().catch(() => ({}));
    const cafeId = Number(body.cafeId);
    if (!cafeId) return NextResponse.json({ ok: false, error: "cafeId 필요" }, { status: 400 });
    const intro = String(body.intro ?? "").slice(0, 1000);
    const photos: string[] = Array.isArray(body.photos) ? body.photos.slice(0, 3).filter((p: any) => typeof p === "string") : [];
    const publish = !!body.publish;

    const cafe = (await sql`SELECT name, area FROM cafes WHERE id=${cafeId}`)[0] as { name: string; area: string } | undefined;
    if (!cafe) return NextResponse.json({ ok: false, error: "카페 없음" }, { status: 404 });

    let ai = null;
    if (body.generate && hasPromoLLM()) ai = await generatePromo(cafe.name, cafe.area, intro, photos[0]);

    if (ai) {
      await sql`INSERT INTO cafe_promos (cafe_id, intro, photos, ai_headline, ai_tagline, ai_points, published, updated_at)
        VALUES (${cafeId}, ${intro}, ${JSON.stringify(photos)}, ${ai.headline}, ${ai.tagline}, ${JSON.stringify(ai.points)}, ${publish}, now())
        ON CONFLICT (cafe_id) DO UPDATE SET intro=EXCLUDED.intro, photos=EXCLUDED.photos, ai_headline=EXCLUDED.ai_headline, ai_tagline=EXCLUDED.ai_tagline, ai_points=EXCLUDED.ai_points, published=EXCLUDED.published, updated_at=now()`;
    } else {
      await sql`INSERT INTO cafe_promos (cafe_id, intro, photos, published, updated_at)
        VALUES (${cafeId}, ${intro}, ${JSON.stringify(photos)}, ${publish}, now())
        ON CONFLICT (cafe_id) DO UPDATE SET intro=EXCLUDED.intro, photos=EXCLUDED.photos, published=EXCLUDED.published, updated_at=now()`;
    }
    const row = (await sql`SELECT * FROM cafe_promos WHERE cafe_id=${cafeId}`)[0];
    return NextResponse.json({ ok: true, promo: row, generated: !!ai, llmAvailable: hasPromoLLM() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
