import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const rows = [
  {
    title: '[룰갭 신규] 다중토큰 상호명 부분토큰 OR-매칭 — id9683·id19744 무관 콘텐츠 매칭',
    detail: '자세한 내용: agent-reports/rulegap-proposals-20260818-1614.md 제안1. lib/reviewQuality.ts coreTokensDetail(L633)+distinctInBody/Title(L1082-1083)이 다중토큰(공백 포함) 상호명에서 identTokens.some()으로 토큰 하나만 히트해도 매칭 인정 — 흔한 부가어(작업실·하우스·포레스트류, GENERIC_WORD 미등재) 단독 일치로 무관 콘텐츠가 딸려옴. id9683(카야씨의 작업실) 6/6 무관("카야씨" 0건, "작업실"만 언급), id19744(포레스트 하우스) 1/6 무관("포레스트" 토큰만 일치, 다른 구 파티룸 업체). 붙여쓰기(미도리작업실·작업실301)·전체이름일치(베이커스 키친) 대조군은 정상 확인. 제안: 다중토큰 매칭 시 매칭 기여 토큰이 짧은/흔한 부가어뿐이면 weakSingle과 유사하게 전체이름 원문일치 우선 요구 또는 동 단위 지역어 AND 조건 추가.',
    team: '품질본부 룰갭발굴팀',
    severity: 'MED',
    action_type: 'dev_task',
    recommendation: 'lib/reviewQuality.ts 코드수정 필요(CEO 확인 게이트). 승인 시 dev-claim 파이프라인이 자동 픽업하도록 action_type=dev_task로 등록.',
  },
  {
    title: '[룰갭 신규 — 저위험] LANDMARK_WORDS "꿈의숲" 미등재 — id16913 5/6 무관 콘텐츠 매칭',
    detail: '자세한 내용: agent-reports/rulegap-proposals-20260818-1614.md 제안2. LANDMARK_WORDS(L544-557, 기존 서울숲·고려궁지·수봉별마루·추억의거리 4건 선례·decisions#584 패턴)에 "꿈의숲"(북서울꿈의숲, 강북구·노원구 대형 공원) 미등재. id16913(숲이 있는, 강북구) offctx_rate=0.34, 표시 6건 중 5건이 꿈의숲 관련 무관 콘텐츠(아트센터·맛집·벚꽃길·산책로, 카페 언급 0). 대조군(더숲 초소책방·숲속의 밤, 각 6/6 정상)으로 "숲" 글자 자체가 아니라 "꿈의숲" 랜드마크 미등재가 원인임을 확인. 제안: LANDMARK_WORDS 배열에 "꿈의숲" 1건 추가(기존 메커니즘 재사용, 신규 로직 없음, 저위험).',
    team: '품질본부 룰갭발굴팀',
    severity: 'LOW',
    action_type: 'dev_task',
    recommendation: 'lib/reviewQuality.ts 1줄 추가(기존 검증된 LANDMARK_WORDS 메커니즘 재사용). 승인 시 dev-claim 파이프라인이 자동 픽업하도록 action_type=dev_task로 등록.',
  },
];

for (const r of rows) {
  const inserted = await sql`
    INSERT INTO decisions (title, detail, team, severity, action_type, action_params, status, tier, recommendation)
    VALUES (${r.title}, ${r.detail}, ${r.team}, ${r.severity}, ${r.action_type}, NULL, 'pending', 'L3', ${r.recommendation})
    RETURNING id`;
  console.log('inserted decisions id=', inserted[0].id, '|', r.title.slice(0, 50));
}
