import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

// explicit KST-complete windows: this week 08-13~08-19, last week 08-06~08-12
const wow = await sql`
  SELECT
    count(DISTINCT anon_id) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN '2026-08-13' AND '2026-08-19') AS this_week,
    count(DISTINCT anon_id) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN '2026-08-06' AND '2026-08-12') AS last_week
  FROM user_consents WHERE src='naver' AND NOT COALESCE(internal,false)`;
console.log('WOW_EXPLICIT:', JSON.stringify(wow));

// revisit rate for this-week cohort (visit_count>=2), and last 3 days detail
const revisit = await sql`
  SELECT count(*) AS total, count(*) FILTER (WHERE visit_count>=2) AS r2
  FROM user_consents
  WHERE src='naver' AND NOT COALESCE(internal,false)
    AND (created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN '2026-08-13' AND '2026-08-19'`;
console.log('REVISIT_THISWEEK:', JSON.stringify(revisit));

// check 08-18, 08-19 drop: referrer diversity, anon concentration, UA diversity to rule out bot/anomaly on the DROP side (not a spike this time but a cliff)
const dropCheck = await sql`
  SELECT to_char((created_at AT TIME ZONE 'Asia/Seoul')::date,'YYYY-MM-DD') AS d,
    count(DISTINCT anon_id) AS anon_cnt,
    count(DISTINCT user_agent) AS ua_cnt,
    count(DISTINCT referrer) AS ref_cnt,
    count(DISTINCT region) AS region_cnt
  FROM user_consents
  WHERE src='naver' AND NOT COALESCE(internal,false)
    AND (created_at AT TIME ZONE 'Asia/Seoul')::date IN ('2026-08-16','2026-08-17','2026-08-18','2026-08-19','2026-08-20')
  GROUP BY 1 ORDER BY 1`;
console.log('DROP_CHECK:', JSON.stringify(dropCheck));

// hourly pattern for 08-17 (peak day) vs 08-18/19 (drop days) to see if peak was a burst
const hourly = await sql`
  SELECT to_char((created_at AT TIME ZONE 'Asia/Seoul')::date,'YYYY-MM-DD') AS d,
    extract(hour from (created_at AT TIME ZONE 'Asia/Seoul')) AS hr,
    count(DISTINCT anon_id) AS cnt
  FROM user_consents
  WHERE src='naver' AND NOT COALESCE(internal,false)
    AND (created_at AT TIME ZONE 'Asia/Seoul')::date IN ('2026-08-17','2026-08-18')
  GROUP BY 1,2 ORDER BY 1,2`;
console.log('HOURLY:', JSON.stringify(hourly));

// referrer path landing diversity for 08-17 vs 08-18 (was 08-17 dominated by one blog post / one query?)
const referrers17 = await sql`
  SELECT referrer, count(*) AS cnt FROM user_consents
  WHERE src='naver' AND NOT COALESCE(internal,false)
    AND (created_at AT TIME ZONE 'Asia/Seoul')::date = '2026-08-17'
  GROUP BY 1 ORDER BY 2 DESC LIMIT 8`;
console.log('REF17:', JSON.stringify(referrers17));
