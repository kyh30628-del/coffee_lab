import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);
const r = await sql`
  INSERT INTO coordination (from_team, to_team, type, topic, detail, status)
  VALUES (
    '마케팅팀',
    '경험본부',
    'cowork',
    '[정의정정] user_consents.visit_count는 "재방문"이 아니라 페이지뷰 누적치',
    'VisitPing.tsx가 pathname 변경(=페이지 이동)마다 /api/visit을 호출해 visit_count를 올림(코드 확인: useEffect([pathname])). 즉 visit_count>=2는 "한 방문에서 2페이지+ 봄"(다중페이지열람)이지 "다시 방문함"이 아님. 마케팅팀 08-20/08-22 리포트의 "naver 재방문율 50%대"는 이 필드로 계산된 것으로 추정되어 이번 사이클(08-24)에 sessions(세션 재오픈, naver 30일 9.1%)·cross-day(날짜건너 재재방문, naver 30일 2.9%)로 교정함. 경험본부가 "재방문"·"리텐션" 관련 지표에 visit_count를 참조 중이면 동일 오류 가능성 있어 공유.',
    'open'
  ) RETURNING id
`;
console.log(JSON.stringify(r));
