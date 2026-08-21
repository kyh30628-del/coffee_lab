import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  INSERT INTO coordination (from_team, to_team, type, topic, detail, status, stage, created_at)
  VALUES (
    '폐업조사팀',
    '품질본부(자율 정합성 조사)',
    'handoff',
    '[주소갱신] id4371 비건베이커리 도야팡 — DB주소 구주소(폐업 오탐 원인)',
    'closure_misses=3로 검토대기 진입했으나 폐업 아님. 웹검색 확인: 2026년 상반기 중 "고산"에서 "의정부정보도서관 앞"(의정로 44)으로 이전, 영업 지속 중(블로그 최신 2026-08-09). 그러나 DB 주소는 구주소("경기도 의정부시 바대논길 112 1층") 그대로라 네이버 지역검색이 신주소 기준이라 매칭 실패 → cron-closure 오탐 근본원인. 네이버 지역검색 결과 신주소: "경기도 의정부시 의정로 44 105호"(mapx 1270352980, mapy 377366743). 주소/좌표 갱신 권장(비공개 대상 아님, misses는 자연 리셋 예정이나 근본원인은 주소 불일치).',
    'open',
    '신규',
    now()
  )
  RETURNING id
`;
console.log(JSON.stringify(rows));
