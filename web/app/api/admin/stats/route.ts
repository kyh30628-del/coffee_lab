import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 관리자 대시보드 통계 (비밀번호 게이트). 콘텐츠 현황 + 데이터 품질.
// 접속·유입 통계는 여기서 다루지 않는다 — /api/orchestrator·/api/admin/analytics 참고(#313).
// 🚨 재발방지(2026-07-26): 서울 "중구"가 목록에서 아예 빠져있었고(우연히 결과는 안 틀렸지만 위험한 누락),
//   인천 신설 구(검단·서해·영종·제물포)도 없었다. 게다가 최초 수정 시도에서 "인천 동구"를 서울/경기와
//   같은 폴백 루프에 그대로 남겨둔 채 배열 전체를 원본 문자열(g) 길이순으로만 정렬했더니, "인천 " 접두어를
//   뗀 비교문자열("동구", 2자)이 서울 "성동구"·"강동구"(각 3자, "동구"를 부분포함)보다 실제로는 짧은데도
//   원본 g("인천 동구", 5자)가 더 길어서 먼저 매칭돼 — 서울 성동구·강동구 카페 468곳이 "인천 동구"로
//   오분류되는 **새 버그**를 만들 뻔했다(배포 전 로컬 실측으로 발견·수정). 근본 수정: 인천 항목은 인천
//   분기(아래)에서만 다루므로 폴백 루프에는 아예 넣지 않고, 정렬도 실제 비교에 쓰이는 문자열 길이 기준으로.
const SEOUL_GYEONGGI_GU = [
  "강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구",
  "수원시", "성남시", "고양시", "용인시", "부천시", "안산시", "안양시", "남양주시", "화성시", "평택시", "의정부시", "시흥시", "파주시", "김포시", "광명시", "광주시", "군포시", "하남시", "오산시", "양주시", "구리시", "안성시", "포천시", "의왕시", "여주시", "동두천시", "과천시", "이천시", "양평군", "가평군", "연천군",
];
// ⚠️ 2026-08-31 정정(decisions#910): "2026-07-01 인천 2군9구 개편"(제물포구·영종구·검단구·서해구)은
// 실존하지 않는 행정구역명이었다(coordination#354) — 실제 인천 10개 구·군으로 되돌린다.
const INCHEON_GU = ["중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"];
const _longestFirst = (list: string[]) => [...list].sort((a, b) => b.length - a.length);
const SEOUL_GYEONGGI_SORTED = _longestFirst(SEOUL_GYEONGGI_GU);
const INCHEON_SORTED = _longestFirst(INCHEON_GU);
function guOf(area: string): string {
  const a = area ?? "";
  if (a.includes("인천")) { for (const g of INCHEON_SORTED) if (a.includes(g)) return "인천 " + g; return "인천"; }
  for (const g of SEOUL_GYEONGGI_SORTED) if (a.includes(g)) return g;
  return a || "기타";
}

export async function GET(req: NextRequest) {
  try {
    if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    await ensureSchema();

    // ===== 콘텐츠 현황 =====
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS raw_reviews JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS llm_judged_at TIMESTAMPTZ`;
    const c = (await sql`SELECT
      COUNT(*)::int total,
      COUNT(*) FILTER (WHERE published)::int published,
      COUNT(*) FILTER (WHERE NOT published)::int hidden,
      COUNT(*) FILTER (WHERE NOT published AND source='owner')::int owner_pending,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int embedded,
      COUNT(*) FILTER (WHERE published AND embedding IS NOT NULL)::int pub_embedded,
      COUNT(*) FILTER (WHERE published AND review_dates IS NOT NULL)::int pub_has_dates,
      COUNT(*) FILTER (WHERE review_dates IS NOT NULL)::int has_dates,
      COUNT(*) FILTER (WHERE raw_reviews IS NOT NULL)::int raw_cached,
      COUNT(*) FILTER (WHERE llm_judged_at IS NOT NULL)::int llm_judged
      FROM cafes`)[0];
    const grades = await sql`SELECT COALESCE(synth_grade,'미합성') grade, COUNT(*)::int n FROM cafes WHERE published GROUP BY synth_grade`;
    const quality = (await sql`SELECT
      ROUND(AVG((synth_quality->>'rejected')::float / NULLIF((synth_quality->>'raw')::float,0))::numeric * 100, 1) avg_noise_pct,
      SUM((synth_quality->>'raw')::int)::int raw, SUM((synth_quality->>'rejected')::int)::int rejected
      FROM cafes WHERE synth_quality IS NOT NULL`)[0];

    // 지역별 공개 카페 분포 (JS 버킷)
    const areas = (await sql`SELECT area FROM cafes WHERE published`) as unknown as { area: string }[];
    const regionMap: Record<string, number> = {};
    for (const r of areas) { const g = guOf(r.area); regionMap[g] = (regionMap[g] ?? 0) + 1; }
    const topRegions = Object.entries(regionMap).map(([region, n]) => ({ region, n })).sort((a, b) => b.n - a.n).slice(0, 12);

    // ⚠️ 접속/방문자 집계는 여기서 하지 않는다 — 봇·내부·스팸 필터가 없는 전체누적 정의라
    //    필터링된 DAU/WAU/MAU(orchestrator·analytics와 동일 정의)와 화면상 숫자가 어긋나 혼란을 줬다(#313).
    //    접속 통계는 /api/orchestrator·/api/admin/analytics(user_consents + BOT 필터, rolling)를 단일 소스로 쓴다.
    return NextResponse.json({
      ok: true,
      content: { ...c, grades, quality, topRegions },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
