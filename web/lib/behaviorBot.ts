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
// 확정 봇 UA 시그니처 단일출처(#523, coord#262 후속) — 표출필터(아래 SQL 2곳)와 수집단계
// 원천차단(app/api/visit/route.ts)이 이 문자열 하나만 참조한다. 과거엔 이 정규식이 route.ts에
// 따로 박제되어 있다가(facebookexternalhit까지만) 여기서 'meta-externalagent'를 추가한 뒤로도
// 갱신이 안 돼(#472→#503 사이 드리프트) 수집(INSERT) 자체는 계속 야간마다 오염 누적되고
// 표출 화면에서만 걸러지고 있었다 — 드리프트 재발 방지가 이 상수의 존재 이유.
export const KNOWN_BOT_UA_PATTERN = "bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|preview|meta-externalagent|Google-Read-Aloud";

export const BEHAVIOR_BOT_ANON_IDS_SQL = `
  SELECT t.anon_id
  FROM traffic_events t
  LEFT JOIN user_consents u ON u.anon_id = t.anon_id
  WHERE COALESCE(u.user_agent, '') !~* '${KNOWN_BOT_UA_PATTERN}'
    AND COALESCE(t.src, '') !~* 'findelio|blinkx|semrush|ahrefs|dataprovider|dotbot|petalbot|yandex|mj12|serpstat'
    AND COALESCE(t.src, '') NOT IN ('spam')
    AND NOT COALESCE(u.internal, false)
  GROUP BY t.anon_id
  HAVING bool_or(t.src IN ('naver', 'google', 'bing', 'daum', 'duckduckgo.com')) = false
     AND COUNT(DISTINCT t.path) < 2
     AND COUNT(DISTINCT date_trunc('day', t.ts AT TIME ZONE 'Asia/Seoul')) < 2
     AND bool_or(COALESCE(u.user_agent, '') ~* 'Mobile|iPhone|Android') = false
`;

// 🤖 Meta 링크미리보기 크롤러(2026-07-26 발견) — 카페 공유링크(?cafe=ID)가 페이스북/인스타/왓츠앱/
//   메신저/스레드 어디든 붙여넣어지는 순간, 사람이 클릭 안 해도 Meta가 자동으로 그 URL을 가져가
//   미리보기 카드를 생성한다(UA에 박힌 공식 문서 URL로 확정: developers.facebook.com/docs/sharing/
//   webmasters/crawler). 예전 시그니처 facebookexternalhit는 이미 걸렀지만 Meta가 새 UA
//   'meta-externalagent'로 갈아탄 뒤로는 안 걸리고 있었다. 데스크톱 UA+direct/internal 출처+
//   페이지 2개(본문+오리지 og-image 등 후속요청)라 기존 행동기반 필터(경로<2)도 통과했음
//   — 실측: anon_id 577개(2026-07-18~), 하루 최대 247건(07-23). "오늘 9명 중 실사람 몇?" CEO
//   질문으로 발견. 확정 봇 시그니처라 오탐 위험 없음(실브라우저 UA엔 이 문자열이 나올 수 없음).
// 🕵️ 필터조합 전수순회 스크래퍼(2026-07-25 발견) — naver referrer로 위 3개 신호를 전부 통과하는 스크래퍼가
//   실제로 있었다(#503 사고 조사 중 실측 발견): 검증 리퍼러(naver)+데스크톱 UA로 위장하고, 짧은 시간에
//   서로 다른 /area/{구}/{취향필터} 조합을 기계적으로 대량 순회(예: 7분간 19종 조합·49건, 초단위 간격).
//   진짜 사람은 이렇게 많은 지역×필터 조합을 한 세션에 훑지 않는다(실측: 오늘 방문자 중 2위가 6종/7건뿐 —
//   19 vs 6로 확연히 분리). '속도(초당 이벤트)'는 네이버 인앱브라우저로 카페 카드 여러 개를 빠르게 비교하는
//   진짜 사람과 구분이 안 돼(오탐 위험 실측 확인) 신호로 안 쓴다 — '서로 다른 지역+필터 조합 개수'만 본다.
//   임계값 10(관측치 19 vs 6에서 넉넉한 여유)은 보수적 — 애매하면 사람으로 남긴다(과거 '55% 오탐' 재발 방지).
const AREA_ENUM_BOT_ANON_IDS_SQL = `
  SELECT anon_id FROM traffic_events
  WHERE path LIKE '/area/%'
  GROUP BY anon_id
  HAVING COUNT(DISTINCT path) >= 10
`;

// 🧪 자사 프리뷰 배포 자가방문(2026-07-26, CEO "더 오래된 것까지 전수로" 지시로 전체기간 재감사 중 발견) —
//   자율 개발 파이프라인이 dev_task 브랜치를 배포검증할 때 프리뷰 URL(`coffee-*-product-builder.vercel.app`
//   또는 `coffee-lab-git-{브랜치명}-product-builder.vercel.app`)을 여는 것(HeadlessChrome 자동화 또는
//   실브라우저 수동확인)이 같은 프로덕션 Neon DB에 `/api/visit`을 그대로 남겨 방문자로 잡혔다. UA에
//   이미 'headless' 있는 건 기존 정규식이 걸렀지만, 실브라우저(Chrome/Android 등)로 연 건 안 걸렸음.
//   `referrer`가 우리 커스텀도메인(dongnecoffeenote.com)이 아니라 `*.vercel.app` 프리뷰 URL 자체인
//   게 결정적 증거(실 소비자는 절대 이 주소로 안 들어옴). 전체기간(06-06~) 스캔: anon_id 26개 중
//   traffic_events에 실제로 남은 건 9개, 그중 3개(4a1749c0·6208b151·dd830cee)가 기존 필터를 통과해
//   사람으로 집계되고 있었음(수량은 작지만 방치 금지). 아래 EXPLICIT_BOT_ANON_IDS_SQL의
//   `u.referrer ~* '\.vercel\.app'` 조건으로 제외.

// 🎯 단일 카페 반복 프로버(2026-07-26, 전수감사 중 발견) — 서로 다른 anon_id 27개가 전부 정확히 동일한
//   UA 문자열("X11; Linux x86_64 ... Chrome/149.0.0.0", 실제 KR 소비자에 드문 리눅스 데스크톱)로 6일간
//   /c/5424 딱 한 곳만 반복 방문(24건, 매번 새 anon_id·단일페이지 이탈), 전부 src=google 자칭 — 네이버
//   위장 스크래퍼(위 AREA_ENUM)와 같은 계열(검색유입 신호 위조로 행동필터 회피)이나 지역×취향 대신
//   카페 1곳을 표적. 실제 사람은 독립된 브라우저 인스턴스가 며칠에 걸쳐 완전히 동일한 UA 문자열을
//   유지하지 않는다(브라우저 버전·기기가 자연히 갈림). 전수 스캔 결과 이 신호는 이 1건 외엔 안 걸림
//   (임계값 5는 24라는 관측치에서 넉넉한 여유).
const SINGLE_CAFE_UA_REPEAT_BOT_ANON_IDS_SQL = `
  SELECT t.anon_id FROM traffic_events t
  LEFT JOIN user_consents u ON u.anon_id = t.anon_id
  WHERE t.path LIKE '/c/%'
    AND t.anon_id IN (SELECT anon_id FROM traffic_events GROUP BY anon_id HAVING COUNT(DISTINCT path) = 1)
    AND (u.user_agent, t.path) IN (
      SELECT u2.user_agent, t2.path
      FROM traffic_events t2 LEFT JOIN user_consents u2 ON u2.anon_id = t2.anon_id
      WHERE t2.path LIKE '/c/%'
        AND t2.anon_id IN (SELECT anon_id FROM traffic_events GROUP BY anon_id HAVING COUNT(DISTINCT path) = 1)
      GROUP BY u2.user_agent, t2.path
      HAVING COUNT(DISTINCT t2.anon_id) >= 5
    )
`;

// 💥 카페 순회 부하테스트/스크래퍼 버스트(2026-07-26, 카페별 반복 프로버 전수 스캔 중 추가 발견) —
//   07-07 21:35과 07-08 17:29, 단 두 개의 1분 구간에 각각 서로 다른 anon_id 14개·13개가 몰려서
//   완전히 무작위인 카페 13~14곳(두 날 거의 동일한 카페ID 목록 재사용)을 한 곳씩 나눠 방문(각자
//   단일페이지 이탈), UA는 매번 다른 Chrome 버전(139~147 사이를 인위적으로 순환)을 썼다. 진짜
//   사람이라면 서로 무관한 15명 남짓이 정확히 같은 60초 안에 우연히 접속해 하필 다른 카페들로
//   흩어질 확률이 사실상 0 — 스크립트가 매 요청마다 새 anon_id·가짜 UA를 돌려쓰며 카페 목록을
//   순회한 부하테스트/스크래퍼 흔적. 전수 스캔(1분 단위 서로 다른 anon_id 수 집계) 결과 이
//   두 구간 외엔 최대 5명(2026-07-25 13:12, 정상적인 동시접속 범위)뿐이라 임계값 8은 안전.
const CAFE_BURST_BOT_ANON_IDS_SQL = `
  SELECT anon_id FROM traffic_events
  WHERE path LIKE '/c/%'
    AND date_trunc('minute', ts) IN (
      SELECT date_trunc('minute', ts) FROM traffic_events
      WHERE path LIKE '/c/%'
      GROUP BY date_trunc('minute', ts)
      HAVING COUNT(DISTINCT anon_id) >= 8
    )
`;

// 🔊 Google-Read-Aloud(2026-07-26, 카페 롤링 스캔 중 발견) — UA에 자체 명시된 구글 접근성 크롤러
//   (+https://support.google.com/webmasters/answer/1061943, "페이지 읽어주기" 기능). 확정 봇 시그니처.

// 명시적 봇(UA·크롤러 referrer·internal·필터전수순회) anon_id — 위 BEHAVIOR_BOT_ANON_IDS_SQL은 이 조건을
// 만족하는 이벤트를 WHERE에서 먼저 걷어내고 나머지로만 행동신호를 판정하므로(노이즈가 '다중페이지'로
// 오분류되는 버그 방지), 모든 이벤트가 명시적 봇 조건인 anon_id는 GROUP BY 결과 자체에 나타나지 않는다 →
// 아래 BOT_ANON_IDS_SQL의 UNION으로 따로 합쳐야 새지 않는다(#503, traffic_events 집계에서 새던 버그).
export const EXPLICIT_BOT_ANON_IDS_SQL = `
  SELECT DISTINCT t.anon_id
  FROM traffic_events t
  LEFT JOIN user_consents u ON u.anon_id = t.anon_id
  WHERE COALESCE(u.user_agent, '') ~* '${KNOWN_BOT_UA_PATTERN}'
     OR COALESCE(t.src, '') ~* 'findelio|blinkx|semrush|ahrefs|dataprovider|dotbot|petalbot|yandex|mj12|serpstat'
     OR COALESCE(t.src, '') IN ('spam')
     OR COALESCE(u.internal, false)
     OR COALESCE(u.referrer, '') ~* '\\.vercel\\.app'
     OR t.anon_id IN (${AREA_ENUM_BOT_ANON_IDS_SQL})
     OR t.anon_id IN (${SINGLE_CAFE_UA_REPEAT_BOT_ANON_IDS_SQL})
     OR t.anon_id IN (${CAFE_BURST_BOT_ANON_IDS_SQL})
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
