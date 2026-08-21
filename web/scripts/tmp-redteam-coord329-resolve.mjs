import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

await sql`
  UPDATE coordination
  SET stage='수신확인', accepted_at=now()
  WHERE id=329
`;

const resolution = '#329는 08-20 03:05 시점 스냅샷(attraction 33+22·noncafe-biz 11) 기준 재알림으로 확인 — 실제로는 27차 사이클(coord#324)에서 attraction 23건·noncafe-biz 11건·generic-term 12건·franchise-branch 1건을 이미 전량 판독완료(08-20 23:25 resolved). 08-21 07:xx 신규 동결분(attraction 7건)만 실제 미판독이었음을 재확인해 레드팀이 직접 판독·태깅 완료(전부 오탐 — 독립카페 근접관광지 오매칭, 상세 근거는 redteam-20260821 리포트 참조). 현재 4개 카테고리(attraction/franchise-branch/generic-term/noncafe-biz) 전량 unread=0.';

await sql`
  UPDATE coordination
  SET status='resolved', resolved_at=now(), resolution=${resolution}
  WHERE id=329
`;

const check = await sql`SELECT id, status, stage, resolution FROM coordination WHERE id=329`;
console.log(JSON.stringify(check, null, 1));
