import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

console.log('=== H9: duplicate place_id (same Naver place, different cafe id), published ===');
const placeDup = await sql`
  SELECT place_id, array_agg(id) ids, array_agg(name) names, array_agg(published) pubs, count(*) c
  FROM cafes WHERE place_id IS NOT NULL AND place_id <> ''
  GROUP BY place_id HAVING count(*) > 1 ORDER BY c DESC LIMIT 20`;
console.log(JSON.stringify(placeDup,null,1));

console.log('=== H10: instagram_url shared across >1 published cafe (not same brand chain) ===');
const igDup = await sql`
  SELECT instagram_url, array_agg(id) ids, array_agg(name) names, count(*) c
  FROM cafes WHERE published AND instagram_url IS NOT NULL AND instagram_url <> ''
  GROUP BY instagram_url HAVING count(*) > 1 ORDER BY c DESC LIMIT 15`;
console.log(JSON.stringify(igDup,null,1));
