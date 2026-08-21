import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const ids = ['4640','14536','7784','7785','4064','18091','7835','13854'];
const rows = await sql`SELECT id, name, area, synth_reviews FROM cafes WHERE id = ANY(${ids})`;
for (const r of rows) {
  const matches = r.synth_reviews.filter(x => [
    'https://blog.naver.com/flythedj/224189250399',
    'https://blog.naver.com/hh__n/224197632038',
    'https://blog.naver.com/hyo_ggg93/224206685846',
    'https://blog.naver.com/neatran/223556866274',
  ].includes(x.link));
  console.log(`#${r.id} ${r.name} [${r.area}]`);
  for (const m of matches) console.log('  link:', m.link, '| quote:', m.quote.slice(0,80));
}
