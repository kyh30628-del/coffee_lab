import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);
await sql`UPDATE coordination SET
  detail = detail || E'\n\n[레드팀 08-20 16:20 추가조치] attraction 8/37 신규 판독(전량 오탐 — 미술관/수목원/식물원/한옥 부속카페, decision#32 선례 적용: 보름산미술관·일월수목원 데이지원·영흥수목원 버터플라이·부천 수피아·야자수마을카페·풍물기행 한옥카페·장인더 포천본점·빌리). 잔여 attraction 29건·generic-term 12건은 여전히 품질본부(검증심사팀) 본대 배치 필요 — status open 유지, 자기종결 금지.'
  WHERE id = 324`;
console.log('coord#324 updated');
