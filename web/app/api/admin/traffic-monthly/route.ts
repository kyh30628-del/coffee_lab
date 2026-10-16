import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 📈 접속자 전체 현황 — **월별 누적 + 전국 지역별 전수**(2026-10-16, CEO 지시).
//
// 왜 따로 만들었나: 기존 유입 화면(/api/admin/analytics)은 최근 구간 중심이라
//   "몇 달째 접속자가 어떻게 움직였나"와 "전국에서 어디가 되고 어디가 안 되나"를 한 화면에서 못 봤다.
//
// 💰 비용: traffic_events는 66,868행·14MB라 전수 집계가 298ms(실측). 인덱스 idx_traffic_events_ts 사용.
//   관리자가 열 때만 1회. 하루 수 회 수준이라 캐시 없이 간다(캐시가 오히려 '옛 숫자' 사고를 만든다 — 관제탑 규칙).
// 🤖 봇 제외는 bot_anon_cache 단일 출처만 쓴다(여기서 정규식을 다시 만들지 말 것 — 2026-07-26 재발방지).
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    // ① 월별 — 순방문자·PV·검색유입(네이버/구글/AI)·재방문
    const monthly = (await sql`
      SELECT to_char(ts AT TIME ZONE 'Asia/Seoul','YYYY-MM') m,
             count(DISTINCT anon_id)::int people,
             count(*)::int pv,
             count(DISTINCT anon_id) FILTER (WHERE src='naver')::int naver,
             count(DISTINCT anon_id) FILTER (WHERE src='google')::int google,
             count(DISTINCT anon_id) FILTER (WHERE src ILIKE '%chatgpt%' OR src ILIKE '%perplexity%' OR src ILIKE '%openai%' OR src ILIKE '%claude%')::int ai
      FROM traffic_events
      WHERE anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)
      GROUP BY 1 ORDER BY 1`) as any[];

    // ② 월별 재방문(2일 이상 방문한 사람)
    const repeat = (await sql`
      WITH d AS (
        SELECT anon_id, to_char(ts AT TIME ZONE 'Asia/Seoul','YYYY-MM') m,
               count(DISTINCT (ts AT TIME ZONE 'Asia/Seoul')::date) days
        FROM traffic_events WHERE anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)
        GROUP BY 1,2)
      SELECT m, count(*) FILTER (WHERE days >= 2)::int repeat_people FROM d GROUP BY 1`) as any[];
    const repeatBy = new Map(repeat.map((r) => [r.m, r.repeat_people]));

    // ③ 전국 지역별 — **공개 카페가 있는 지역 전수**. 유입은 착지 기준.
    //   🔴 2026-10-16 버그수리(CEO "지역이 아닌 것들은 뭐냐") — 경로가 URL 인코딩(/area/%EA%B4%91%EC%A3%BC%EC%8B%9C)인데
    //   디코딩 없이 지역명으로 썼다. 같은 지역이 '광주시'와 '%EA%B4%91...' 둘로 갈리고, FULL OUTER JOIN까지 겹쳐
    //   지역이 230개 → 441개로 부풀었다.
    //   ⚠️ SQL에서 decode(...,'hex')로 풀려다 깨졌다(부분 인코딩·잘못된 시퀀스에서 쿼리 전체가 죽는다).
    //      → **디코딩은 JS에서** 한다(decodeURIComponent, 실패 시 그 행만 버림). 기준 목록은 cafes.area로 고정.
    const rawHits = (await sql`
      SELECT substring(path from '^/area/([^/?]+)') seg, NULL::bigint cid, anon_id
      FROM traffic_events
      WHERE ts > now() - interval '90 days' AND anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)
        AND path LIKE '/area/%'
      UNION ALL
      SELECT NULL, NULLIF(substring(path from '^/c/([0-9]+)'),'')::bigint, anon_id
      FROM traffic_events
      WHERE ts > now() - interval '90 days' AND anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)
        AND path ~ '^/c/[0-9]+'`) as { seg: string | null; cid: string | null; anon_id: string }[];

    const cafeArea = new Map<string, string>(
      ((await sql`SELECT id, area FROM cafes WHERE published AND area IS NOT NULL`) as any[])
        .map((r) => [String(r.id), String(r.area)]),
    );
    const agg = new Map<string, { pv: number; people: Set<string> }>();
    for (const h of rawHits) {
      let region: string | null = null;
      if (h.seg) { try { region = decodeURIComponent(h.seg); } catch { region = null; } }
      else if (h.cid) region = cafeArea.get(String(h.cid)) ?? null;
      if (!region) continue;
      let a = agg.get(region);
      if (!a) { a = { pv: 0, people: new Set() }; agg.set(region, a); }
      a.pv++; a.people.add(h.anon_id);
    }
    const cafesByArea = (await sql`SELECT area, count(*)::int cafes FROM cafes
      WHERE published AND area IS NOT NULL AND area <> '' GROUP BY 1`) as { area: string; cafes: number }[];
    const byRegion = cafesByArea.map((c) => {
      const a = agg.get(c.area);
      return { region: c.area, cafes: c.cafes, people: a ? a.people.size : 0, pv: a ? a.pv : 0 };
    }).sort((x, y) => y.people - x.people || y.cafes - x.cafes);

    // ④ 패턴 — 요일별·시간대별(최근 90일). "언제 들어오는가"를 본다.
    const byDow = (await sql`
      SELECT EXTRACT(dow FROM ts AT TIME ZONE 'Asia/Seoul')::int dow,
             count(DISTINCT anon_id)::int people, count(*)::int pv
      FROM traffic_events
      WHERE ts > now() - interval '90 days' AND anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)
      GROUP BY 1 ORDER BY 1`) as any[];
    const byHour = (await sql`
      SELECT EXTRACT(hour FROM ts AT TIME ZONE 'Asia/Seoul')::int h,
             count(DISTINCT anon_id)::int people, count(*)::int pv
      FROM traffic_events
      WHERE ts > now() - interval '90 days' AND anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)
      GROUP BY 1 ORDER BY 1`) as any[];
    // ⑤ 패턴 — 체류 깊이(한 페이지만 보고 나갔나). 재방문을 못 만드는 원인 지표.
    const depth = (await sql`
      WITH p AS (
        SELECT anon_id, count(*)::int pv, count(DISTINCT path)::int paths
        FROM traffic_events
        WHERE ts > now() - interval '90 days' AND anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)
        GROUP BY 1)
      SELECT count(*)::int people,
             count(*) FILTER (WHERE paths = 1)::int one_page,
             count(*) FILTER (WHERE paths >= 3)::int three_plus,
             round(avg(pv)::numeric, 1)::float avg_pv
      FROM p`) as any[];

    const totals = {
      cafes: byRegion.reduce((a, r) => a + Number(r.cafes || 0), 0),
      regions: byRegion.length,
      regionsWithTraffic: byRegion.filter((r) => Number(r.people) > 0).length,
      regionsZero: byRegion.filter((r) => Number(r.people) === 0).length,
    };

    return NextResponse.json({
      ok: true, at: new Date().toISOString(),
      monthly: monthly.map((m) => ({ ...m, repeat: repeatBy.get(m.m) ?? 0 })),
      byRegion, totals, byDow, byHour, depth: depth[0] ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
  }
}
