import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { generatePromo } from "@/lib/promoAgent";
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
  await sql`ALTER TABLE cafe_promos ADD COLUMN IF NOT EXISTS ai_pending BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE cafe_promos ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT false`; // 관리자 승인 후에만 배너 노출
  await sql`ALTER TABLE cafe_promos ADD COLUMN IF NOT EXISTS style INT DEFAULT 1`; // 사장님이 고른 템플릿(1~10), 0=영상
  await sql`ALTER TABLE cafe_promos ADD COLUMN IF NOT EXISTS video_url TEXT`; // 홍보 영상(Vercel Blob URL)
  await sql`ALTER TABLE cafe_promos ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false`; // 우선 노출(유료 상품, 관리자 토글)
  await sql`ALTER TABLE cafe_promos ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ`;     // 구독 기간 — 만료 시 자동 해제
  await sql`ALTER TABLE cafe_promos ADD COLUMN IF NOT EXISTS coupon TEXT`;                    // 🎟 쿠폰·프로모션(혜택 문구)
  await sql`ALTER TABLE cafe_promos ADD COLUMN IF NOT EXISTS trial_used BOOLEAN DEFAULT false`; // 🎁 14일 무료체험 1회 사용 여부
  await sql`ALTER TABLE cafe_promos ADD COLUMN IF NOT EXISTS views INT DEFAULT 0`;   // 1차 성과: 노출(조회)
  await sql`ALTER TABLE cafe_promos ADD COLUMN IF NOT EXISTS clicks INT DEFAULT 0`;  // 클릭
  await sql`ALTER TABLE cafe_promos ADD COLUMN IF NOT EXISTS plays INT DEFAULT 0`;   // 영상 재생
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
    // 소비자(비관리자)는 '관리자 승인된' 홍보만 본다(배포 포함). 관리자는 미리보기 위해 전부.
    if (!row || (!authed(req) && !row.approved)) return NextResponse.json({ ok: true, promo: null });
    // 사장님(인증)에겐 월간 성과 리포트도 함께
    if (authed(req)) {
      try {
        await sql`CREATE TABLE IF NOT EXISTS promo_daily (cafe_id INT, day DATE, views INT DEFAULT 0, clicks INT DEFAULT 0, plays INT DEFAULT 0, PRIMARY KEY (cafe_id, day))`;
        const m = (await sql`SELECT
          COALESCE(SUM(views) FILTER (WHERE day >= date_trunc('month', CURRENT_DATE)),0)::int v_now,
          COALESCE(SUM(clicks) FILTER (WHERE day >= date_trunc('month', CURRENT_DATE)),0)::int c_now,
          COALESCE(SUM(plays) FILTER (WHERE day >= date_trunc('month', CURRENT_DATE)),0)::int p_now,
          COALESCE(SUM(views) FILTER (WHERE day >= date_trunc('month', CURRENT_DATE - interval '1 month') AND day < date_trunc('month', CURRENT_DATE)),0)::int v_prev
          FROM promo_daily WHERE cafe_id=${cafeId}`)[0] as any;
        return NextResponse.json({ ok: true, promo: row, month: { views: m.v_now, clicks: m.c_now, plays: m.p_now, prevViews: m.v_prev } });
      } catch { /* 리포트 실패해도 promo는 반환 */ }
    }
    return NextResponse.json({ ok: true, promo: row });
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
    // 🎁 우선노출 14일 무료 체험 — 카페당 1회. (승인된 홍보가 있어야 노출됨)
    if (body.trial) {
      const cur = (await sql`SELECT trial_used FROM cafe_promos WHERE cafe_id=${cafeId}`)[0];
      if (!cur) return NextResponse.json({ ok: false, error: "먼저 쇼케이스를 저장해 주세요" }, { status: 400 });
      if (cur.trial_used) return NextResponse.json({ ok: false, error: "무료 체험은 1회만 가능해요" }, { status: 400 });
      await sql`UPDATE cafe_promos SET featured=true, featured_until = now() + make_interval(days => 14), trial_used=true WHERE cafe_id=${cafeId}`;
      const r = (await sql`SELECT * FROM cafe_promos WHERE cafe_id=${cafeId}`)[0];
      return NextResponse.json({ ok: true, promo: r, trial: true });
    }
    // 🎟 쿠폰(혜택 문구)만 저장 — 내용·승인 유지
    if (body.couponOnly) {
      await sql`UPDATE cafe_promos SET coupon=${String(body.coupon ?? "").slice(0, 60) || null}, updated_at=now() WHERE cafe_id=${cafeId}`;
      const r = (await sql`SELECT * FROM cafe_promos WHERE cafe_id=${cafeId}`)[0];
      return NextResponse.json({ ok: true, promo: r });
    }
    // 스타일(템플릿)만 변경 — 내용·승인은 그대로(템플릿은 외형만 바꿈)
    if (body.styleOnly) {
      await sql`UPDATE cafe_promos SET style=${Math.min(Math.max(Number(body.style) || 1, 1), 10)}, updated_at=now() WHERE cafe_id=${cafeId}`;
      const r = (await sql`SELECT * FROM cafe_promos WHERE cafe_id=${cafeId}`)[0];
      return NextResponse.json({ ok: true, promo: r });
    }
    // 영상 모드 — 업로드된 Blob URL 저장(style=0=영상). 관리자 승인 후 노출.
    if (body.mode === "video") {
      const vurl = typeof body.video_url === "string" ? body.video_url : null;
      await sql`INSERT INTO cafe_promos (cafe_id, video_url, style, published, approved, updated_at)
        VALUES (${cafeId}, ${vurl}, 0, true, false, now())
        ON CONFLICT (cafe_id) DO UPDATE SET video_url=${vurl}, style=0, published=true, approved=false, updated_at=now()`;
      const r = (await sql`SELECT * FROM cafe_promos WHERE cafe_id=${cafeId}`)[0];
      return NextResponse.json({ ok: true, promo: r });
    }
    const intro = String(body.intro ?? "").slice(0, 1000);
    const photos: string[] = Array.isArray(body.photos) ? body.photos.slice(0, 3).filter((p: any) => typeof p === "string") : [];
    const publish = !!body.publish;

    const cafe = (await sql`SELECT name, area FROM cafes WHERE id=${cafeId}`)[0] as { name: string; area: string } | undefined;
    if (!cafe) return NextResponse.json({ ok: false, error: "카페 없음" }, { status: 404 });

    // Vercel 인라인 생성은 '콘솔 키' 있을 때만. 없으면 ai_pending=true로 두고
    // 사장님 맥의 로컬 배치(promo-batch, Max 구독)가 생성한다.
    const consoleKey = !!process.env.ANTHROPIC_API_KEY;
    let ai = null;
    if (body.generate && consoleKey) ai = await generatePromo(cafe.name, cafe.area, intro, photos[0]);
    const pending = !!body.generate && !ai; // 생성 요청했는데 인라인 못 함 → 로컬 배치 대기

    // 저장하면 published=true(노출 희망), approved=false(관리자 재승인 필요).
    if (ai) {
      await sql`INSERT INTO cafe_promos (cafe_id, intro, photos, ai_headline, ai_tagline, ai_points, published, approved, ai_pending, updated_at)
        VALUES (${cafeId}, ${intro}, ${JSON.stringify(photos)}, ${ai.headline}, ${ai.tagline}, ${JSON.stringify(ai.points)}, true, false, false, now())
        ON CONFLICT (cafe_id) DO UPDATE SET intro=EXCLUDED.intro, photos=EXCLUDED.photos, ai_headline=EXCLUDED.ai_headline, ai_tagline=EXCLUDED.ai_tagline, ai_points=EXCLUDED.ai_points, published=true, approved=false, ai_pending=false, updated_at=now()`;
    } else {
      await sql`INSERT INTO cafe_promos (cafe_id, intro, photos, published, approved, ai_pending, updated_at)
        VALUES (${cafeId}, ${intro}, ${JSON.stringify(photos)}, true, false, ${pending}, now())
        ON CONFLICT (cafe_id) DO UPDATE SET intro=EXCLUDED.intro, photos=EXCLUDED.photos, published=true, approved=false, updated_at=now()`;
      if (pending) await sql`UPDATE cafe_promos SET ai_pending=true WHERE cafe_id=${cafeId}`;
    }
    if (body.style) await sql`UPDATE cafe_promos SET style=${Math.min(Math.max(Number(body.style) || 1, 1), 10)} WHERE cafe_id=${cafeId}`;
    const row = (await sql`SELECT * FROM cafe_promos WHERE cafe_id=${cafeId}`)[0];
    return NextResponse.json({ ok: true, promo: row, generated: !!ai, pending });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
