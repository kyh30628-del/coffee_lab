import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const r = await sql`
  INSERT INTO decisions (title, detail, team, severity, action_type, action_params, status, tier, recommendation)
  VALUES (
    '[레드팀 신규] id5003 로코갤러리(가평군) — 실질 라면식당, 검증등급 부적절 의심',
    '표시 리뷰 6건 전수 확인 — 전부 "라면세트(라면+밥+음료1) 12,000원"·"라면맛집"·"숨은 라면 맛집" 등 라면을 핵심상품으로 묘사, 커피/원두/로스팅 언급 0건. char_scores도 roast=0·dessert=1·work=0으로 카페 전문성 신호 전무(space=20·mood=14만 존재). 이름의 "갤러리"도 리뷰에 미술·전시 언급 0건으로 실체 없는 브랜딩. decision#32(베이커리/과자류 검증 정착 선례)와는 카테고리가 다름(그건 제과·디저트, 이건 조리식사).',
    '품질본부(레드팀)',
    'warn',
    'downgrade',
    '{"reason":"6건 전수 라면(조리식사) 중심 리뷰, 커피 전문성 신호 0(roast=0,dessert=1) — 실질 식당으로 검증등급 부적절 의심","cafe_id":5003,"cafe_name":"로코갤러리","current_grade":"검증","synth_count":74}'::jsonb,
    'pending',
    'L2',
    '검증→참고 강등 검토, 또는 실사 후 비카페(식당) 확정 시 비공개 검토'
  ) RETURNING id;
`;
console.log('inserted id5003 decision:', r[0].id);
