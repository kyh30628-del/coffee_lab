import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

console.log('=== H6: phone number reused across published cafes >1km apart ===');
const phoneDup = await sql`
  WITH d AS (
    SELECT phone, array_agg(id) ids, array_agg(name) names, array_agg(lat) lats, array_agg(lng) lngs, count(*) c
    FROM cafes WHERE published AND phone IS NOT NULL AND phone <> '' GROUP BY phone HAVING count(*) > 1
  )
  SELECT * FROM d ORDER BY c DESC LIMIT 15`;
for (const r of phoneDup) {
  // compute max pairwise distance roughly
  let maxd = 0;
  for (let i=0;i<r.ids.length;i++) for (let j=i+1;j<r.ids.length;j++) {
    const dlat=(r.lats[i]-r.lats[j])*111000, dlng=(r.lngs[i]-r.lngs[j])*88000;
    const d=Math.sqrt(dlat*dlat+dlng*dlng);
    if (d>maxd) maxd=d;
  }
  if (maxd > 500) console.log(r.phone, r.ids, r.names, 'maxdist_m=', Math.round(maxd));
}

console.log('=== H7: near-duplicate coords (<40m), different id, published ===');
const nearDup = await sql`
  SELECT a.id ida, a.name na, a.lat la, a.lng lo, b.id idb, b.name nb
  FROM cafes a JOIN cafes b ON a.id < b.id
    AND a.published AND b.published
    AND abs(a.lat-b.lat) < 0.0004 AND abs(a.lng-b.lng) < 0.0005
  LIMIT 30`;
console.log(JSON.stringify(nearDup,null,1));

console.log('=== H8: exact address literal dup, different id, published ===');
const addrDup = await sql`
  SELECT address, array_agg(id) ids, array_agg(name) names, count(*) c
  FROM cafes WHERE published AND address IS NOT NULL AND address <> ''
  GROUP BY address HAVING count(*) > 1 ORDER BY c DESC LIMIT 15`;
console.log(JSON.stringify(addrDup,null,1));
