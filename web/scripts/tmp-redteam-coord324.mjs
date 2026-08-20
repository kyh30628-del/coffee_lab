import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
await sql`UPDATE coordination SET stage='진행중', accepted_at=COALESCE(accepted_at, now()),
  detail = detail || E'\n\n[레드팀 08-20 조치] noncafe-biz 11/11 사람판독 완료·태그 — 오탐 8건, 근거오염 신규발견 2건(id13050 소래산커피 5/6건 타카페·id13615 궁뜰38 2-3/6건 형제식당 혼입 → redteam-proposals-20260820 상신), 경미 1건(id1453). attraction 33건·generic-term 12건은 물량상 레드팀 단독범위 초과 — 품질본부(검증심사팀) 본대 배치 필요, status는 open 유지(자기종결 방지).'
  WHERE id = 324`;
const check = await sql`SELECT id,stage,status,LEFT(detail,400) d FROM coordination WHERE id=324`;
console.log(JSON.stringify(check,null,1));
