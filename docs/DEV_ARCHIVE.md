# 개발 배포 아카이브 (자동 누적)

> dev-deploy 파이프라인이 배포 확정(main merge·push) 시 한 줄씩 자동 append한다. **수동 편집 금지** — dev_task 레코드(decisions)가 소스오브트루스이고 이 파일은 그 미러다.
> 조회 전용 로그. 컬럼: 배포일시(UTC) · 이슈# · 제목 · 커밋 · risk · 요청요약

| 배포일시(UTC) | 이슈 | 제목 | 커밋 | risk | 요청요약 |
|---|---|---|---|---|---|
| 2026-07-06 14:09 | #180 | 챗 일반탭 답변 | 61ffd3a7 | med | route.ts: 일반탭 GET?region=에 결정론 지식응답(answerKnowledge: 서비스/조직/관제/라운지/구독/파이프라인/MY PIN→CLAUDE·SERVICE_OV |
| 2026-07-06 14:45 | #181 | 챗 질문6개 | f417a2f7 | low | app/admin/org/page.tsx: 일반(region)탭 추천칩 3→6개(성수동·강남구·블루보틀·서비스가 뭐야?·MY PIN이 뭐야?·구독은 어떻게 해? — 모두 결정론 즉 |
| 2026-07-06 15:00 | #182 | 관제 UI 가독성 | 4e4f1d6f | med | 관제 UI 가독성(스타일 전용). app/admin/org/page.tsx: 핵심수치 스타일(big/lbl/sub)에 tabular-nums·볼드·진한대비·넘침방지(ellipsis |
| 2026-07-06 21:53 | #183 | 직할 분리표시 | ad85067b | low | app/admin/org/page.tsx: 조직도 모달에서 기조실장 직할(비서실장·자율진단감사실·개발실행유닛)을 라인 본부와 분리. note='기조실장 직속'으로 staff/lin |
| 2026-07-07 02:15 | #186 | [룰갭 제안6] COMMON_WORD_NAMES 4건 추가 — 소소한일상·하루에·여기서·인디고 | abbc58af | - | lib/reviewQuality.ts: COMMON_WORD_NAMES에 소소한일상·하루에·여기서·인디고 4건 추가(제안6, offctx 동명 오염 nameAsWord 게이트).  |
| 2026-07-07 02:16 | #187 | [룰갭 제안7·구조] CAFE_CONTEXT 게이트를 nameInBody-only(참고등급) 경로까지 확장 | 1f94fd18 | - | lib/reviewQuality.ts: 제안1의 inTitleFull CAFE_CONTEXT 게이트를 nameInBody-only 참고등급 경로로 대칭 확장. 점수화 직전 !nam |
| 2026-07-07 02:17 | #189 | [심층판정 handoff] 주소=상호 패턴 전수스캔·규칙 + 동음이의/지점혼입 매칭 보정 | c143b2c0 | - | lib/reviewQuality.ts 3패턴 매칭보정: (P1 주소=상호) 이름이 도로명주소形이면 CAFE_CONTEXT 필수화(nameIsRoadAddr/roadAddrCtxOk |
| 2026-07-07 02:56 | #188 | [레드팀 handoff] 흔한단어(코너·하우스·루트·그리고우리)+호텔서브브랜드 매칭 오염 규칙 확장 | 230d7292 | - | lib/reviewQuality.ts 오염룰 4종 확장: ①NAME_STOPWORD+코너·하우스·루트·그리고우리(코너50→[50]·타스 하우스→[타스]·그리고우리→[] 전체이름일치 |
| 2026-07-07 08:36 | #190 | 인스타 홍보 포스터 | 1e731e0c | low | app/poster/page.tsx 신규 라우트 — 캔버스로 1080x1080·1080x1350 두 아트보드를 브랜드톤(크림 #F7F1E6·에스프레소·골드·지도핀·커피콩·Gowun |
| 2026-07-07 08:53 | #191 | 포스터 슬라이드 확장 | 9c31ec05 | low | app/poster/page.tsx: 단일 포스터를 5장 인스타 캐러셀(각 1080x1080 canvas)로 확장 — 1 메인훅·2 문제제기(오염칩)·3 해법(체크리스트)·4 핵심 |
| 2026-07-07 12:45 | #195 | [룰갭 제안9] 관광랜드마크명(LANDMARK_WORDS) 목록 신설 | 958adc65 | - | lib/reviewQuality.ts: LANDMARK_WORDS 17개(경복궁·창덕궁·덕수궁·창경궁·종묘·운현궁·북촌·서촌·삼청동·인사동·익선동·남산·N서울타워·한강공원·여의도공 |
| 2026-07-07 12:46 | #196 | [정합성·레드팀 handoff] 프랜차이즈/멀티지점 지점앵커 매칭 필수화 | ff41e559 | - | lib/reviewQuality.ts — 지점앵커 매칭 필수화(브랜치 카페 리뷰 귀속): (1)브랜드 수식어(프리미엄·빙수·무인 등) 식별토큰서 제외→같은자리 다른브랜드(백억커피  |
| 2026-07-07 15:18 | #205 | PIN발급일 기준수정 | 78a42322 | low | app/admin/page.tsx: PIN발급 경과일 기준을 pin_emailed_at→승인시각 updated_at(없으면 pin_emailed_at fallback)으로 변경.  |
| 2026-07-07 15:26 | #197 | [개발] 협업 #133: [P0] ANTHROPIC_API_KEY 크레딧 소진 — 검색재정렬·리뷰판정 전면  | 3008559b | - | app/api/orchestrator/route.ts: search_log.ai_err(실사용자 쿼리) 결정론 감시 추가 — 콘솔키 크레딧소진·키오류(credit/http_40x) |
| 2026-07-07 15:35 | #206 | 주간한도 계산교정 | 1e85e7d7 | med | scripts/usageGuard.mjs+chat-watch.mjs: 주간사용률에서 cache_read를 온전합산→실단가 0.1x 가중으로 교정. 기록부(logUsage)가 [2] |
| 2026-07-07 16:34 | #207 | 검색저하 조직관제 이관 | 67bf2350 | med | lib/searchDegradeTrack.ts 신설(분류 predicate+상수). app/admin/page.tsx: tower.risks에서 검색AI저하 제외(towerRisk |
| 2026-07-08 02:41 | #200 | [자율진단] lib/issues.ts 자동종결 로직 오탐 — 활성 잡을 은퇴로 오판, L3 에스컬레이션 무력 | 42395e7e | - | lib/jobTeams.ts: 명시적 RETIRED_JOBS(dong-backfill·qualityaudit)+isRetired 단일출처 추가. lib/issues.ts 6b: r |
| 2026-07-08 02:50 | #210 | [룰갭] 신규 오염 규칙 4건(P1·P2·P3·P5) — 테라피·조도/회전목마/실험실·어느멋진날 등 반영 | a75fa875 | - | lib/reviewQuality.ts: P1 NONCAFE_BIZ에 '테라피' 추가([동명 비카페] 게이트가 카페맥락 전무 시 거절), P2 WEAK_IDENTITY_TOKEN에  |
| 2026-07-08 03:08 | #213 | 조직관제 뒤로가기 | 00c3c4d7 | low | app/admin/org/page.tsx: 헤더 상단에 <BackLink to='/admin' label='대시보드'>(router.push 고정) 추가 — history.back |
| 2026-07-08 03:17 | #212 | [자율진단] #200 배포경로 막힘 — 배포대기 무한정체 + #211 배포확정 챗요청이 코딩작업으로 오분류돼 | 863312c0 | - | scripts/chat-watch.mjs: 챗 "배포확정"류 요청(기존 dev_task #번호 지목)이 신규 코드구현 큐로 오라우팅돼 "구현불가"로 조용히 무산되던 갭 차단. TR |
| 2026-07-08 09:15 | #214 | [개발] 협업 #138: decisions#209 "실행완료" 자기보고가 실제 DB 미반영(30/37곳) — | 6ed44848 | - | app/api/admin/decide/route.ts: 신규 action_type 'set_offctx' 추가 — action_params.value(기본 false)로 cafes |
| 2026-07-08 11:01 | #215 | [룰갭 3차] 신규 오염 규칙 3건(P9 도로명=상호명·P10 브랜드명다의충돌·P11 관광랜드마크 흡수) | 3381430e | - | lib/reviewQuality.ts: LANDMARK_WORDS에 추억의거리(P11) 추가, WEAK_IDENTITY_TOKEN에 청하동길·스위치(P9·P10) 추가. 각 근거  |
| 2026-07-08 11:02 | #216 | [검색품질] 브랜드명 검색 시 DB無매칭 카페가 검증·고득점으로 오인 노출 | a05740b4 | - | app/api/search/route.ts:267 시맨틱 경로 gradeBonus에 어휘일치 가드 추가 — exact+concept===0(브랜드명 DB無매칭)이면 등급가산(+25 |
| 2026-07-08 11:03 | #217 | [검색·UX] 즐겨찾기 데스크톱 진입점 부재 (4일 이월) | 329d61d1 | - | app/page.tsx: MapControls 상단에 즐겨찾기(N) 버튼 추가(데스크톱 전용 hidden md:flex, 하단 네비는 md:hidden이라 데스크톱 진입로 없었음) |
