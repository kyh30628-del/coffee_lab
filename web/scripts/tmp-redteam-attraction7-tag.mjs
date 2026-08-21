import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const noteMap = {
  20137: '오탐 — 라디오엠, 삼청동 베이커리카페 정상 리뷰(빙수/빵 메뉴 직접언급)',
  17455: '오탐(경계) — 동양 차 문화관, 북촌동양문화박물관 부속 티하우스. 입장료 6,000원(음료값포함) 모델이라 decision#32 선례(별도과금 부속카페)와 결 다름 — 실제 방문객은 차를 마시러 옴(칡차/녹차 리뷰), 카페기능 존재로 판단하되 정책 재확인 권고',
  16953: '오탐 — 온클라우드나인, 사당역 빵집/카페 정상 리뷰. 관광지 연관성 없음(오매칭)',
  13838: '오탐 — 쿄쿄, 물향기수목원 "앞" 독립카페(부속 아님). decision#32 선례',
  10534: '오탐 — 벨라쿠키 안국, 안국역 쿠키전문 베이커리카페 정상 리뷰. 관광지 연관성 없음',
  16536: '오탐 — 카페 임초리, 아침고요수목원 인근 독립 애견동반카페. decision#32 선례',
  13239: '오탐 — 세인트린느프렌즈 NTM, 파주출판도시 박물관 "옆" 독립카페(부속 아님), 흑임자 디저트 직접언급. decision#32 선례',
};
for (const [id, note] of Object.entries(noteMap)) {
  await sql`UPDATE heal_attempts SET note = ${'[사람판독 08-21] ' + note} WHERE job='sentinel.attraction' AND target_id=${id}`;
}
const cats = await sql`
  SELECT job,
    count(*) FILTER (WHERE note LIKE '[사람판독%') AS read,
    count(*) FILTER (WHERE note IS NULL OR note NOT LIKE '[사람판독%') AS unread
  FROM heal_attempts
  WHERE frozen_until IS NOT NULL AND frozen_until > now()
  GROUP BY job ORDER BY job
`;
console.log('=== updated tally ===');
console.table(cats);
