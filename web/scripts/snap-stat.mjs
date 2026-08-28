// 쿼리 통계 스냅샷 — 두 시점을 찍어 차이를 보면 "그 구간에 실제로 뭐가 돌았나"가 나온다.
import { readFileSync, writeFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url),"utf8");
for (const l of env.split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m&&!process.env[m[1]]) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT queryid::text q, calls, total_exec_time t,
  left(regexp_replace(query,'\s+',' ','g'),150) txt FROM pg_stat_statements`;
const out = { at: new Date().toISOString(), rows: Object.fromEntries(rows.map(r=>[r.q,{c:Number(r.calls),t:Number(r.t),x:r.txt}])) };
writeFileSync(process.argv[2], JSON.stringify(out));
console.log(`스냅샷 저장 ${process.argv[2]} · 쿼리종류 ${rows.length}개 · ${out.at}`);
