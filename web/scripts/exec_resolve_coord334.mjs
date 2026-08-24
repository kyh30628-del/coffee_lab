import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  UPDATE coordination SET status='resolved', resolved_at=now(), resolution=${"기획조정실 조사 완료: web/lib/discover.ts:456 좌표전용 dedup(이름검증無)이 원인으로 확인. decision#814(L3, dev_task) 상신 완료, CEO 결재 대기. (a)단순 소진 가설 기각 — 6개지역 균일 저조+dedup박스 내 카페공존 0건은 알고리즘 산물"}
  WHERE id=334
  RETURNING id, status, resolved_at
`;
console.log(JSON.stringify(rows, null, 1));
