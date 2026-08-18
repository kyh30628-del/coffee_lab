import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const r1 = await sql`INSERT INTO decisions (title, detail, team, severity, action_type, status, tier, recommendation)
VALUES (
  '[룰갭 회귀의심] 일반명사 단독상호 앵커게이트(P47/#428)가 재합성 후에도 무관콘텐츠 통과 — id9294 온기·id19681 cafe JM재미',
  '자세한 내용: agent-reports/rulegap-proposals-20260818-1217.md 제안1. id9294(온기,서초구) synth_updated=08-10(규칙배포 07-22보다 늦음)인데도 표시 6건중 5건 무관(부동산 시황 블로그 등, trust=verified). id19681(cafe JM재미) 표시 1건이 무관 타지역 카페 리뷰("재미" 우연일치, COMMON_WORD_NAMES 미등재). 코드 재확인 필요: (1) id9294 raw review를 회귀테스트케이스로 verifyReview 실제거절여부 검증 (2) COMMON_WORD_NAMES에 "재미" 추가 검토.',
  '품질본부 룰갭발굴팀',
  'MED',
  'dev_task',
  'pending',
  'L3',
  'lib/reviewQuality.ts 코드수정 필요(CEO 확인 게이트). 승인 시 dev-claim 파이프라인이 자동 픽업하도록 action_type=dev_task로 등록.'
) RETURNING id`;
console.log('inserted decision1 id=', r1[0].id);

const r2 = await sql`INSERT INTO decisions (title, detail, team, severity, action_type, status, tier, recommendation)
VALUES (
  '[룰갭 신규] 브랜드/플랫폼명 충돌 — "해피빈"(네이버 기부 플랫폼)이 카페 상호에 포함되면 무관 기부콘텐츠 매칭',
  '자세한 내용: agent-reports/rulegap-proposals-20260818-1217.md 제안2. id7368(해피빈 행복한카페, 평택시, offctx_ok=false) 표시 6건중 4건이 네이버 해피빈 기부 플랫폼 관련 무관 콘텐츠(콩기부·기프티콘 당첨공지·저금통 기부결과). 제안: 카페명에 "해피빈" 포함 + 본문에 기부/저금통/기프티콘당첨/자출사 등 플랫폼 전용어 있고 CAFE_CONTEXT_SUBSTANCE 없으면 거절(HOTEL_LODGING_SIGNAL과 동일 좁은도메인 패턴).',
  '품질본부 룰갭발굴팀',
  'MED',
  'dev_task',
  'pending',
  'L3',
  'lib/reviewQuality.ts 코드수정 필요(CEO 확인 게이트). 승인 시 dev-claim 파이프라인이 자동 픽업하도록 action_type=dev_task로 등록.'
) RETURNING id`;
console.log('inserted decision2 id=', r2[0].id);
