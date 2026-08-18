import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const ids = ['9294','18064','7368','20145','19681','9395','11264'];
const rows = await sql`SELECT id, name, synth_updated, offctx_ok FROM cafes WHERE id = ANY(${ids})`;
rows.forEach(r => console.log(r.id, r.name, 'synth_updated=', r.synth_updated, 'offctx_ok=', r.offctx_ok));
