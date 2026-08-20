import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const ids = [7976, 2403, 11011, 13226, 16638, 3069];
for (const id of ids) {
  const rows = await sql`SELECT id, name, area, synth_grade, synth_reviews FROM cafes WHERE id = ${id}`;
  const r = rows[0];
  const lodging = /(숙박|투숙|1박\s*2일|글램핑|펜션|연수원|바베큐\s*무한리필|단체\s*워크숍|가평숙소|가평리조트|계곡\s*물놀이)/;
  const substance = /(커피|라떼|아메리카노|에스프레소|콜드브루|디저트|케이크|베이커리|빵|원두|바리스타)/;
  console.log(`\n=== ${r.id} ${r.name} (${r.area}) grade=${r.synth_grade} ===`);
  for (const rv of r.synth_reviews) {
    const q = rv.quote || '';
    if (lodging.test(q) && !substance.test(q)) {
      console.log('LEAK> ' + q.slice(0, 180).replace(/\n/g, ' '));
    }
  }
}
