import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { subscriptionLive } from "@/lib/flags";
export const runtime = "nodejs";

// 지도·목록용 경량 응답 — 무거운 synth_reviews는 제외(상세 열 때 따로 로드)
export async function GET() {
  try {
    await ensureSchema();
    const cafes = await sql`
      SELECT c.id, c.name, c.area, c.lat, c.lng, c.vibe, c.note, c.signature,
             c.synth_grade, c.synth_count, c.synth_identity,
             c.acidity, c.body, c.sweet, c.roasts_own, c.uses, c.tone, c.photo_url, c.hours, c.phone, c.char_scores,
             COALESCE(p.featured AND p.approved AND (p.featured_until IS NULL OR p.featured_until > now()), false) AS featured
      FROM cafes c
      LEFT JOIN cafe_promos p ON p.cafe_id = c.id
      WHERE c.published = true
      ORDER BY (c.note IS NOT NULL AND c.note <> '') DESC, c.synth_count DESC NULLS LAST
    `;
    // 구독 라이브 전: featured(금색 핀·추천)는 소비자에 숨김(관리자 전용)
    const out = subscriptionLive() ? cafes : (cafes as any[]).map((c) => ({ ...c, featured: false }));
    // 엣지 캐시: 공개 카페 목록은 밤에만 바뀌므로 CDN이 5분 캐시 + 1일간 stale 제공(즉시 응답).
    // → 방문 폭증에도 DB는 5분에 한 번만 맞고, 나머지는 CDN이 받아냄(용량 10~100배).
    return NextResponse.json({ ok: true, cafes: out }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), cafes: [] }, { status: 500 });
  }
}
