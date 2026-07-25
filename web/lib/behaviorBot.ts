// 의미없는 방문자(봇 + 무신호 이탈) 코호트 — 관제탑 표출 집계 전용 헬퍼(#472, 결재#463 후속).
// 접근 전환(2026-07-24, CEO "의미없는 숫자 다 거둬내"): '봇 패턴 빼기'는 direct(referrer 없음)가
//   출처 불명이라 100% 못 잡는다(초판은 봇 172명 중 1명, 2판은 절반만). 그래서 뒤집어서
//   **'사람이라는 확실한 증거가 하나도 없는' anon_id를 제외**한다. 사람 증거(하나라도 있으면 유지):
//     ① 검색엔진 유입(naver/google/bing/daum/duckduckgo) — referrer 위조 사실상 불가
//     ② 2페이지 이상 탐색(COUNT DISTINCT path >= 2)
//     ③ 2일 이상 재방문
//     ④ 모바일 기기(이번 봇은 전부 데스크톱, 진짜 KR 소비자는 모바일 우세)
//   위 넷이 전부 없는 anon = direct+데스크톱+단일페이지+1일 = 봇/무의미 이탈 → 집계서 제외.
// ⚠️ 신호 평가는 반드시 UA/크롤러 필터를 통과한 이벤트로만 한다(크롤러 이벤트가 가짜 '다중페이지'
//   신호를 만들어 노이즈를 사람으로 오분류하던 버그 방지 — 실측 검증). 이렇게 하니
//   급증기 275명 → 진짜사람 78명(노이즈 197 제거), 새벽비중 36%→11%(사람의 정상 패턴)로 수렴.
//   ⚖️ 트레이드오프: '검색·탐색·재방문·모바일' 증거 없는 실사용자 1회 이탈자도 제외된다(=확실한 사람만
//   세는 보수적 하한). 수집(ingest)·공개 API·검색랭킹은 무변. `sql.unsafe(...)`로 표출 집계에 끼워 쓴다.
// 🚨🚨 재발방지(2026-07-25, CEO "50%나 갑자기 사라지냐" — #503 배포 직후 실제 사고): traffic_events.src='internal'은
//   "우리 팀 방문"이 아니라 **"이 페이지뷰의 리퍼러가 우리 사이트 자신"**, 즉 사이트 안에서 링크를 클릭해
//   다음 페이지로 이동했다는 뜻이다(lib/trafficSource.ts sourceBucket, referrer가 dongnecoffeenote.com/*.vercel.app
//   일 때 부여). 세션의 2번째 이상 페이지뷰는 거의 다 이 값을 갖는다 — 즉 **여러 페이지를 둘러본 가장
//   참여도 높은 진짜 사용자를 잡아내는 신호**다. 이걸 'src IN (...)'로 봇 제외 조건에 넣으면(과거에 있었음)
//   실제로 오늘 방문자 103→46명(-55%)까지 진짜 사람을 봇으로 오분류했다(#503 배포 당일 실측 확인·수정).
//   팀/관리자 방문 제외는 `user_consents.internal`(아래 `u.internal`) 하나로 충분 — 완전히 다른 컬럼·다른
//   의미다. **`t.src`(traffic_events)에 'internal'을 봇/제외 조건으로 다시 넣지 말 것** — spam(리퍼러
//   스팸봇 도메인, lib/trafficSource.ts SPAM_REFERRER_PATTERN)만 진짜 봇 신호다.
export const BEHAVIOR_BOT_ANON_IDS_SQL = `
  SELECT t.anon_id
  FROM traffic_events t
  LEFT JOIN user_consents u ON u.anon_id = t.anon_id
  WHERE COALESCE(u.user_agent, '') !~* 'bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|preview'
    AND COALESCE(t.src, '') !~* 'findelio|blinkx|semrush|ahrefs|dataprovider|dotbot|petalbot|yandex|mj12|serpstat'
    AND COALESCE(t.src, '') NOT IN ('spam')
    AND NOT COALESCE(u.internal, false)
  GROUP BY t.anon_id
  HAVING bool_or(t.src IN ('naver', 'google', 'bing', 'daum', 'duckduckgo.com')) = false
     AND COUNT(DISTINCT t.path) < 2
     AND COUNT(DISTINCT date_trunc('day', t.ts AT TIME ZONE 'Asia/Seoul')) < 2
     AND bool_or(COALESCE(u.user_agent, '') ~* 'Mobile|iPhone|Android') = false
`;

// 명시적 봇(UA·크롤러 referrer·internal) anon_id — 위 BEHAVIOR_BOT_ANON_IDS_SQL은 이 조건을 만족하는
// 이벤트를 WHERE에서 먼저 걷어내고 나머지로만 행동신호를 판정하므로(노이즈가 '다중페이지'로 오분류되는
// 버그 방지), 모든 이벤트가 명시적 봇 조건인 anon_id는 GROUP BY 결과 자체에 나타나지 않는다 → 아래
// BOT_ANON_IDS_SQL의 UNION으로 따로 합쳐야 새지 않는다(#503, traffic_events 집계에서 새던 버그).
export const EXPLICIT_BOT_ANON_IDS_SQL = `
  SELECT DISTINCT t.anon_id
  FROM traffic_events t
  LEFT JOIN user_consents u ON u.anon_id = t.anon_id
  WHERE COALESCE(u.user_agent, '') ~* 'bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|preview'
     OR COALESCE(t.src, '') ~* 'findelio|blinkx|semrush|ahrefs|dataprovider|dotbot|petalbot|yandex|mj12|serpstat'
     OR COALESCE(t.src, '') IN ('spam')
     OR COALESCE(u.internal, false)
`;

// 봇/노이즈 anon_id 단일 소스(#503) — 명시적 봇 UNION 행동기반 봇. traffic_events 기반이든
// user_consents 기반이든, "봇 제외"가 필요한 모든 집계(헤드라인 카드·14일 추이 그래프·기타 트래픽
// 통계)는 이 상수 하나만 참조한다. 필터 기준이 갈라지면 같은 날짜의 방문자·페이지뷰 수치가
// 화면마다 달라진다(예: 469 vs 467) — 그 재발을 막는 게 이 상수의 존재 이유다.
export const BOT_ANON_IDS_SQL = `
  SELECT anon_id FROM (${EXPLICIT_BOT_ANON_IDS_SQL}) e
  UNION
  SELECT anon_id FROM (${BEHAVIOR_BOT_ANON_IDS_SQL}) b
`;
