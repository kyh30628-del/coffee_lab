import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { BOT_ANON_IDS_SQL } from "../lib/behaviorBot.ts";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

// ① 재방문 코호트 (전체기간, 봇 제외, internal 제외)
const revisit = await sql.query(`
  SELECT
    COUNT(*) FILTER (WHERE visit_count >= 2) AS v2plus,
    COUNT(*) FILTER (WHERE visit_count >= 3) AS v3plus,
    COUNT(*) FILTER (WHERE visit_count >= 5) AS v5plus,
    COUNT(*) AS total
  FROM user_consents
  WHERE NOT COALESCE(internal,false)
    AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
`);
console.log("REVISIT", JSON.stringify(revisit));

// ② src별 방문자수 + 재방문율 (최근 30일 created_at 기준)
const bySrc = await sql.query(`
  SELECT src,
    COUNT(*) AS visitors,
    COUNT(*) FILTER (WHERE visit_count >= 2) AS revisitors,
    ROUND(100.0 * COUNT(*) FILTER (WHERE visit_count >= 2) / NULLIF(COUNT(*),0), 1) AS revisit_pct
  FROM user_consents
  WHERE NOT COALESCE(internal,false)
    AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
    AND created_at > now() - interval '30 days'
  GROUP BY src ORDER BY visitors DESC
`);
console.log("BY_SRC_30D", JSON.stringify(bySrc));

// ③ 몰입: traffic_events 기준 세션당 distinct path >=2 (카페상세 2곳+), 봇제외
const immersion = await sql.query(`
  SELECT
    COUNT(DISTINCT anon_id) FILTER (WHERE cafe_paths >= 2) AS cafe2plus,
    COUNT(DISTINCT anon_id) AS total_active
  FROM (
    SELECT anon_id, COUNT(DISTINCT path) FILTER (WHERE path LIKE '/c/%') AS cafe_paths
    FROM traffic_events
    WHERE ts > now() - interval '30 days'
      AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
    GROUP BY anon_id
  ) x
`);
console.log("IMMERSION_30D", JSON.stringify(immersion));

// ④ 실기능 사용: 위치동의(lat/lng not null), taste_logs, bookmarks — 스키마 확인 먼저
const tlCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='taste_logs' ORDER BY ordinal_position`;
console.log("TASTE_LOGS_COLS", JSON.stringify(tlCols.map(c=>c.column_name)));
const bmCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='bookmarks' ORDER BY ordinal_position`.catch(e=>[{err:String(e)}]);
console.log("BOOKMARKS_COLS", JSON.stringify(bmCols));

// ⑤ 일별 신규 외부 방문 추이 (최근 14일)
const daily = await sql.query(`
  SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Seoul') AS d, COUNT(*) AS n
  FROM user_consents
  WHERE NOT COALESCE(internal,false)
    AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
    AND created_at > now() - interval '14 days'
  GROUP BY 1 ORDER BY 1
`);
console.log("DAILY_14D", JSON.stringify(daily));

// ⑥ 모바일 비중 (최근 30일)
const mobile = await sql.query(`
  SELECT
    COUNT(*) FILTER (WHERE user_agent ~* 'Mobile|iPhone|Android') AS mobile_n,
    COUNT(*) AS total_n
  FROM user_consents
  WHERE NOT COALESCE(internal,false)
    AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
    AND created_at > now() - interval '30 days'
`);
console.log("MOBILE_30D", JSON.stringify(mobile));
