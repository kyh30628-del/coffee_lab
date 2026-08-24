import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { BOT_ANON_IDS_SQL } from "../lib/behaviorBot.ts";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

// naver WoW 완결 7일: 08-17~08-23 vs 08-10~08-16 (KST)
const wow = await sql.query(`
  SELECT
    COUNT(*) FILTER (WHERE created_at AT TIME ZONE 'Asia/Seoul' >= '2026-08-17' AND created_at AT TIME ZONE 'Asia/Seoul' < '2026-08-24') AS this_week,
    COUNT(*) FILTER (WHERE created_at AT TIME ZONE 'Asia/Seoul' >= '2026-08-10' AND created_at AT TIME ZONE 'Asia/Seoul' < '2026-08-17') AS last_week
  FROM user_consents
  WHERE src='naver' AND NOT COALESCE(internal,false)
    AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
`);
console.log("NAVER_WOW", JSON.stringify(wow));

// 이번주 코호트(08-17~23)의 재방문 신호(session재오픈, cross-day) — 신규 정의
const cohort = await sql.query(`
  SELECT COUNT(*) AS n,
    COUNT(*) FILTER (WHERE sessions>=2) AS session_revisit,
    COUNT(*) FILTER (WHERE date_trunc('day', last_seen AT TIME ZONE 'Asia/Seoul') > date_trunc('day', created_at AT TIME ZONE 'Asia/Seoul')) AS crossday_revisit,
    COUNT(*) FILTER (WHERE visit_count>=2) AS pagedepth2plus
  FROM user_consents
  WHERE src='naver' AND NOT COALESCE(internal,false)
    AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
    AND created_at AT TIME ZONE 'Asia/Seoul' >= '2026-08-17' AND created_at AT TIME ZONE 'Asia/Seoul' < '2026-08-24'
`);
console.log("NAVER_COHORT_0817_23", JSON.stringify(cohort));

// AI답변엔진 (src 필드 기준, 확정 정의)
const ai = await sql.query(`
  SELECT src, COUNT(*) n, COUNT(*) FILTER (WHERE sessions>=2) session_revisit
  FROM user_consents
  WHERE src IN ('chatgpt.com','bing','perplexity.ai','copilot.microsoft.com')
    AND NOT COALESCE(internal,false) AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
  GROUP BY src
`);
console.log("AI_ENGINES", JSON.stringify(ai));

// 오늘(부분일) src 분포 이상탐지
const today = await sql.query(`
  SELECT src, COUNT(*) n FROM user_consents
  WHERE NOT COALESCE(internal,false) AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
    AND created_at AT TIME ZONE 'Asia/Seoul' >= '2026-08-24'
  GROUP BY src ORDER BY n DESC
`);
console.log("TODAY_SRC", JSON.stringify(today));
