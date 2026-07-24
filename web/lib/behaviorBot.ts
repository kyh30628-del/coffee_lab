// 의미없는 방문자(봇 + 무신호 이탈) 코호트 — 관제탑 표출 집계 전용 헬퍼(#472, 결재#463 후속).
// 접근 전환(2026-07-24, CEO "의미없는 숫자 다 거둬내"): '봇 패턴 빼기'는 direct(referrer 없음)가
//   출처 불명이라 100% 못 잡는다(초판은 봇 172명 중 1명, 2판은 절반만). 그래서 뒤집어서
//   **'사람이라는 확실한 증거가 하나도 없는' anon_id를 제외**한다. 사람 증거(하나라도 있으면 유지):
//     ① 검색엔진 유입(naver/google/bing/daum/duckduckgo) — referrer 위조 사실상 불가
//     ② 2페이지 이상 탐색(COUNT DISTINCT path >= 2)
//     ③ 2일 이상 재방문
//     ④ 모바일 기기(이번 봇은 전부 데스크톱, 진짜 KR 소비자는 모바일 우세)
//   위 넷이 전부 없는 anon = direct+데스크톱+단일페이지+1일 = 봇/무의미 이탈 → 집계서 제외.
// ⚠️ 신호 평가는 반드시 UA/크롤러/내부 필터를 통과한 이벤트로만 한다(내부=관리자·크롤러 이벤트가
//   가짜 '다중페이지' 신호를 만들어 노이즈를 사람으로 오분류하던 버그 방지 — 실측 검증). 이렇게 하니
//   급증기 275명 → 진짜사람 78명(노이즈 197 제거), 새벽비중 36%→11%(사람의 정상 패턴)로 수렴.
//   ⚖️ 트레이드오프: '검색·탐색·재방문·모바일' 증거 없는 실사용자 1회 이탈자도 제외된다(=확실한 사람만
//   세는 보수적 하한). 수집(ingest)·공개 API·검색랭킹은 무변. `sql.unsafe(...)`로 표출 집계에 끼워 쓴다.
export const BEHAVIOR_BOT_ANON_IDS_SQL = `
  SELECT t.anon_id
  FROM traffic_events t
  LEFT JOIN user_consents u ON u.anon_id = t.anon_id
  WHERE COALESCE(u.user_agent, '') !~* 'bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|preview'
    AND COALESCE(t.src, '') !~* 'findelio|blinkx|semrush|ahrefs|dataprovider|dotbot|petalbot|yandex|mj12|serpstat'
    AND COALESCE(t.src, '') NOT IN ('internal', 'spam')
    AND NOT COALESCE(u.internal, false)
  GROUP BY t.anon_id
  HAVING bool_or(t.src IN ('naver', 'google', 'bing', 'daum', 'duckduckgo.com')) = false
     AND COUNT(DISTINCT t.path) < 2
     AND COUNT(DISTINCT date_trunc('day', t.ts AT TIME ZONE 'Asia/Seoul')) < 2
     AND bool_or(COALESCE(u.user_agent, '') ~* 'Mobile|iPhone|Android') = false
`;
