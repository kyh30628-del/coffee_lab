import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

const r1 = await sql`
  INSERT INTO decisions (title, detail, team, severity, action_type, action_params, status, tier, recommendation)
  VALUES (
    '[레드팀 재상신] id13050 소래산커피(시흥시 대야동) — requeue_resynth(#704) 무효 확인, 비공개로 격상',
    '08-15 decision#704(requeue_resynth)로 재합성 큐 등록 후 08-17 11:02 재합성 실행됨(synth_updated 갱신 확인). 그러나 재합성 후에도 표시 리뷰 6건이 08-13 최초 발견 당시와 100% 동일(같은 링크·같은 인용문, 하우앤여우×3·청화공간·몬테인 그대로) — "소래산" 지명 단독매칭 버그가 매칭로직 자체에 있어 재합성만으로는 자연치유 안 됨을 실증. #751-753 선례(근거오염 고비율=비공개+코드수정 병행) 기준 적용 요청.',
    '품질본부(레드팀)',
    'high',
    'unpublish',
    '{"reason":"requeue_resynth(#704) 실행 후에도 동일 오염 재현 — 매칭로직 근본결함, 데이터 재합성으로 해결 불가. 6건 중 5건(83%) 타업체, 1건 상호불명","cafe_id":13050,"cafe_name":"소래산커피","prior_decision":704}'::jsonb,
    'pending',
    'L2',
    '비공개 전환(재합성 재시도 무의미 확인) + 코드레벨 랜드마크 단독매칭 배제 룰 필요(품질본부 룰갭발굴팀 공유 권장)'
  ) RETURNING id;
`;
console.log('inserted id13050 decision:', r1[0].id);

const r2 = await sql`
  INSERT INTO decisions (title, detail, team, severity, action_type, action_params, status, tier, recommendation)
  VALUES (
    '[레드팀 신규] id13615 궁뜰38발효차커피족욕카페(광주시 도척면) — 형제식당 리뷰 33-50% 혼입',
    '표시 리뷰 6건 중 2-3건이 같은 주소(궁평하천길38)의 별개 업종 형제식당 "궁뜰 한정식/궁뜰 맛있는 발효밥상" 리뷰(네이버 분류=식당/한식). 나머지 3건은 정상 족욕카페 리뷰로 실제 업체 존재 확인 — 완전 비카페 잠입은 아니므로 비공개보다 재합성(오염 리뷰 제외)이 적정.',
    '품질본부(레드팀)',
    'warn',
    'purge_contam_reviews',
    '{"reason":"형제식당(한정식/발효밥상) 리뷰 33-50% 혼입, cleanCafeName 매칭 시 한정식/발효밥상 단독언급·족욕·카페 신호 없는 건 배제 필요","cafe_id":13615,"cafe_name":"궁뜰38발효차커피족욕카페"}'::jsonb,
    'pending',
    'L2',
    '오염 리뷰만 제외하고 재합성(족욕/카페 마커 우선, 한정식/발효밥상 단독 리뷰 배제) — 등급 유지 검토'
  ) RETURNING id;
`;
console.log('inserted id13615 decision:', r2[0].id);
