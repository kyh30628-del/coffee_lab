import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const rows = await sql`SELECT name, char_scores, synth_reviews FROM cafes WHERE id=2302`;
const c = rows[0];
console.log('char_scores:', JSON.stringify(c.char_scores));
let sr; try { sr = typeof c.synth_reviews==='string'?JSON.parse(c.synth_reviews):c.synth_reviews; } catch(e){sr=[];}
sr.slice(0,3).forEach((r,i)=>console.log(i,(r.text||r.quote||r.review||JSON.stringify(r)).slice(0,140)));
