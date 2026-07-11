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
