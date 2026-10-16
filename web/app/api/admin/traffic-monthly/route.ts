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

    // ③ 전국 지역별 — 유입(착지 기준) + 보유 카페. 230개 지역 전수.
    //    /area/{지역} 착지와 /c/{id}(카페의 area)를 합쳐 '그 지역이 받은 사람 수'로 센다.
    const byRegion = (await sql`
      WITH ev AS (
        SELECT anon_id,
               COALESCE(
                 substring(path from '^/area/([^/?]+)'),
                 (SELECT area FROM cafes WHERE cafes.id = NULLIF(substring(path from '^/c/([0-9]+)'),'')::bigint)
               ) AS region
        FROM traffic_events
        WHERE ts > now() - interval '90 days'
          AND anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)
          AND (path LIKE '/area/%' OR path ~ '^/c/[0-9]+')
      ),
      t AS (SELECT region, count(DISTINCT anon_id)::int people, count(*)::int pv FROM ev WHERE region IS NOT NULL GROUP BY 1),
      c AS (SELECT area, count(*)::int cafes FROM cafes WHERE published GROUP BY 1)
      SELECT COALESCE(c.area, t.region) region, COALESCE(c.cafes,0) cafes,
             COALESCE(t.people,0) people, COALESCE(t.pv,0) pv
      FROM c FULL OUTER JOIN t ON c.area = t.region
      ORDER BY people DESC NULLS LAST, cafes DESC`) as any[];

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
