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
| 2026-07-22 23:45 | #448 | [룰갭 P49] '오늘도' 등 조사결합 시간부사 NAME_STOPWORD 누락 — 다중토큰명 OR매칭 오염 | 780b4a3b | - | lib/reviewQuality.ts:285 NAME_STOPWORD Set에 "오늘도" 추가 — 조사결합 시간부사 OR매칭 오염 차단. tsc 신규에러 0, npm run bui |
| 2026-07-22 23:49 | #449 | [룰갭 P50] 호텔부속 카페 — 웨딩/호캉스/타호텔 객실후기 등 비-F&B 콘텐츠 혼입(NONCAFE_BI | 9b447fb5 | - | lib/reviewQuality.ts: (1)NONCAFE_BIZ에 꽃집/플로리스트/화환 추가(132행) (2)호텔카페(이름에 호텔 또는 HOTEL_BRANDS 포함) + 숙박/호 |
| 2026-07-23 01:39 | #450 | [개발] 협업 #234: [정정] P46/P47/P48 미인입 감시는 오탐 확정 — 코드 직접확인 배포완료, | 24bc0bde | - | scripts/make-digest.mjs 제안서 미인입 감시 근본수정(#427 잔여 오탐): '결재행이 서로 다른 제안서 stem 2개+ 동시 언급하면 메타 논의로 제외' 휴리스 |
| 2026-07-23 01:43 | #451 | [개발] 협업 #235: [coord#225 후속] 코드수정(#429, 07-22 13:34 배포) 이후에도 | 1a13dd36 | - | lib/reviewQuality.ts(isAreaLikeWord export)+lib/synthStore.ts(evidenceHitsCafe): #429가 '○○점' 접미 지점표기 |
| 2026-07-23 09:35 | #452 | [검색품질] 미보유 프랜차이즈명 검색 시 리뷰 속 타사비교 언급만으로 무관카페 1위 노출 | 9b70984a | - | app/api/search/route.ts lexicalScore(): 리뷰텍스트만 매칭(다른 필드 0)인 경우 exact=0으로 제외해 lexScore/gradeBonus 대상에 |
| 2026-07-23 11:50 | #456 | [룰갭 P52] GENERIC_SUFFIX에 "플래그십(스토어)" 추가 — 타 브랜드 매장타입 서술어 교차매 | 46a65fd9 | - | lib/reviewQuality.ts:259 GENERIC_SUFFIX에 플래그십 스토어 접미사(공백유무 모두) 추가. tsc 신규에러 0, build 성공. |
| 2026-07-23 23:24 | #465 | [룰갭 P53] "퍼스널" 흔한 서비스업 수식어 identity-core 오귀속 → COMMON_WORD_N | 6028d86d | - | lib/reviewQuality.ts:163 COMMON_WORD_NAMES에 "퍼스널" 추가. tsc 신규에러 0(베이스라인 next.config eslint 1건 제외), np |
| 2026-07-23 23:46 | #466 | [룰갭 P54] 다지점 프랜차이즈 형제지점 완전주소 병기 — 동일구·다른도로 슬립(신규 로직, 승인 필요) | ea527f88 | - | lib/reviewQuality.ts: myBranch('점'지점) 카페의 주소검증 블록(input.addr 섹션) 끝에 신규 체크 추가 — 등록 도로명이 리뷰 전문에 전혀 없는데 |
| 2026-07-23 23:59 | #472 | [개발] 관제탑 트래픽 패널 — 행동기반 봇 제외(스푸핑 UA 헤드리스 대응) | dbcb87f0 | - | 신규 lib/behaviorBot.ts(BEHAVIOR_BOT_ANON_IDS_SQL, 재사용 predicate) + app/api/admin/analytics/route.ts에  |
| 2026-07-24 04:09 | #477 | [룰갭 P55] 흔한 관용구/명사형 카페명 — '우상향'·'향초' weak_token 갭(사전추가) | e0790d1e | - | lib/criteriaListsBase.ts identity.weak_token에 '우상향'·'향초' 2건 추가(P44/46과 동일 메커니즘, 코멘트 블록에 P55 근거 명시).  |
| 2026-07-24 04:19 | #478 | [룰갭 P56] 동명이업종 브랜드 오귀속 — nameInTitle 자기소개 예외 무력화(레드문 뷰티 vs 레 | 97b0a527 | - | lib/reviewQuality.ts: NONCAFE_BIZ의 nameInTitle 자기소개 예외를 무력화하는 신규 게이트 추가(747/755 뒤). nameInTitle=true |
| 2026-07-24 04:27 | #479 | [룰갭 P57] LOCAL_SEO_SERVICES 사전 갭 — 리모델링/종합설비 배관시공 SEO스팸 미등재( | a85a6b49 | - | lib/reviewQuality.ts LOCAL_SEO_SERVICES에 리모델링·종합설비 추가(142행). 기존 865행 CAFE_CONTEXT/SELF_BIZ_PROMO 가드  |
| 2026-07-24 14:07 | #483 | [룰갭 P58] P50 HOTEL_LODGING_SIGNAL 사전 협소 — 웨딩/예식/객실/1박/수영장(ba | 6d8b6a6e | - | lib/reviewQuality.ts:789 HOTEL_LODGING_SIGNAL에 웨딩 예식장? 객실 1박 수영장(bare) 추가, 수영장 이용권 조건 제거. CAFE_CONTE |
| 2026-07-24 14:08 | #486 | [개발] instagram_url enrich 좌표전용매칭 근본버그 — 상호명 검사 없음(coord#244  | 8ea3e609 | - | scripts/instagram-backfill.mjs: 좌표(165m)만+link형식 매칭에 상호명 코어토큰 일치(lib/reviewQuality.ts coreTokens 재사용 |
| 2026-07-25 01:10 | #493 | [개발] 협업 #245: #486 instagram_url enrich 재검토 요청 — 배포 후에도 잔존 오 | 9b137e1d | - | lib/reviewQuality.ts: coreTokensDetail export(venueOnly 노출) + scripts/instagram-backfill.mjs nameMat |
| 2026-07-25 03:22 | #499 | [레드팀 신규] cron-sentinel 교차오염 탐지 사각 — 동일브랜드 타지점 인용문 복제 | f59e9b23 | - | app/api/cron-sentinel/route.ts scanFranchiseBranchPollution: 브랜드 접미사(예 서창점) 완전일치뿐 아니라 마커를 뗀 지점토큰(서창) |
| 2026-07-25 03:28 | #497 | [룰갭 P59] 체험공방(도자기 원데이클래스)이 "테마카페"로 오분류 — 카페맥락 0인 체험후기가 참고/검증 | 35576532 | - | lib/reviewQuality.ts: CRAFT_WORKSHOP_ACTIVITY 하드게이트 신규(원데이클래스·물레체험·핸드빌딩·찰흙놀이·도자(기)?체험/만들기/굽기/페인팅/공방· |
| 2026-07-25 09:30 | #500 | [룰갭 P60] 기관 보도자료·업무협약/후원 소식이 카페 방문후기로 오분류 — 참고등급 노출(6곳 확인) | a6fa42de | - | lib/reviewQuality.ts: INSTITUTIONAL_PR 정규식 추가(업무협약/협약체결/보도자료/후원받아/전달식/기념식/사회보장협의체/구청장 등) + verifyRev |
| 2026-07-25 09:37 | #502 | [dev_task 재상신] make-digest.mjs 제안서 미인입 감시 오탐 근본재설계 — #450 수정 | 6a6c1071 | - | scripts/make-digest.mjs 제안서 미인입 감시 근본재설계(#450 수정 후에도 3주+ 재발): 기존 stem ILIKE 문자열매칭 계열(#421/#427/#450) |
| 2026-07-25 11:12 | #503 | 트래픽 지표 통일 | 6d689dbe | med | 단일소스 lib/trafficMetrics.ts(getDailyTraffic/getTodayTraffic) 신설 + lib/behaviorBot.ts BOT_ANON_IDS_SQL |
| 2026-07-26 05:01 | #507 | [룰갭 P61] naver_category 비-F&B 업종 + 리뷰 내 타업체/타지역 혼입 조합 신호 — 신 | 383af22c | - | lib/reviewQuality.ts: naver_category 비F&B 조합신호 신규 게이트 추가(QualityInput.naverCategory, isNonFnbCategor |
| 2026-07-26 08:49 | #512 | [검색품질] 체인상한(chain_cap) 오탐 — "카페 OOO" 등 일반명사 접두 개인상호를 프랜차이즈로  | c85a14a6 | - | app/api/search/route.ts:165 chainKeyOf() 수정 — 마지막 단어가 "점"으로 끝나는 지점접미 패턴일 때만 체인키로 묶도록 제한(그 외엔 이름 전체를  |
| 2026-07-26 08:54 | #513 | [사장님영업] 사장님 신청 퍼널 이벤트 계측 3종 — 홈 CTA→모달→제출 이탈지점 트래킹 | be9ae6b3 | - | 신규 app/api/owner-funnel/route.ts(owner_funnel_events 테이블: anon_id/event/source/cafe_id/path/meta) +  |
| 2026-07-27 02:22 | #518 | [개발] 제안서 미인입 감시 5차+ 재발오탐 확정 — 오늘 8건 전부 결재행 기존확인, 실배치 아님 | 0e0361b2 | - | scripts/make-digest.mjs 1.5절(제안서 미인입 감시) 근본전환(coord#255): 폴백 매칭 신호를 파일명 stem ILIKE에서 제안서 헤딩(##+)의 카페 |
| 2026-07-27 02:41 | #519 | [개발] 협업 #254: PII 유출: id2588 카페세그루 공개후기에 전화번호 노출(scrubPublis | 4d247098 | - | lib/collectOrchestrator.ts maskPII()에 050[0-9](안심/가상번호) 대역 정규식 추가(마지막 그룹 3~4자리 가변 대응) + lib/synthSto |
| 2026-07-27 03:17 | #520 | [룰갭 P62] '워크샵' 일반활동명사 — identity.weak_token 갭(사전추가) | bd5aeeaa | - | lib/criteriaListsBase.ts:125 identity.weak_token 배열에 "워크샵" 추가(P38/P44/P55 동일 패턴). tsc 신규에러 0(베이스라인 n |
| 2026-07-27 03:55 | #522 | [개발] 협업 #259: [신규] PII 유출 재발 위험: scrubPublishedPII가 synth_re | 61730345 | - | lib/synthStore.ts scrubPublishedPII() 후보선별 쿼리 수정: synth_reviews(top6)만 스캔하던 것을 synth_reviews_all까지 U |
| 2026-07-27 09:02 | #523 | [개발] [coord#248 후속정정] direct 봇오염(meta-externalagent) 야간 주기 재 | 52b1e054 | - | lib/behaviorBot.ts: KNOWN_BOT_UA_PATTERN 단일출처 신설(표출필터 2곳도 이걸로 통일). app/api/visit/route.ts: /api/visi |
| 2026-07-28 04:03 | #530 | [룰갭 P63] 택배/스마트스토어 배송 후기가 VISIT_CUES 오탐 — 비방문 구매글이 검증등급에 산입 | 2d422bd3 | - | lib/reviewQuality.ts: 택배/스마트스토어 배송 후기 오탐 수정 — DELIVERY_ONLY_CUES(택배 후기/택배로 받/스마트스토어 구매/주문서 캡쳐 등) + I |
| 2026-07-28 09:29 | #531 | [룰갭 P64] 배달앱(배민·쿠팡이츠·요기요) 주문 후기가 VISIT_CUES 오탐 — P63 배송후기 수정 | 538f82aa | - | lib/reviewQuality.ts:51 DELIVERY_ONLY_CUES 정규식에 배달앱 어휘(배달 시켜/시켰/앱/어플/주문/해서, 배달 후기, 쿠팡이츠, 배달의 민족, 배민) |
| 2026-07-28 09:30 | #532 | [검색품질] 무관련 질의에도 관련성 하한선 없이 24건 확정노출 — 프랜차이즈명·오타·무의미 문자열 검색 시 | 057856e6 | - | app/api/search/route.ts 시맨틱 경로(lexMatched===false)에 sim<criteria(search.semantic_floor.min_sim, 기본 0 |
| 2026-07-28 09:37 | #533 | [사장님영업] 홈 사장님 CTA 시각 강조 개선 — 배포 후 2일간 클릭 0건(방문 92명) | d2ecc315 | - | app/page.tsx:1276-1278 사장님 CTA 버튼을 소비자 버튼과 동등한 시각강조로 변경 — border 아웃라인→bg-[#e8b87a] 채움+shadow-lg(소비자는 |
| 2026-07-28 09:40 | #534 | [기조실장 발견] L2 자동승인 코드가 requeue_resynth·investigate 미커버 — 29~8 | 541295c5 | - | web/lib/issues.ts autoCorrect(): L2 자동승인·자동집행 대상을 unpublish 단독에서 unpublish+requeue_resynth로 확대(둘 다 / |
| 2026-07-29 08:29 | #536 | [정합성조사 발견] synth_identity 태그라인 조합폭발형 대량중복(90.2%) — 다양성 신뢰 리스 | 46180482 | - | lib/synthEngine.ts:buildIdentity — soleSignal(취향신호 전무) 조건으로만 지역명(동)을 붙이던 걸 상시 부착으로 변경(용도문구 있으면 '~동에서 |
| 2026-07-29 08:30 | #537 | [룰갭 P65 · coord#263] YouTube 댓글이 quote에 혼입돼 verified 리뷰로 집계( | aab328d6 | - | lib/youtubeCollector.ts: YouTube 댓글 수집·병합 로직 완전 제거(commentThreads API 호출 삭제, text/desc는 title+desc만) |
| 2026-07-29 08:31 | #538 | [정합성조사 발견] 유사상호 카페 간 동일 블로그리뷰 링크 교차귀속(2쌍) | 8d7fd374 | - | lib/synthStore.ts healCrossCafeLinkContamination() 승자선정 근본수정: 종전엔 hit=true 후보가 2곳 이상이면 카페별 독립 score로 |
| 2026-07-29 08:32 | #539 | [룰갭 P66 · coord#265] naver_category F&B이나 비카페(양식/파스타 등)인데 검증 | ba36b0eb | - | lib/reviewQuality.ts: isNonCafeFnbCategory()+COFFEE_SUBSTANCE 신규(F&B대분류·비카페 업종=레스토랑/양식/한식/중식/일식/분식/이 |
| 2026-07-29 11:34 | #542 | [정합성조사 발견] 리뷰 아닌 양식성 문구가 리뷰 인용문으로 오혼입 | aac7b94a | - | lib/reviewQuality.ts: VENDOR_LISTING_TEMPLATE 패턴(네임택 첨부 필수 등 위탁판매 게시판 등록양식) 신규 분류 게이트로 하드 탈락 추가(향후 재 |
| 2026-07-29 11:35 | #543 | [룰갭 P67] 반려식물/수족관 소매업이 '카페 겸업' 자기서술로 검증노출 — 커피실질언급 0건(id3313 | b017fd3a | - | lib/reviewQuality.ts: NONCAFE_BIZ와 별개로 AQUASCAPE_PET_RETAIL(수초/어항/아쿠아스케이프/반려식물/다육 판매) 신설, CRAFT_WORK |
| 2026-07-29 11:36 | #545 | [검색품질] 취향추천(char_scores) 오염 — 일반명사형 카페명("동네카페")이 무관 타업체 후기로  | e7289f72 | - | lib/reviewQuality.ts: GENERIC_WORD에 "동네" 추가(동네카페 등 상호 자체가 일반구문인 경우 coreEmpty 처리) + verifyReview core |
| 2026-07-29 11:37 | #546 | [개발] 협업 #266: 검증등급 카페 80곳 최신리뷰증거 18개월+ 노후(closure_misses=0 사 | ecdeb8be | - | app/api/cron-closure/route.ts: STALE_EVIDENCE_MONTHS(18) 보조지표 추가 — misses=0(네이버는 발견됨)이라도 검증등급 최신후기 1 |
| 2026-08-01 04:41 | #565 | [룰갭] 프랜차이즈 필터 영문/로마자 브랜드 미등재 — 체인필터 우회 (rulegap-proposals-20 | 16ba1e4b | - | lib/discover.ts·lib/sangga.ts·app/api/cafe-discover/route.ts: FRANCHISE 배열에 영문/로마자 브랜드명(STARBUCKS/TW |
| 2026-08-01 04:42 | #566 | [룰갭] "제목이 다른 업체를 가리킴" 방어 게이트가 카페/커피 키워드 전제 — 비카페 업종어(라이브카페·재 | 27ee5dec | - | lib/reviewQuality.ts: naver_category 기반 non-coffee 카페 업종어(라이브카페/재즈바/재즈클럽/라이브클럽/공연카페/북카페/와인바/펍카페) 세트  |
| 2026-08-01 05:43 | #567 | [룰갭] 짧은/흔한 이름 카페맥락 게이트가 5자+ 관용구성 상호명은 미보호 — 무관 업종 글 혼입 (rule | 43e6404d | - | lib/reviewQuality.ts:1304 제안7 게이트 길이문턱 4자→5자 확장(파일럿 승인안). id19491 화목한가정 등 5자 관용구성 상호가 본문언급만으로 CAFE_C |
| 2026-08-01 09:44 | #569 | [룰갭] 영문/외래어 카페명이 실존 고유명사(도서명·해외지명)와 우연일치 — 무관 콘텐츠 verified 채 | 47d4adeb | - | lib/reviewQuality.ts: isLatinHeavyName() 헬퍼 추가(라틴글자비중>=60%, 글자수>=4) — 제안1 게이트(985행 inTitleFull)·제안7  |
| 2026-08-01 10:45 | #572 | [개발] 협업 #274: 프랜차이즈 블록리스트 소급미적용 41곳(decisions#570) — 근본원인 프로 | 796549ed | - | app/api/cron-rulegap/route.ts: 스캔 루프에 isFranchise(lib/discover.ts) 체크 추가, 신규 소급미적용 카페를 decisions에 자동 |
| 2026-08-02 00:47 | #580 | [자율진단] 새벽 크론 통잠창(47ffe86) — 정지감시 임계값(EXPECT_MAX_H) 미조정으로 매일  | 4d2c39ed | - | web/lib/jobTeams.ts EXPECT_MAX_H 재계산(#580): cron-grow 6→14h, cron-resynth 3→9h, cron-embed/synth/iss |
| 2026-08-02 00:48 | #583 | [정합성조사 발견] synth_identity '빵·디저트' 잔여 균질화(40.3%) — #536 후속 미해 | 0eadeed4 | - | lib/synthEngine.ts buildIdentity()에 3차 disambiguator 추가: 동+빵 최다용도 충돌 시 naver_category 세부값(베이커리/케이크전문 |
| 2026-08-02 01:49 | #584 | [룰갭] 랜드마크+업종접미사 복합상호 — 전체상호 미일치로 방어게이트 우회, verified까지 침투 (ru | 89ad1f75 | - | lib/reviewQuality.ts: coreTokensDetail에 landmarkStripped 신호 추가(랜드마크 토큰 제거 후 다른 식별어만 남는 경우 감지, venueO |
| 2026-08-02 01:50 | #586 | [레드팀 코드결함] autoCorrect() 승인집행 done 오표시 — action_params 없으면 무 | 3d9c4c48 | - | web/lib/issues.ts autoCorrect() L46-72: ids.length===0(action_params 누락)일 때 ok 기본값을 true→ids.length> |
| 2026-08-02 02:51 | #589 | [개발] 협업 #276: decision#575 cron-grow 정지의심 — 부분 오탐 가능성(하트비트만  | 74df9ba1 | - | app/api/cron-grow/route.ts: 합성루프(②)에 시간예산(SYNTH_DEADLINE=t0+285s) 추가. 근본원인: recordRun(하트비트)이 함수 맨 끝에 |
| 2026-08-03 01:53 | #596 | [개발] 협업 #277: 결재#594·#595 크론 정지의심 — 임계값(EXPECT_MAX_H) 미스매치로  | 9f699155 | - | lib/jobTeams.ts EXPECT_MAX_H 재계산: cron-rulegap 16→20(스케줄 04:30·23:30UTC 최대공백19h+버퍼), orchestrator-he |
| 2026-08-03 01:54 | #597 | [룰갭] 예약제·무인픽업 주문제작 케이크공방 — walk-in 카페와 동일경로로 검증(최고신뢰) 등급 도달  | 988d0aa6 | - | lib/reviewQuality.ts: DELIVERY_ONLY_CUES와 대칭인 PICKUP_ONLY_CUES 신설(100%예약제·무인픽업·픽업시간·카톡ID/문의·주문제작·원데이 |
| 2026-08-03 03:55 | #599 | [개발] 협업 #278: CAFE_CTX/CAFE_CONTEXT 사전 협소로 offctx_rate 과대측정  | 0d23a3f5 | - | lib/synthStore.ts CAFE_CTX·lib/reviewQuality.ts CAFE_CONTEXT/CAFE_CONTEXT_STRONG/CAFE_CONTEXT_SUBSTA |
| 2026-08-04 08:54 | #600 | [룰갭] 브랜드 체험관(자동차·가구쇼룸) 부속 카페 — 전시/시승 방문기가 카페 리뷰로 혼입 (rulegap | a000fd7a | - | lib/reviewQuality.ts: BRAND_EXPERIENCE_ACTIVITY regex 신설(전시/시승 후기·포토존·쇼룸 투어·캐릭터 전시) + P50(호텔 부속 카페)과 |
| 2026-08-04 08:55 | #605 | [정합성조사] synth_identity 태그라인 잔여 수렴 — 동일동 내 10곳+ 완전동일 문구 135그룹 | 0155bfa6 | - | lib/synthEngine.ts buildIdentity: 4개 잔여 용도(작업/혼자/수다/사진)에 리뷰텍스트 기반 구체 키워드 disambiguator(SPECIFIC_TERM |
| 2026-08-04 08:56 | #606 | [룰갭] naver_category="라이브카페" 자기소유 리뷰가 실제 주류/공연 업소인데 카페실질 0으로도 | 8b0a5854 | - | lib/reviewQuality.ts: ALCOHOL_LIVE_VENUE_ACTIVITY(재즈바/생맥주/하이볼/칵테일/위스키/공연입장료·무대/커버차지/야외바베큐/바베큐장·이자) 신 |
| 2026-08-04 08:57 | #618 | [룰갭] 원두 도매/로스팅공장 + 소매아울렛 — 사업자 대량구매·제품구매 후기가 카페 방문후기로 혼입 (ru | 4d549ed4 | - | lib/reviewQuality.ts: WHOLESALE_RETAIL_CUES 정규식 신설(대량주문·사업자 원두/샘플·도매가·창고형·홈카페 용품/구매·카페창업·원두 구매/판매 후기 |
| 2026-08-06 23:05 | #623 | [룰갭] 인테리어/가구업계 콘텐츠(리바트·한샘·인테리어시공 등) 동명 오채택 — 카페리뷰 혼입 (rulega | 15ff50a9 | - | lib/reviewQuality.ts: NONCAFE_INTERIOR_CUES 신규 게이트 추가(P59/P67과 동일 구조, verifyReview 하드탈락 섹션) — 가구 재설치 |
| 2026-08-06 23:06 | #625 | [룰갭] 검증등급 표시 근거리뷰가 단일 블로거(사업자 자체 계정 추정)로 지배 — 노출 다양성 캡 필요 (c | 8f3616c3 | - | lib/collectOrchestrator.ts L217-233: top-6 근거리뷰 선정에 같은 블로거(source=bloggername) 최대 2건 캡(pickDiverse)  |
| 2026-08-06 23:07 | #626 | [룰갭] naver_category 비카페 신호 미사용 — 리뷰큐 반영 + 확정오염 4건(1996·1819· | 380f29ef | - | lib/reviewQuality.ts: isNonCafeFamilySignal(naverCategory,name) 신규 export(H17 게이트, 카페계열 카테고리 밖+상호명도  |
| 2026-08-06 23:08 | #628 | [개발] 협업 #290: 등급판정 n(reviewCount)이 relevance/trust 미반영 — 랜드마 | f13fdf5f | - | lib/collectOrchestrator.ts: 등급판정 gradeCount = verified + reference*0.5 (참고 floor는 trustCount 그대로) —  |
| 2026-08-08 03:05 | #631 | [룰갭] 바리스타/커피 교육원(직업,기술교육) 자기완결형 후기가 P61 교차오염 게이트 우회 — id4335 | 66ad853f | - | lib/reviewQuality.ts: BARISTA_EDU_CATEGORY/BARISTA_EDU_ACTIVITY 신규 하드거절 게이트 추가(P59 위치, naver_categor |
| 2026-08-08 03:06 | #634 | [룰갭] 로스팅시설(로스팅랩/센터) 네이버 리스팅에 형제 소매지점 후기 혼입 — id7112 라이브 노출 4 | c25a2fd3 | - | lib/reviewQuality.ts: otherBranch/otherBranchTok 다른지점 게이트가 "OO점"(붙임) 정규식만 매칭해 "송파 지점"처럼 공백 있는 격식체를 놓 |
| 2026-08-08 07:05 | #636 | [룰갭] 동일날짜 SEO템플릿반복 — 미표기 체험단 캠페인(coordination#293 후속) — need | 899f4999 | - | lib/reviewQuality.ts: detectCampaignCluster() 추가(±1일 날짜밀집≥30% + 2-gram 템플릿중복≥0.35 + 개인서사마커<34% 결합신호, |
| 2026-08-08 23:05 | #637 | [룰갭] 부분문자열 상호명 매칭 시 근접성 게이트 부재 — 원거리 이종업체 리뷰 교차귀속, 라이브 검증등급  | b57b02cf | - | lib/reviewQuality.ts verifyReview()에 부분문자열 상호명 근접성 게이트 추가(1187행 앞): 우리 상호가 원문에 경계매칭은 실패했지만(nameInTit |
| 2026-08-09 03:05 | #639 | [개발] 협업 #294: [증거보강] decision#637 구현 전 반영 요망 — 다중테넌트(몰/아울렛)  | 0610c5fe | - | lib/reviewQuality.ts venueCtxOk 적용범위 확대(998-1032행): 다중테넌트 시설(백화점·아울렛·몰) venueOnly 이름(브랜드핵심토큰 없이 건물명뿐 |
| 2026-08-09 07:05 | #640 | [룰갭] 비방문 거래게시판 NONVISIT_BOARD 미등록 — cafe.naver.com/ettrainer | fd8cc9f9 | - | web/lib/reviewQuality.ts:156 NONVISIT_BOARD 정규식에 ettrainer 추가(카페직거래광장, joonggonara/changupnamu와 동일 성 |
| 2026-08-09 08:06 | #642 | [레드팀 재발] synth_identity 태그라인 수렴 재악화 — #605 disambiguator 배포  | f8fca721 | - | lib/synthEngine.ts+lib/criteriaListsBase.ts: 용도문구(사진/작업/혼자/수다/빵) disambiguator에 2차 폴백 추가 — 코드고정 SPEC |
| 2026-08-09 11:05 | #643 | [룰갭] 비방문 거래게시판 NONVISIT_BOARD 미등록 — cafe.naver.com/jihosocce | 6abb9e87 | - | lib/reviewQuality.ts:159 NONVISIT_BOARD 정규식에 jihosoccer123 게시판 추가(joonggonara changupnamu ettrainer  |
| 2026-08-09 11:06 | #644 | [룰갭] 갤러리 병설 카페 전시 공지문(3인칭 초대장) — VISIT_CUES 없는 방문후기 노출, 2곳 4 | 2bc9976d | - | lib/reviewQuality.ts: EXHIBITION_PR 정규식 추가(개인전/전시소개/전시명:/작가:/전시 기간:/많은 관심 부탁드립니다) + VISIT_CUES 부재 조건 |
| 2026-08-10 11:05 | #646 | [개발] 협업 #297: [경영지원 코디네이션] 제안서 미인입 감시 로직 — "표 형식" 특화 패턴에 국한, | 4385e974 | - | scripts/make-digest.mjs extractContentTokens(): id\d+/P\d{2,} 추출을 헤딩(## ) 전용에서 문서 전체 줄로 일반화 — 불릿·중첩목 |
| 2026-08-10 23:05 | #650 | [룰갭] 언론 보도기사 바이라인 방문후기 오분류 — NEWS_BYLINE 미등록, 5곳 5건 (rulegap | 8d4ac0f7 | - | lib/reviewQuality.ts: NEWS_BYLINE 정규식 신설(EXHIBITION_PR 아래) + verifyReview()에서 institutionalPR/exhibi |
| 2026-08-11 07:05 | #651 | [룰갭] 업체 자체 SNS 공지문 방문후기 오분류 — SELF_ANNOUNCE 미등록, 5곳 6건 (rule | ac8e3682 | - | lib/reviewQuality.ts: SELF_ANNOUNCE 정규식(오픈/신메뉴 출시/이벤트/영업 시작 안내, 소식을 전해드립니다류) 신설, verifyReview() inst |
| 2026-08-11 07:05 | #656 | [룰갭] FOREIGN_HOMONYM 화이트리스트 누락 — 바이워드마켓(오타와) 해외지명 오염, 1곳 6건 | 292ad8ec | - | lib/reviewQuality.ts:1086 FOREIGN_HOMONYM Set→Map<식별토큰,전용정규식> 확장. 콜롬보=기존 공용정규식 유지, 바이워드마켓→/오타와 캐나다 O |
| 2026-08-12 23:05 | #658 | [개발] [관측] 인천 중구·서구 area태깅 이상 — 대량 발굴에도 실published 0~3건 | 7a6ef6cd | - | app/api/cron-grow/route.ts: METRO_REGIONS 시딩 뒤 discovery_state에서 METRO_REGIONS에 없는 폐지지역 행 DELETE 추가( |
| 2026-08-12 23:05 | #659 | [룰갭] 프랜차이즈 지점오염 힐러 가드 과보존 — id3782·11906 노출후기가 타지점 얘기, 자동조치  | f0bdf066 | - | app/api/cron-sentinel/route.ts healFranchiseBranchPollution: 보존 판정을 raw 항목 전체가 아니라 실제 표시 quote(lib/c |
| 2026-08-12 23:06 | #661 | [룰갭] VENUE_WORDS 누락 — 지식산업센터 건물코드(SKV1), 디저트문정 SKV1점 9/51건 이 | 7932e1c4 | - | lib/reviewQuality.ts VENUE_WORDS 배열에 "SKV1" 추가(지식산업센터 건물브랜드, #661). tsc 신규에러 0(기존 next.config.ts esl |
| 2026-08-13 03:05 | #667 | [룰갭] EQUIPMENT_SERVICE_BLOG 미등재 — 커피머신 정비업체 영업일지 8곳 10건 고객후기 | 62fe6765 | - | lib/reviewQuality.ts: EQUIPMENT_SERVICE_BLOG 정규식 신설(L72 근방, decisions#667) + equipmentServiceOnly 게이 |
| 2026-08-13 07:05 | #668 | [룰갭] COMMON_WORD_NAMES 근접판정 구조적 회귀 — CAFE_CONTEXT_STRONG의 공연 | f4bdd43f | - | lib/reviewQuality.ts:1320 ctxNearName(fullN, commonAnchor, CAFE_CONTEXT_STRONG)→CAFE_CONTEXT_SUBSTAN |
| 2026-08-13 07:05 | #669 | [룰갭] COMMON_WORD_NAMES 사전 미등재 — "무렵"(시간관용구,5/6건 무관) · "네오"(제 | 4f0a9817 | - | lib/reviewQuality.ts:239 COMMON_WORD_NAMES에 "무렵"·"네오" 추가. tsc 신규에러 0(기존 next.config.ts eslint 베이스라인  |
| 2026-08-13 23:05 | #671 | [개발] 협업 #304: [정합성] 폐업 감지 사각 — 리뷰 텍스트 내 명시적 폐업신호 미활용(cron-cl | fe5256c5 | - | app/api/cron-closure/route.ts: synth_reviews(_all) quote 텍스트에서 폐업/폐점/문닫았/영업안해/없어졌 명시신호 감지 시 STALE_MO |
| 2026-08-13 23:06 | #674 | [탐지엔진] 카페간 인용문(quote) 완전동일 상시탐지 — cron-sentinel/cron-verify  | 4987b37d | - | app/api/cron-verify/route.ts: runChecks()에 check #16 cross_cafe_quote_dup 추가 — 공개카페 synth_reviews[]. |
| 2026-08-14 03:05 | #676 | [자율진단] youtube-backfill 은퇴 후 EXPECT_MAX_H 잔류 → 매 사이클 허위 크론정지 | 04bce37d | - | web/lib/jobTeams.ts: EXPECT_MAX_H·LAUNCHD_JOBS에서 youtube-backfill 제거(RETIRED_JOBS와 정합, 57·81행 삭제). t |
| 2026-08-14 03:06 | #677 | [룰갭] VENUE_WORDS 누락 — 연세대 백양누리(학생회관 복합시설) 타업체(샐러디) 오염 | be787c63 | - | web/lib/reviewQuality.ts VENUE_WORDS에 백양누리 추가(대학 복합건물 그룹). tsc 신규에러 0, npm run build 성공. |
| 2026-08-14 23:05 | #683 | [자율진단] franchise-branch 힐러 2회연속 무효→30일동결 — id7840 보구슬라바 오산시청 | 79419258 | - | lib/collectOrchestrator.ts(BorderlineItem에 text 필드 추가·auditItems/borderline push에 t.text 보존)·app/api |
| 2026-08-14 23:05 | #684 | [룰갭·저신뢰] COMMERCE_JUNK 가드 "카페" 부분문자열 우회 — 헬스장비 판매글 verified  | c64df313 | - | web/lib/reviewQuality.ts NONVISIT_BOARD 정규식에 gymmaster(헬스장비 중고거래 게시판) 추가. 판매 정형고지문(카페 특성과는 다른…)이 tit |
| 2026-08-14 23:06 | #693 | [개발] EXPECT_MAX_H 워치독 사각 해소 — search-quality-agent·b2b-sales | f7a84369 | - | web/lib/jobTeams.ts EXPECT_MAX_H에 search-quality-agent:30, b2b-sales-agent:54 추가(JOB_TEAM엔 이미 등록돼 있었 |
| 2026-08-14 23:07 | #694 | [개발] synth_identity 정체성 붕괴 템플릿 897건 — 생성 로직 폴백조건 조사·수정 | f5220bc8 | - | lib/synthEngine.ts buildIdentity 수정. 근본원인 분해: 897건 중 대다수(약 2,774건)는 #642(08-09 07:17 UTC 배포) 이전에 합성된 |
| 2026-08-14 23:08 | #695 | [개발] decide API action_params 키 불일치로 미실행건 허위 done 처리 — ids 정 | d364e425 | - | app/api/admin/decide/route.ts: ids 파싱에 cafe_id 단수 폴백 추가(정규화) + status===done && ids.length>0 && affe |
| 2026-08-15 03:05 | #702 | [자율진단] 정책 소급 재판정 큐(L6) 리뷰 UI 부재 — 0/200 방치 | 2624e598 | - | 신규: app/admin/recheck/page.tsx(리뷰 화면)+app/api/admin/recheck/route.ts(GET목록/POST verdict). lib/rechec |
| 2026-08-15 03:06 | #727 | [검색품질 재발] 리뷰 비교문 언급 오탐 — #452 스코어인플레는 픽스, 후보노출(candidate lea | 578c7eb5 | - | app/api/search/route.ts: reviewOnly(리뷰 인용문 타사비교 언급 단독 매칭)이 lexMatched=true로 잡혀 semantic_floor(min_si |
| 2026-08-15 07:05 | #716 | [룰갭] LANDMARK_WORDS 가드가 AI판정(needs_llm) 경로에서 우회 — 수봉별마루도너츠 표 | 6b3e3e9a | - | web/lib/reviewQuality.ts classify()의 nameInTitle/nameInBody 둘 다 false인 폴백 분기(라인 1359 부근)에 venueOnly/ |
| 2026-08-15 11:05 | #730 | [룰갭] "카페" 브랜딩 비카페 요식업(파스타·순댓국·죽·떡집) — NONCAFE_BIZ titleHasCa | 755d5ef5 | - | web/lib/reviewQuality.ts:1176 부근 — naver_category dish-specific 화이트리스트(한식>순대,순댓국 한식>죽 이탈리아음식>스파게티,파스 |
| 2026-08-15 23:05 | #732 | [룰갭] 멀티플레이스 리스트/투어 콘텐츠 — nameInTitle만으로 listicle 하드거절 우회 | 4ccd5892 | - | web/lib/reviewQuality.ts:1616 listicle 하드거절 조건을 (listicle && !nameInTitle) -> (listicle && !nameInBo |
| 2026-08-15 23:06 | #733 | [사장님영업] 홈 사장님 CTA→체험신청 모달 미스매치 — 전환 8%대 붕괴(cta_click 12건 중 m | f1d0bf79 | - | app/page.tsx: 랜딩 사장님 CTA(1299행)를 A안대로 role 분리 — 1차 버튼이 ownerPwModal(PIN 로그인벽) 대신 OwnerSignupModal(체험 |
| 2026-08-16 07:35 | #734 | [사장님영업] 트라이얼 전환 버튼(BillingManage.tsx) day-1 카피 개선 — 방향 승인 요청 | d6516f30 | - | app/BillingManage.tsx: 트라이얼 전환 버튼 카피 개선(문자열/레이아웃만). 버튼 위에 체험 중 실제 켜져있는 기능(골드핀·추천카페 상단·쇼케이스) 1줄 고지 +  |
| 2026-08-16 23:05 | #743 | [버그수정] lib/issues.ts:49 L2 자동집행 ids폴백 누락 — cafe_id단수 결정 영구미집 | 3c582bf7 | - | lib/issues.ts:49 ids 파싱에 action_params.cafe_id 단수 폴백 추가(app/api/admin/decide/route.ts:33-37과 동일 패턴). |
| 2026-08-17 11:05 | #745 | [룰갭 신규] 관용구/일반명사형 상호명(동네·우리동네·골목·마실) — titleHasCafeWord만으론 " | 660bc2fa | - | lib/reviewQuality.ts bareWeak 게이트에 관용구/동사동음이의 화이트리스트 2종 추가(identity.idiom_dong_token: 동네방네·우리동네·골목=d |
| 2026-08-17 11:06 | #746 | [룰갭 캐치업] 45차 발견 미등록 — 호텔 예약 제휴 어필리에이트 "할인정보" 템플릿 AD_STRONG 우 | ac2583a1 | - | lib/reviewQuality.ts:109 AD_STRONG에 호텔 예약제휴 할인정보 템플릿(할인정보(후기 가격 평점 교통 조식 세일 리뷰) 및 역순 (할인정보, — id418  |
| 2026-08-17 23:05 | #750 | [정합성조사→핸드오프후속] coord#312 근본원인 진단 — nameCoherence 위치어 단독매칭 가드 | 27fe71e4 | - | lib/reviewQuality.ts nameCoherence(): non-empty coreTokens 경로에 지명형(locTerms=isAreaLikeWord) 가드 추가 —  |
| 2026-08-18 07:05 | #759 | [개발] make-digest.mjs 제안서 미인입 감시 — '상신 없음'만 매칭, '제안 없음' 문구 누락 | ba42f731 | - | web/scripts/make-digest.mjs:122 isExplicitNoProposal 정규식을 /상신.../에서 /(?:상신 제안).../로 확장 — 제안 없음 문구도 매 |
| 2026-08-18 11:05 | #761 | [룰갭 신규] 브랜드/플랫폼명 충돌 — "해피빈"(네이버 기부 플랫폼)이 카페 상호에 포함되면 무관 기부콘텐 | e64bc306 | - | lib/reviewQuality.ts: 해피빈 브랜드/플랫폼명 충돌 게이트 추가(HOTEL_LODGING_SIGNAL과 동일 패턴) — 카페명에 해피빈 포함+본문에 기부/콩기부/저 |
| 2026-08-18 23:05 | #762 | [개발] 협업 #320: [전사자율진단] sentinel.noncafe-biz 자동치유 실패 3건 — 채용공 | 75c20f10 | - | app/api/cron-sentinel/route.ts: JOB_AD_ABSOLUTE 정규식(채용공고/직원모집/시급숫자 등) 신설 — scanNonCafeBizPollution·h |
| 2026-08-19 07:05 | #763 | [개발] make-digest.mjs 제안서 미인입 감시 — b2b-sales 팀 제목 구조상 no-prop | 83cb2931 | - | scripts/make-digest.mjs isExplicitNoProposal 2건 수정: (a) 긍정패턴에 요청 alt 추가(승인 요청 없음 미매칭 해소), (b) 부정조건(! |
| 2026-08-19 11:05 | #760 | [룰갭 회귀의심] 일반명사 단독상호 앵커게이트(P47/#428)가 재합성 후에도 무관콘텐츠 통과 — id92 | d79483f5 | - | lib/reviewQuality.ts 수정. (1) id9294(온기) 재현: 현재 코드는 이미 정상 거절함(score2, nameAsWord 오염 사유) — 회귀 아님, synt |
| 2026-08-19 11:06 | #765 | [룰갭 신규] 다중토큰 상호명 부분토큰 OR-매칭 — id9683·id19744 무관 콘텐츠 매칭 | 6df7ad95 | - | lib/reviewQuality.ts: distinctInTitle/Body가 identTokens.some()으로 다중토큰 중 하나만 히트해도 매칭 인정하던 것을, 히트 토큰이  |
| 2026-08-19 11:07 | #766 | [룰갭 신규 — 저위험] LANDMARK_WORDS "꿈의숲" 미등재 — id16913 5/6 무관 콘텐츠  | 3d92bd6d | - | lib/reviewQuality.ts LANDMARK_WORDS 배열에 꿈의숲 1건 추가(기존 메커니즘 재사용). tsc 신규에러 0(기존 next.config eslint 베이스 |
| 2026-08-19 23:05 | #780 | [개발] instagram-backfill 매칭 검증 스텝 부재 — 데이터리셋 반복 실효 없음(08-13 재 | 9b5a9283 | - | lib/discover.ts: 좌표전용 매칭(byName 실패 시 좌표 근접 55m만으로 채택, 424행)으로 백필되던 instagram_url(429행)에 상호명 브랜드토큰 겹침 |
| 2026-08-20 07:05 | #777 | [룰갭 신규] 접두 결합 합성상호 dong 불일치 게이트 — id11853 커피마을/두레커피마을 오매칭 | aadaf180 | - | lib/reviewQuality.ts: 접두 결합 합성상호 dong 불일치 게이트 추가(attachedNamePrefix). id11853 커피마을/두레커피마을 케이스2건 실측검증 |
| 2026-08-20 07:06 | #782 | [사장님영업] 카페 상세페이지 사장님 CTA 계측 공백 — 14일 826명 최대접점이 무측정 | ef6179cc | - | app/c/[id]/OwnerCtaLink.tsx 신설(SaveMemoryButton/OutboundLink와 동일 클라 래퍼 패턴) + app/c/[id]/page.tsx의 사장 |
| 2026-08-20 23:05 | #783 | [개발] healGroundingSuspects 재합성 후 grounding 재검증 루프 부재 — 환각 미교 | abaaf33f | - | lib/synthStore.ts healGroundingSuspects(): 재합성 후 llm_judged_at=NULL로 초기화해 judge-candidates 기본 큐(로컬 g |
| 2026-08-20 23:06 | #784 | [결재 재구성] needs_llm 임계선 대응 — 우선순위 재조정(#490 26일 미집행 근본수정) | 8e9c9e3a | - | app/api/cron-batch-judge/route.ts ORDER BY(line92-97)에 재정제 우선순위 추가: (published AND synth_grade!=검증)  |
| 2026-08-20 23:07 | #787 | [개발] 협업 #323: [리스크 MED] issues#5548 cron-sentinel 예산초과 HIGH  | 0509b77c | - | lib/jobContract.ts: cron-sentinel budget.blobReads 24→200(9일 실측 avg18/max151 반영, decision#499/#674 교 |
| 2026-08-21 03:05 | #788 | [정합성] 인천 신규구 동 매핑표 커버리지 누락 — decision#487 재발(5건) | 43c2b987 | - | lib/discover.ts: discoverRegion INSERT가 검색쿼리 라벨(storeArea)을 무조건 area로 찍던 근본버그 수정 — parseGuArea()로 실주 |
| 2026-08-21 11:05 | #790 | [룰갭 신규] 카페+펜션/글램핑 겸업 — 숙박류 게이트가 '호텔' 명칭에만 한정돼 우회 (id18246 그라 | 2475b224 | - | lib/reviewQuality.ts:1388 부근에 LODGING_NAMED/LODGING_SIGNAL 게이트 추가(P50/P58 패턴 재사용). 카페명에 펜션/글램핑/리조트/연 |
| 2026-08-21 11:06 | #794 | [개발] decisions_normalize_action_type 정규화 게이트 오탐 — .mjs 언급만으로 | 857bcdb8 | - | app/api/admin/decisions/route.ts의 decisions_normalize_action_type() 트리거 수정: 파일확장자(.mjs/.tsx?) 매칭은 ti |
| 2026-08-21 11:07 | #795 | [룰갭 신규] 행위 관용구형 상호명("카페투어") — bareWeakOk 전체이름일치 안전장치 무력화, 10 | cc906280 | - | lib/criteriaListsBase.ts: identity.idiom_dong_token 화이트리스트에 "카페투어" 추가(id7265 실측 오염). reviewQuality.t |
| 2026-08-22 03:05 | #798 | [룰갭 신규] 네이버 카페(커뮤니티) 소스 — "카페" 동음이의로 본문언급 게이트 우회 (id11444·18 | 1f0f34e1 | - | lib/reviewQuality.ts:1832 짧은/흔한 카페명 본문언급 게이트 수정 — source==='cafearticle'(네이버 카페 커뮤니티)일 때만 bodyCtxGat |
| 2026-08-22 11:05 | #802 | [룰갭 신규] identity.weak_token 미등재 3건 — 크리스탈·허니브라운·소문난 (id6435· | d89c9aff | - | lib/criteriaListsBase.ts identity.weak_token 배열에 크리스탈·허니브라운·소문난 3건 추가(기존 사전과 동일 메커니즘 확장). tsc 신규에러 0 |
| 2026-08-23 07:05 | #805 | [룰갭 신규] 부동산 분양 홍보글 정형구 — OFFTOPIC_SPAM 우회 + CAFE_CONTEXT_STR | 190f88c5 | - | lib/reviewQuality.ts: OFFTOPIC_SPAM에 부동산 시황 정형구(미분양/집값·땅값 우상향/부동산 시황/전용면적) 추가 + REAL_ESTATE_LISTING_ |
| 2026-08-23 11:05 | #804 | [룰갭 신규] identity.weak_token 미등재 — "플랫폼" (id9605 237플랫폼 카페) | 2a891af7 | - | lib/criteriaListsBase.ts: identity.weak_token 배열에 플랫폼 추가(id9605 237플랫폼 오혼입 대응) + 근거 주석. tsc 신규에러 0(기 |
| 2026-08-23 11:06 | #806 | [룰갭 신규] "OO호텔+범용시설어" 코어토큰 붕괴 — 스카이라운지 단어일치로 무관 건물 콘텐츠 유입 (id | 69bc3938 | - | lib/reviewQuality.ts GENERIC_WORD(line457)에 스카이라운지 정확일치 추가 — VENUE_WORDS 호텔 부분일치 스트립 후 남는 유일 식별토큰이 범 |
| 2026-08-24 03:05 | #807 | [룰갭 신규] "OO아트홀" 부속 카페 코어토큰 붕괴 — 지자체 문화시설명 부분일치로 무관 전시·인근식당 콘 | 1cead8f0 | - | lib/reviewQuality.ts: VENUE_WORDS 배열에 "아트홀" 추가(코멘트 포함). id18064 반월아트홀 쉼카페처럼 지자체 문화시설명이 카페명에 붙어쓰인 복합명 |
| 2026-08-24 07:05 | #810 | [룰갭 신규] P73(네이버카페 자기홍보 정형구) 미수정 반쪽 — inTitleFull 경로 CAFE_CON | 4d192611 | - | lib/reviewQuality.ts:1478 inTitleFull(제목=카페명) 게이트를 body-only 경로(:1877, P73/#798)와 대칭으로 수정 — source== |
| 2026-08-24 11:05 | #811 | [개발] [정합성 발견] instagram_url 근접 오귀속 의심 40쌍(80곳) — enrichment  | 18ceea7d | - | lib/discover.ts: healInstagramMisattribution() 추가 — 조사결과 brandTokenOverlap 게이트(#780)는 이미 정상 작동 중(재현  |
| 2026-08-24 11:05 | #812 | [룰갭 신규] 동명 상품/식물명 판매 콘텐츠(리테일 브랜드 자사글) — 정확 동명일치로 CAFE_CONTEX | 4d8d7fda | - | lib/reviewQuality.ts: CAFE_CONTEXT_SUBSTANCE에 커피(?!테이블 나무) 부정형lookahead 추가(커피테이블·커피나무 복합어 오탐 차단) + B |
| 2026-08-24 23:05 | #813 | [룰갭 신규] 동호회 커뮤니티 모임 공지문이 실제 후기로 오판정 (id1198 카페소소·id11232 차너른 | deb5ce64 | - | lib/reviewQuality.ts: CLUB_MEETUP_LOGISTICS_LEAK 게이트 신규(CLUB_NAVER_LINK+CLUB_MEETUP_LOGISTICS_CUES 동 |
| 2026-08-24 23:06 | #814 | [개발] 발굴 좌표전용 dedup 과잉차단 — lib/discover.ts:456 이름검증 없이 44~55m | a653d54e | - | web/lib/discover.ts:456 좌표전용 dedup에 brandTokenOverlap 이름검증 추가(decisions#780 함수 재사용) — 좌표 근접만으론 skip  |
| 2026-08-25 03:05 | #815 | [개발] 협업 #337: [정의정정] user_consents.visit_count는 "재방문"이 아니라 페 | 97c611ae | - | app/admin/page.tsx(유입경로 카드)·app/api/orchestrator/route.ts(sourceEngage)에서 visit_count 평균을 '재방문 횟수'로  |
| 2026-08-25 11:05 | #816 | [개발] [정합성 발견] raw_reviews에 스팸 블로그원문("금호김영집" 등) 981곳 중복 오염 —  | f0c88535 | - | 근본원인: lib/webSearchCollector.ts fetchWebReviews가 네이버 sort=sim 유사도만 믿고 카페명 무관 콘텐츠까지 반환(예: 링크나열형 스팸 블로 |
| 2026-08-25 11:05 | #817 | [룰갭 신규] 백화점/몰 팝업스토어 순환벤뉴 — 다른 시기 타브랜드 팝업 후기 오귀속 (id16327 앨리스 | db8dad99 | - | lib/reviewQuality.ts: GENERIC_WORD에 팝업/팝업스토어 추가(coreTokens 오염 제거) + isPopupRotatingVenue 신규 하드게이트(na |
| 2026-08-26 07:05 | #822 | [룰갭 신규] DISTRICT_WORDS 누락어 "루원시티" — 인천 서구 신도시 상권 딴 브랜드 오귀속 ( | f03294c4 | - | lib/reviewQuality.ts DISTRICT_WORDS에 루원시티 추가(1줄). isVenueTok·AREA_NAME·otherDistrictInTitle 판정에 자동 반 |
| 2026-08-26 11:05 | #823 | [개발] [정합성 발견] synth_identity 템플릿 중복 848그룹/3838곳(공개28%) — 카페  | 963a230a | - | lib/synthEngine.ts buildIdentity() 빵 카테고리 구체어 우선순위 역전: categoryBreadTerm(naver_category만 반영, 동+카테고리  |
| 2026-08-26 11:05 | #827 | [레드팀 발견][코드수정] 강등/비공개 결재 action_params 포맷 불일치가 재발가드(lastDown | eb754d3b | - | app/api/admin/decide/route.ts: 실행 후 최종 UPDATE decisions에서 action_params를 정규화된 ids(jsonb 배열)와 downgra |
| 2026-08-26 23:05 | #819 | [개발] 정합성 감시(lib/issues.ts) 하드코딩 좌표박스·주소필터가 강원 확장(criteria.ge | 4e6e2d4d | - | web/lib/issues.ts integ:outbox는 이미 geoBoxSql(getCriterionSync)로 교정돼 있었음(선행 커밋). integ:noncap도 OUT_OF |
| 2026-08-26 23:06 | #828 | [개발] [폐업검토] cron-closure 신호 오탐 2건 — closure_signal 정규식 + 상호  | e5ed6b8c | - | app/api/cron-closure/route.ts: CLOSURE_TEXT_SIGNAL 정규식에 부정후방탐색 추가(품절/소진 시 조기영업종료 조건부문구 예외, 실제 폐업신호는  |
| 2026-08-27 07:05 | #833 | [룰갭 신규] VENUE_WORDS 누락어 "비발디파크" — 리조트 복합단지 딴 입점업체 오귀속 (id242 | 4c84b841 | - | lib/reviewQuality.ts VENUE_WORDS에 비발디파크 추가(리조트 복합단지 클래스, 아파트단지#271/SKV1#661/백양누리#677와 동일 메커니즘). tsc  |
| 2026-08-27 11:05 | #835 | [개발] id1152 동네카페 — 3회 상신에도 근본 코드수정 미집행, 오염 원문 그대로 라이브 9일+ 방치 | 7335e2ac | - | lib/reviewQuality.ts verifyReview() borderline(LLM 재판정) 라우팅 게이트 수정(~1656-1663행). 근본원인: coreEmpty(완전  |
| 2026-08-27 11:06 | #840 | [룰갭 신규] VENUE_WORDS 누락어 "하이원리조트" — 리조트 복합단지 내 4개 카페 교차오염(최대  | c4ed7e09 | - | web/lib/reviewQuality.ts VENUE_WORDS에 "하이원리조트" 추가(#833 비발디파크와 동일 패턴). tsc 신규에러 0, build 성공. |
| 2026-08-28 07:05 | #852 | [개발] [정합성 발견] 근접중복(구어체 철자·브랜드축약) 신규 3~4쌍 — discover dedup 사각 | 749ddfb2 | - | lib/reviewQuality.ts에 nearDuplicateCafeName() 추가(공백·까페/캬페 등 구어체 철자·업종어 위치차 정규화 후 완전일치/4자+포함 판정) — br |
| 2026-08-28 07:06 | #853 | [룰갭 신규] VENUE_WORDS 누락어 "휘닉스파크"(휘닉스 평창) — 강원 리조트 복합단지 교차오염 ( | 40fc31d9 | - | lib/reviewQuality.ts VENUE_WORDS(579행 부근)에 휘닉스파크/휘닉스평창 추가, #833·#840과 동일 isVenueTok 메커니즘 재사용. tsc 신규 |
| 2026-08-28 11:05 | #854 | [룰갭 신규] identity.weak_token 미등재 — "사무소" (id21579 2/2건 오피스클리닝 | a0e3e359 | - | lib/criteriaListsBase.ts: identity.weak_token 리스트(175행)에 "사무소" 추가(id21579 오피스클리닝 광고 100% 오염 대응). tsc |
| 2026-08-29 03:05 | #859 | [룰갭 신규] 휴게소 "간식 나열형" listicle 미검출 — PLACE_TOKEN이 비카페 접미사 브랜드 | 41bb8b2d | - | lib/reviewQuality.ts: listicle 판정에 휴게소/터미널/공항/역사/환승센터 소속 카페 한정 보조신호 추가 — body에서 쉼표·가운뎃점 구분 고유명사형 토큰( |
| 2026-08-29 07:05 | #880 | [룰갭 신규] LANDMARK_WORDS 누락어 "하조대" — 양양 해변/전망대 랜드마크명 타업종 교차오염  | f9f589d8 | - | lib/reviewQuality.ts LANDMARK_WORDS(684행)에 하조대 추가 — 기존 isLandmarkTok 메커니즘 재사용(#584·#766과 동일 패턴). tsc |
| 2026-08-30 11:05 | #894 | [레드팀 재발] id3376 브라운필빵공장 — requeue_resynth 2회 연속 실패, 환각 문구 코드 | 983c1435 | - | lib/synthEngine.ts(ops 스캔)·lib/collectOrchestrator.ts(trust 전달): 운영신호(직접로스팅 등) 스캔이 trust=reference(약 |
| 2026-08-30 11:06 | #896 | [정합성 신규] 이름변형 중복등록 — place_id 이름해시 dedup 우회(discover.ts:525) | e2303e64 | - | lib/discover.ts:493-546 — 발굴 dedup에 주소 완전일치 매칭(byAddress) 추가. 이름해시 place_id로 인해 지점명 변형·좌표오차(>55m)로 기 |
| 2026-08-30 21:57 | #847 | [룰갭 신규] SELF_ANNOUNCE 사각 — 예약/주문 유도 홍보글이 리뷰 인용문으로 노출 (12곳, 검 | b9010bec | - | lib/reviewQuality.ts: SELF_ANNOUNCE 옆에 ORDER_SOLICITATION_AD 신규 추가(전화번호 패턴 + 예약문의/주문예약/카톡ID·문의 키워드 동 |
| 2026-08-30 21:58 | #848 | [룰갭 신규] franchise-branch 스캐너 사각 — 지점 접미사가 "점"류가 아닌 브랜드쌍 완전 미 | 61da97ed | - | app/api/cron-sentinel/route.ts: scanFranchiseBranchPollution()에 접미사 마커(BRANCH_SUFFIX_RE) 무관 보조 탐지 추가 |
| 2026-08-30 21:59 | #850 | [개발] 팀홀튼 FRANCHISE 코드 블록리스트 미등재 — #834 근본원인 미수정 확인 | 64b2b285 | - | web/lib/discover.ts FRANCHISE 배열에 "팀홀튼"(한글, line26), "TIMHORTONS"(영문, line30) 추가. isFranchise가 공백제거+ |
| 2026-08-30 22:00 | #865 | [룰갭 신규] COMMON_WORD_NAMES 미등재 "카나리아/CANARIA" — 칵테일메뉴명·지명 동음이 | 27d8e7fe | - | web/lib/reviewQuality.ts:306 COMMON_WORD_NAMES에 카나리아/canaria 추가(norm()이 소문자화해 CANARIA/Canaria 모두 커버) |
| 2026-08-30 22:02 | #901 | [검색결함] "카공" 단독검색 0건 — 등록된 카공시설 데이터 미연결 | 8fc4b2c7 | - | lib/criteriaListsBase.ts: concept.work.triggers 배열에 "카공" 추가(단일출처, DB오버레이 없음 확인). 근본원인: SEO aliases(s |
| 2026-08-30 22:43 | #866 | [룰갭 신규] COMMON_WORD_NAMES 미등재 "우상향" — 부동산 관용구 동음이의 오염 (id190 | 0287a27b | - | web/lib/reviewQuality.ts:319 COMMON_WORD_NAMES에 "우상향" 추가(부동산 시황 관용구 동음이의 방지, id19003). tsc 신규에러 0(기존 |
| 2026-08-31 07:05 | #910 | [개발] 협업 #356: [확대] 인천 가짜 세부지명 3종 정정 필요 — 729건 (coordination# | 395077ed | - | 코드 근본원인 수정: 실존하지 않는 "인천 2026-07-01 2군9구 개편"(제물포구/영종구/검단구/서해구)이 과거 에이전트 환각으로 6개 파일에 사실처럼 박혀 cron-grow |
| 2026-09-01 02:29 | #914 | [개발] 협업 #361: decision#894 dev_task "배포완료·반영확인" 처리 후에도 대상 레코 | a8bffb88 | - | scripts/dev-deploy.mjs, scripts/reconcileUnverified.mjs: dev_task 완료 결재의 result/coordination.resolut |
| 2026-09-01 02:30 | #916 | [룰갭 신규] CAFE_CTX 호텔 애프터눈티/라운지 어휘 미등재 — 정상후기 offctx 오탐 (id250 | 8c8e5313 | - | lib/synthStore.ts CAFE_CTX 정규식에 호텔 F&B 어휘(애프터눈 르구떼 르 꾸떼 딤섬 딸기뷔페 하이티 라운지 해피아워 조식) 9종 추가. tsc 신규에러 0(기 |
| 2026-09-01 02:31 | #917 | [룰갭 신규] COMMON_WORD_NAMES 미등재 "컨시어지" — 호텔예약사이트 상용구 동음충돌 (id2 | b3cb34f5 | - | lib/reviewQuality.ts COMMON_WORD_NAMES에 "컨시어지" 등재(id247 컨시어지커피 — 호텔 컨시어지서비스 상용구 동음충돌, offctx_rate 0. |
| 2026-09-01 02:33 | #919 | [룰갭 신규] LANDMARK_WORDS 누락 "화진포"/"김일성별장" — 관광지 방문기 교차오염 (id24 | 05579ad8 | - | lib/reviewQuality.ts LANDMARK_WORDS에 화진포·김일성별장 추가(#880 하조대 동일 패턴). isVenueTok/isLandmarkTok이 이미 LAND |
| 2026-09-01 02:34 | #920 | [룰갭 신규] 리조트 브랜드(비발디파크·하이원·델피노) 부속 F&B — LODGING_NAMED/LODGIN | 79555a5f | - | lib/reviewQuality.ts LODGING_DESC에 리조트 브랜드명(비발디파크·소노벨·소노펫·소노펠리체·델피노·하이원·휘닉스파크/평창) 추가, LODGING_SIGNAL |
| 2026-09-01 02:35 | #922 | [개발] 팀홀튼 재발 근본원인 — app/api/cafe-discover/route.ts에 lib/disco | ac729c62 | - | app/api/cafe-discover/route.ts, lib/sangga.ts: FRANCHISE 배열에 팀홀튼(KR)+TIMHORTONS(EN) 추가. tsc 신규에러 0(기 |
| 2026-09-01 03:05 | #923 | [개발] Review schema.org JSON-LD 구조화데이터 추가 — 전략기획 5회 연속 제언(08- | b0023e77 | - | app/c/[id]/page.tsx: 기존 CafeOrCoffeeShop JSON-LD의 aggregateRating 옆에 review[] 추가 — evAll(오염방어 필터 통과한 |
| 2026-09-01 09:00 | #918 | [룰갭 신규] COMMON_WORD_NAMES 미등재 "아일랜드" — 인테리어/부동산 "아일랜드 식탁" 동음 | 0fd91e01 | - | lib/reviewQuality.ts COMMON_WORD_NAMES에 아일랜드 등재(id6659 아일랜드15 vs 인테리어 아일랜드 식탁/키친 동음충돌 차단). 숫자토큰15는 s |
| 2026-09-01 23:52 | #932 | [개발] 협업 #363: [관찰공유] naver 재방문 지표 4사이클 정체 — 콘텐츠만으로는 한계, 기능레버 | f035a083 | - | 신규 app/SavedCafes.tsx(찜한 카페 재방문 유도, 기존 /api/bookmark GET 재사용) 추가 + app/c/[id]/page.tsx에 RecentCafes  |
| 2026-09-03 07:44 | #927 | [룰갭 신규] COMMON_WORD_NAMES 미등재 "오롯이담아내다" — 서술구 동음충돌 (id25659) | 1f5fee9d | - | lib/reviewQuality.ts COMMON_WORD_NAMES에 "오롯이담아내다" 등재(id25659). norm()이 공백제거하므로 nameClean 전체이름 대조(P23 |
| 2026-09-03 07:46 | #931 | [정책개선] costwatch 데이터전송 임계 절대값→상대값 전환 검토 | 4cf89164 | - | app/api/cron-costwatch/route.ts: 전송량 임계(TOTAL_GB_ALERT 고정 25GB)를 가동시간 워치독과 동일 패턴(최근 7일 중앙값×1.6배, 이력없 |
| 2026-09-03 07:47 | #950 | [개발] 협업 #365: /api/cron-sentinel 무응답(hang) — 어제까지의 빠른 cost-h | b33b57de | - | app/api/cron-sentinel/route.ts: 재진입(reentrancy) 가드 추가(heal_leases 재사용, target_id=-1 예약, ttl=320s). 원 |
