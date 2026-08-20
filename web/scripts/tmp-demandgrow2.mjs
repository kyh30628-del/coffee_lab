import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const done = await sql`SELECT id, region, area_label, keywords, priority, reason, found, inserted, created_at, consumed_at FROM discovery_targets WHERE status='done' AND created_at > now() - interval '10 days' ORDER BY created_at DESC LIMIT 20`;
console.log('DONE_OUTCOMES:', JSON.stringify(done));

const lowprio = await sql`SELECT id, region, keywords, priority, reason, found, inserted FROM discovery_targets WHERE priority <= 5 ORDER BY id DESC LIMIT 10`;
console.log('LOWPRIO_SOURCE:', JSON.stringify(lowprio));

// verified cafe density by 수도권 구/시 - check top gap areas beyond what's already been targeted
const density = await sql`
  SELECT area, count(*) total, count(*) FILTER (WHERE verified=true) verified,
    round(100.0*count(*) FILTER (WHERE verified=true)/NULLIF(count(*),0),1) vrate
  FROM cafes WHERE published=true AND area IS NOT NULL
  GROUP BY area HAVING count(*) > 15
  ORDER BY vrate ASC LIMIT 15`;
console.log('DENSITY_LOWEST_VRATE:', JSON.stringify(density));
