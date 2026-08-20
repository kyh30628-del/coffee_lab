import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

// 1. coordination inbox for marketing/sales
const coord = await sql`SELECT id, from_team, to_team, type, topic, stage, status, created_at FROM coordination WHERE (to_team ILIKE '%마케팅%' OR to_team ILIKE '%영업%') AND status IN ('open','in_progress') ORDER BY id DESC`;
console.log('COORD_INBOX:', JSON.stringify(coord));

// 2. naver daily new visitors (KST-complete days) last 6 days
const naverDaily = await sql`
  SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS d, count(DISTINCT anon_id) AS cnt
  FROM user_consents
  WHERE src='naver' AND NOT COALESCE(internal,false)
    AND created_at >= now() - interval '7 days'
  GROUP BY 1 ORDER BY 1`;
console.log('NAVER_DAILY:', JSON.stringify(naverDaily));

// 3. WoW complete 7-day windows
const wow = await sql`
  SELECT
    count(DISTINCT anon_id) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN (current_date AT TIME ZONE 'Asia/Seoul')::date - 8 AND (current_date AT TIME ZONE 'Asia/Seoul')::date - 2) AS this_week,
    count(DISTINCT anon_id) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN (current_date AT TIME ZONE 'Asia/Seoul')::date - 15 AND (current_date AT TIME ZONE 'Asia/Seoul')::date - 9) AS last_week
  FROM user_consents WHERE src='naver' AND NOT COALESCE(internal,false)`;
console.log('WOW:', JSON.stringify(wow));

// 4. revisit rate for new-7d cohort (visit_count>=2)
const revisit7 = await sql`
  SELECT count(*) AS total, count(*) FILTER (WHERE visit_count >= 2) AS revisit
  FROM user_consents
  WHERE src='naver' AND NOT COALESCE(internal,false)
    AND (created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN (current_date AT TIME ZONE 'Asia/Seoul')::date - 8 AND (current_date AT TIME ZONE 'Asia/Seoul')::date - 2`;
console.log('REVISIT7:', JSON.stringify(revisit7));

// 5. AI answer engines
const aiEngines = await sql`
  SELECT src, count(DISTINCT anon_id) AS total, count(DISTINCT anon_id) FILTER (WHERE visit_count>=2) AS revisit
  FROM user_consents
  WHERE src IN ('chatgpt.com','bing','perplexity.ai','claude.ai') AND NOT COALESCE(internal,false)
  GROUP BY 1 ORDER BY 1`;
console.log('AI_ENGINES:', JSON.stringify(aiEngines));

// 6. mobile share last 7d
const mobile = await sql`
  SELECT
    count(*) FILTER (WHERE user_agent ILIKE '%Mobile%') AS mobile,
    count(*) AS total
  FROM user_consents
  WHERE src='naver' AND NOT COALESCE(internal,false)
    AND created_at >= now() - interval '7 days'`;
console.log('MOBILE:', JSON.stringify(mobile));

// 7. today's in-progress naver count (partial day)
const today = await sql`
  SELECT count(DISTINCT anon_id) AS cnt
  FROM user_consents
  WHERE src='naver' AND NOT COALESCE(internal,false)
    AND (created_at AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date`;
console.log('TODAY_PARTIAL:', JSON.stringify(today));
