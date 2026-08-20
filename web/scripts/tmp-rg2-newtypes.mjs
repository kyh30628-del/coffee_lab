import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const patterns = ['%스터디카페%','%만화카페%','%보드게임카페%','%룸카페%','%셀프사진관%','%인생네컷%','%애견카페%','%고양이카페%','%키즈카페%'];
for (const p of patterns) {
  const rows = await sql`SELECT id, name, area, offctx_rate, published, synth_count FROM cafes WHERE name ILIKE ${p} AND published = true LIMIT 5`;
  if (rows.length) {
    console.log(`\n=== ${p} ===`);
    rows.forEach(r => console.log(`${r.id}\t${r.name}\t${r.area}\trate=${r.offctx_rate}\tn=${r.synth_count}`));
  }
}
