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
| 2026-07-08 23:47 | #219 | [개발] 협업 #140: 결재#209 offctx_ok 리셋 30곳, autoCorrect() 자동치유 루프 | 2c88040e | - | lib/issues.ts autoCorrect() offctx 오탐 재판정을 이름일관성→offctx 지표 자체로 교정(구조적 상충 해소). lib/synthStore.ts에 off |
| 2026-07-08 23:48 | #220 | [개발] discovery_state 로테이션에 인천 동구·중구 미등록 | 52eecd85 | - | lib/discover.ts: METRO_REGIONS 인천 배열에 중구·동구 추가(누락 근본원인) → cron-grow 시드루프가 다음 실행에 discovery_state row |
| 2026-07-09 01:55 | #221 | [개발] dev-deploy.mjs 사람작업보호 가드가 catch블록에서 자기파괴 — 미커밋 변경 9시간+  | 1e22c943 | - | scripts/dev-deploy.mjs: 사람작업보호 dirty가드가 던진 에러가 공용 catch의 checkout -f/reset --hard로 흘러 미커밋 변경을 자기폐기하던 |
| 2026-07-09 01:56 | #224 | [룰갭 4차] 신규 오염 규칙 4건(P7 고려궁지·P8 에스엠·P13 푸드몰·P14 우리동네구멍가게) | dce684e0 | - | P7 고려궁지→LANDMARK_WORDS, P13 푸드몰→VENUE_WORDS(reviewQuality.ts); P8 에스엠·P14 우리동네구멍가게→identity.weak_tok |
| 2026-07-09 02:06 | #226 | 헤더버튼 너비 | 2e3bc9df | low | app/admin/org/page.tsx 헤더 3버튼(기준·라운지·조직도): padding 11→16px·minWidth 84·textAlign center·whiteSpace n |
| 2026-07-09 06:18 | #227 | [개발] 협업 #149: [후속] dev#219 배포됐으나 플래그십 2곳(15462·14839) 여전히 of | 78fd6f29 | - | lib/issues.ts autoCorrect(): offctx 재판정 대상쿼리를 offctx_ok 무관 전수(offctx_rate>=0.55)로 확장 + 화이트리스트 회수 분기  |
| 2026-07-09 11:04 | #251 | [자율진단] lib/issues.ts 조사결재 자동종결(6번) 오탐 — 정지된 크론을 최신run=ok tru | 9951ffc4 | - | lib/issues.ts 6번(closedInv) 조사결재 자동종결에 staleness 게이트 추가: 최신 run ok=true인 동시에 그 run이 EXPECT_MAX_H(정지의 |
| 2026-07-09 11:16 | #256 | 헤더 이모지 제거 | fecd4624 | low | app/admin/org/page.tsx 헤더 3항목(기준/라운지/조직도) 이모지 접두 제거(🎛️🏛️🏢) — 라벨·href·onClick·정렬 스타일 유지. tsc 신규에러  |
| 2026-07-09 12:40 | #261 | 헤더1줄+프로필이미지 | 2ee921ab | low | ①app/admin/org/page.tsx 헤더 버튼 이모지 복원(🎛️기준·🏛️라운지·🏢조직도)+패딩 8px16px→7px11px·gap7→5·minWidth84 제거·fle |
| 2026-07-09 14:11 | #262 | 문의메일·챗봇아이콘 | b4b99a9e | med | ①문의메일 kyh30628@gmail.com→dongnecoffeenote@gmail.com 전수교체(8파일 13곳: lib/newsletter·onboardingEmail, ap |
| 2026-07-09 14:45 | #263 | 관리자챗봇노출 | 0bc13021 | med | ChatWidget는 #262에서 /admin에 이미 배선됨(import+<ChatWidget pw={pw}/> line1600, blame 96b03f3)—코드상 런처는 정상 렌 |
| 2026-07-10 00:52 | #266 | [자율진단] cron-selfaudit 자체 dedup(ikey) 버그 — 경과시간 포함으로 매 사이클 결재 | b9367b8d | - | app/api/cron-selfaudit/route.ts: 크론 정지의심 finding에 안정 ikey(selfaudit:크론정지의심:<job>) 부여, dedup은 f.ikey  |
| 2026-07-10 00:53 | #271 | 룰갭 P24 — 아파트 브랜드명(자이·래미안 등) VENUE_WORDS 추가 (lib/reviewQualit | d0159bf9 | - | lib/reviewQuality.ts VENUE_WORDS에 아파트 단지 브랜드 카테고리 추가(자이·래미안·푸르지오·힐스테이트·e편한세상·아이파크·롯데캐슬 등 18종). 부분일치로 |
| 2026-07-10 09:26 | #276 | 룰갭 P26 — nameHit/boundedHit 우측경계 미검증 (lib/reviewQuality.ts 코 | 6c76f0bf | - | lib/reviewQuality.ts: boundedHit·nameHit에 우측 경계검사 추가(JOSA_LIST 예외 포함, 르씨엘가구·써니네집·24시간·대나무숲이있는 오매칭 차단 |
| 2026-07-10 09:27 | #277 | 레드팀 2차 — CAFE_CTX 정규식 보강 (lib/synthStore.ts L70, offctx 자동원복 | b74ec33a | - | lib/synthStore.ts L70 CAFE_CTX 정규식에 맛집·레스토랑·초콜릿·쇼콜라·봉봉 5개 추가. tsc 신규에러 0(기존 next.config eslint 베이스라인 |
| 2026-07-10 09:43 | #280 | 배포정체 자동감지 | 40ffc022 | med | app/api/admin/dev-pipeline/route.ts: dev_status=배포대기 정체 감지(age_min=dev_claimed 경과, STUCK_MIN=30분, so |
| 2026-07-10 10:35 | #281 | 일일보고서 기본접힘 | 65e3ee9e | low | app/admin/org/page.tsx: EXECUTIVE 일일보고서 섹션에 showBriefs 접이식 state 추가(기본 false=접힘), showCoord/showWO와  |
| 2026-07-10 10:54 | #282 | 챗봇 기능 강화 | 4d574719 | med | 변경: app/admin/ChatWidget.tsx(경과시간 표시·중지버튼(AbortController)·대화검색·새 응답 알림(배지+Notification API, 백그라운드/닫 |
| 2026-07-10 11:01 | #283 | 챗봇 모달 스크롤 고정 | 89b7deee | low | app/admin/ChatWidget.tsx: 모달 오픈 시 body를 position:fixed(top=-scrollY)로 고정해 배경 스크롤 원천 차단, 닫히면 원복+스크롤위치 |
| 2026-07-10 11:09 | #284 | 챗봇 메시지 시각표시 | 70583618 | low | app/admin/ChatWidget.tsx: 메시지에 time(KST HH:MM) 필드 추가, 말풍선 하단에 회색 시각 표시. 신규 전송은 클라이언트 Date로, 작업지시 탭 서 |
| 2026-07-10 11:59 | #285 | 그라운딩 문서정정 | c1943c26 | low | lib/synthStore.ts(holdZeroEvidenceSuspects 상단·release UPDATE 주석)·app/api/orchestrator/route.ts(e단계 주 |
| 2026-07-10 12:10 | #286 | 대화기록 저장·검색 | 7f76a751 | med | app/api/admin/chat-archive/route.ts(신규, GET전용) + app/api/admin/chat/route.ts(purge/clear 직전 chat_arc |
| 2026-07-10 12:46 | #287 | 답변에 모델 배지 표시 | 27f41cde | low | app/api/admin/chat/route.ts(llm_model 컬럼+GET 노출)·scripts/chat-watch.mjs(실호출 model을 chat_queue.llm_mo |
| 2026-07-10 12:57 | #288 | 유입경로 스팸 필터링 | 34ccb1f8 | med | lib/trafficSource.ts 신설(sourceBucket 단일출처, vercel.app 프리뷰->internal, semalt 등 리퍼러 스팸->spam 분류 추가), v |
| 2026-07-10 13:27 | #290 | 근접매칭 가드 강화 | 89108617 | high | lib/reviewQuality.ts: nameRisky 가드(룰갭 P23)를 근접매칭으로 강화. ctxNearName() 헬퍼 추가(상호명 토큰 ±25자 창 안에서만 CAFE_C |
| 2026-07-10 13:57 | #289 | [개발] 협업 #170: [자율진단] coord#163/#165 "해소" 재확인 — offctx_ok=fal | b6a2dab4 | - | scripts/purge-contam-reviews.mjs 신규: coord#170이 특정한 5곳(8422 써니21·11358 나무그늘아래·12307 르씨엘·15622 24 OUR |
| 2026-07-10 13:58 | #291 | 모델배지 미표시 수정 | e1745982 | low | 근본원인: #287 배포(21:46) 후 상주 데몬(chat-watch.mjs, launchd KeepAlive)이 재기동 안 돼 구코드로 계속 실행 — llm_model 항상 N |
| 2026-07-10 14:13 | #292 | 위치동의 상세표기 | c93dfab0 | low | app/api/admin/analytics/route.ts: consentDetail(total/internal/real/located/unlocated) DB실측 쿼리 추가·응답 |
| 2026-07-10 14:26 | #293 | 챗봇 자동스크롤 수정 | 649b7be2 | low | app/admin/ChatWidget.tsx: 스크롤 위치 추적(nearBottomRef+onScroll)으로 하단 100px 이내일 때만 자동스크롤, 위로 스크롤 중이면 유지.  |
| 2026-07-10 14:50 | #294 | 대시보드 지표 정리 | 03f6d086 | med | 수정: web/app/admin/page.tsx, web/app/api/cron-verify/route.ts. 중복 제거: /admin의 "접속·방문자 현황" 섹션(총방문자/위치동 |
| 2026-07-10 15:34 | #295 | 챗 프롬프트 캐싱 적용 | 3f0ff1e8 | med | scripts/chat-watch.mjs: KB+DOCS(+CANON)를 매턴 -p인자로 재전송하던 걸 단일 --append-system-prompt-file(SYSTEM_STAT |
| 2026-07-11 00:19 | #297 | [룰갭 P28] 상호가 업종 일반명사(영문 대여어) 자체인 카페 — 이름일치·offctx_rate 방어선 동 | e0fea712 | - | lib/reviewQuality.ts: (1) GENERIC_SUFFIX/GENERIC_WORD에 베이크샵·베이크하우스·브런치카페·베이글샵·도넛 추가 (2) coreEmpty 분기 |
| 2026-07-11 04:31 | #299 | 카페소개 포스터 | cb9da76d | low | 신규 app/poster/cafe/page.tsx(카페소개 포스터, 검색/오늘의추천/카드형·포토형 2템플릿/PNG저장) + app/api/poster-cafe/route.ts(검증 |
| 2026-07-11 05:58 | #301 | 지역포스터+모아보기 | e4e044de | med | 신규: app/poster/area/page.tsx(지역소개 포스터, DB실측 카페수/검증후기수) + app/api/poster-area/route.ts(area 목록·통계). a |
| 2026-07-11 06:29 | #302 | 지역포스터 콘텐츠 개편 | bbabca87 | med | app/api/poster-area/route.ts: topCafes(이름+한줄 하이라이트, extractHighlights/synth_identity 실측 기반) 응답 추가. a |
| 2026-07-11 06:57 | #306 | 유입현황 즐겨찾기+그래프 | 5c4f02c2 | med | 변경: app/api/admin/analytics/route.ts, app/admin/page.tsx. ①user_visits.favorite(하트) 일별/누적/상위카페 섹션 추가 |
| 2026-07-11 07:41 | #307 | 리뷰 정렬 정합성 수정 | 3a2b475f | med | app/api/cafe-detail/route.ts: 정렬을 nameCoherence 매칭확신도(신규 quoteMatchConfidence)→최신순→score/trust 순으로 변 |
| 2026-07-11 09:05 | #312 | 후기모달 배경고정 | 4921acb0 | low | app/VisitorReviews.tsx: 후기 목록/상세 모달을 createPortal로 document.body에 렌더(인앱 CafePanel aside가 transform 컨 |
| 2026-07-11 11:42 | #313 | 접속 통계 정의 통일 | 7c856b58 | med | app/api/admin/stats/route.ts: 필터없는 전체누적 visitors 집계 제거(화면에 미사용, 착시 소지 원천 차단·주석으로 단일소스 명시). app/admin |
| 2026-07-11 12:42 | #314 | 홍보카피 포스터 | 95a6d4e7 | low | 신규 app/poster/copy/page.tsx: 홍보카피 4종(통합 추천안/공감형 강조/취향결 강조/짧고임팩트) 프리셋 드롭다운+지역명 자유입력([지역명] 실시간 치환)+캔버스 |
| 2026-07-11 13:07 | #315 | 방문패턴 보고추가 | 68342b20 | med | scripts/make-digest.mjs: DIGEST.md에 위치동의 기기 실사용 패턴 섹션 추가(traffic_events+user_consents 조인, region 보유+ |
| 2026-07-11 14:12 | #317 | 추억저장 버튼 추가 | 3e97cce7 | med | app/c/[id]/SaveMemoryButton.tsx 신규(추억으로 저장 버튼, 카카오공유 바로아래 우측정렬·동일사이즈·핑크accent #d6336c) + app/MyCafeR |
| 2026-07-11 14:58 | #320 | 추억버튼 노출 근본수정 | 2c72cb43 | med | app/page.tsx: 근본원인 발견 — #317은 /c/[id](공유용 SEO 페이지)에만 버튼을 추가, 실사용자가 실제로 쓰는 지도 홈(app/page.tsx)의 카페 상세  |
| 2026-07-11 15:09 | #321 | 추억버튼 위치이동 | 600861f6 | low | app/page.tsx CafePanel: 추억으로 저장 버튼을 즐겨찾기·공유·닫기 행에서 분리해 그 아래 새 행(우측정렬)으로 이동. 버튼 자체·즐겨찾기/공유 순서는 무변경. t |
| 2026-07-11 15:26 | #322 | 추억버튼 헤더로이동 | a5547278 | low | app/c/[id]/page.tsx: SaveMemoryButton을 즐겨찾기·공유 아래 줄에서 카페명 밑 지역명(c.area) 줄로 이동, flex justify-between으 |
| 2026-07-11 16:22 | #316 | 포스터 컨셉 다양화 | c34da687 | med | 4개 포스터 타입 시각 차별화: copy=다크 에스프레소 배경+골드 코너브래킷+좌측정렬 에디토리얼(카피 4→7종, 스토리텔링/후킹질문/통계인용 추가, 카페명 미노출), area=크 |
| 2026-07-12 04:43 | #311 | [룰갭 P29] 범업종 마케팅 대여어 상호(커스텀·시그니처 등)가 유일 core토큰이면 무관 업종 광고와 충 | 0e25889f | - | 제안1(즉시·저위험)만 구현: lib/reviewQuality.ts COMMERCE_JUNK에 공동구매, LOCAL_SEO_SERVICES에 줄눈(단독) 추가 — id13073 그 |
| 2026-07-12 04:48 | #327 | [개발] 협업 #182: [P0 재발] ANTHROPIC_API_KEY 크레딧 재소진 — 검색재정렬·리뷰판정 | 20d58774 | - | lib/coordConsumer.ts classify(): 콘솔키 크레딧소진/결제 이슈가 lib/ 등 코드버그 키워드에 걸려 L3_dev(개발결재)로 오분류되던 버그 수정(본 결재 |
| 2026-07-12 04:52 | #328 | [룰갭 P30] 멀티지점 브랜드 OR매칭 갭 — 타지점 확정신호 무시(reviewQuality.ts) | bf9a5d4c | - | lib/reviewQuality.ts verifyReview() 다른 지점 후기 게이트(라인 727 블록) 수정: otherBranch(OO점 명시)가 확인됐는데 dongHere( |
| 2026-07-12 07:19 | #334 | [P0] vercel.json ignoreCommand이 dev-deploy 배포를 전부 무음 스킵 — #3 | 02297e8d | - | web/vercel.json ignoreCommand 재작성: VERCEL_GIT_PREVIOUS_SHA(실제 마지막 배포 sha)를 기준으로 diff, 미설정시 HEAD~9 폴백 |
| 2026-07-12 07:37 | #335 | [자율진단] dev-deploy 반영미확인(dev_status) 영구정체 — 실제론 배포완료인데 결재가 ap | 564c3546 | - | scripts/dev-deploy.mjs: 반영미확인(dev_status) 영구정체 근본원인 수정 — deploy_approved 재쿼리 전에 reconcileUnverified( |
| 2026-07-12 08:24 | #337 | 네이버 롱테일 SEO — 외곽도시 콘텐츠 밀도 보강 | b5444eed | med | 수원/화성/파주/의정부/김포/양주 x 스페셜티·로스팅 결이 전 도시 공통 최약 조합(DB실측). lib/seoData.ts: getRegionTasteGradeBreakdown 추 |
| 2026-07-12 08:30 | #336 | [자율진단] #335 반영미확인 재검증 로직이 실제로는 절대 안 불림 — run-dev-deploy.sh C | 6dda4d6a | - | scripts/reconcileUnverified.mjs 신설(반영미확인 재검증 로직 공용모듈화, dev-deploy.mjs에서 추출) + scripts/dev-claim.mjs가 |
| 2026-07-12 08:33 | #338 | 카페 상세페이지에 '비슷한 카페 더보기' 추가 | 099bf1e2 | low | app/c/[id]/page.tsx: getNearby→getSimilar로 교체(같은 area 후보 40건 fetch 후 char_scores 결 벡터 코사인유사도 계산), li |
| 2026-07-12 08:34 | #339 | MY PIN(내 카페 추억) 노출 강화 | 24f6e1cb | low | app/c/[id]/SaveMemoryButton.tsx에 variant="banner" 추가(기존 pill 로직 재사용, 이미 기록시 문구 변경) + app/c/[id]/page |
| 2026-07-12 08:48 | #341 | [개발] [재발견] instagram_url 컬럼 07-01 완료처리됐지만 11일째 0/13259 채워짐 - | 650ae4e7 | - | scripts/instagram-backfill.mjs 신규: 네이버 지역검색 link 필드가 스마트플레이스 등록 인스타그램을 그대로 반환함을 실측 확인(무크롤·공식API)→카페당 |
| 2026-07-12 08:59 | #344 | [개발] 등급강등 결정 비영속 구조갭 — downgrade는 재합성 시 조용히 원복(unpublish만 보호 | 748fe973 | - | lib/synthStore.ts: lastDowngradeCap() 가드 추가(lastUnpublishLocked와 동형) — 가장 최근 done downgrade 결정의 목표등급 |
| 2026-07-12 09:19 | #345 | [검색품질 결함B] "애견동반" 등 편의시설 의도가 "넓은공간" concept에 뭉뚱그려짐 | 643c1638 | - | lib/criteriaListsBase.ts: concept.space.triggers에서 애견/반려 분리, 신규 concept.pet.triggers(애견/반려/강아지/펫동반)  |
| 2026-07-12 09:20 | #346 | [검색품질 결함C] "브런치" concept 트리거 부재 — 순수 임베딩 유사도만으로 검색 | f77097b7 | - | app/api/search/route.ts CONCEPTS_BASE·lib/criteriaListsBase.ts LIST_META에 브런치 개념 트리거(concept.brunch. |
| 2026-07-12 09:36 | #347 | 상세페이지기능미노출수정 | eb4ab828 | med | 근본원인: CEO 실사용 경로는 지도(app/page.tsx CafePanel)인데 #338/#339는 공유용 상세페이지(/c/[id])에만 구현돼 지도에서는 안 보였음(SSR c |
| 2026-07-12 10:37 | #348 | 유입현황 대시보드 개선 | f711385b | med | 수정: app/admin/page.tsx, app/api/admin/analytics/route.ts. (1) 일별 방문 추이·즐겨찾기 일별 차트 렌더링 버그 수정 — 중첩 fle |
| 2026-07-12 11:05 | #343 | [룰갭 P32] B2B 쇼룸/인테리어 광고가 "카페" 자기묘사로 LOCAL_SEO_SERVICES 가드 무력 | fa210846 | - | lib/reviewQuality.ts:682 LOCAL_SEO_SERVICES 가드에 SELF_BIZ_PROMO(쇼룸/매장주소/방문예약/카톡방문/시공갤러리) 자기업체 정형구 체크  |
| 2026-07-12 11:13 | #349 | 방문분석요약 고도화 | de13da5b | med | web/app/api/admin/analytics/route.ts: 서버에서 다차원 일일 인사이트(buildDailyInsights) 생성 — ①전일·7일평균 대비 증감+유입경로  |
| 2026-07-12 11:56 | #350 | 일일요약 심층화 | 6548b018 | high | 일일요약 심층화 완료. (1) 체류시간 계측 신설: traffic_events.duration_ms 컬럼(ALTER IF NOT EXISTS, 기존 INSERT 무해) + Visi |
| 2026-07-12 12:25 | #351 | 일일요약 5시 자동갱신 | edde2b6f | med | 확인 결과: #350의 오늘 페이지순위/체류시간/유의미사용자 요약(todayInsight)은 /api/admin/analytics(라이브 요청시점 계산)에만 있었고, 17시 일일보 |
| 2026-07-12 13:09 | #352 | 카페상세 구조화데이터 | ec06d1a7 | low | app/c/[id]/page.tsx: JSON-LD에 geo(lat/lng)·address(streetAddress/dong/area)·aggregateRating(등급기반 rat |
| 2026-07-12 22:06 | #353 | 모달 배경스크롤 고정 | 73feb6e5 | low | lib/useLockBodyScroll.ts(신규, 참조카운트 iOS-safe 훅) 추가 후 admin/ChatWidget·VisitorReviews의 기존 임시구현을 대체, ad |
| 2026-07-13 01:52 | #354 | [개발] 협업 #190: [레드팀] id16208 표시명 손상 — 정체성붕괴 경계사례(등급 무관) | 2312a439 | - | scripts/fix-name-16208.mjs 신규: id16208 표시명 정정 원클릭 스크립트. 라이브 네이버 재확인 결과 "김포공항플레이보6 트윗젤"은 손상이 아니라 김포공항 |
| 2026-07-13 09:45 | #358 | [룰갭 P33] 브랜드+숫자 상호 순수숫자토큰 오매칭 — id13384·id10782 재현확정 | a99c1ccb | - | lib/reviewQuality.ts coreTokensDetail: 한글↔숫자 경계분리로 생긴 순수숫자토큰(카페인24→24, 커피깡패254→254)이 다른 비숫자 토큰과 공존할  |
| 2026-07-13 09:47 | #359 | [정합성] char_scores space/mood 축 브랜드명·발음우연 오염 2건(테라스/뷰) — coor | 89be11ff | - | lib/charScore.ts: stripNameMentions에 '지점명 뗀 브랜드핵심명' 변형 추가(앤드테라스 파주점→앤드테라스 자기인용 커버). lib/criteriaList |
| 2026-07-13 11:51 | #360 | [검색품질 결함D] 모멘텀(요즘뜨는) 피드에 grade 가중치 부재 — 참고등급 저표본 카페 검증등급과 동열 | aa70b6c3 | - | web/app/api/momentum/route.ts: gradeBonus() 추가(search.grade_bonus.verified/reference criteria 재사용) — |
| 2026-07-13 11:52 | #361 | [전사 재발방지] Anthropic 콘솔키 잔액 임계치 사전경보(Slack/이메일) — 크레딧 소진 4~5차 | dcc2e7c9 | - | lib/consoleKeyProbe.ts: 콘솔키 소진/인증오류(credit·authkey) 감지 시 이메일(Resend·ALERT_EMAIL 폴백 CEO메일) 즉시 발송 + Sl |
| 2026-07-13 11:58 | #363 | 공유 OG카드 강화 | 70e60b48 | med | lib/ogCard.tsx+charScore.ts(topCharTraits)+c/[id]/opengraph-image.tsx: OG카드에 카페명·등급(✓검증/참고)·대표 결(예:� |
| 2026-07-13 13:28 | #364 | 지역 SEO 랜딩 확충 | 0745b235 | med | lib/seoData.ts, app/area/Curated.tsx: 지역/취향 랜딩 카페 리스트에 실제 대표후기 스니펫(synth_reviews 중 최고점 quote, correl |
| 2026-07-13 13:46 | #365 | UI색상·인터랙션 3건 | dcb972e7 | low | app/page.tsx: ①홈 CTA(내 주변 옥석 찾기) 배경색 #2f6fb0(블루)→#2b2018(브랜드 espresso brown), 텍스트 #f4ece0, 토글상태 색도 브 |
| 2026-07-13 14:04 | #366 | 버튼색·탭하이라이트 | d50596b3 | low | app/page.tsx: 1) 내 주변 옥석 카페 바로 찾기 버튼 배경 #2b2018(다크브라운/거의검정)→#9c6b3f(브랜드 커피브라운)로 변경. 2) 하단 탭바 4개 acti |
| 2026-07-13 22:01 | #367 | 버튼톤+애니메이션 | 2d0a1157 | low | app/page.tsx: 내주변 옥석 카페 버튼 배경을 커피톤 그라디언트(#7c5230→#9c6b3f→#b8804a)로 재조정, globals.css에 .dcn-cta-glow(은 |
| 2026-07-13 22:17 | #368 | 주변카페버튼 재수정 | e7d17086 | low | app/page.tsx(CTA버튼)·app/globals.css(dcn-cta-glow): 배경을 브라운 그라디언트→다크 에스프레소(#2b1a10→#7a4a22)+골드 보더/글로우 |
| 2026-07-14 08:09 | #369 | [개발] 협업 #198: [#192 후속] 레거시 비수도권 오염 217건 일괄정리 요청 (코드는 이미 수정됨 | 230669a5 | - | scripts/purge-legacy-nonmetro.mjs 신규(purge-contam-reviews.mjs 관행 따름). WHERE published=false AND area |
| 2026-07-14 08:10 | #370 | [자율진단] dev_status 배포승격 갭 재발 — #369 CEO승인 15시간+ 미배포(자율진단발 dev | f05e744c | - | scripts/chat-watch.mjs maintenance() 자동승격 WHERE에서 source=chat 조건 제거 — action_type=dev_task AND statu |
| 2026-07-14 08:51 | #371 | [개발] 협업 #201: [TIER1 비공개 재상정 요청] id18739 목요일산책 — 재합성 실측 미해결· | 51551ee8 | - | lib/reviewQuality.ts: P31(NONCAFE_BIZ에 사주 타로 철학관 무속 신점 운세상담 손금 추가) + P35(지번주소 구+동+번지 위치불일치 검증, 구 추출  |
| 2026-07-14 12:45 | #373 | 재방문 인증 허용 | 0d1e86ba | high | 재방문 인증(verified) 구현. app/api/my-cafe/route.ts: verified 컬럼 마이그레이션·GET은 본인기기 인증/미인증 모두 반환(verified 필드 |
| 2026-07-14 13:15 | #374 | 인증 안내문구 추가 | c00ceca7 | low | app/MyCafeRegModal.tsx(미인증 임시저장 확인팝업 문구 강화·저장완료화면 인증/미인증 분기 신설)·app/page.tsx(추억보관소 목록에 인증/미인증 배지 병기· |
| 2026-07-15 00:13 | #376 | 인증상태 안내+글자진하게 | a4bc940d | med | 변경: app/MyCafeRegModal.tsx(임시저장/완료 팝업에 인증됨·미인증 뱃지 추가+나에게만 보임(비공개)/인증 상태로 전환 문구 명시), app/page.tsx(추억상 |
| 2026-07-15 01:35 | #378 | 인증안내/글자진하게수정 | 576ce984 | med | 1) MyCafeRegModal 마운트경로(showMyCafeReg) 재확인 — feature flag·조건부렌더 버그 없음, 미인증배지·안내문구·저장직후/목록/상세 3곳 모두 코 |
| 2026-07-15 10:38 | #386 | [룰갭 P38] 전체이름=흔한 단일단어 카페명 — weak-token 안전장치 자기무력화 | 7b01a960 | - | lib/reviewQuality.ts: verifyReview(nameInTitle/nameInBody)와 quoteMatchConfidence에 nameIsSoleToken/ba |
| 2026-07-17 04:19 | #393 | [개발] 협업 #205: [호기 D-5] 브라운테일커피 창사 첫 로그인·체험 활성화(07-14) — PAYM | 9ed7b04c | - | 계좌이체 안내 발송 기능 추가(협업#205 대안②) — lib/billingEmail.ts에 bank_transfer 메일 종류(사실문구, 계좌번호는 회신으로만 안내) 추가, ap |
| 2026-07-17 13:49 | #398 | 계좌이체 안내메일 발송 중단 | 399281f7 | high | lib/flags.ts(bankTransferEmailEnabled, 기본 off)+lib/billingEmail.ts(kind=bank_transfer 최종 차단)+app/api |
| 2026-07-18 03:41 | #399 | [개발] 협업 #211: [레드팀 각도C 정체성 붕괴] synth_identity 균질화 — 검증등급 141 | 66088ad2 | - | lib/synthEngine.ts buildIdentity()에 2차 보조신호(동/지역) 추가 — 취향·로스팅 근거가 전혀 없어 최다-용도 문구 하나로만 정체성이 정해지는 카페(사 |
| 2026-07-18 08:54 | #397 | [룰갭 신규규칙 2건] P42 지역테마별명(베네치아 송도) + P43 LOC_LIKE/areaPresent  | fd3e4ac0 | - | lib/reviewQuality.ts 3건: (1) DISTRICT_NICKNAME_WORDS 신설(베네치아→송도) — coreTokensDetail의 branded 판정에 연동해 |
| 2026-07-18 09:55 | #400 | [근본원인] decisions action_type 오분류 코드레벨 검증 게이트 신설 (6차 재발 확정, # | 74043ffc | - | app/api/admin/decisions/route.ts ensure()에 BEFORE INSERT 트리거(decisions_normalize_action_type) 추가 — a |
| 2026-07-18 09:57 | #401 | [정합성 신규] synth_reviews_all 완전중복 quote가 검증등급 카운트 부풀림 — synthE | f3e535e9 | - | lib/synthEngine.ts:64-66 — synthesize()의 clean 필터에 quote 정규화(공백제거+소문자) 후 동일 텍스트 uniqBy 추가, n=clean.l |
| 2026-07-19 00:14 | #408 | [개발] 협업 #213: #407 action_type 정정 필요(investigate→dev_task) — | 412bf4fa | - | web/app/api/orchestrator/route.ts: maxDuration 120→300(플랜상한, 실측102s/여유18s→198s로 확대) + HEAL_DEADLINE( |
| 2026-07-19 09:06 | #410 | [#395 후속] 51개 그룹 전수분류 스크립트 + 매칭 파이프라인 지점앵커 근본원인 조사 | 99c3698b | - | ① scripts/classify-cross-branch-quotes.mjs 신규(결정론·API0·읽기전용): 동일quote 2곳+귀속 그룹 자동탐지→verifyReview 재적용 |
| 2026-07-19 23:45 | #412 | [룰갭 신규 2건] P44 흔한 추상명사 카페명(시너지·프렌즈) — identity.weak_token 리스 | 9c1de9b9 | - | lib/criteriaListsBase.ts identity.weak_token에 "시너지","프렌즈" 2항목 추가(주석에 P44 근거 기록). tsc 신규에러 0, npm run |
| 2026-07-20 03:32 | #413 | [룰갭 신규 2건] P45 흔한 형용사형 카페명(향기로운·온전한) — identity.weak_token 리 | cfda4fa2 | - | lib/criteriaListsBase.ts identity.weak_token 리스트에 향기로운·온전한 2건 추가(P44와 동일 패턴). tsc 신규에러 0, npm run bu |
| 2026-07-20 08:48 | #414 | [검색P0][coord#219] semantic 폴백 gradeBonus 무력화 — 참고등급이 검증등급 위로 | 09b23faa | - | app/api/search/route.ts:266-285 semantic 폴백 exact+concept(무상한 필드가중치 누적)를 sim*100과 동일한 0~100 스케일로 후보군 |
| 2026-07-20 08:52 | #415 | [검색P0][coord#219] momentum 강동구 top1 참고등급 승격 — gradeBonus로 억제 | 71b81425 | - | app/api/momentum/route.ts: 참고등급이 검증등급을 버즈점수로 역전하던 결함(gradeBonus 상수가산 무력화)을 구조적으로 해결 — 등급을 점수 가산에서 정렬 |
| 2026-07-20 10:16 | #419 | [개발] 협업 #219: [재발 3회째] 검색랭킹 P0(등급역전) decisions row 미생성 24h+  | b1e6dff5 | - | scripts/make-digest.mjs에 제안서 미인입 감시 섹션 추가 — coord#187/#219 재발 원인(팀이 agent-reports/*-proposals-*.md로  |
| 2026-07-21 11:12 | #421 | [제안→결재행 미생성 재발] rulegap P46/47/48+레드팀id1032 — coord#221→224  | 81831662 | - | scripts/make-digest.mjs 제안서 미인입 감시 근본수정: (1) coordination 행 존재만으로 인입 완료 오판하던 버그 수정 — 이제 decisions 행  |
| 2026-07-22 00:24 | #424 | [coord#226 재상신] 카페상세 FAQ 구조화 — AI답변엔진(ChatGPT 등) 인용 최적화 | 063abd4d | - | app/c/[id]/page.tsx: buildFaq()로 FAQPage JSON-LD(schema.org) + 동일 내용의 가시 FAQ 아코디언(<details>) 추가. 소개/ |
| 2026-07-22 00:28 | #425 | 구독상태 구분표시 | 915340a5 | low | app/admin/page.tsx(구독 카페 현황 모달)·app/api/subscription/route.ts(billing_key SELECT 추가): status+duratio |
| 2026-07-22 01:39 | #427 | [개발] 협업 #227: [재확인] rulegap P46/47/48+id1032 실제 미인입 지속 — dec | 882e9412 | - | scripts/make-digest.mjs 제안서 미인입 감시 근본수정(#421 잔여버그): title/detail ILIKE 매치가 '이 제안서를 실제 처리한 결재행'과 '미인입 |
| 2026-07-22 04:24 | #428 | [개발] 협업 #231: [3차 재상신] P46/P47/P48+레드팀 id11208/id18854 — 결재행 | 79818d8d | - | P46: lib/criteriaListsBase.ts identity.weak_token에 "스토리" 추가(id1338). P47: lib/reviewQuality.ts COMMO |
| 2026-07-22 04:34 | #429 | [협업#225 SLA위반 에스컬레이션] 프랜차이즈 형제지점 증거 교차공유 — 매칭 파이프라인 지점앵커 근본수 | f3278240 | - | lib/reviewQuality.ts: isNonBranchWord를 모듈스코프로 끌어올려 export(GENERIC_WORD 포함) — 지점앵커 사전에 제과점 등 업태접미사 드리 |
| 2026-07-22 11:15 | #434 | [개발] 협업 #232: [정보공유] cafes.instagram_url 전량 미입력(0/13483) — B | 2be89c13 | - | lib/discover.ts: 발굴 수집(discoverRegion/localSearch)이 네이버 응답의 link·telephone 필드를 무시하던 것을 근본수정 — instag |
| 2026-07-22 11:23 | #433 | [개발] 협업 #230: [정합성발견] 근거링크 일반어/부제 혼입형 교차오귀속 — 검증등급 5곳 포함 확정  | 7ae551ae | - | lib/reviewQuality.ts: coord#230 일반어/부제 혼입형 오귀속 근본수정. GENERIC_WORD에 라운지·신상·전통찻집·동네빵집·비치·베이글·샌드위치 추가,  |
| 2026-07-22 23:02 | #444 | [자율진단] synth_coherence 재기록 누락 — 오탐 근거오염 경보(decisions#443) 구조 | 24147f0c | - | lib/synthStore.ts:794 healPublishedAudit — 재검 시 계산한 coh를 cafes.synth_coherence에 UPDATE로 반영(재기록 누락 수정 |
