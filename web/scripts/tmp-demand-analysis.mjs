import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
const sql = neon(m[1].trim());

console.log('--- coordination inbox (성장/growth) ---');
console.log(JSON.stringify(await sql`SELECT id,from_team,type,topic,stage,status,detail FROM coordination WHERE status IN('open','in_progress') AND (to_team ILIKE '%성장%' OR to_team ILIKE '%growth%' OR to_team ILIKE '%grow%') ORDER BY id DESC LIMIT 10`, null, 1));

console.log('--- discovery_targets status counts ---');
console.log(JSON.stringify(await sql`SELECT status, count(*) FROM discovery_targets GROUP BY status`, null, 1));

console.log('--- discovery_targets pending detail ---');
console.log(JSON.stringify(await sql`SELECT id, region, area_label, priority, reason, created_at FROM discovery_targets WHERE status='pending' ORDER BY priority DESC LIMIT 20`, null, 1));

console.log('--- discovery_targets recent (any status, last 5 days) ---');
console.log(JSON.stringify(await sql`SELECT id, region, area_label, status, priority, created_at FROM discovery_targets WHERE created_at > now() - interval '5 days' ORDER BY created_at DESC LIMIT 30`, null, 1));

console.log('--- verified cafe density by area (published) ---');
console.log(JSON.stringify(await sql`
  SELECT area,
    count(*) FILTER (WHERE synth_grade='verified') AS verified,
    count(*) FILTER (WHERE synth_grade='reference') AS reference,
    count(*) AS total
  FROM cafes
  WHERE published = true AND (area LIKE '서울%' OR area LIKE '경기%' OR area LIKE '인천%')
  GROUP BY area
  ORDER BY verified ASC
  LIMIT 40
`, null, 1));

console.log('--- discovery lag: last discovery target date per area vs verified count ---');
console.log(JSON.stringify(await sql`
  SELECT area_label, max(created_at) AS last_target
  FROM discovery_targets
  GROUP BY area_label
  ORDER BY last_target ASC
  LIMIT 15
`, null, 1));
