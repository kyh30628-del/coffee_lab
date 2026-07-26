import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getTodayInsight, formatTodayInsightLines, type TodayInsight } from "@/lib/dailySummary";
import { BOT_ANON_IDS_SQL } from "@/lib/behaviorBot";
import { getDailyTraffic } from "@/lib/trafficMetrics";
export const runtime = "nodejs";

// 📈 유입 분석 전용 API — 네이버·구글 없이 우리 DB(user_consents·traffic_events)로 상세 집계.
// 방문자 단위 지표는 user_consents(즉시), 페이지뷰·퍼널·추이는 traffic_events(적재되며 채워짐).
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
// 🚨 재발방지(2026-07-26): 여기 로컬로 봇 정규식을 다시 만들지 말 것 — 예전에 이 자리에 있던 로컬
//   BOT 상수가 `src NOT IN ('internal','spam')`을 독자적으로 재도입해 #503과 똑같은 방식으로 진짜
//   방문자를 오탐(DAU 165→94, -43% 실측)하고 있었다. 노이즈 제외 기준은 lib/behaviorBot.ts의
//   `BOT_ANON_IDS_SQL` 단일출처만 쓴다(CEO 절대원칙, [[reference_traffic_analysis]]).
const BOT = `anon_id NOT IN (${BOT_ANON_IDS_SQL})`;
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

// 🧾 일일 분석 요약 — 전일·7일평균 대비 증감(+근거) / 기기 비중 변화 / 요일·시간대 패턴을
// 실제 수치 없이는 문장을 만들지 않는다(표본 부족 시 '분석 불가' 명시, 숫자 날조 금지).
function buildDailyInsights(
  daily: any[], dailySources: any[], dailyDevices: any[], hours: any[], weekdays: any[],
  todayInsight?: TodayInsight
): string[] {
  const insights: string[] = [];

  // (1) 전일·최근7일 평균 대비 증감 + 유입경로 근거
  if (daily.length < 2) {
    insights.push("일별 방문 추이를 분석하기엔 아직 데이터가 부족해요.");
  } else {
    const t = daily[daily.length - 1], y = daily[daily.length - 2];
    if ((t.visitors ?? 0) + (y.visitors ?? 0) < 3) {
      insights.push(`오늘 방문 ${t.visitors ?? 0}명 · 표본이 적어(어제 ${y.visitors ?? 0}명) 증감 추세는 분석 불가예요.`);
    } else {
      const diff = t.visitors - y.visitors;
      const diffPct = y.visitors ? Math.round(Math.abs(diff) / y.visitors * 100) : (t.visitors > 0 ? 100 : 0);
      const trendTxt = diff > 0 ? `어제보다 ${diff}명(${diffPct}%) 늘었어요` : diff < 0 ? `어제보다 ${Math.abs(diff)}명(${diffPct}%) 줄었어요` : "어제와 비슷한 수준이에요";
      const prev7 = daily.slice(-8, -1);
      const avg7 = prev7.length ? prev7.reduce((s, d) => s + (d.visitors ?? 0), 0) / prev7.length : 0;
      let vsAvgTxt = "";
      if (prev7.length >= 3 && avg7 >= 1) {
        const avgDiffPct = Math.round((t.visitors - avg7) / avg7 * 100);
        if (Math.abs(avgDiffPct) >= 20) vsAvgTxt = ` 최근 7일 평균(${avg7.toFixed(1)}명)보다 ${avgDiffPct > 0 ? `${avgDiffPct}% 많아요` : `${Math.abs(avgDiffPct)}% 적어요`}.`;
      }
      // 근거: 오늘 vs 지난 7일 같은 소스 평균 — 가장 크게 움직인 유입경로 1개
      let srcTxt = "";
      const byDay = new Map<string, Map<string, number>>();
      for (const r of dailySources) {
        if (!byDay.has(r.day)) byDay.set(r.day, new Map());
        byDay.get(r.day)!.set(r.src, r.visitors);
      }
      const todayMap = byDay.get(t.day);
      if (todayMap) {
        let mover: { src: string; today: number; hist: number; pct: number } | null = null;
        for (const [src, todayN] of todayMap) {
          if (todayN < 2) continue;
          let histSum = 0, histDays = 0;
          for (const [day, m] of byDay) {
            if (day === t.day) continue;
            histSum += m.get(src) ?? 0; histDays++;
          }
          if (histDays < 3) continue;
          const histAvg = histSum / histDays;
          if (histAvg < 1) continue;
          const pct = Math.round((todayN - histAvg) / histAvg * 100);
          if (Math.abs(pct) >= 50 && (!mover || Math.abs(pct) > Math.abs(mover.pct))) mover = { src, today: todayN, hist: histAvg, pct };
        }
        if (mover) {
          const label = mover.src === "미상" ? "미상(추적 전 방문)" : mover.src;
          srcTxt = ` ${label} 유입이 평소(${mover.hist.toFixed(1)}명)보다 ${mover.pct > 0 ? `${mover.pct}% 급증` : `${Math.abs(mover.pct)}% 급감`}했어요(오늘 ${mover.today}명).`;
        }
      }
      insights.push(`오늘 방문 ${t.visitors}명 · ${trendTxt}.${vsAvgTxt}${srcTxt}`);
    }
  }

  // (2) 기기별 비중 + 전일 대비 변화
  if (daily.length >= 1) {
    const t = daily[daily.length - 1], y = daily.length >= 2 ? daily[daily.length - 2] : null;
    const sumDev = (rows: any[]) => rows.reduce((s, r) => s + (r.n ?? 0), 0);
    const pctOf = (rows: any[], dev: string, total: number) => total ? Math.round((rows.find((r) => r.dev === dev)?.n ?? 0) / total * 100) : 0;
    const todayRows = dailyDevices.filter((r) => r.day === t.day);
    const todayTotal = sumDev(todayRows);
    if (todayTotal < 3) {
      insights.push("오늘은 기기별 비중을 분석하기엔 방문 표본이 부족해요.");
    } else {
      const mobPctToday = pctOf(todayRows, "mobile", todayTotal);
      let cmpTxt = "(전일 비교는 데이터 부족)";
      if (y) {
        const yestRows = dailyDevices.filter((r) => r.day === y.day);
        const yestTotal = sumDev(yestRows);
        if (yestTotal >= 3) {
          const mobPctYest = pctOf(yestRows, "mobile", yestTotal);
          const deltaP = mobPctToday - mobPctYest;
          cmpTxt = `전일(${mobPctYest}%) 대비 ${deltaP > 0 ? `${deltaP}%p 늘었어요` : deltaP < 0 ? `${Math.abs(deltaP)}%p 줄었어요` : "비슷해요"}`;
        }
      }
      insights.push(`오늘 모바일 방문 비중은 ${mobPctToday}%예요. ${cmpTxt}.`);
    }
  }

  // (3) 요일 또는 시간대 중 더 뚜렷한 패턴 1개
  const hourTotal = hours.reduce((s, h) => s + (h.n ?? 0), 0);
  const wdTotal = weekdays.reduce((s, w) => s + (w.n ?? 0), 0);
  if (hourTotal < 10 && wdTotal < 10) {
    insights.push("요일·시간대별 패턴을 분석하기엔 최근 30일 데이터가 부족해요.");
  } else {
    let hourRatio = 0, peakH = -1, peakHN = 0;
    if (hourTotal >= 10) {
      for (const h of hours) if ((h.n ?? 0) > peakHN) { peakHN = h.n; peakH = h.h; }
      hourRatio = (peakHN / hourTotal) / (1 / 24);
    }
    let wdRatio = 0, peakW = -1, peakWN = 0;
    if (wdTotal >= 10) {
      for (const w of weekdays) if ((w.n ?? 0) > peakWN) { peakWN = w.n; peakW = w.w; }
      wdRatio = (peakWN / wdTotal) / (1 / 7);
    }
    if (hourRatio < 1.3 && wdRatio < 1.3) {
      insights.push("최근 30일 트래픽은 요일·시간대별로 특별히 몰리지 않고 고르게 분포해요.");
    } else if (hourRatio >= wdRatio) {
      insights.push(`최근 30일 방문은 ${peakH}시대에 가장 몰려요(전체의 ${Math.round(peakHN / hourTotal * 100)}%, ${peakHN}건).`);
    } else {
      insights.push(`최근 30일 방문은 ${WEEKDAY_KO[peakW]}요일에 가장 많았어요(전체의 ${Math.round(peakWN / wdTotal * 100)}%, ${peakWN}건).`);
    }
  }

  // (4) 오늘 페이지 조회 순위 / 체류시간 / 유의미한 사용자 — todayInsight가 있을 때만(표본 없으면 문장 생략)
  //     실제 쿼리·문장 로직은 lib/dailySummary.ts 단일출처(scripts/make-digest.mjs와 공유, #351)
  if (todayInsight) insights.push(...formatTodayInsightLines(todayInsight));

  return insights;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS traffic_events (id BIGSERIAL PRIMARY KEY, anon_id TEXT, path TEXT, src TEXT, ts TIMESTAMPTZ NOT NULL DEFAULT now())`.catch(() => {});
    await sql`ALTER TABLE traffic_events ADD COLUMN IF NOT EXISTS duration_ms INT`.catch(() => {});

    // 핵심 KPI (방문자 — user_consents)
    const kpi = (await sql.query(
      `SELECT
        COUNT(*) FILTER (WHERE last_seen > now()-interval '1 day')::int dau,
        COUNT(*) FILTER (WHERE last_seen > now()-interval '7 days')::int wau,
        COUNT(*) FILTER (WHERE last_seen > now()-interval '30 days')::int mau,
        COUNT(*) FILTER (WHERE created_at > now()-interval '7 days')::int new7,
        COUNT(*) FILTER (WHERE created_at > now()-interval '30 days')::int new30,
        COUNT(*) FILTER (WHERE last_seen > now()-interval '30 days' AND COALESCE(visit_count,1) > 1)::int returning30,
        SUM(COALESCE(visit_count,1)) FILTER (WHERE last_seen > now()-interval '30 days')::int totalvisits
      FROM user_consents WHERE ${BOT}`
    ).catch(() => [{}]))[0] as any;

    // 🟢 실시간 접속 — 최근 5분/30분 활성(방문핑이 last_seen 갱신)
    const live = (await sql.query(
      `SELECT COUNT(*) FILTER (WHERE last_seen > now()-interval '5 minutes')::int active5,
              COUNT(*) FILTER (WHERE last_seen > now()-interval '30 minutes')::int active30
       FROM user_consents WHERE ${BOT}`
    ).catch(() => [{ active5: 0, active30: 0 }]))[0] as any;
    // 위치 동의 퍼널 — 방문 → 위치요청 응답(agreed IS NOT NULL) → 동의(agreed=true) → 위치공유(region 보유)
    // ⚠️ agreed는 방문 핑에선 NULL(미정)로 남는다(app/api/visit/route.ts) — 모달에 실제로 응답한 사람만 IS NOT NULL.
    //    과거엔 이 구분 없이 '전체 방문' 대비로 동의율을 계산해 실제보다 훨씬 낮게 보였다(집계 로직 누락).
    const consent = (await sql.query(
      `SELECT COUNT(*)::int pinged,
              COUNT(*) FILTER (WHERE agreed IS NOT NULL)::int asked,
              COUNT(*) FILTER (WHERE agreed IS TRUE)::int agreed,
              COUNT(*) FILTER (WHERE region IS NOT NULL)::int located
       FROM user_consents WHERE ${BOT}`
    ).catch(() => [{ pinged: 0, asked: 0, agreed: 0, located: 0 }]))[0] as any;
    // 방문자 지역 분포(위치 공유한 방문자)
    const visitorRegions = (await sql.query(
      `SELECT region, COUNT(*)::int n FROM user_consents
       WHERE region IS NOT NULL AND ${BOT} GROUP BY region ORDER BY n DESC LIMIT 12`
    ).catch(() => [])) as any[];

    // 유입경로 — 고유 방문자·평균 재방문·비중
    const sources = (await sql.query(
      `SELECT COALESCE(NULLIF(src,''),'미상') AS src, COUNT(*)::int visitors,
              ROUND(AVG(COALESCE(visit_count,1))::numeric,1) AS avg_visits,
              SUM(COALESCE(visit_count,1))::int visits
       FROM user_consents WHERE last_seen > now()-interval '30 days' AND ${BOT}
       GROUP BY 1 ORDER BY visitors DESC LIMIT 15`
    ).catch(() => [])) as any[];

    // 신규 vs 재방문
    const retention = (await sql.query(
      `SELECT COUNT(*) FILTER (WHERE COALESCE(visit_count,1) <= 1)::int newcomers,
              COUNT(*) FILTER (WHERE COALESCE(visit_count,1) > 1)::int ret
       FROM user_consents WHERE last_seen > now()-interval '30 days' AND ${BOT}`
    ).catch(() => [{ newcomers: 0, ret: 0 }]))[0] as any;

    // 기기(모바일/태블릿/데스크톱) — user_agent 추정. 태블릿은 iPad·Tablet 토큰 또는 'Mobile' 없는 Android로 판별.
    const devices = (await sql.query(
      `SELECT CASE
         WHEN user_agent ~* 'iPad|Tablet' OR (user_agent ~* 'Android' AND user_agent !~* 'Mobile') THEN 'tablet'
         WHEN user_agent ~* 'Mobile|iPhone|Android' THEN 'mobile'
         ELSE 'desktop' END AS dev, COUNT(*)::int n
       FROM user_consents WHERE last_seen > now()-interval '30 days' AND ${BOT} GROUP BY 1`
    ).catch(() => [])) as any[];

    // 일별 추이(최근 14일, KST) — 페이지뷰·순방문자. 단일 소스 lib/trafficMetrics.ts(#503) — 아래 헤드라인
    // 카드의 '오늘' 값도 이 배열의 마지막(오늘) 원소를 그대로 써서 그래프와 100% 일치를 보장한다(별도 쿼리 금지).
    const daily = await getDailyTraffic(sql, 14);
    const todayTraffic = daily[daily.length - 1] ?? { pageviews: 0, visitors: 0 };

    // 페이지 유형
    const pageBuckets = (await sql`
      SELECT CASE
        WHEN path = '/' OR path = '' OR path IS NULL THEN '홈'
        WHEN path LIKE '/c/%' THEN '카페상세'
        WHEN path LIKE '/area%' THEN '지역'
        WHEN path LIKE '/taste%' THEN '취향'
        WHEN path LIKE '/owner%' OR path LIKE '/cafe%' THEN '사장님'
        ELSE '기타' END AS bucket,
        COUNT(*)::int views, COUNT(DISTINCT anon_id)::int uniques
      FROM traffic_events WHERE ts > now()-interval '30 days'
        AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
      GROUP BY 1 ORDER BY views DESC`.catch(() => [])) as any[];

    // 인기 카페(조회순)
    const topCafes = (await sql`
      SELECT c.id, c.name, c.area, COUNT(*)::int views, COUNT(DISTINCT te.anon_id)::int uniques
      FROM traffic_events te JOIN cafes c ON te.path = '/c/' || c.id
      WHERE te.ts > now()-interval '30 days'
        AND te.anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
      GROUP BY c.id, c.name, c.area ORDER BY views DESC LIMIT 15`.catch(() => [])) as any[];

    // 인기 지역(조회된 카페의 area 집계)
    const topRegions = (await sql`
      SELECT c.area, COUNT(*)::int views, COUNT(DISTINCT te.anon_id)::int uniques
      FROM traffic_events te JOIN cafes c ON te.path = '/c/' || c.id
      WHERE te.ts > now()-interval '30 days'
        AND te.anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
      GROUP BY c.area ORDER BY views DESC LIMIT 12`.catch(() => [])) as any[];

    // 시간대 분포(KST 0~23)
    const hours = (await sql`
      SELECT EXTRACT(hour FROM ts AT TIME ZONE 'Asia/Seoul')::int AS h, COUNT(*)::int n
      FROM traffic_events WHERE ts > now()-interval '30 days'
        AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)}) GROUP BY 1 ORDER BY 1`.catch(() => [])) as any[];

    // 요일 분포(KST, 0=일~6=토, 최근 30일) — '일일 분석 요약'의 요일 패턴 문장용
    const weekdays = (await sql`
      SELECT EXTRACT(dow FROM ts AT TIME ZONE 'Asia/Seoul')::int AS w, COUNT(*)::int n
      FROM traffic_events WHERE ts > now()-interval '30 days'
        AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)}) GROUP BY 1`.catch(() => [])) as any[];

    // 일별 유입경로별 순방문자(최근 8일, KST, day='MM-DD'로 daily와 동일 포맷) — 오늘 급증/급감 소스 근거용
    const dailySources = (await sql`
      SELECT to_char(ts AT TIME ZONE 'Asia/Seoul', 'MM-DD') AS day,
             COALESCE(NULLIF(src,''),'미상') AS src,
             COUNT(DISTINCT anon_id)::int visitors
      FROM traffic_events WHERE ts > now()-interval '8 days'
        AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
      GROUP BY 1, 2`.catch(() => [])) as any[];

    // 일별 기기 비중(최근 2일, KST) — traffic_events × user_consents.user_agent 조인
    const dailyDevices = (await sql`
      SELECT to_char(te.ts AT TIME ZONE 'Asia/Seoul', 'MM-DD') AS day,
        CASE
          WHEN uc.user_agent ~* 'iPad|Tablet' OR (uc.user_agent ~* 'Android' AND uc.user_agent !~* 'Mobile') THEN 'tablet'
          WHEN uc.user_agent ~* 'Mobile|iPhone|Android' THEN 'mobile'
          ELSE 'desktop' END AS dev,
        COUNT(DISTINCT te.anon_id)::int n
      FROM traffic_events te JOIN user_consents uc ON uc.anon_id = te.anon_id
      WHERE te.ts > now()-interval '2 days'
        AND te.anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
      GROUP BY 1, 2`.catch(() => [])) as any[];

    // 퍼널 — 방문 → 카페상세 조회 → 여러 카페 탐색(몰입)
    const funnel = (await sql`
      SELECT COUNT(DISTINCT anon_id)::int visitors,
             COUNT(DISTINCT anon_id) FILTER (WHERE path LIKE '/c/%')::int viewed_cafe,
             COUNT(DISTINCT anon_id) FILTER (WHERE path LIKE '/area%' OR path LIKE '/taste%')::int browsed
      FROM traffic_events WHERE ts > now()-interval '30 days'
        AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})`.catch(() => [{ visitors: 0, viewed_cafe: 0, browsed: 0 }]))[0] as any;
    // 여러 카페(2곳+) 본 몰입 방문자
    const engaged = (await sql`
      SELECT COUNT(*)::int n FROM (
        SELECT anon_id FROM traffic_events WHERE ts > now()-interval '30 days' AND path LIKE '/c/%'
          AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
        GROUP BY anon_id HAVING COUNT(DISTINCT path) >= 2) q`.catch(() => [{ n: 0 }]))[0]?.n ?? 0;

    const pageviews30d = (await sql`SELECT COUNT(*)::int n FROM traffic_events WHERE ts > now()-interval '30 days'
      AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})`.catch(() => [{ n: 0 }]))[0]?.n ?? 0;

    // 📄⏱️🧑 오늘(KST) 페이지 조회 순위·체류시간·유의미 사용자 — lib/dailySummary.ts 단일출처
    //   (scripts/make-digest.mjs의 일일보고서 파이프라인과 동일 쿼리를 공유, #351)
    const todayInsight = await getTodayInsight(sql);

    const dailyInsights = buildDailyInsights(daily, dailySources, dailyDevices, hours, weekdays, todayInsight);

    // 🧑 진짜 사용자 신호 — 봇으로 설명 안 되는 신호(재방문·기능사용·검색유입 재방문율)
    // r2/r3/r5 = 페이지 열람 2/3/5장+ (visit_count=페이지뷰). trueReturn = 다른 날 다시 온 진짜 재방문.
    const cohort = (await sql.query(
      `SELECT COUNT(*) FILTER (WHERE COALESCE(visit_count,1)>=2)::int r2,
              COUNT(*) FILTER (WHERE COALESCE(visit_count,1)>=3)::int r3,
              COUNT(*) FILTER (WHERE COALESCE(visit_count,1)>=5)::int r5,
              COUNT(*) FILTER (WHERE COALESCE(sessions,1) >= 2)::int truereturn
       FROM user_consents WHERE last_seen>now()-interval '30 days' AND ${BOT}`).catch(() => [{}]))[0] as any;
    // 위치동의 상세: 전체동의 → 내부기기 제외 → 최종(실사용자) → 지역명 유/무(카톡 인앱 GPS 미획득 등)
    const consentDetail = (await sql`SELECT
        COUNT(*) FILTER (WHERE agreed IS TRUE)::int total,
        COUNT(*) FILTER (WHERE agreed IS TRUE AND COALESCE(internal,false))::int internal,
        COUNT(*) FILTER (WHERE agreed IS TRUE AND NOT COALESCE(internal,false))::int real,
        COUNT(*) FILTER (WHERE agreed IS TRUE AND NOT COALESCE(internal,false) AND region IS NOT NULL)::int located,
        COUNT(*) FILTER (WHERE agreed IS TRUE AND NOT COALESCE(internal,false) AND region IS NULL)::int unlocated
      FROM user_consents`.catch(() => [{ total: 0, internal: 0, real: 0, located: 0, unlocated: 0 }]))[0] as any;
    const consentReal = consentDetail?.real ?? 0;
    const tasteN = (await sql`SELECT COUNT(*)::int n FROM taste_logs`.catch(() => [{ n: 0 }]))[0]?.n ?? 0;
    const bookmarkN = (await sql`SELECT COUNT(*)::int n FROM bookmarks`.catch(() => [{ n: 0 }]))[0]?.n ?? 0;

    // ❤ '내 카페 추억' 즐겨찾기(하트) — user_visits.favorite (위치인증 방문기록 중 하트 표시된 것)
    const favStat = (await sql`SELECT COUNT(*)::int total,
        COUNT(*) FILTER (WHERE created_at > now()-interval '7 days')::int last7
      FROM user_visits WHERE favorite = true AND verified = true`.catch(() => [{ total: 0, last7: 0 }]))[0] as any;
    const favDaily = (await sql`
      WITH days AS (
        SELECT generate_series(
          (now() AT TIME ZONE 'Asia/Seoul')::date - interval '13 days',
          (now() AT TIME ZONE 'Asia/Seoul')::date,
          interval '1 day'
        )::date AS d
      )
      SELECT to_char(days.d, 'MM-DD') AS day, COALESCE(f.n, 0)::int n
      FROM days
      LEFT JOIN (
        SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS d, COUNT(*)::int n
        FROM user_visits WHERE favorite = true AND verified = true AND created_at > now()-interval '14 days'
        GROUP BY 1
      ) f ON f.d = days.d
      ORDER BY days.d`.catch(() => [])) as any[];
    const topFavCafes = (await sql`
      SELECT c.name, c.area, COUNT(*)::int n
      FROM user_visits v JOIN cafes c ON c.id = v.cafe_id
      WHERE v.favorite = true AND v.verified = true
      GROUP BY c.id, c.name, c.area ORDER BY n DESC LIMIT 8`.catch(() => [])) as any[];
    const realSources = (await sql.query(
      `SELECT src, COUNT(*)::int visitors,
              COUNT(*) FILTER (WHERE COALESCE(sessions,1) >= 2)::int returned,
              ROUND(AVG(COALESCE(visit_count,1))::numeric,1) avg_pv
       FROM user_consents WHERE src IN('naver','google','instagram','youtube','threads','kakao') AND last_seen>now()-interval '30 days' AND ${BOT}
       GROUP BY 1 ORDER BY visitors DESC`).catch(() => [])) as any[];

    // 📣 공유 기록 — 사용자가 카페를 타인에게 공유한 이벤트(바이럴). 내부(대표·팀) 제외.
    await sql`CREATE TABLE IF NOT EXISTS share_events (id BIGSERIAL PRIMARY KEY, anon_id TEXT, path TEXT, cafe_id INT, channel TEXT, ts TIMESTAMPTZ NOT NULL DEFAULT now())`.catch(() => {});
    const shares = (await sql`SELECT COUNT(*)::int total,
        COUNT(*) FILTER (WHERE channel='kakao')::int kakao,
        COUNT(*) FILTER (WHERE channel='web')::int web,
        COUNT(*) FILTER (WHERE channel='clipboard')::int clip,
        COUNT(DISTINCT s.anon_id)::int sharers,
        COUNT(*) FILTER (WHERE s.ts > (now() AT TIME ZONE 'Asia/Seoul')::date)::int today
      FROM share_events s LEFT JOIN user_consents u ON s.anon_id = u.anon_id
      WHERE s.ts > now()-interval '30 days' AND NOT COALESCE(u.internal, false)`.catch(() => [{}]))[0] as any;
    const topShared = (await sql`SELECT c.name, c.area, COUNT(*)::int n
      FROM share_events s JOIN cafes c ON s.cafe_id = c.id LEFT JOIN user_consents u ON s.anon_id = u.anon_id
      WHERE s.ts > now()-interval '30 days' AND NOT COALESCE(u.internal, false)
      GROUP BY c.id, c.name, c.area ORDER BY n DESC LIMIT 6`.catch(() => [])) as any[];

    return NextResponse.json({
      realUsers: {
        r2: cohort?.r2 ?? 0, r3: cohort?.r3 ?? 0, r5: cohort?.r5 ?? 0, trueReturn: cohort?.truereturn ?? 0,
        consent: consentReal, taste: tasteN, bookmark: bookmarkN,
        consentDetail: {
          total: consentDetail?.total ?? 0, internal: consentDetail?.internal ?? 0, real: consentDetail?.real ?? 0,
          located: consentDetail?.located ?? 0, unlocated: consentDetail?.unlocated ?? 0,
        },
      }, realSources,
      shares: { total: shares?.total ?? 0, kakao: shares?.kakao ?? 0, web: shares?.web ?? 0, clip: shares?.clip ?? 0, sharers: shares?.sharers ?? 0, today: shares?.today ?? 0 }, topShared,
      favorites: { total: favStat?.total ?? 0, last7: favStat?.last7 ?? 0, daily: favDaily, topCafes: topFavCafes },
      ok: true, generatedAt: new Date().toISOString(),
      kpi: {
        dau: kpi?.dau ?? 0, wau: kpi?.wau ?? 0, mau: kpi?.mau ?? 0,
        new7: kpi?.new7 ?? 0, new30: kpi?.new30 ?? 0, returning30: kpi?.returning30 ?? 0,
        totalVisits: kpi?.totalvisits ?? 0, pageviews30d,
      },
      realtime: { active5: live?.active5 ?? 0, active30: live?.active30 ?? 0 },
      today: { visitors: todayTraffic.visitors, pageviews: todayTraffic.pageviews },
      consent: { pinged: consent?.pinged ?? 0, asked: consent?.asked ?? 0, agreed: consent?.agreed ?? 0, located: consent?.located ?? 0 },
      visitorRegions,
      sources, retention: { newcomers: retention?.newcomers ?? 0, returning: retention?.ret ?? 0 },
      devices, daily, dailyInsights, todayInsight, pageBuckets, topCafes, topRegions, hours,
      funnel: { visitors: funnel?.visitors ?? 0, viewedCafe: funnel?.viewed_cafe ?? 0, browsed: funnel?.browsed ?? 0, engaged },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
