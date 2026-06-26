import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { recordRun } from "@/lib/agentLog";

export const runtime = "nodejs";
export const maxDuration = 60;

// 📈 검색 수요→발굴/콘텐츠 루프 에이전트. search_log(검색 수요)를 분석해 '수요 높고 결과 빈약한 갭'을 찾는다.
//   → 발굴 우선순위(그 지역·키워드 더 캐기) + 콘텐츠 소재(그 주제로 큐레이션 글). 공급을 추측 아닌 '실수요'로 채운다.
//   결과는 demand_gaps에 저장 → 관제탑/콘텐츠 에이전트가 소비. 토큰 0(집계만).

const authed = (req: NextRequest) => {
  const s = process.env.CRON_SECRET;
  return (!!s && req.headers.get("authorization") === `Bearer ${s}`) || !s;
};

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS search_log (id BIGSERIAL PRIMARY KEY, q TEXT, region TEXT, results INT, mode TEXT, ts TIMESTAMPTZ DEFAULT now())`.catch(() => {});
    await sql`CREATE TABLE IF NOT EXISTS demand_gaps (id BIGSERIAL PRIMARY KEY, kind TEXT, term TEXT, region TEXT, searches INT, avg_results REAL, detected_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});

    const totalSearches = Number((await sql`SELECT count(*)::int n FROM search_log WHERE ts > now() - interval '30 days'`)[0]?.n ?? 0);

    // ① 갭: 같은 (질문·지역)이 자주 검색되는데 평균 결과가 빈약(<3) = 수요>공급
    const gaps = (await sql`SELECT q, region, count(*)::int searches, round(avg(results)::numeric, 1)::real avg_results
      FROM search_log WHERE ts > now() - interval '30 days' AND q <> ''
      GROUP BY q, region HAVING count(*) >= 3 AND avg(results) < 3
      ORDER BY count(*) DESC LIMIT 40`) as any[];
    // ② 지역 수요: 검색 많은 지역(발굴 우선순위 후보)
    const hotRegions = (await sql`SELECT region, count(*)::int searches, round(avg(results)::numeric,1)::real avg_results
      FROM search_log WHERE ts > now() - interval '30 days' AND region <> ''
      GROUP BY region ORDER BY count(*) DESC LIMIT 10`) as any[];

    // 갱신: 이번 분석 결과 저장(최근 것만 유지)
    await sql`DELETE FROM demand_gaps WHERE detected_at < now() - interval '60 days'`.catch(() => {});
    for (const g of gaps) {
      await sql`INSERT INTO demand_gaps (kind, term, region, searches, avg_results) VALUES ('query_gap', ${g.q}, ${g.region}, ${g.searches}, ${g.avg_results})`.catch(() => {});
    }

    const detail = `검색 ${totalSearches}건(30일) 수요갭 ${gaps.length} 핫지역 ${hotRegions.length}`;
    await recordRun("cron-demand", true, detail, gaps.length);
    return NextResponse.json({
      ok: true, ranAt: new Date().toISOString(),
      totalSearches30d: totalSearches,
      gapCount: gaps.length,
      gaps: gaps.slice(0, 20),
      hotRegions,
      note: totalSearches < 20 ? "검색 로그 축적 중 — 데이터 쌓이면 갭이 또렷해집니다" : undefined,
    });
  } catch (e) {
    await recordRun("cron-demand", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
