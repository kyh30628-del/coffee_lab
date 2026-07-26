// 🧾 오늘(KST) 페이지 조회 순위·체류시간·유의미 사용자 — /api/admin/analytics(라이브 관제 화면)와
//   scripts/make-digest.mjs(08·12·17시 일일보고서 파이프라인) 양쪽이 같은 쿼리·문장 로직을 쓰도록 단일화(#351).
//   이렇게 해야 매 사이클 DIGEST.md가 당일 최신 데이터로 자동 갱신되고, 수동 트리거 없이 일일보고서에 맞물린다.
// ⚠️ 봇 제외·오늘 방문자 총계는 lib/behaviorBot.ts BOT_ANON_IDS_SQL·lib/trafficMetrics.ts 단일 소스를 그대로
//   쓴다(#503) — 예전엔 이 파일이 봇 필터를 아예 안 걸어서 헤드라인 카드·추이그래프와 다른 숫자가 나왔다.
import { BOT_ANON_IDS_SQL } from "./behaviorBot";
import { getTodayTraffic } from "./trafficMetrics";

export type TodayInsight = {
  pages: { bucket: string; views: number; uniques: number }[];
  dwell: { todayMs: number | null; todayN: number; yestMs: number | null; yestN: number };
  serious: { visitors: number; serious: number };
};

export async function getTodayInsight(sql: any): Promise<TodayInsight> {
  // duration_ms 컬럼 보장 — 이 함수가 admin 화면 히트 없이(예: make-digest.mjs 단독 실행) 먼저 불려도
  // 안전하도록 여기서도 idempotent 마이그레이션(원본은 app/api/admin/analytics/route.ts에도 있음).
  await sql`ALTER TABLE traffic_events ADD COLUMN IF NOT EXISTS duration_ms INT`.catch(() => {});

  // 📄 오늘 페이지 카테고리별 조회 순위 — 카페상세·홈지도·지역·취향·컬렉션·사장님 등으로 묶어 top 순위·비중
  const todayPages = (await sql`
    SELECT CASE
      WHEN path = '/' OR path = '' OR path IS NULL THEN '홈·지도'
      WHEN path LIKE '/c/%' THEN '카페상세'
      WHEN path LIKE '/area%' THEN '지역'
      WHEN path LIKE '/taste%' THEN '취향'
      WHEN path LIKE '/collections%' THEN '컬렉션'
      WHEN path LIKE '/share%' THEN '공유'
      WHEN path LIKE '/owner%' OR path LIKE '/cafe/register%' OR path LIKE '/business%' OR path LIKE '/pricing%' THEN '사장님'
      ELSE '기타' END AS bucket,
      COUNT(*)::int views, COUNT(DISTINCT anon_id)::int uniques
    FROM traffic_events
    WHERE (ts AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date
      AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
    GROUP BY 1 ORDER BY views DESC LIMIT 5`.catch(() => [])) as any[];

  // ⏱️ 체류시간 — 오늘·어제(KST) 평균 체류(ms)와 표본수. duration_ms 채워진 페이지뷰만.
  const dwellRows = (await sql`
    SELECT (ts AT TIME ZONE 'Asia/Seoul')::date AS d,
           ROUND(AVG(duration_ms))::int avg_ms, COUNT(*)::int n
    FROM traffic_events
    WHERE duration_ms IS NOT NULL AND ts > now()-interval '2 days'
      AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
    GROUP BY 1`.catch(() => [])) as any[];
  const todayKst = (await sql`SELECT (now() AT TIME ZONE 'Asia/Seoul')::date::text d`.catch(() => [{ d: "" }]))[0]?.d ?? "";
  const dwellToday = dwellRows.find((r: any) => String(r.d) === todayKst) ?? null;
  const dwellYest = dwellRows.find((r: any) => String(r.d) !== todayKst) ?? null;

  // 🧑 '유의미한 사용자' — 오늘 방문자 중 서로 다른 카페상세 2곳+ OR 체류 60초+ OR 재방문(세션 2회+)
  // 분모(visitors)는 lib/trafficMetrics.ts getTodayTraffic()과 동일 소스 — 헤드라인 카드·추이그래프의
  // '오늘 방문자'와 이 문장의 '오늘 방문자'가 항상 같은 수를 가리키게 한다(#503, 별도 재계산 금지).
  const { visitors: todayVisitors } = await getTodayTraffic(sql);
  const seriousRow = (await sql`
    WITH today AS (
      SELECT anon_id,
             COUNT(DISTINCT path) FILTER (WHERE path LIKE '/c/%') AS cafes,
             MAX(COALESCE(duration_ms, 0)) AS max_dur
      FROM traffic_events
      WHERE (ts AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date
        AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
      GROUP BY anon_id
    )
    SELECT COUNT(*) FILTER (
      WHERE cafes >= 2 OR max_dur >= 60000
      OR anon_id IN (SELECT anon_id FROM user_consents WHERE COALESCE(sessions, 1) >= 2)
    )::int serious
    FROM today`.catch(() => [{ serious: 0 }]))[0] as any;

  return {
    pages: todayPages,
    dwell: {
      todayMs: dwellToday?.avg_ms ?? null, todayN: dwellToday?.n ?? 0,
      yestMs: dwellYest?.avg_ms ?? null, yestN: dwellYest?.n ?? 0,
    },
    serious: { visitors: todayVisitors, serious: seriousRow?.serious ?? 0 },
  };
}

// 문장화 — 실제 수치 없이는 문장을 만들지 않는다(표본 부족 시 생략, 숫자 날조 금지).
export function formatTodayInsightLines(todayInsight: TodayInsight): string[] {
  const lines: string[] = [];
  const { pages, dwell, serious } = todayInsight;

  const totalToday = (pages || []).reduce((s, p) => s + (p.views ?? 0), 0);
  if (totalToday >= 1 && pages.length) {
    const top = pages[0];
    const topPct = Math.round((top.views / totalToday) * 100);
    lines.push(`오늘 가장 많이 본 화면은 '${top.bucket}'이에요(전체 조회의 ${topPct}%, ${top.views.toLocaleString()}회).`);
  }

  if (dwell.todayMs != null && dwell.todayN >= 3) {
    const secToday = Math.round(dwell.todayMs / 1000);
    let cmp = "(어제는 표본 부족으로 비교 불가)";
    if (dwell.yestMs != null && dwell.yestN >= 3) {
      const secYest = Math.round(dwell.yestMs / 1000);
      const diff = secToday - secYest;
      cmp = diff > 0 ? `어제(${secYest}초)보다 ${diff}초 길어졌어요` : diff < 0 ? `어제(${secYest}초)보다 ${Math.abs(diff)}초 짧아졌어요` : `어제(${secYest}초)와 비슷해요`;
    }
    lines.push(`오늘 평균 체류시간은 ${secToday}초예요. ${cmp}.`);
  } else if ((dwell.todayN ?? 0) > 0) {
    lines.push(`오늘 체류시간은 아직 표본이 적어(${dwell.todayN}건) 평균을 내기엔 일러요.`);
  }

  if (serious.visitors >= 1) {
    lines.push(`오늘 방문자 ${serious.visitors}명 중 ${serious.serious}명이 진지하게 둘러봤어요(카페 2곳+ 조회·60초+ 체류·재방문 중 하나).`);
  }

  return lines;
}
