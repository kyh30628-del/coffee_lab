import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { BOT_ANON_IDS_SQL } from "../lib/behaviorBot.ts";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

// ① 진짜 재방문(세션 재오픈) 코호트 — sessions 컬럼(브라우저 재오픈 시 +1), visit_count(페이지뷰)와 다름
const revisitSessions = await sql.query(`
  SELECT
    COUNT(*) FILTER (WHERE sessions >= 2) AS s2plus,
    COUNT(*) FILTER (WHERE sessions >= 3) AS s3plus,
    COUNT(*) FILTER (WHERE sessions >= 5) AS s5plus,
    COUNT(*) AS total
  FROM user_consents
  WHERE NOT COALESCE(internal,false)
    AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
`);
console.log("REVISIT_SESSIONS", JSON.stringify(revisitSessions));

// ①-b 날짜를 건너 다시 온 경우 (created_at 날짜 != last_seen 날짜) — 가장 강한 재방문 증거
const crossDay = await sql.query(`
  SELECT COUNT(*) AS n
  FROM user_consents
  WHERE NOT COALESCE(internal,false)
    AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
    AND date_trunc('day', last_seen AT TIME ZONE 'Asia/Seoul') > date_trunc('day', created_at AT TIME ZONE 'Asia/Seoul')
`);
console.log("CROSS_DAY_REVISIT", JSON.stringify(crossDay));

// src별 sessions>=2 재방문율 (naver 북극성 지표)
const srcSessions = await sql.query(`
  SELECT src,
    COUNT(*) AS visitors,
    COUNT(*) FILTER (WHERE sessions >= 2) AS session_revisitors,
    ROUND(100.0*COUNT(*) FILTER (WHERE sessions>=2)/NULLIF(COUNT(*),0),1) AS session_revisit_pct,
    COUNT(*) FILTER (WHERE date_trunc('day', last_seen AT TIME ZONE 'Asia/Seoul') > date_trunc('day', created_at AT TIME ZONE 'Asia/Seoul')) AS crossday_revisitors
  FROM user_consents
  WHERE NOT COALESCE(internal,false)
    AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
    AND created_at > now() - interval '30 days'
  GROUP BY src ORDER BY visitors DESC
`);
console.log("SRC_SESSIONS_30D", JSON.stringify(srcSessions));

// taste_logs, bookmarks — anon_id 연결 불가(스키마 확인됨). 총량·기간만 참고치로.
const tl = await sql`SELECT COUNT(*) n, MIN(created_at) mn, MAX(created_at) mx FROM taste_logs`;
console.log("TASTE_LOGS_META", JSON.stringify(tl));
const bm = await sql`SELECT COUNT(*) n, MIN(created_at) mn, MAX(created_at) mx, COUNT(DISTINCT device_id) devices FROM bookmarks`;
console.log("BOOKMARKS_META", JSON.stringify(bm));

// 위치동의(agreed=true, lat/lng 있음) — 실기능 사용 신호, 봇/internal 제외
const geo = await sql.query(`
  SELECT COUNT(*) n FROM user_consents
  WHERE agreed = true AND lat IS NOT NULL AND NOT COALESCE(internal,false)
    AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
`);
console.log("GEO_CONSENT", JSON.stringify(geo));
