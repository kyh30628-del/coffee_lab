// 행동기반 봇 코호트 판별(#472, 결재#463 후속) — 관제탑 표출 집계 전용 헬퍼.
// app/api/admin/analytics|lounge|stats 의 UA 키워드 필터(BOT/NOISE 상수)는 못 잡는
// 위장형 헤드리스 대응: 일반 데스크톱 Chrome UA로 위장했지만 다음을 전부 만족하는 anon_id를 봇으로 본다.
//   ① 데스크톱 UA(Mobile/Android/iPhone/iPad 토큰 없음) — 진짜 KR 소비자는 모바일 우세
//   ② 유입 이력이 전부 src=direct(referrer 없음)
//   ③ 단일 페이지만 봄(COUNT DISTINCT path = 1) — 콘텐츠 탐색 0(봇의 결정적 특징)
// ⚠️ 2026-07-24 수정: 초판은 "경로가 홈 '/'뿐 + 전부 새벽(0-8시)"까지 AND로 걸어 너무 빡빡했다
//   → 저녁에도 찍히거나 카페페이지(/c/…) 하나 찍은 봇을 다 놓쳐 실측상 봇 172명 중 1명만 걸렀다.
//   새벽조건 제거 + '홈 단일' → '단일페이지'로 완화하니 급증기 봇 105명을 정확히 제거(실측), 기준기 실사용자는 거의 무영향(하루 1명 수준).
//   보수성: 모바일·검색유입·2페이지 이상 탐색·비-direct는 절대 봇으로 안 봄(전부 유지). 신규 테이블/크론 없이 predicate 하나(단순·견고).
//   수집(ingest)·공개 API·검색랭킹은 무변. `sql.unsafe(BEHAVIOR_BOT_ANON_IDS_SQL)`로 표출 집계 쿼리에 끼워 쓴다.
export const BEHAVIOR_BOT_ANON_IDS_SQL = `
  SELECT te.anon_id
  FROM traffic_events te
  JOIN user_consents uc ON uc.anon_id = te.anon_id
  WHERE uc.user_agent !~* 'Mobile|Android|iPhone|iPad'
  GROUP BY te.anon_id
  HAVING COUNT(*) FILTER (WHERE COALESCE(te.src, '') <> 'direct') = 0
     AND COUNT(DISTINCT te.path) = 1
`;
