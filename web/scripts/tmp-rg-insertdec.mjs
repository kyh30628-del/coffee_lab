import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const title = "[룰갭 신규] 네이버 카페(커뮤니티) 소스 — \"카페\" 동음이의로 본문언급 게이트 우회 (id11444·18112·10314 등 228곳)";
const detail = "자세한 내용: agent-reports/rulegap-proposals-20260821-1620.md 제안1. reviewQuality.ts:1832 짧은/흔한 상호명 카페맥락 게이트는 CAFE_CONTEXT(카페|커피|라떼...) 매치를 요구하나, source='네이버 카페'(온라인 커뮤니티 게시판) 원문은 '카페'가 커피숍/온라인커뮤니티 동음이의라 무관 콘텐츠도 우연히 게이트를 통과한다. 확정 3곳(전수 확인, 각 2건씩 무관): id11444 버라이어티(디저트샵, '김장훈 버라이어티 콘서트'/'용인예총 버라이어티 공연' 무관 유입), id18112 플러스82 안산점(카페, '안산 이유식 유아반찬 배송'/'안산 인터넷가입 안내' 무관 유입), id10314 리본(카페, '한남동 il chiasso 파인다이닝'/'대학생 연금투자 다이어리 리본포장' 무관 유입). 규모: source='네이버 카페' + 본문에 카페명 언급 경로 통과 = 268건 · 228개 카페(전부 오염은 아님 — id2917 커피볶는집 리베 등 정상 통과 사례도 확인, 이 코호트가 구조적으로 오탐 위험 높다는 의미). 제안 규칙: 게이트에서 source가 네이버 카페류 커뮤니티일 때 요구 수준을 CAFE_CONTEXT(약함)에서 CAFE_CONTEXT_SUBSTANCE(실질 음료·디저트 어휘, 이미 코드 246~272행에 정의됨, P59/P61 등에서 검증된 패턴 재사용)로 격상. 일반 블로그 소스는 기존 그대로 유지.";
const rows = await sql`
  INSERT INTO decisions (title, detail, team, severity, action_type, action_params, status, tier, recommendation)
  VALUES (
    ${title},
    ${detail},
    '품질본부 룰갭발굴팀',
    'LOW',
    'dev_task',
    ${JSON.stringify({
      file: "lib/reviewQuality.ts",
      cafes: [11444, 18112, 10314],
      pattern: "NAVERCAFE_SOURCE_SUBSTANCE_GATE",
      summary: "reviewQuality.ts:1832 게이트에서 리뷰 원본 소스가 '네이버 카페'(온라인 커뮤니티 게시판)류일 때, 현재 요구하는 CAFE_CONTEXT(약함, '카페' 단독 토큰 포함 매치) 대신 CAFE_CONTEXT_SUBSTANCE(실질 음료·디저트 어휘, '카페' 토큰 자체는 제외 — 246~272행에 이미 정의됨)를 요구하도록 격상. '카페'가 커피숍/온라인커뮤니티 동음이의라 커뮤니티 게시판 원문은 무관 콘텐츠도 게이트를 우연 통과하는 사례가 반복 확인됨(228개 카페·268건). 배포 전 무작위 published 표본 회귀 스캔으로 신규 오탐(특히 id2917류 실제 카페 언급 정상 리뷰) 0건 확인 필수."
    })},
    'pending',
    'L3',
    'lib/reviewQuality.ts 기존 CAFE_CONTEXT 게이트를 소스 조건부로 CAFE_CONTEXT_SUBSTANCE로 격상. 승인 시 dev-claim 파이프라인 자동 픽업하도록 action_type=dev_task로 등록.'
  )
  RETURNING id, title, status
`;
console.log(JSON.stringify(rows, null, 1));
