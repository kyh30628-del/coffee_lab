import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 📈 유입 분석 전용 API — 네이버·구글 없이 우리 DB(user_consents·traffic_events)로 상세 집계.
// 방문자 단위 지표는 user_consents(즉시), 페이지뷰·퍼널·추이는 traffic_events(적재되며 채워짐).
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
// 노이즈 제외: 봇 UA + 크롤러 referrer(UA로 안 잡히는 findelio·blinkx 등) + 내부(대표·팀). 거치면 '진짜 외부 방문자'만.
const CRAWLER_SRC = "findelio|blinkx|semrush|ahrefs|dataprovider|dotbot|petalbot|yandex|mj12|serpstat";
const BOT = `COALESCE(user_agent,'') !~* 'bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|preview' AND COALESCE(src,'') !~* '${CRAWLER_SRC}' AND COALESCE(src,'') NOT IN ('internal','spam') AND NOT COALESCE(internal, false)`;
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

// 🧾 일일 분석 요약 — 전일·7일평균 대비 증감(+근거) / 기기 비중 변화 / 요일·시간대 패턴을
// 실제 수치 없이는 문장을 만들지 않는다(표본 부족 시 '분석 불가' 명시, 숫자 날조 금지).
function buildDailyInsights(
  daily: any[], dailySources: any[], dailyDevices: any[], hours: any[], weekdays: any[],
  todayInsight?: { pages: any[]; dwell: { todayMs: number | null; todayN: number; yestMs: number | null; yestN: number }; serious: { visitors: number; serious: number } }
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
  if (todayInsight) {
    const { pages, dwell, serious } = todayInsight;
    // 오늘 가장 많이 본 페이지 유형 top (비중 = 오늘 전체 페이지뷰 대비)
    const totalToday = (pages || []).reduce((s, p) => s + (p.views ?? 0), 0);
    if (totalToday >= 1 && pages.length) {
      const top = pages[0];
      const topPct = Math.round((top.views / totalToday) * 100);
      insights.push(`오늘 가장 많이 본 화면은 '${top.bucket}'이에요(전체 조회의 ${topPct}%, ${top.views.toLocaleString()}회).`);
    }
    // 오늘 평균 체류시간 + 어제 대비 증감
    if (dwell.todayMs != null && dwell.todayN >= 3) {
      const secToday = Math.round(dwell.todayMs / 1000);
      let cmp = "(어제는 표본 부족으로 비교 불가)";
      if (dwell.yestMs != null && dwell.yestN >= 3) {
        const secYest = Math.round(dwell.yestMs / 1000);
        const diff = secToday - secYest;
        cmp = diff > 0 ? `어제(${secYest}초)보다 ${diff}초 길어졌어요` : diff < 0 ? `어제(${secYest}초)보다 ${Math.abs(diff)}초 짧아졌어요` : `어제(${secYest}초)와 비슷해요`;
      }
      insights.push(`오늘 평균 체류시간은 ${secToday}초예요. ${cmp}.`);
    } else if ((dwell.todayN ?? 0) > 0) {
      insights.push(`오늘 체류시간은 아직 표본이 적어(${dwell.todayN}건) 평균을 내기엔 일러요.`);
    }
    // 유의미한 사용자
    if (serious.visitors >= 1) {
      insights.push(`오늘 방문자 ${serious.visitors}명 중 ${serious.serious}명이 진지하게 둘러봤어요(카페 2곳+ 조회·60초+ 체류·재방문 중 하나).`);
    }
  }

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
    // 오늘(KST) 접속자·페이지뷰
    const todayVisitors = (await sql.query(
      `SELECT COUNT(*)::int n FROM user_consents
       WHERE (last_seen AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date AND ${BOT}`
    ).catch(() => [{ n: 0 }]))[0]?.n ?? 0;
    const todayPv = (await sql`SELECT COUNT(*)::int n FROM traffic_events
       WHERE (ts AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date`.catch(() => [{ n: 0 }]))[0]?.n ?? 0;
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

    // 일별 추이(최근 14일, KST) — 페이지뷰·방문자
    // ⚠️ 이벤트가 없는 날은 GROUP BY 결과에서 통째로 빠져 그래프가 도중에 끊겨 보였다(x축 배열 누락).
    //    generate_series로 14일 전체 날짜를 먼저 만들고 LEFT JOIN해 빈 날은 0으로 채운다(끊김 없이 연속 렌더).
    const daily = (await sql`
      WITH days AS (
        SELECT generate_series(
          (now() AT TIME ZONE 'Asia/Seoul')::date - interval '13 days',
          (now() AT TIME ZONE 'Asia/Seoul')::date,
          interval '1 day'
        )::date AS d
      )
      SELECT to_char(days.d, 'MM-DD') AS day,
             COALESCE(t.pageviews, 0)::int pageviews,
             COALESCE(t.visitors, 0)::int visitors
      FROM days
      LEFT JOIN (
        SELECT (ts AT TIME ZONE 'Asia/Seoul')::date AS d,
               COUNT(*)::int pageviews, COUNT(DISTINCT anon_id)::int visitors
        FROM traffic_events WHERE ts > now()-interval '14 days'
        GROUP BY 1
      ) t ON t.d = days.d
      ORDER BY days.d`.catch(() => [])) as any[];

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
      GROUP BY 1 ORDER BY views DESC`.catch(() => [])) as any[];

    // 인기 카페(조회순)
    const topCafes = (await sql`
      SELECT c.id, c.name, c.area, COUNT(*)::int views, COUNT(DISTINCT te.anon_id)::int uniques
      FROM traffic_events te JOIN cafes c ON te.path = '/c/' || c.id
      WHERE te.ts > now()-interval '30 days'
      GROUP BY c.id, c.name, c.area ORDER BY views DESC LIMIT 15`.catch(() => [])) as any[];

    // 인기 지역(조회된 카페의 area 집계)
    const topRegions = (await sql`
      SELECT c.area, COUNT(*)::int views, COUNT(DISTINCT te.anon_id)::int uniques
      FROM traffic_events te JOIN cafes c ON te.path = '/c/' || c.id
      WHERE te.ts > now()-interval '30 days'
      GROUP BY c.area ORDER BY views DESC LIMIT 12`.catch(() => [])) as any[];

    // 시간대 분포(KST 0~23)
    const hours = (await sql`
      SELECT EXTRACT(hour FROM ts AT TIME ZONE 'Asia/Seoul')::int AS h, COUNT(*)::int n
      FROM traffic_events WHERE ts > now()-interval '30 days' GROUP BY 1 ORDER BY 1`.catch(() => [])) as any[];

    // 요일 분포(KST, 0=일~6=토, 최근 30일) — '일일 분석 요약'의 요일 패턴 문장용
    const weekdays = (await sql`
      SELECT EXTRACT(dow FROM ts AT TIME ZONE 'Asia/Seoul')::int AS w, COUNT(*)::int n
      FROM traffic_events WHERE ts > now()-interval '30 days' GROUP BY 1`.catch(() => [])) as any[];

    // 일별 유입경로별 순방문자(최근 8일, KST, day='MM-DD'로 daily와 동일 포맷) — 오늘 급증/급감 소스 근거용
    const dailySources = (await sql`
      SELECT to_char(ts AT TIME ZONE 'Asia/Seoul', 'MM-DD') AS day,
             COALESCE(NULLIF(src,''),'미상') AS src,
             COUNT(DISTINCT anon_id)::int visitors
      FROM traffic_events WHERE ts > now()-interval '8 days'
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
      GROUP BY 1, 2`.catch(() => [])) as any[];

    // 퍼널 — 방문 → 카페상세 조회 → 여러 카페 탐색(몰입)
    const funnel = (await sql`
      SELECT COUNT(DISTINCT anon_id)::int visitors,
             COUNT(DISTINCT anon_id) FILTER (WHERE path LIKE '/c/%')::int viewed_cafe,
             COUNT(DISTINCT anon_id) FILTER (WHERE path LIKE '/area%' OR path LIKE '/taste%')::int browsed
      FROM traffic_events WHERE ts > now()-interval '30 days'`.catch(() => [{ visitors: 0, viewed_cafe: 0, browsed: 0 }]))[0] as any;
    // 여러 카페(2곳+) 본 몰입 방문자
    const engaged = (await sql`
      SELECT COUNT(*)::int n FROM (
        SELECT anon_id FROM traffic_events WHERE ts > now()-interval '30 days' AND path LIKE '/c/%'
        GROUP BY anon_id HAVING COUNT(DISTINCT path) >= 2) q`.catch(() => [{ n: 0 }]))[0]?.n ?? 0;

    const pageviews30d = (await sql`SELECT COUNT(*)::int n FROM traffic_events WHERE ts > now()-interval '30 days'`.catch(() => [{ n: 0 }]))[0]?.n ?? 0;

    // 📄 (1) 오늘(KST) 페이지 카테고리별 조회 순위 — 카페상세·홈지도·지역·취향·컬렉션·사장님 등으로 묶어 top 순위·비중
    const todayPages = (await sql`
      SELECT CASE
        WHEN path = '/' OR path = '' OR path IS NULL THEN '홈·지도'
        WHEN path LIKE '/c/%' THEN '카페상세'
        WHEN path LIKE '/area%' THEN '지역'
        WHEN path LIKE '/taste%' THEN '취향'
        WHEN path LIKE '/collections%' THEN '컬렉션'
        WHEN path LIKE '/share%' THEN '공유'
        WHEN path LIKE '/owner%' OR path LIKE '/cafe%' OR path LIKE '/business%' OR path LIKE '/pricing%' THEN '사장님'
        ELSE '기타' END AS bucket,
        COUNT(*)::int views, COUNT(DISTINCT anon_id)::int uniques
      FROM traffic_events
      WHERE (ts AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date
      GROUP BY 1 ORDER BY views DESC LIMIT 5`.catch(() => [])) as any[];

    // ⏱️ (2) 체류시간 — 오늘·어제(KST) 평균 체류(ms)와 표본수. duration_ms 채워진 페이지뷰만.
    const dwellRows = (await sql`
      SELECT (ts AT TIME ZONE 'Asia/Seoul')::date AS d,
             ROUND(AVG(duration_ms))::int avg_ms, COUNT(*)::int n
      FROM traffic_events
      WHERE duration_ms IS NOT NULL AND ts > now()-interval '2 days'
      GROUP BY 1`.catch(() => [])) as any[];
    const todayKst = (await sql`SELECT (now() AT TIME ZONE 'Asia/Seoul')::date::text d`.catch(() => [{ d: "" }]))[0]?.d ?? "";
    const dwellToday = dwellRows.find((r) => String(r.d) === todayKst) ?? null;
    const dwellYest = dwellRows.find((r) => String(r.d) !== todayKst) ?? null;

    // 🧑 (3) '유의미한 사용자' — 오늘 방문자 중 서로 다른 카페상세 2곳+ OR 체류 60초+ OR 재방문(세션 2회+, make-digest와 동일 기준)
    const serious = (await sql`
      WITH today AS (
        SELECT anon_id,
               COUNT(DISTINCT path) FILTER (WHERE path LIKE '/c/%') AS cafes,
               MAX(COALESCE(duration_ms, 0)) AS max_dur
        FROM traffic_events
        WHERE (ts AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date
        GROUP BY anon_id
      )
      SELECT COUNT(*)::int visitors,
             COUNT(*) FILTER (
               WHERE cafes >= 2 OR max_dur >= 60000
               OR anon_id IN (SELECT anon_id FROM user_consents WHERE COALESCE(sessions, 1) >= 2)
             )::int serious
      FROM today`.catch(() => [{ visitors: 0, serious: 0 }]))[0] as any;

    const todayInsight = {
      pages: todayPages,
      dwell: {
        todayMs: dwellToday?.avg_ms ?? null, todayN: dwellToday?.n ?? 0,
        yestMs: dwellYest?.avg_ms ?? null, yestN: dwellYest?.n ?? 0,
      },
      serious: { visitors: serious?.visitors ?? 0, serious: serious?.serious ?? 0 },
    };

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
      today: { visitors: todayVisitors, pageviews: todayPv },
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
