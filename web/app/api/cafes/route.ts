import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { subscriptionLive } from "@/lib/flags";
import { encodeCharScores } from "@/lib/mapCafes";
export const runtime = "nodejs";

// 🗺️ 지도·목록용 응답. 무거운 synth_reviews는 제외(상세 열 때 따로 로드).
//
// ⚡ 2026-08-06 — 요청마다 공개 카페 13,460행(약 4MB)을 Neon에서 통째로 실어오고 CDN 캐시도 없어
//   실측 7.6초·gzip 739KB였다. 트래픽이 6.8배(MAU 195→1,330) 늘어 이제는 비용·이탈 양쪽 문제다.
//   그렇다고 CDN에 s-maxage를 다시 거는 건 금지 — 비공개 처리한 카페가 몇 분간 지도에 남던 사고로
//   이미 한 번 되돌린 길이다(CLAUDE.md §2.5 "공개 API는 always-fresh").
//   해법 = **버전 기반 메모리 캐시**. 요청마다 값 3개짜리 초경량 버전 쿼리만 돌려
//   (공개 수 · MAX(updated_at) · MAX(synth_updated)) 직전과 같으면 만들어 둔 응답을 그대로 준다.
//   데이터가 바뀌면 버전이 즉시 달라져 **always-fresh는 그대로**고, 안 바뀐 동안의 4MB 전송만 사라진다.
//   실측 근거: 공개 카페 변경은 최근 1시간 0건·24시간 21건 → 대부분의 요청이 캐시 적중.
type Cached = { version: string; body: string };
let cache: Cached | null = null;

export async function GET() {
  try {
    await ensureSchema();
    const [v] = (await sql`SELECT COUNT(*)::int n, COALESCE(MAX(updated_at)::text,'') u, COALESCE(MAX(synth_updated)::text,'') s
      FROM cafes WHERE published = true`) as any[];
    const live = subscriptionLive();
    const version = `${v?.n ?? 0}|${v?.u ?? ""}|${v?.s ?? ""}|${live ? 1 : 0}`;
    if (cache && cache.version === version) {
      return new NextResponse(cache.body, {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=0, must-revalidate", "X-Cafes-Cache": "HIT" },
      });
    }
    const cafes = await sql`
      SELECT c.id, c.name, c.area, c.dong, c.lat, c.lng, c.vibe, c.note, c.signature,
             c.synth_grade, c.synth_count, c.synth_identity, c.char_scores,
             COALESCE(p.featured AND p.approved AND (p.featured_until IS NULL OR p.featured_until > now()), false) AS featured
      FROM cafes c
      LEFT JOIN cafe_promos p ON p.cafe_id = c.id
      WHERE c.published = true
      ORDER BY (c.note IS NOT NULL AND c.note <> '') DESC, c.synth_count DESC NULLS LAST
    `;
    // 📉 페이로드 축소 — 담는 정보는 그대로 두고 낭비만 걷어낸다(실측 raw 4.04MB→2.51MB).
    //   ①빈 값은 키 자체를 뺀다(vibe·note·signature는 13,460곳 중 11곳만 값이 있다)
    //   ②좌표는 소수 5자리(약 1m)로 반올림
    //   ③char_scores 6축은 키 이름 대신 고정 순서 배열 `cs`로(단일 최대 항목, 전체의 26%)
    //   구독 라이브 전에는 featured(금색 핀·추천)를 소비자에 숨긴다 — 예전과 동일하게 값 자체를 안 보냄.
    const out = (cafes as any[]).map((c) => {
      const o: Record<string, unknown> = {
        id: c.id, name: c.name, area: c.area, dong: c.dong,
        lat: typeof c.lat === "number" ? Math.round(c.lat * 1e5) / 1e5 : c.lat,
        lng: typeof c.lng === "number" ? Math.round(c.lng * 1e5) / 1e5 : c.lng,
        synth_grade: c.synth_grade, synth_count: c.synth_count, synth_identity: c.synth_identity,
      };
      if (c.vibe) o.vibe = c.vibe;
      if (c.note) o.note = c.note;
      if (c.signature) o.signature = c.signature;
      if (live && c.featured) o.featured = true;
      const cs = encodeCharScores(c.char_scores);
      if (cs) o.cs = cs;
      return o;
    });
    const body = JSON.stringify({ ok: true, cafes: out });
    cache = { version, body };
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=0, must-revalidate", "X-Cafes-Cache": "MISS" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), cafes: [] }, { status: 500 });
  }
}
