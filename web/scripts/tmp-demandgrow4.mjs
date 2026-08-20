import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

try {
  const jb = await sql`SELECT count(*) n, max(created_at) latest FROM judge_batches WHERE created_at > now() - interval '48 hours'`;
  console.log('JUDGE_BATCHES_48H:', JSON.stringify(jb));
} catch (e) { console.log('ERR1', e.message); }

try {
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='cafes' AND column_name ILIKE '%verif%'`;
  console.log('CAFE_VERIF_COLS:', JSON.stringify(cols));
} catch (e) { console.log('ERR2', e.message); }

try {
  const needsllm = await sql`SELECT count(*) n FROM cafes WHERE needs_llm = true`;
  console.log('NEEDS_LLM:', JSON.stringify(needsllm));
} catch (e) { console.log('ERR3', e.message); }
