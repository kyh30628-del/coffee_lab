import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

// space + generic-ish tail word (not in GENERIC_WORD/SUFFIX), candidates for OR-token gap
const r = await sql`
  SELECT id, name, area, offctx_rate FROM cafes
  WHERE published=true AND offctx_rate > 0.1
    AND (name ~ ' (작업실|공방|스튜디오|가든|하우스|마켓|다이닝|키친|스토어|플레이스|룸|텃밭|정원)$')
  ORDER BY offctx_rate DESC NULLS LAST LIMIT 15`;
r.forEach(x => console.log(x.id, '|', x.name, '|', x.area, '|', x.offctx_rate));
