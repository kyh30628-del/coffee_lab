// 행동기반 봇 코호트 판별(#472, 결재#463 후속) — 관제탑 표출 집계 전용 헬퍼.
// app/api/admin/analytics|lounge|stats 의 UA 키워드 필터(BOT/NOISE 상수)는 못 잡는
// 위장형 헤드리스 대응: 일반 데스크톱 Chrome UA로 위장했지만
//   ① 유입 이력이 전부 src=direct
//   ② 콘텐츠 페이지 진입 0(경로가 홈 '/' 뿐)
//   ③ 데스크톱 UA(Mobile/Android/iPhone/iPad 토큰 없음)
//   ④ 새벽(KST 0~8시)에만 발생
// 을 전부 만족하는 anon_id를 봇으로 본다. 신규 테이블·크론 없이 predicate 하나로만 판별
// (단순·견고 우선) — traffic_events·user_consents는 이미 있는 표출 집계 쿼리에서
// `sql.unsafe(BEHAVIOR_BOT_ANON_IDS_SQL)`로 끼워 넣어 쓴다. 수집(ingest)·공개 API·검색랭킹은 무변.
export const BEHAVIOR_BOT_ANON_IDS_SQL = `
  SELECT te.anon_id
  FROM traffic_events te
  JOIN user_consents uc ON uc.anon_id = te.anon_id
  WHERE uc.user_agent !~* 'Mobile|Android|iPhone|iPad'
  GROUP BY te.anon_id
  HAVING COUNT(*) FILTER (WHERE COALESCE(te.src, '') <> 'direct') = 0
     AND COUNT(*) FILTER (WHERE te.path <> '/') = 0
     AND COUNT(*) FILTER (WHERE EXTRACT(hour FROM te.ts AT TIME ZONE 'Asia/Seoul') >= 8) = 0
`;
