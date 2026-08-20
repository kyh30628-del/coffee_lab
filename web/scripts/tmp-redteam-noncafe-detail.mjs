import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const ids = [18295,13615,13050,7202,2220,1453,11117,17627,9409,4008,12968];
const rows = await sql`SELECT id,name,area,published,synth_grade,naver_category,offctx_rate,synth_identity FROM cafes WHERE id = ANY(${ids})`;
for (const r of rows) {
  console.log(`--- id${r.id} ${r.name} | area=${r.area} | published=${r.published} | grade=${r.synth_grade} | naver_cat=${r.naver_category} | offctx=${r.offctx_rate}`);
  console.log(`  identity: ${(r.synth_identity||'').slice(0,150)}`);
}
