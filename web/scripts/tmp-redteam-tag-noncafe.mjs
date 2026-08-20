import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const notes = {
  12968: "[사람판독 08-20] 오탐 — 6건 전부 자기 베이커리(짬뽕순두부 언급은 동일 블로그포스트 내 인근 타업체 병기, 상호명 마커 존재로 이미 보존판정됨)",
  4008:  "[사람판독 08-20] 오탐 — 6건 전부 자기 베이커리(빠니스비떼)",
  11117: "[사람판독 08-20] 오탐 — 6건 전부 자기 빵집(도쿄팡야 판교도서관점)",
  9409:  "[사람판독 08-20] 오탐 — 6건 전부 자기 베이커리/브런치카페(밀스)",
  7202:  "[사람판독 08-20] 오탐 — 6건 전부 자기 카페(리셉션, 서촌)",
  17627: "[사람판독 08-20] 오탐 — 6건 전부 자기 카페(텐나인, 행주산성 인접이나 실제 카페 운영)",
  2220:  "[사람판독 08-20] 오탐 — 6건 전부 자기 카페(빈센트반커피)",
  18295: "[사람판독 08-20] 기지 케이스(코드주석 명시 사례) — 참고등급, 채용공고 잔재 1/6건 낮은우선순위. redteam 별도 상신 안 함",
  13050: "[사람판독 08-20] noncafe-biz 관점 오탐(레스토랑 업종어 없음)이나 별도 근거오염 발견 — 5/6건 타 카페(하우앤여우x3·청화공간·몬테인), redteam-proposals-20260820 상신",
  13615: "[사람판독 08-20] 2-3/6건 형제업체 '궁뜰 한정식'(식당) 혼입 — redteam-proposals-20260820 상신",
  1453:  "[사람판독 08-20] 1/6건 '부산제과'(경동시장 인근 타업체) 혼입, 경미 — resynth 권장",
};
for (const [id, note] of Object.entries(notes)) {
  await sql`UPDATE heal_attempts SET note = ${note} WHERE target_id = ${Number(id)} AND job = 'sentinel.noncafe-biz'`;
}
const check = await sql`SELECT target_id, note FROM heal_attempts WHERE job='sentinel.noncafe-biz' AND frozen_until > now() ORDER BY target_id`;
console.log(JSON.stringify(check, null, 1));
