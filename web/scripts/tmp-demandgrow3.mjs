import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

// split conversion: SEO filler (reason mentions 롱테일) vs my region-specific targeting, last 14d
const split = await sql`
  SELECT (reason ILIKE '%롱테일%') AS is_seo_filler, count(*) n, sum(found) found, sum(inserted) inserted
  FROM discovery_targets WHERE status='done' AND consumed_at > now() - interval '14 days'
  GROUP BY is_seo_filler`;
console.log('SPLIT_14D:', JSON.stringify(split));

// judge/AI activity last 24h & 48h to confirm credit stall status
const judge = await sql`SELECT count(*) n FROM judge_decisions WHERE created_at > now() - interval '24 hours'`;
console.log('JUDGE_24H:', JSON.stringify(judge));
const aierr = await sql`SELECT count(*) FILTER (WHERE ai_err IS NOT NULL) errs, count(*) total FROM search_log WHERE ts > now() - interval '24 hours'`;
console.log('AIERR_24H:', JSON.stringify(aierr));

// verified cafe count trend
try {
  const vtrend = await sql`SELECT count(*) FILTER (WHERE verified_at > now() - interval '7 days') last7, count(*) FILTER (WHERE verified_at > now() - interval '14 days') last14 FROM cafes WHERE verified=true`;
  console.log('VTREND:', JSON.stringify(vtrend));
} catch (e) { console.log('VTREND_ERR:', e.message); }
