// 트래픽 지표(페이지뷰·순방문자) 단일 소스(#503) — 예전엔 대시보드 헤드라인 카드(user_consents.last_seen
// 기준)·14일 추이 그래프(traffic_events 기준, 행동기반 봇만 제외)·dailySummary.ts(봇 필터 아예 없음)가
// 각자 다른 필터·집계식을 써서 같은 날짜에도 다른 숫자가 나왔다(예: 469 vs 467, 101명 vs 99명).
// 봇 제외 기준은 lib/behaviorBot.ts BOT_ANON_IDS_SQL(단일 소스) 하나로, KST 날짜경계·집계식은 이 함수
// 하나로 통합한다. 헤드라인 카드는 getTodayTraffic()이 getDailyTraffic()의 마지막(오늘) 원소를 그대로
// 반환한 값을 쓰고, 14일 추이 그래프는 같은 배열을 그대로 쓴다 — 별도 재계산 금지(100% 일치 보장).
import { BOT_ANON_IDS_SQL } from "./behaviorBot";

export type DailyTraffic = { day: string; date: string; pageviews: number; visitors: number };

// 최근 days일(KST, 오늘 포함) 일별 페이지뷰·순방문자. 이벤트 없는 날도 0으로 채워 배열이 끊기지 않는다.
export async function getDailyTraffic(sql: any, days: number): Promise<DailyTraffic[]> {
  return (await sql`
    WITH days AS (
      SELECT generate_series(
        (now() AT TIME ZONE 'Asia/Seoul')::date - make_interval(days => ${days - 1}),
        (now() AT TIME ZONE 'Asia/Seoul')::date,
        interval '1 day'
      )::date AS d
    )
    SELECT to_char(days.d, 'MM-DD') AS day, days.d::text AS date,
           COALESCE(t.pageviews, 0)::int pageviews,
           COALESCE(t.visitors, 0)::int visitors
    FROM days
    LEFT JOIN (
      SELECT (ts AT TIME ZONE 'Asia/Seoul')::date AS d,
             COUNT(*)::int pageviews, COUNT(DISTINCT anon_id)::int visitors
      FROM traffic_events
      WHERE ts > now() - make_interval(days => ${days})
        AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
      GROUP BY 1
    ) t ON t.d = days.d
    ORDER BY days.d`.catch(() => [])) as DailyTraffic[];
}

// 오늘(KST) 페이지뷰·순방문자 — getDailyTraffic(1일)의 결과를 그대로 반환한다(별도 쿼리 아님).
// 14일 추이 그래프를 그릴 때도 daily[daily.length-1]이 곧 이 값과 같아야 한다.
export async function getTodayTraffic(sql: any): Promise<{ pageviews: number; visitors: number }> {
  const [today] = await getDailyTraffic(sql, 1);
  return { pageviews: today?.pageviews ?? 0, visitors: today?.visitors ?? 0 };
}
