import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { subscriptionLive } from "@/lib/flags";
export const runtime = "nodejs";

// 지도·목록용 경량 응답 — 무거운 synth_reviews는 제외(상세 열 때 따로 로드)
export async function GET() {
  try {
    await ensureSchema();
    const cafes = await sql`
      SELECT c.id, c.name, c.area, c.dong, c.lat, c.lng, c.vibe, c.note, c.signature,
             c.synth_grade, c.synth_count, c.synth_identity, c.char_scores,
             COALESCE(p.featured AND p.approved AND (p.featured_until IS NULL OR p.featured_until > now()), false) AS featured
      FROM cafes c
      LEFT JOIN cafe_promos p ON p.cafe_id = c.id
      WHERE c.published = true
      ORDER BY (c.note IS NOT NULL AND c.note <> '') DESC, c.synth_count DESC NULLS LAST
    `;
    // 구독 라이브 전: featured(금색 핀·추천)는 소비자에 숨김(관리자 전용)
    const out = subscriptionLive() ? cafes : (cafes as any[]).map((c) => ({ ...c, featured: false }));
    // ⚡ 항상 최신: 비공개/복원 결재가 지도에 즉시 반영돼야 하므로 CDN이 stale을 못 내보내게 매 요청 재검증.
    //   (예전 s-maxage=60·swr=300은 비공개 후 최대 ~6분 지도가 옛 데이터를 보여주는 '반영 지연'의 원인이었음.)
    //   저트래픽 구간엔 부하 무시 가능. 트래픽 성장 시 tag기반 on-demand 무효화로 캐시 재도입 예정.
    return NextResponse.json({ ok: true, cafes: out }, {
      headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), cafes: [] }, { status: 500 });
  }
}
