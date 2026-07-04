import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 📈 유입 분석 전용 API — 네이버·구글 없이 우리 DB(user_consents·traffic_events)로 상세 집계.
// 방문자 단위 지표는 user_consents(즉시), 페이지뷰·퍼널·추이는 traffic_events(적재되며 채워짐).
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
// 노이즈 제외: 봇 UA + 크롤러 referrer(UA로 안 잡히는 findelio·blinkx 등) + 내부(대표·팀). 거치면 '진짜 외부 방문자'만.
const CRAWLER_SRC = "findelio|blinkx|semrush|ahrefs|dataprovider|dotbot|petalbot|yandex|mj12|serpstat";
const BOT = `COALESCE(user_agent,'') !~* 'bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|preview' AND COALESCE(src,'') !~* '${CRAWLER_SRC}' AND NOT COALESCE(internal, false)`;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS traffic_events (id BIGSERIAL PRIMARY KEY, anon_id TEXT, path TEXT, src TEXT, ts TIMESTAMPTZ NOT NULL DEFAULT now())`.catch(() => {});

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
    // 위치 동의 퍼널 — 방문 → 위치동의 → 위치공유(region 보유)
    const consent = (await sql.query(
      `SELECT COUNT(*)::int pinged,
              COUNT(*) FILTER (WHERE agreed IS TRUE)::int agreed,
              COUNT(*) FILTER (WHERE region IS NOT NULL)::int located
       FROM user_consents WHERE ${BOT}`
    ).catch(() => [{ pinged: 0, agreed: 0, located: 0 }]))[0] as any;
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

    // 기기(모바일/데스크톱) — user_agent 추정
    const devices = (await sql.query(
      `SELECT CASE WHEN user_agent ~* 'Mobile|iPhone|Android|iPad' THEN 'mobile' ELSE 'desktop' END AS dev, COUNT(*)::int n
       FROM user_consents WHERE last_seen > now()-interval '30 days' AND ${BOT} GROUP BY 1`
    ).catch(() => [])) as any[];

    // 일별 추이(최근 14일, KST) — 페이지뷰·방문자
    const daily = (await sql`
      SELECT to_char((ts AT TIME ZONE 'Asia/Seoul')::date, 'MM-DD') AS day,
             COUNT(*)::int pageviews, COUNT(DISTINCT anon_id)::int visitors
      FROM traffic_events WHERE ts > now()-interval '14 days'
      GROUP BY 1 ORDER BY 1`.catch(() => [])) as any[];

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

    // 🧑 진짜 사용자 신호 — 봇으로 설명 안 되는 신호(재방문·기능사용·검색유입 재방문율)
    const cohort = (await sql.query(
      `SELECT COUNT(*) FILTER (WHERE COALESCE(visit_count,1)>=2)::int r2,
              COUNT(*) FILTER (WHERE COALESCE(visit_count,1)>=3)::int r3,
              COUNT(*) FILTER (WHERE COALESCE(visit_count,1)>=5)::int r5
       FROM user_consents WHERE last_seen>now()-interval '30 days' AND ${BOT}`).catch(() => [{}]))[0] as any;
    const consentReal = (await sql`SELECT COUNT(*)::int n FROM user_consents WHERE agreed IS TRUE AND NOT COALESCE(internal,false)`.catch(() => [{ n: 0 }]))[0]?.n ?? 0;
    const tasteN = (await sql`SELECT COUNT(*)::int n FROM taste_logs`.catch(() => [{ n: 0 }]))[0]?.n ?? 0;
    const bookmarkN = (await sql`SELECT COUNT(*)::int n FROM bookmarks`.catch(() => [{ n: 0 }]))[0]?.n ?? 0;
    const realSources = (await sql.query(
      `SELECT src, COUNT(*)::int visitors, COUNT(*) FILTER (WHERE COALESCE(visit_count,1)>=2)::int returned, ROUND(AVG(COALESCE(visit_count,1))::numeric,1) avg_visits
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
      realUsers: { r2: cohort?.r2 ?? 0, r3: cohort?.r3 ?? 0, r5: cohort?.r5 ?? 0, consent: consentReal, taste: tasteN, bookmark: bookmarkN }, realSources,
      shares: { total: shares?.total ?? 0, kakao: shares?.kakao ?? 0, web: shares?.web ?? 0, clip: shares?.clip ?? 0, sharers: shares?.sharers ?? 0, today: shares?.today ?? 0 }, topShared,
      ok: true, generatedAt: new Date().toISOString(),
      kpi: {
        dau: kpi?.dau ?? 0, wau: kpi?.wau ?? 0, mau: kpi?.mau ?? 0,
        new7: kpi?.new7 ?? 0, new30: kpi?.new30 ?? 0, returning30: kpi?.returning30 ?? 0,
        totalVisits: kpi?.totalvisits ?? 0, pageviews30d,
      },
      realtime: { active5: live?.active5 ?? 0, active30: live?.active30 ?? 0 },
      today: { visitors: todayVisitors, pageviews: todayPv },
      consent: { pinged: consent?.pinged ?? 0, agreed: consent?.agreed ?? 0, located: consent?.located ?? 0 },
      visitorRegions,
      sources, retention: { newcomers: retention?.newcomers ?? 0, returning: retention?.ret ?? 0 },
      devices, daily, pageBuckets, topCafes, topRegions, hours,
      funnel: { visitors: funnel?.visitors ?? 0, viewedCafe: funnel?.viewed_cafe ?? 0, browsed: funnel?.browsed ?? 0, engaged },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
