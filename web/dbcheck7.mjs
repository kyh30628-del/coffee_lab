import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);
const r = await sql`UPDATE coordination SET status='resolved', resolution=${'2026-08-18 12:04 KST 정규 스케줄 실행이 정상 완료 확인됨(agent_runs: ok=true, processed=19, 치유19·정합성OK·오염의심215 정상 리포트). 08-18 08시대 수동 API 호출 2회 타임아웃은 함수 자체(수동 curl) 문제였고 실제 크론 스케줄 실행에는 영향 없었던 것으로 재확인 — SLA 리스크 해소.'}, resolved_at=now() WHERE id=317 AND status='open' RETURNING id,status`;
console.log(JSON.stringify(r,null,1));
