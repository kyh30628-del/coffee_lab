import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const runs = await sql`SELECT job, ok, detail, ran_at FROM agent_runs WHERE job = 'cron-costwatch'`;
console.log('COSTWATCH_RUNS:', JSON.stringify(runs));

const coordCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'coordination'`;
console.log('COORD_COLS:', JSON.stringify(coordCols));

