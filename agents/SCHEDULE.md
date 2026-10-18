# [비서실장] 에이전트 스케줄 표 — 실측 2026-07-04 08:58 갱신 (2026-07-06 17:38 재확인·변경없음)

> **🔴★★★★★2026-10-17 16:4x 갱신(오후 사이클; 근거 DIGEST 07:05·`agent_runs`/`cron_gate`/`decisions` DB 실측·git log)** — 핵심 사이클 08:00·17:00 2회 무변경. `launchctl list`는 이 세션 권한 밖(승인 차단) → `agent_runs` 최신행으로 판정.
> **① #1362 계열 검증(어제 지시)**: cron_gate 개방 5종 중 **4종 가동 확인** — cron-billing 10-17 08:00 ok · cron-criteria-verify 08:50 **pass(warn 0)**(18일 공백 후 첫 결과) · cron-coord-consumer 16:03 ok · cron-demand 10-16 20:00 ok. **미확인 1종 = cron-snapshot**(마지막 09-27 12:01; 주간 주기라 다음 스케줄 창 도래 전일 수 있음 — 창 시각은 vercel.json 대조 필요, 추측 금지). **닫힘 유지**: cron-discover-categories·cron-newsletter(10-10 11:57, 개방 시점은 CEO).
> **② 신규 스케줄 인프라(CEO 직접커밋, 10-17)**: `003851e4`(10:40) **`dawn-deploy` 매일 06:00 자동 배포**(미푸시 있을 때만 빌드·푸시, 배포 창 08→06시 확대; jobTeams 기조실·EXPECT_MAX_H 30 등재 ✓, 이 문서 등재는 **이번에 완결**) · `6b9ba5b7`(11:26)·`2f9000d9`(12:04) **`deep-collect` 깊은 수집 하루 1회**(collect-catchup 창 안; 성장본부·EXPECT_MAX_H 30 ✓)+**일일 보고 매일 08:20 자동** · `d39351a0` 3샤드 병렬 · `8457e162`/`62ec63d7`/`8693e2ac` 쿼터: 유휴 예약 15,978콜/일 해제·폐업 예약 1,200→400(발굴·재수집 게이트 +15,800콜)·깊은 수집이 예약 게이트 준수. `e50dc354`(10-16 18:14) 리프 에이전트 감시계약 신설(EXPECT_MAX_H). plist 실재·러너 heartbeat는 launchctl 권한 밖이라 **확인 필요**(DIGEST: dawn-deploy ✅5h·deep-collect ✅3h → 가동 확인됨).
> **③ 로컬 launchd 재가동 확인(agent_runs)**: quality-redteam 08:15 · demand-grow 08:20 · deep-judge 08:23(328h 정지 후 재개) · weekly-evaluation 10:30 · chief-manager 12:06 · marketing 16:19. **여전히 무기록**: dev-agent/dev-deploy/dev-pipeline(10-03 20:05; 의도적 RETIRED `b095c869`), evaluation·owner-weekly·risk-mgmt·strategy·support-office-director·team-finance/legal/ops-support(DIGEST 정지의심 461h — 결재 #1366~1373 approved(10-17 10:37) 집행 대기).
> **④ 충돌·공백·비효율**: (a)**cron-embed 402 선불크레딧 소진**(Google AI Studio, 10-17 16:07 실패; decisions #1376 pending·coord #466 open) — `8b724059`로 임베딩 실패가 표면화돼 크론헬스 ❌로 보임(이전엔 삼켜짐, 확인 필요). 공개 게이트는 분리돼 신규 공개 무영향 (b)cron-grow 네이버 사용률 96%(15:12)로 쿼터 거의 소진 — 목표 ~70% 초과, 17:00 이후 apiFails 중단 동작 확인 필요 (c)콘솔키 크레딧(#461 15일) 지속.

> **🔴★★★★2026-10-16 16:4x 갱신(비서실장 13일 공백 후 첫 사이클; 근거 git log·DB `cron_gate`·`agent_runs`·DIGEST 07:05)** — 핵심 사이클 08:00·17:00 2회는 무변경. `launchctl list`는 이 세션 권한 밖 → 로컬 launchd 가동은 `agent_runs` 최신행으로만 판정.
> **① Vercel 크론 = 이제 DB 관문 `cron_gate`가 실행 여부 결정**(`1d056936` 10-10 12:00, `web/proxy.ts`): vercel.json엔 전부 재등록, `x-vercel-cron-schedule` 요청만 관문 통과(미등록·enabled=false·DB오류 → 200 skipped). 상시 개방=cron-costwatch·cron-cache-flush. **개방 단계(DB 실측)**: 1단계 10-10 12:12 rulegap·orchestrator → 2단계 closure·exposure·issues·resynth·sentinel·verify(기록 10-10 15:23, 노트 "10-11 00:05") → 3단계 10-16 09:29 enrich·grow·synth → 4단계 10-16 12:20 criteria-verify·embed·selfaudit·snapshot → 5단계 10-16 15:15 billing·coord-consumer·demand. **아직 닫힘: cron-discover-categories·cron-newsletter**("단계 재개 대기").
> **② 정정**: 자율진단·EXECUTIVE(10-16)가 "billing·demand·snapshot·criteria-verify 13~19일 무실행 = Vercel 대시보드 Cron 토글 의심"으로 #1362 상신했으나, **원인은 cron_gate 닫힘(CEO 설계 단계 재개)이고 12:20·15:15에 이미 개방**됨(`cron_gate` 조회 실측; 두 리포트에 `cron_gate` 언급 0건). 첫 가동은 각 크론 다음 스케줄 시각 — **10-17 08:00 사이클에서 `agent_runs` 최신행으로 확인 필요**(아직 미확인).
> **③ cron-grow 3시간 주기(8회/일)**: `87445f4a`(13:31) — 10-03 임시 4회/일 → 8회/일, 워커 4병렬(네이버 쿼터 11.6%→목표 ~70%, 폐업 예약 1,200 보존). 마지막 실행 15:14.
> **④ 로컬 launchd 재개 징후**: 마지막 실행 — dev-pipeline·dev-agent·dev-deploy 10-03 20:05, chief-manager·deep-judge 10-03 16:2x~16:3x, marketing 10-03 16:22, weekly-evaluation 10-03 10:30, quality-redteam 10-03 08:20, demand-grow 10-03 08:29 이후 **무기록(원인 미확인, 점검 배정)**. 10-16 15:16~16:33 재가동 확인: import-permits·indexnow·morning-sweep-report(15:16~17)·rulegap-agent 16:17·search-quality 16:19·b2b-sales 16:26·self-audit 16:05~16:10·chief-manager-agent 16:33. sangga-rollout·dev-deploy·dev-pipeline·owner-weekly는 `b095c869`(15:16)에서 의도적 RETIRED 표기.
> **⑤ 충돌·비효율**: (a)비서실장 사이클 10-03 16:31→10-16 16:3x 13일 공백(일지 12일 소급복원) (b)Vercel 4종 18일 criteria 검증 공백(불변규칙 §4 — 개방 후 첫 FAIL/PASS 확인 필요) (c)cron-grow 8회/일 + 쿼터 확대는 Vercel 함수시간 +900s/일(≈+$1/월, 커밋 메시지 원문) — 한도 임박 이력(10-03 $30.51/$31)이 있어 costwatch 추이 감시 (d)10-03 예고된 "launchd 3종 세트(heartbeat·jobTeams·SCHEDULE)"는 이번 변경에 jobTeams만 있고 신규 launchd 잡 추가는 없음 — 해당없음.

> **🔴★★★2026-10-03 16:3x 재확인(오후 사이클) — Vercel 자동 크론 전면 일시정지 반영**: `git log --since=2026-10-02` 8건 중 스케줄 인프라 변경 **3건**: ①`175c9cbc`(10:36) cron-grow 13→4회/일(임시) ②`aa87449b`(10:50) 유형전체 ISR 무효화 묶음창 120초→6시간 ③**`bb104076`(15:29, CEO 지시) `web/vercel.json` 크론 −80줄 = Vercel 자동 크론 전면 정지, `cron-costwatch`만 유지**(사유: 지출관리 온디맨드 $30.51/$31 한도 임박). **따라서 이 문서 §4 Vercel cron 표는 현재 cron-costwatch 1건 외 전부 '정지 중(임시)'** — 원복은 `git log` 직전 vercel.json. 부작용: DIGEST 크론헬스 정지의심 6(costwatch 32h·billing 32h·criteria-verify 19h·rulegap 24h·verify 20h = 정지 부작용, b2b 72h = 격일 스케줄). 정지 중 공백: **cron-verify(결정론 레드팀)·cron-criteria-verify(기준 검증)·cron-synth/resynth/embed/enrich(신규 합성)·cron-sentinel·cron-issues·cron-selfaudit 일부** — 로컬 launchd 잡(레드팀·룰갭·심층판정·자율진단 에이전트 등)은 계속 가동 중. **제안(결정은 CEO)**: ①한도 리셋 후 재개 시 우선순위 = verify·costwatch(안전망) → synth/embed(합성대기 0이라 급하지 않음) → grow ②정지 중 jobTeams EXPECT_MAX_H 오탐 방지(자율진단이 #1344류 개별 상신 중 — 일괄 '의도된 정지' 처리 필요) ③cron-verify 결정론 검사의 로컬 대체 여부 검토. 핵심 08:00·17:00 로컬 사이클은 무변경(`launchctl list`는 비대화형 승인차단으로 스킵·git+DIGEST 대조). 충돌·공백 신규: 위 크론 공백 1건(의도된 정지).

> **★★★2026-10-02 16:3x 재확인(오후 사이클)**: `git log --since=2026-10-01` = **0건**(인프라 변경 없음, 마지막 커밋 `6f83c21a` 09-30 06:51). 핵심 08:00·17:00 2사이클 무변경. DIGEST 크론헬스 57개 중 **search-quality-agent만 정지의심(47.8h, 정상주기 30h 초과)** — 09-30 16:15 이후 미실행, 10-02 16:1x 리포트로 재개 확인. 원인은 스케줄 결함이 아니라 *전일 2사이클 미실행*(원인 확인 필요, 추측: 크레딧 소진 연쇄) → decisions #1337(approved, 집행대기). **비서실장 10-01 사이클 미실행 발견**(JOURNAL-20261001 소급복원). `launchctl list`는 비대화형 승인차단으로 스킵(DIGEST·git 대조). 충돌·공백·비효율 신규 없음.

> **★★★2026-09-30 16:2x 재확인(오후 사이클)**: `git log --since="2026-09-29 14:00"` = 2건(`385b0c82` 전 사이클 반영분, `6f83c21a` 06:51 topup-permits 첫실행 크래시 수리 — 코드 수정, launchd/vercel.json/jobTeams 변경 0). 핵심 08:00·17:00 2사이클 무변경, DIGEST 크론헬스 57/57 정상. 비서실장(chief-secretary)은 §2대로 17시 1회(08:00 미실행=정상). 충돌·공백·비효율 신규 없음. `launchctl list` 직접조회는 비대화형 승인차단으로 스킵(git+DIGEST 대조).
> **★★★2026-09-29 16:2x 재확인(오후 사이클)**: `git log --since="2026-09-28 16:30"` 13건 중 스케줄 인프라 변경 **1건**: `385b0c82`(14:07, CEO 지시) `web/lib/jobTeams.ts`에 **deep-judge-agent 신선도 감시(EXPECT_MAX_H) 신규 등록** — 원인: `.ai-paused`(07-01 CEO 지시)로 81일(DIGEST 실측 1960h) 무실행이었는데 감시 대상 아니라 무경보 방치. 러너(`run-deep-judge-agent.sh`)가 정지 중에도 heartbeat ok=true를 갱신하도록 로컬 수정(git 미추적)해 오탐 없음 — 3종세트(러너 heartbeat·jobTeams·이 문서) 중 **이 문서 등재를 이번에 완결**. **★신규 상태 변화**: 메인 워킹트리에서 `.ai-paused` 삭제(git status `D .ai-paused`) = **AI 판정 정지 해제**, deep-judge-agent가 09-29 15:04 KST 재개 첫 사이클 실행(deep-judge-20260929.md, 크론헬스 ✅ 1h) — PRINCIPLES §2 "AI 판정 자동실행 금지" 항목은 *서버 자동실행 금지* 원칙이며 로컬 `claude -p` 판정 재개와 무충돌하나, **해제 일시·CEO 승인 여부는 git 이력에 없어 확인 필요**(WORK-ORDER 반영). `484aa87a`(10:43, CEO 지시)는 naverBudget 적체 발굴중단 임계 1,500→3,000(코드값, 스케줄 무변경). 핵심 08:00·17:00 2사이클 무변경, DIGEST 크론헬스 57/57 정상, 비서실장(chief-secretary)은 §2대로 17시 1회(08:00 미실행=정상). 충돌·공백·비효율 신규 없음.
> **★★2026-09-22 16:2x 재확인(오후 사이클)**: `git log --since="2026-09-20 16:29" -- web/lib/jobTeams.ts web/vercel.json` **0건** — 케이던스 인프라 파일 무변경, 핵심 08:00·17:00 2사이클 무변경. `~/Library/LaunchAgents/com.coffee.*.plist` 신규·삭제 0(9-21 이후 mtime 변화 없음). `agent_runs` 오늘(09-22) 실패 0건, `coordination` 미해결 0건(DIGEST 07:05 스냅샷의 "3건"은 낮 동안 전부 resolved — 정상 소화, 재조사 불요). **chief-secretary-agent가 오늘 08:00 사이클에 미실행**(마지막 성공 09-21 07:32 UTC, 이번이 09-22 07:2x UTC 첫 실행)은 케이던스 드리프트가 아니라 [[schedule-baseline]]에 이미 기록된 **CEO 승인(07-12) 설계값** — `run-daily.sh` 48행 주석 확인: "종합+비서실장=저녁(17시) 1회만(토큰/Max헤드룸 확보)", 08시엔 실행 대상에서 애초에 제외. 오탐 아님. **★신규 발견(비케이던스, 심각)**: `agents/CEO-ORDERS.md`가 09-20 16:38 이후 갱신이 전혀 없었음 — 09-21 16:2x·09-22 08:00 두 사이클 연속 대조 누락, 그 사이 CEO 직접 세션 커밋 **45건**(카페상세 재설계·서체 3회 급선회·공공원장 본실행 전환·파이프라인 당일완결화·PWA 앱이름·랜딩히어로 렌더 반복·랜딩노트 마감·원장 재수집)이 미등재 상태로 방치돼 있었음 — 이번 세션이 CEO-85~87로 소급 복원 완료(CEO-ORDERS.md 참조). 09-09(§55)에 이미 한 번 동일 유형(SCHEDULE 점검에만 집중, CEO-ORDERS 대조 누락)이 발견·재발방지 명시됐으나 2주 만에 재발 — PRINCIPLES.md에 "매 사이클 SCHEDULE·CEO-ORDERS 대조는 분리된 필수 체크리스트 항목"으로 재강조. 충돌·공백·비효율: launchd/vercel 케이던스 자체는 0건, 비효율은 CEO-ORDERS 갱신누락 1건(정정 완료).
> **🔴★2026-09-26 09:0x 사고·수리(은퇴 잡 부활 — 쿼터 16% 유출)**: CEO 승인으로 09-21 은퇴시킨 `com.coffee.discover-sweep`이 **되살아나 09-26 07:05 실행**돼 네이버 쿼터 **3,890콜(하루의 15.6%)**을 먹고 신규 151곳만 적재했다(25.8콜/곳 — 원장 적재 2.27콜/곳의 **11배 비효율**). 원인은 09-21 정지를 `launchctl unload`**만** 하고 plist 파일을 `.plist`로 남긴 것 — unload는 재로그인/재부팅이면 풀린다(로그 공백으로 보아 09-25 중 재로그인에 복귀, 09-25 20:05 회차는 쿼터가 이미 소진돼 무해했고 09-26 07:05가 첫 실제 피해). 은퇴 잡 7종 중 **이 잡만 `.plist.disabled` 규약을 벗어나 있었다**(chat-watch·youtube-backfill·recollect-purged·dong-backfill·qualityaudit는 전부 준수). **수리**: `launchctl unload` + `com.coffee.discover-sweep.plist.disabled`로 개명(영구). **재발방지**: `morning-sweep-report`에 **④-b 은퇴 잡 부활 감시** 신설 — launchd가 아니라 `agent_runs` 실행흔적으로 판정하므로 unload 우회·수동실행도 잡는다. **동시 발견(같은 사고의 다른 얼굴)**: `import-permits`가 자기 예산을 전역 사용량 증가분으로 재고 있어 스윕이 먹은 콜까지 자기 지출로 계산, 예산 8,100 중 자기 콜 4,212에서 조기중단 — 당일 적재가 계획의 52%(1,855곳)에 그쳤다. `lib/naverBudget.ts`에 프로세스별 카운터(`naverCallsThisProcess`) 신설해 `import-permits`·`recollect-purged`·`grow-all` 3종 전부 자기 콜 기준으로 교정(전역 절대값은 '하루 천장' 백스톱에만 사용).

> **★2026-09-22 11:4x 변경(CEO 지시 "쿼터 제대로 써")**: `agents/run-import-permits.sh` 기본 `--limit` 2700→**3400**(예산 캡 4,800콜=25,000−폐업1,200−수집19,000이 먼저 걸림, 1.42콜/곳 기준 ≈3,380곳). 원장 파일에 대구·경북·광주·전남·전북·울산·제주가 없던 것 발견 → `fetch-permits.mjs --only=…`로 `.extra.ndjson` 별도 수집(체인 스크립트, 1회성) 후 import가 `.extra`도 읽음. plist 무변경.
> **★★2026-09-21 16:3x 재확인(오후 사이클, 소급 복원)**: `git log --since="2026-09-20 16:30" -- web/lib/jobTeams.ts web/vercel.json` **0건** — 케이던스 인프라 파일 무변경, 핵심 08:00·17:00 2사이클 무변경. `com.coffee.import-permits`는 오늘 07:34~07:36 CEO 직접커밋(`27c5e12f`·`ad154eaf`)으로 **본실행 전환**됐으나(수집예약 7,200→19,000·discover-sweep 은퇴) 이는 09-20에 이미 3종세트 미완결로 지적된 잡의 실가동일 뿐 launchd/plist 신규 변경은 아님 — heartbeat·jobTeams.ts 미등록 상태는 그대로 유지 중(WORK-ORDER 이월 확인 필요). **신규 발견**: `cron-sentinel`이 09-20 20:05 KST 이후 20h+ 디스패치 자체가 없음(agent_runs에 실패기록도 0건 — 코드 타임아웃이 아니라 Vercel 크론 디스패치 레이어 자체가 안 돈 것으로 의심, 협업#436). 이는 스케줄표상 "등록은 돼 있는데 실제 실행이 플랫폼 레벨에서 스킵"되는 새 유형 — SCHEDULE 표의 launchd/vercel.json 등록 여부 점검만으로는 못 잡는 사각지대. 충돌·공백 신규 없음(cron-sentinel은 등록 정상, 집행 문제).
> **★★2026-09-20 16:3x 재확인(오후 사이클)**: `git log --since="2026-09-19 16:40" -- web/lib/jobTeams.ts web/vercel.json` **0건** — 케이던스 인프라 파일 자체는 무변경, 핵심 08:00·17:00 2사이클 무변경. 단 `~/Library/LaunchAgents/` 전수 mtime 대조 결과 **`com.coffee.import-permits.plist`가 09-20 15:23 신규 등록**돼 있었음(대응 코드 `1d1119df`는 11:04 커밋, plist 등록은 그보다 늦은 15:23 — 사람이 나중에 launchctl load) — jobTeams.ts·이 표 어디에도 없어 §1 표에 신규 행 추가(위 참조), **규칙6 3종세트 중 heartbeat·jobTeams.ts 2종 미완결 확인**(WORK-ORDER 최우선). 오늘 CEO 세션 직접커밋 11건(07:20~16:29, CEO-84 신규 등재 — 발굴:수집 쿼터 재설계 2.3:1·인허가 카페 직접적재·AI판정 배치 파이프라인 사고 3연발(중복제출·고아배치)+당일 근본수정·관제탑 오탐 임계 2건 시정)은 코드/쿼터 배분 변경일 뿐 launchd 트리거 자체 변경은 아님(CEO-ORDERS.md 참조). `web/scripts/refresh-display-quotes.mjs`·`collect-catchup.sh` 워킹트리 dirty 2건(09-19 16:4x CEO확인요청)은 오늘 11:xx `33d7e71f`로 기조실장 L2 전결 커밋 반영·dev-deploy 정체(협업#430, 28h+) 해소 확인. 충돌·공백 신규 없음, 비효율은 위 import-permits 3종세트 미완결 1건.
> **★★2026-09-19 16:4x 정정(같은 오후 사이클, 비서실장 재검증)**: 바로 아래 16:3x 항목과 WORK-ORDER.md 16:20판이 "coordination#430의 반영미확인 플래그는 stale 추정, #1132·#1133·#1135 배포 정상"이라 결론냈으나 **git ancestry로 직접 재검증한 결과 이 결론은 틀렸다**. `git merge-base --is-ancestor 285577ca 097cdc1b` → YES — #1132 배포커밋(`097cdc1b`, 08:05)은 07:31 커밋(`285577ca`)의 SQL주석 백틱 버그를 그대로 포함한 채 푸시됐고, 이 버그는 14:33(`69f26ff6`) CEO 직접수정 전까지 `tsc` 빌드 자체를 깨뜨리고 있었다(CEO 커밋 메시지 원문: "오늘 푸시한 커밋 3건이 하나도 배포되지 않았다"). 즉 **07:31~14:33(약 7시간) 동안 #1132·#1133·#1135 포함 모든 푸시가 프로덕션에 반영되지 못했다** — 반영미확인 플래그는 stale이 아니라 실제 빌드파손을 정확히 감지한 것이었다(라이브 200 OK는 전날 배포가 살아있었을 뿐, [[deploy-browser-verify-mandatory]] 계열: SSR200≠최신반영). 09-19 16:35 이후 시점이면 69f26ff6로 빌드 복구·재배포됐을 것이나, **운영본부는 "플래그 로직만 점검"이 아니라 Vercel 배포 로그로 현재 라이브 커밋이 69f26ff6 이상인지 직접 확인**해야 한다(git merge≠배포확인, 상세는 PRINCIPLES.md 09-19 신규 항목·JOURNAL-20260919.md). WORK-ORDER.md 이 정정 반영해 갱신함.

> **★2026-09-19 16:3x 재확인(오후 사이클)**: `git log --since="2026-09-18 16:31" -- web/lib/jobTeams.ts web/vercel.json` **1건**: `47b90490`(어제 20:06 작성, 오늘 08:05 `097cdc1b`로 main 배포·#1132 CEO 승인건) — `RETIRED_JOBS`에 `recollect-purged`·`cron-batch-judge` 2종 추가(WORK-ORDER가 09-17부터 2사이클+ 최우선 이월하던 항목, 코드 1줄 반영 확인). §1 표 신규 행 불요(잡 자체 신설·폐지 아님, 은퇴세트 갱신). 단 DIGEST(07:05)는 여전히 `recollect-purged` "정지의심 56.1h"를 표출 중 — 원인은 **다른 경로**: cron-selfaudit(관제 자율진단) 자체가 RETIRED_JOBS를 참조하지 않아 별도로 오경보를 내는 구조(#1144, CEO 승인·dev-pipeline 배포대기 3h)이며 jobTeams.ts 수정(#1132)과는 별개 코드 경로 — 혼동 주의. `~/Library/LaunchAgents/com.coffee.*.plist` 15개 mtime 전건 09-17 이전(오늘 신규·삭제 0). `launchctl list` 직접조회는 이번 세션도 비대화형 승인차단으로 스킵(plist mtime+git 대조로 대체, 기존 관행 동일). 핵심 08:00·17:00 2사이클 편성 자체 무변경. **WORK-ORDER.md는 기조실장이 16:20 직접조사로 이미 최신 발행**(dirty 워킹트리 2건이 승인된 #1134 배포를 막고 있는 CEO 확인요청 1건 포함) — 비서실장 재대조 결과 수치 정합, 추가 수정 불요. 충돌·공백·비효율 신규 없음.
> **★2026-09-18 16:2x 재확인(오후 사이클)**: `git log --since="2026-09-17 16:38" -- web/lib/jobTeams.ts web/vercel.json` **1건**: `5624a0e0`(19:50, CEO 직접커밋) — 신규 로컬 잡 `com.coffee.morning-sweep-report`(매일 08:20, 아침 스윕 자기보고 강제) 등록. 러너·plist·jobTeams(성장본부·EXPECT_MAX_H=30)는 커밋 시점 3종세트 완료였으나 **이 문서(SCHEDULE.md) 등재만 누락**돼 있었음 — 이번 세션이 §1 표(discover-sweep 다음 행)에 신규 행 추가로 규칙6 위반 상태 21h만에 정정. **WORK-ORDER #1(jobTeams.ts RETIRED_JOBS 미등재 2건, cron-batch-judge·recollect-purged) 미이행 확인 — 09-17 16:38 지시 이후 24h 경과, `git log`·`grep RETIRED_JOBS`로 직접 재대조한 결과 코드 무변경**. 예측대로 recollect-purged가 09-18 13:00경 EXPECT_MAX_H(30h) 초과해 self-audit가 "정지의심" 거짓경보를 실제로 발행(decisions#1131, 07:05 UTC) — 같은 사이클에 자율진단이 근본원인(jobTeams.ts 미수정)까지 자체진단해 수정 dev_task(decisions#1132)를 별도 상신함(WORK-ORDER 최우선 유지, 2사이클 연속 이월 — 코드 1줄 미착수 장기화 주의). 핵심 08:00·17:00 2사이클 편성 자체 무변경. `launchctl list`는 이번 세션도 비대화형 승인차단으로 스킵(git+plist mtime 대조로 대체, 기존 관행 동일).

> **★2026-09-17 16:3x 재확인(오후 사이클)**: `git log --since="2026-09-16 16:33" -- web/lib/jobTeams.ts web/vercel.json` **1건**: `24a60fbe`(13:22, CEO 승인) — 09-16 신설한 `recollect-purged`(파기재수집 레인)를 **완전 폐지**(예약 2,300→0콜, plist `.disabled` 07:01). 전제("검증 등급 raw 소실이 재검을 막는다")가 "raw 소실은 유입과 무관(표시 인용문은 synth_reviews 별도보관)"으로 뒤집혔고, 기회비용 실측(월 방문자의 7%를 스스로 깎는 중)이 확정타 — 09-17 09:13(`63e20878`)에 우선순위를 "사람이 실제로 연 카페"로 좁혔다가 4h 만에 아예 폐지. 스크립트/레인 코드는 보존(수동 재가동용), §1 표에 이 잡이 별도 행으로 등재된 적은 없었음(신설 당시 헤더 각주로만 기록). **★신규 결함 발견(6번째 변종, [[expectmaxh-schedule-drift-recurring]] 계열)**: `web/lib/jobTeams.ts`가 위 폐지된 `recollect-purged`뿐 아니라 **09-15 21:55(`17607df8`, CEO 본인 "내 오류 정정" — route.ts:29가 명시 금지한 스케줄러 등록을 어기고 vercel.json에 넣었던 걸 당일 철회) 시점에 이미 폐지된 `cron-batch-judge`까지 EXPECT_MAX_H(20h/30h)·JOB_TEAM에 그대로 남아있음** — RETIRED_JOBS(104행) 미등재. 09-16 16:4x 사이클이 `git log --since="2026-09-15 16:20"`에서 "1건"만 찾았다고 보고했으나 실제로는 `17607df8`(09-15 21:55, 그 창 안에 포함되는 시각)도 같은 파일을 건드렸어야 하는데 놓쳤음(원인 불명, 이번 세션 직접 재대조로 발견) — §4 표 해당 행 정정 완료(위). 두 잡 다 다음 무실행 경과 시(batch-judge는 이미 20h 초과 상태 지속 중일 가능성, recollect-purged는 30h 후인 09-18 13:00경) cron-selfaudit가 "정지의심" **오탐**을 발행할 것 — WORK-ORDER 최우선 반영(jobTeams.ts RETIRED_JOBS에 두 잡 추가 필요, 코드 1줄). 핵심 08:00·17:00 2사이클 자체 무변경. `launchctl list`는 이번 세션도 비대화형 승인차단으로 스킵(기존 관행 동일, git 대조로 대체).
> **★2026-09-16 16:4x 재확인(오후 사이클)**: `git log --since="2026-09-15 16:20" -- web/lib/jobTeams.ts web/vercel.json` **1건**: `40a66f87`(10:02, CEO 승인 "결재 B안") — **신규 로컬 잡 `com.coffee.recollect-purged`** 등록(매일 08:30 KST, 90일 파기된 raw_reviews 재수집 — 파기만 있고 짝인 warmup이 존재하지 않던 구조적 공백 해소). 3종세트 실측 확인: 러너(`agents/run-recollect-purged.sh`)+plist(`~/Library/LaunchAgents/com.coffee.recollect-purged.plist`, mtime 09-16 10:02, 매일 08:30)+`jobTeams.ts`(JOB_TEAM=운영본부·EXPECT_MAX_H=30 등재) 전건 완료 — 규칙6 위반 없음. 오늘 첫 스케줄 창(08:30)은 등록(10:02) 이전이라 스킵, 내일 08:30이 첫 실행. `launchctl list` 직접조회는 이번 세션도 비대화형 승인차단으로 스킵(기존 관행과 동일, plist mtime+jobTeams.ts/vercel.json git 대조로 대체). 같은 커밋의 후속 `4b0d1b84`(CEO, 예약 1,500→2,300콜 상향)는 예산 파라미터 조정일 뿐 케이던스·잡 등록 변경 없음. **08:00 사이클 소급 확인**: `1c3272f1`(08:03) `cron-resynth` Vercel cron이 20시 군집 타임아웃 회피 목적으로 `11 UTC`→`13 UTC`(20:00→22:00 KST)로 변경됐고 §4 표(107·136행)에 이미 반영 확인(당일 오전 중 정정 완료, 이번 세션 재확인만). 핵심 08:00·17:00 2사이클 편성 자체 무변경. 충돌·공백·비효율 신규 없음.
> **★2026-09-15 16:2x 재확인(오후 사이클)**: `git log --since="2026-09-14 17:00" -- web/lib/jobTeams.ts web/vercel.json` **1건**: `c1199ba8`(11:29, CEO 직접 "관제탑 상주 에러 수리") — **Vercel cron 신설 `cron-batch-judge`**(`45 2,14 * * *` UTC = 매일 11:45·23:45 KST, AI판정 후보 149곳 적체 해소 목적)를 vercel.json에 등록 + `jobTeams.ts` EXPECT_MAX_H=20 등록. §4 표에 **신규 행 추가**(아래). 같은 커밋이 `issues.ts`도 수정: cron-costwatch의 이상감지 자체보고(`ok=false`)를 "크론 실패"로 오인식하던 버그를 "비용 이상"(별도 유형)으로 분리하고, **비공개 표출이 없던 `cost_guard` 파이프라인 정지(30일 중 14일·누적 119회 스킵)를 "파이프라인 정지" HIGH·consumer:true로 신규 표출** — 스케줄 cadence 자체 변경은 아니나 워치독 로직 변경이라 PRINCIPLES.md 참고. **★신규 발견(다음 사이클 확인 필요)**: `cron-batch-judge`는 11:29 배포 이후 첫 스케줄 창(11:45 KST)이 이미 지났음에도(현재 16:2x) `agent_runs`에 **실행 기록 0건** — Vercel cron이 신규 등록 후 첫 프로덕션 배포 전파 지연으로 11:45창을 놓친 것으로 추정, 다음 창(23:45 KST) 정상 발화 여부 재확인 필요(WORK-ORDER 반영). `~/Library/LaunchAgents/com.coffee.*.plist` 신규·변경 0건 — launchd 쪽 드리프트 없음. 핵심 08:00·17:00 2사이클 자체 무변경. **참고**: 오전 중 `.tmp_selfaudit_*.mjs` 3개가 메인 루트에 커밋(`c47daa0d`)됐다가 로컬 삭제만 되고 삭제 자체가 미커밋 상태로 남아 dev-deploy가 "사람 작업 보호"로 승인된 dev_task 10건(#1073~#1088)의 병합을 24h+ 보류시킨 사고가 있었음 — 16:21(`01b7d25c`) 삭제 커밋으로 해소, 스케줄 인프라 파일과는 무관(WORK-ORDER·JOURNAL 상세). 충돌·공백 신규 없음, 비효율은 위 batch-judge 미발화 건 1개.
> **★2026-09-14 17:0x 재확인(오후 사이클)**: `git log --since="2026-09-13 17:00" -- web/lib/jobTeams.ts web/vercel.json` **1건**: `e6d8b379`(08:42) 신규 로컬 잡 `com.coffee.neon-billing`(매일 07:50 KST, Neon 실청구 스냅샷 — NEON_API_KEY가 Vercel엔 없어 로컬이 대신 하루 1회 적재) 등록. plist(`~/Library/LaunchAgents/com.coffee.neon-billing.plist`, mtime 08:41)+러너(`agents/run-neon-billing.sh`)+`jobTeams.ts`(팀·EXPECT_MAX_H=30·라벨)까지는 완료됐으나 **이 문서(SCHEDULE.md)만 미등재 상태였음 — 이번 세션이 §neon-billing 절 신설로 3종세트 완결**(규칙6 위반 상태 24h만에 정정). 핵심 08:00·17:00 2사이클 자체 무변경. 크론헬스는 DIGEST 기준 53개 중 dev-agent 1건만 실패(#1084 claude-p 무응답/에러, 스케줄 드리프트 아닌 개별 실행오류 — WORK-ORDER 참조). **★CEO 직접커밋 초대량**: `git log --since="2026-09-13 17:14"` 대조 결과 09-13 17:14~22:18(오너퍼널·인허가 매칭·사진기능 6건) + 09-14 06:49~16:35(검색 서브시스템 재설계·시설/취향 페이지·손님사진 제보·회사본사 검색·비용지표 등 30건+) 전건이 CEO-ORDERS.md 미등재 상태였음 — 이번 세션이 CEO-77(09-13 야간)·CEO-78(09-14 종일) 2건으로 신규 등재 완료(CEO-ORDERS.md 참조). 충돌·공백·비효율 신규 없음.
> **★2026-09-13 17:0x 재확인(오후 사이클)**: `git log --since="2026-09-12 16:55" -- web/lib/jobTeams.ts web/vercel.json` **2건 드리프트 발견·정정**: ①`b9fa288e`(13:26) `indexnow` 잡 3종세트 완료 등록(이미 706행에 기록됨, 무변경) ②`391a8ed0`(11:18) `cron-grow` Vercel cron이 `10 3,7,11,23 * * *`(4회/일)→`10 0-11,23 * * *`(13회/일, KST 09:10~20:10 매시+08:10)로 변경됐으나 **§4 표(121행)가 갱신 안 된 채 방치돼 있었음 — 이번 세션이 직접 정정**. 근거: 네이버 쿼터 6.7%만 소진(CEO 커밋 사유), `jobTeams.ts` EXPECT_MAX_H(`cron-grow`=14h)는 새 케이던스에도 여유 있어 오탐 없음. `~/Library/LaunchAgents/com.coffee.*.plist` 중 `indexnow.plist`(09-13 신규, 3종세트 확인)·`neon-hourly.plist`(mtime만 갱신, 내용 무변경) 외 드리프트 0. 핵심 사이클(08:00·17:00) 자체는 무변경. **CEO 직접커밋 21건**(00:12~14:21, 노트/랜딩 디자인 전면개편+검색 전수스캔 3종 제거+cron-grow 증회+품질 결재 5건 반영 배포)은 CEO-76으로 CEO-ORDERS.md 신규 등재, 파괴적 변경(git add -A류) 재발 0건 확인(`git log --shortstat` 21건 전수 대조). **★중대 발견(스케줄 아님, WORK-ORDER 최우선 반영)**: coordination#398(web/ 루트 스크래치)이 오늘 07:28 "실물 확인 후 삭제 완료(잔여 0)"로 resolved 처리됐으나, 이번 세션이 `find web -maxdepth 1` 광역 패턴으로 직접 재검증한 결과 **여전히 102개+ 잔존**(560KB, 전부 09-09 이전 mtime — 최근 신규 생성은 없음, 즉 유입은 멈췄으나 정리 자체가 실행 안 됨). [[selfaudit-realworld-verify-gap]] 메모가 지적한 정확히 그 문제(좁은 glob으로 오판)가 종결 처리 이후에도 실제로는 안 고쳐진 것 — WORK-ORDER 참조.
> **★2026-09-12 16:5x 재확인(오후 사이클)**: `git log --since="2026-09-12 00:00:00 +0900" -- web/lib/jobTeams.ts web/vercel.json` 0건 — §1·§4 표 대비 드리프트 0. `~/Library/LaunchAgents/com.coffee.*.plist` 13개 mtime 전건 09-09 07:28(neon-hourly) 이전(오늘 신규·삭제 0, `launchctl list`는 이번 세션도 비대화형 승인차단으로 스킵 — plist mtime 대조로 대체, 기존 관행 동일). 핵심 사이클(08:00·17:00) 무변경. **CEO 직접커밋 10건**(10:58~15:44, 검색 서브시스템 전면수리 — 대구·경북 서비스범위·전국철도·장소인덱스·지역판정위계·미서비스캐시·회귀3종·구리한일아파트)은 CEO-75로 CEO-ORDERS.md 신규 등재 — 코드배포일 뿐 스케줄 인프라 파일(jobTeams.ts·vercel.json) 무변경 확인. 이 중 `a25a8637`은 `git add -A`로 무관 실험파일이 섞여 커밋됐다가(app/page.tsx 3,266줄 삭제) three 미설치로 Vercel 빌드가 자체 실패해 운영 미반영, CEO 본인이 31분 내 발견·`b72af47b`로 되돌림 — 스케줄 드리프트 아니나 PRINCIPLES.md에 재발방지 원칙 반영. WORK-ORDER(16:31 기조실장 직접갱신)의 백로그 스냅샷(L3 pending 3건 #1056-1058·approved 1건 #1055·협업 open 3건 #397-399)을 DB 직접쿼리로 재검증 완료 — 수치 불일치 0(단, `decisions.status` 값이 'proposed'가 아니라 'pending'임을 확인 — 향후 쿼리 시 참고). `git status` 재확인 결과 web/ 루트 스크래치 55개(`tmp_*.js`·`_dg_*.cjs`) 그대로 잔존(coordination#398 미집행 지속) + 메인 워킹트리 미커밋 카페상세 리디자인 실험파일(`HandwrittenNote.tsx` 등)도 그대로(#1055 배포 시 stash 필요 경고 유효). 충돌·공백·비효율 신규 없음.
> **★2026-09-11 16:3x 재확인(오후 사이클)**: `git log --since="2026-09-10 16:40" -- web/lib/jobTeams.ts web/vercel.json` 0건 — §1·§4 표 대비 드리프트 0. `~/Library/LaunchAgents/com.coffee.*.plist` 13개 mtime 전건 09-09 07:28(neon-hourly) 이전(오늘 신규·삭제 0). `launchctl list`는 이번 세션도 비대화형 승인차단으로 스킵 — plist mtime+git 대조로 대체(기존 관행 동일). 핵심 사이클(08:00·17:00) 무변경. 크론헬스 이상은 `cron-verify`(20.1h, 정상주기 16h 초과) 1건뿐 — 근본원인(60초 함수 타임아웃)은 이미 규명돼 #1052(품질본부 상신, 03:14 승인)로 배포대기 중, 신규 이슈 아님. `issue#6404`(auth-precheck HIGH, 08-30부터 11일 지속 표시)는 기조실장이 오늘 07:12~07:21 1회성 OAuth 만료로 확진·자가치유 확인 후 종결 처리(WORK-ORDER 참조). **★신규 발견(스케줄 아님, CEO-ORDERS 소급등재 사안)**: 오늘 CEO 직접커밋 3건이 미등재 상태였음 — `1f8ebcab`(지도 물·산 고도화, Blender MCP 렌더+MapLibre color-relief)·`a41a995d`(지도·핀 정적 자산 1년 캐시)·`7bfce8d6`(공지 부활 방지 버그수정), CEO-74로 CEO-ORDERS.md에 소급 등재 완료(§55 09-09 교훈대로 SCHEDULE·CEO-ORDERS 동일 git log에서 양쪽 반영). **스크래치 파일 정리(#1036/#1041) 2일째 정체 재확인**: `git status` 실측 결과 `_dg_*.cjs`·`tmp_*.js` 등 web/ 루트 미추적 스크래치 파일 **55개 그대로 잔존**(09-10 16:5x 확인분과 동일 개수) — 기조실장 세션의 Bash 삭제 권한이 오늘도 구조적으로 차단돼 있어([[rm-permission-blocked-this-session-type]]) 비서실장도 대리 삭제 불가, WORK-ORDER에 경영지원본부 직접 실행 지시 유지. 충돌·공백·비효율 신규 없음.
> **★2026-09-10 16:4x 재확인(오후 사이클)**: `git log --since="2026-09-09 17:00" -- web/lib/jobTeams.ts web/vercel.json` 0건 — §1·§4 표 대비 드리프트 0. `~/Library/LaunchAgents/com.coffee.*.plist` mtime 전건 대조 결과 09-09 07:28(neon-hourly)·09-08 21:51(permit-resume) 이후 신규 plist 0건(둘 다 전일 세션에서 이미 문서화 완료분, 자기완결형 계측/배치 잡이라 jobTeams.ts 미등재는 의도됨). `launchctl list`는 이번 세션도 비대화형 승인차단으로 스킵 — plist mtime+git 대조 이중 확인으로 대체(기존 관행 동일). 핵심 사이클(08:00·17:00) 자체 무변경. **실질 이슈는 케이던스가 아니라 인증 SPOF 지속**: auth-precheck(5.4h전 실패)·integrity-agent(7.5h전, 인증만료로 미실행) 재발 — [[local-claude-cli-oauth-session-expiry]] 계열, 물리 재로그인 외 해법 없음(기존 결론과 동일, 재조사 불요). `cron-costwatch`도 오늘 데이터전송 이상 자체감지(96.9GB/임계68.0GB) — 기획조정실장이 16:33 WORK-ORDER에서 원인을 web/ 루트 미커밋 스크래치쿼리 55개(AGENTS.md 규율 위반)로 특정, #1036/#1041 배치 지시 완료. 충돌·공백·비효율 신규 없음. 오늘 CEO 직접커밋 5건(폐업매칭 파이프라인 고도화+봇필터+DB각성절감, CEO-73 신규 등재)은 코드배포일 뿐 스케줄 인프라 무변경.
> **★2026-09-04 22:xx 재확인(오후 사이클)**: `git log --since="2026-09-03 16:49" -- web/lib/jobTeams.ts web/vercel.json` 0건, `~/Library/LaunchAgents/com.coffee.*.plist` 09-03 16:49 이후 신규/변경 0건(find -newermt 결과 없음) — §1 표 대비 드리프트 0. `launchctl list` 프로세스 조회는 이번 세션 비대화형 승인불가로 스킵, plist mtime+jobTeams.ts/vercel.json git대조 이중 확인으로 대체(기존 관행 동일). **핵심 사이클(08:00·17:00) 자체는 무변경**하나, 오늘 관측된 실질 문제는 케이던스가 아니라 **인증(SPOF) 안정성**: `agent_runs` 24h 실측 결과 auth-precheck·chief-secretary-agent·closure-agent·demand-grow-agent·dev-agent·strategy-agent 6개 크론이 OAuth 세션만료로 09-03 23:0x~09-04 11:33 사이 매 사이클(07시·11시대)마다 실패 반복 — **08-30부터 5일 연속 재발**(08-30·09-01·09-02·09-03·09-04). coordination#367(리스크매니지먼트팀 격상)은 기획조정실이 조사 완결(#961~968 done 종결)했으나 물리적 재로그인 외 해법이 없다는 결론 자체가 반복 확인일 뿐 — **구조적 재발방지(세션 자동갱신 또는 조기경보)는 아직 코드화되지 않음**, 스케줄 표 변경이 아니라 harness 과제로 WORK-ORDER에 지속 반영. `cron-costwatch`는 오늘도 데이터전송 이상(53.6GB/임계35.8GB) 자체감지·정상 작동(장애 아님, 비용가드 발동 관찰 중). 충돌·공백·비효율 신규 없음.
> **★2026-08-28 16:41 재확인**: `launchctl list | grep coffee` 직접조회 성공(10개 잡: chief-manager·weekly-evaluation·self-audit·audit-watch·dev-pipeline·dev-deploy·discover-sweep·collect-catchup·trigger-listener·no-sleep) — §1 표 대비 추가·제거·트리거 변경 0건, 08-26 16:39 대조 이후 무변경 유지. `web/lib/jobTeams.ts`·`web/vercel.json` 오늘 무변경(git log 대조, 코드변경은 dev worktree 브랜치 `b7fb686` #854 1건뿐 — 스케줄 인프라 파일 아님). DIGEST 크론헬스 50/50, `agent_runs` 오늘 전건 실패 0. 충돌·공백·비효율 신규 발견 없음.

> **★2026-08-26 16:39 재확인**: `launchctl list | grep coffee`(10개 잡, 신규 `com.coffee.collect-catchup` 08-25 16:56 도입분 로드 확인) 대조 — §1 표 대비 collect-catchup 1건 신규 추가(3종세트 완료: 러너+jobTeams.ts 08-25 16:56 커밋+이 문서 §collect-catchup). **드리프트 발견·정정 1건**: collect-catchup 창 길이가 `3952dcc`(08-25 20:22)로 90→120분 변경됐으나 이 문서는 20h+ 90분 그대로 방치 — 이번 세션이 §collect-catchup 절 직접 정정. CEO가 08-25 16:38~08-26 13:08 사이 **16시간에 걸쳐 45건 직접 커밋**(강원확장 후속 수집인프라 전면재설계+방문객배지 확산+강원안내모달+IndexNow 신설, CEO-57~59 신규 등재)했고 그 과정에서 자체 사고 3건(429오인·중복실행8배·무한재수집)을 스스로 발견·당일수정 — 상세는 CEO-ORDERS.md·JOURNAL-20260826.md 참조. `web/vercel.json` 무변경(Vercel cron 자체는 불변, 로컬 수집 워커만 재설계). DIGEST 크론헬스 50/50(collect-catchup 신규 포함) 정상.
> **2026-08-25 16:33 재확인**: §42 참조 — `launchctl list` 직접조회 성공(9개 잡, §1 표와 일치), plist/jobTeams.ts/vercel.json 전건 무변경, DIGEST 크론헬스 49/49. 드리프트 0(★단, CEO 직접커밋 10건 소급발견은 스케줄이 아닌 CEO-ORDERS 사안 — §42·WORK-ORDER 참조).

> **2026-08-20 16:4x 재확인**: `web/lib/jobTeams.ts`(mtime 08-15 08:06)·`web/vercel.json`(mtime 08-08)·`~/Library/LaunchAgents/com.coffee.*.plist`(9개, 최신 mtime 08-04 10:28) 전건 08-19 16:30 이후 무변경 — §1 표 대비 추가·제거·트리거 변경 0건. `git log --since="2026-08-19 16:30"` 전 커밋(dev_task #760·765·766·777·780·782 배포+dev-archive) 대조 결과 스케줄 인프라 파일 변경 0건 — §4 Vercel cron 표 그대로 유효. `agent_runs` 최근 10h 49개 크론 전건 1회+ 실행, 24h 실패 0건 실측(DIGEST 크론헬스 49/49 정상과 일치). `launchctl list` 직접조회는 이번 세션도 비대화형 승인불가로 스킵 — plist/jobTeams.ts/vercel.json mtime + agent_runs 실측 3중 대조로 대체(기존 관행과 동일 신뢰도). 오늘 기획조정실장 오후 사이클이 approved 9건 3주기 정체(#742)의 실제 근본원인(DB 정규화 트리거+dev-claim 인증조건 불일치)을 규명·해소했으나, 이는 결재 파이프라인 로직 버그이지 launchd/cron cadence 드리프트는 아니므로 §1·§2 표는 무변경. 충돌·공백·비효율 신규 발견 없음.
> **2026-08-28 심야 갱신(기획조정실장)**: §4 Vercel cron 표를 `web/vercel.json` 실제값으로 **전면 재생성**했다 — 표가 오래 방치돼 `cron-issues */10`(현행 `0 3,7,11,23`)처럼 실제와 크게 어긋나 있었다(문서가 사실이 아니면 감시의 기준선이 무너진다). 함께 **운영 크론 5종을 원주기로 복원**: 같은 날 낮 `3150562`(비용절감)로 issues 4→1·coord-consumer 4→1·selfaudit 3→1·orchestrator heal 2→1·sentinel 2→1로 줄였는데 **`jobTeams.ts` EXPECT_MAX_H를 함께 갱신하지 않아 정지 오탐 4건**(orchestrator-heal·sentinel 24h>18h, issues·coord-consumer 24h>14h)이 생겼다 — §2 각주가 경고하던 자율진단 #604와 **같은 실수의 재발**. 복원 후 전 크론 대조 결과 오탐 0건. 일 실행 39→49회(복원 전 수준). 비용 영향은 무시 가능(이미 깨어 있는 창에 올라타며, 실측상 DB가 실제 쿼리를 실행하는 시간은 전체의 4.8%뿐).

> **2026-08-18 16:39 재확인**: `launchctl list` 이번 세션은 비대화형 승인불가로 스킵 — 대체로 `web/lib/jobTeams.ts`(mtime 08-15 08:06, 무변경)·`web/vercel.json`(mtime 08-08, 무변경) + `git log --since="08-17 16:34"` 대조(두 파일 변경 커밋 0건)로 대체, §1 표와 드리프트 0 확인. DIGEST(07:05 KST) 크론헬스 49/49 정상. **★신규 성능 리스크 발견(스케줄 드리프트 아님, WORK-ORDER 반영)**: coordination#317(08-18 08:17 KST 상신)이 `/api/cron-sentinel` 수동호출 2회(100초·240초) 모두 Vercel 타임아웃으로 실패했다고 보고하며 원인을 "공개카페 수 증가"로 추정했으나, DB 재대조 결과 더 유력한 원인이 있다 — 어제(08-17) 17:38 KST CEO 직접커밋 `e31e6c2`가 센티널 스캐너 6종의 조회범위를 `synth_reviews`(상위6건)에서 `synth_reviews_all`(평균 46.9건, **7.8배**)로 확장했고, 이 커밋 이후 최초 정기실행(오늘 03:04 UTC=12:04 KST)은 성공했으나 그 직전 수동호출(23시대 UTC)은 타임아웃 — 시점상 확장 커밋과 정확히 맞물린다. EXPECT_MAX_H(18h) SLA는 아직 안 깨졌으나 함수 제한(60~300초)에 근접하는 추세이므로 다음 사이클 처리량·소요시간 재확인 필요. `launchctl list | grep coffee` 직접조회 성공(9개 잡: no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·audit-watch·trigger-listener·self-audit) — §1 표와 완전 일치(추가·제거 0건). `web/lib/jobTeams.ts`·`web/vercel.json` 오늘 변경 이력 0건. DIGEST(07:05 KST) 크론헬스 49/49 정상, 이후 agent_runs 재대조도 실패 0건. 오늘 dev_task 자율배포 7건(비용사고 자체발견수정 `140de41` 포함, JOURNAL 참조)은 코드배포일 뿐 스케줄 인프라 무변경. CEO 직접배포·CEO-ORDERS 신규 없음(CEO-50 이후 변동 없음). 충돌·공백·비효율 신규 발견 없음 — 단, **결재 처리 지연**(L2 #757·758, 07:30 상신→16:34 기준 9h+ pending)은 스케줄 드리프트가 아니라 WORK-ORDER 사안으로 별도 반영.
> **2026-08-16 16:44 재확인**: `launchctl list | grep coffee` 직접조회 성공(9개 잡: no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·audit-watch·trigger-listener·self-audit) — §1 표와 완전 일치(추가·제거 0건). `web/lib/jobTeams.ts`(mtime 08-15 08:06)·`web/vercel.json`(mtime 08-08)·`*.plist` 오늘 변경 이력 0건(`git log --since="08-16 00:00" --name-only` 대조). DIGEST 크론헬스 49/49 정상. 오늘 08:00·12:00 사이클 리포트 14종 정상 생성 확인. 오늘 CEO 직접배포 5건(CEO-48~50, 광고협찬 지문판별·하네스 관찰전용신호 오탐수정·리텐션 2건)은 코드 배포일 뿐 스케줄 인프라 무변경. 충돌·공백·비효율 신규 발견 없음.
> **2026-08-15 16:40 재확인**: 이번 세션은 `launchctl list | grep coffee` **직접조회 성공**(수일간 비대화형 승인불가로 스킵되던 것과 달리) — 9개 잡(audit-watch·dev-deploy·dev-pipeline·discover-sweep·self-audit·weekly-evaluation·trigger-listener·no-sleep·chief-manager) 전건 로드 상태 확인, §1 표와 완전 일치(추가·제거 0건). `web/vercel.json`·`web/lib/jobTeams.ts` 변경 없음(오늘 배포 다수는 dev_task 코드수정뿐, 스케줄 인프라 무변경). DIGEST(07:05Z=16:05 KST) 크론헬스 49/49 정상. 오늘 08:05~16:16 KST 3사이클(08·12·17) 전건 완주, EXPECT_MAX_H 위반 0건 — §38(11일공백) 근본수정 이후 안정 지속. 충돌·공백·비효율 신규 발견 없음.
> **2026-08-14 16:47 재확인**: `~/Library/LaunchAgents/com.coffee.*.plist` 08-13 17:15 이후 신규 변경 0건(find -newermt 결과 없음) — §1 표 대비 추가·제거·트리거 변경 0건. `web/vercel.json`도 08-08 이후 무변경. DIGEST(07:05)·EXECUTIVE(16:38) 이중 대조 결과 크론헬스 **49/49 정상**(agent_runs 실패 0건 실측) — §38 11일공백 근본수정(EVENING 게이트) 이후 이틀 연속 5개 리프에이전트(비서실장·종합브리핑·검색품질·마케팅·b2b영업) 정상 재발 없이 안정. `web/lib/jobTeams.ts`는 오늘 12:05(`8b251b5`, 결재#676 배포)로 변경됐으나 이는 **케이던스가 아니라 EXPECT_MAX_H 감시대상에서 youtube-backfill(08-12 은퇴) 제거** — 08-13 DIGEST가 지적한 "은퇴 후에도 매 사이클 허위 정지경보" 문제의 근본수정, §1·§4 표 자체는 무변경. **재발방지 감시망 사각(coordination#296·#300, decisions#693)은 아직 미배정 상태(L3 pending, 오늘로 D+1)** — 승인 전까지는 위 5개 리프에이전트가 EXPECT_MAX_H 미등재인 채로 남아있어, 만약 08-03류 재클러스터링이 또 발생하면 동일 침묵사고가 재발할 수 있음(WORK-ORDER 최우선 참조).
> **★2026-08-13 17:06 재확인 — 11일 공백(08-02→08-13) 발견·근본원인 확정, §38 참조**: `agent_runs` 실측 결과 `chief-secretary-agent`·`chief-manager-agent`·`search-quality-agent`·`marketing-agent`·`b2b-sales-agent` 5개 리프에이전트가 08-02 17:1x~17:3x 이후 **263h(11일)간 미실행**돼 있었음(품질가드 3종·자율진단·발굴·폐업 등 다른 잡은 무영향). 원인: `run-daily.sh`의 `HOUR="17"` 하드코딩 게이트가 08-03 13:48(`8da8c31`) 크론 4창(KST 08·12·16·20) 재클러스터링으로 저녁슬롯이 16:05로 이동하며 영구 거짓화. 08-12 20:41 근본수정(시각하드코딩→"그날의 마지막 사이클" 판정) 완료, 08-13 16:2x~16:5x 5개 잡 전부 정상 재개 실측 확인. **§1 표 정정**: youtube-backfill(08-12 CEO지시 정지, `.disabled`)·chat-watch(08-04 정지) 상태 갱신, **신규 `com.coffee.trigger-listener`(08-04 도입, 상주 ntfy 브릿지) 등재**(9일간 미문서화 상태였음). `~/Library/LaunchAgents/com.coffee.*.plist` 현재 9개(youtube-backfill·chat-watch 제외, trigger-listener 신규) 실측 대조. `launchctl list` 직접조회는 이번 세션도 비대화형 승인불가로 스킵 — plist mtime + jobTeams.ts(08-12 07:12 변경) + agent_runs 실측 3중 대조로 대체.
> **2026-08-02 17:26 재확인**: `~/Library/LaunchAgents/com.coffee.*.plist` 10개 mtime 전건 07-28 21:28 이전(오늘 변경 0건) 실측 대조 — §1 표 대비 추가·제거·트리거 변경 0건. `web/vercel.json`도 07-28(47ffe86 통잠창) 이후 무변경 — §4 Vercel cron 표 그대로 유효. `launchctl list` 이번 세션도 권한 미승인으로 스킵, plist/vercel.json mtime + DIGEST(48/48 정상, agent_runs 실패 0건) 3중 대조로 대체. **단, `web/lib/jobTeams.ts`는 오늘 09:23(`33be922`, decisions#580 dev_task) 변경됨** — 이는 실제 크론 실행주기(StartCalendarInterval/vercel cron) 변경이 아니라 **정지감시 임계값(EXPECT_MAX_H) 재계산**: 07-28 새벽 통잠창(KST 01~07시 크론 제외, `47ffe86`) 도입 이후 커진 자연 공백을 반영해 `cron-grow` 6→14h, `cron-resynth` 3→9h, `cron-embed`·`cron-synth`·`cron-issues`·`cron-coord-consumer` 각 2~4h→9h로 상향(오탐성 "정지의심" 결재 방지 목적). 실제 케이던스 자체는 무변경 — §1·§4 표 갱신 불요, §2 감시임계값 각주만 참고.
> **2026-07-25 17:32 재확인**: `~/Library/LaunchAgents/com.coffee.*.plist` 10개 mtime 전건 07-25 이전(오늘 변경 0건) 실측 대조 — §1 표 대비 추가·제거·트리거 변경 0건. `web/vercel.json` 마지막 변경 07-16(오늘 무변경) — §4 Vercel cron 표 그대로 유효. DIGEST 크론헬스 46/46 정상(agent_runs 실패 0). `launchctl list` 직접조회는 이번 세션도 권한 미승인으로 스킵 — plist mtime + vercel.json mtime + DIGEST 실측 3중 대조로 대체(07-18 선례와 동일 신뢰도, 드리프트 여부 판단에 충분). chief-secretary-agent 자체 실행은 어제 17:00 사이클 이후 오늘 08:00 사이클 미실행, 17:32에 첫 실행(JOURNAL-20260725.md 참조) — §2 "17시 1×" 케이던스로는 정상 범위, 08시 결측이 케이던스 위반은 아님(2026-07-12 CEO 결정대로 17시 1회가 기준).
> **2026-07-27 17:37 재확인**: `launchctl list` 이번 세션도 권한 미승인(비대화형)으로 스킵 — 대체로 `PlistBuddy -c Print`로 10개 plist의 `StartCalendarInterval`/`StartInterval`을 직접 실측: chief-manager(08:00·12:00·17:00, §1과 일치)·self-audit(11:30·15:30·21:30, 일치)·discover-sweep(02:30·14:30, 일치)·audit-watch(300초 간격)·dev-deploy(120초)·dev-pipeline(300초)·youtube-backfill(16:30)·weekly-evaluation(10:30) — §1·§2 표와 전건 일치, 드리프트 0. `git log --since="07-26 17:29"` 34커밋 중 `vercel.json`·`*.plist`·`web/lib/jobTeams.ts` 변경 0건 — §4 Vercel cron 46종 표 그대로 유효. DIGEST(08:01 생성) 46/46 정상, 이후 08:30 신규 결재(#523)는 크론 실패가 아니라 협업 발견 건(§35 참조).

> **이 파일이 곧 기준선(baseline)이다 — 스케줄 변경 시 이 파일 먼저 읽고 사장님(CEO) 확인 후 변경·갱신 필수.**
> **2026-07-06 17:38 재확인**: `launchctl list | grep coffee`(9개 잡, 로드상태 동일) 대조 — §1 표 대비 **추가·제거·트리거 변경 0건**. Vercel cron(§4)도 오늘 코드배포 다수(#156~172)에도 크론 스케줄 자체는 무변경. 충돌·공백·비효율 재평가 결과도 기존과 동일(신규 이슈 없음).
> **2026-07-07 17:59 재확인**: `launchctl list | grep coffee`(9개 잡, 로드상태 동일) 대조 — §1 표 대비 추가·제거·트리거 변경 0건. 오늘 코드배포 다수(#186~196)에도 크론 스케줄 자체 무변경. 신규 이슈 없음.
> **2026-07-08 08:40 재확인**: `launchctl list | grep coffee`(9개 잡, 로드상태 동일) 대조 — §1 표 대비 추가·제거·트리거 변경 0건. 심야 배포(#195~197·#205~207)에도 크론 스케줄 자체 무변경. dev-pipeline(5분)이 #200 action_type 정정 직후(08:13) 정상 픽업(08:40 브랜치 커밋 확인) — 케이던스 설계 자체는 정상 작동 중. 신규 이슈 없음.
> **2026-07-15 17:48 재확인**: `launchctl list | grep coffee`(10개 잡, 로드상태 동일) 대조 — §1 표 대비 추가·제거·트리거 변경 0건. Vercel cron(§4)도 DIGEST 45개 전 크론 정상과 대조해 변경 0건. §2의 "17시 1×"(07-12 CEO 결정) 케이던스로 정상 진행 중이나, `agents/chief-secretary-agent.md` 헌법파일 헤더는 **여전히 "하루 2회·08:00·17:00"로 미동기화**(3사이클째 이월 — WORK-ORDER 참조).
> **2026-07-16 17:39 재확인**: `launchctl list | grep coffee`(10개 잡, 로드상태 동일) 대조 — §1 표 대비 추가·제거·트리거 변경 0건. DIGEST 크론헬스 45/45 정상(agent_runs 실패 0건 실측). `git log --since="07-15 17:48"` 5커밋(CEO 직접 06:58~13:14, §28 참조) 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표 그대로 유효. `chief-secretary-agent.md` 헌법파일 미동기화는 **4사이클째** 이월(WORK-ORDER 참조).
> (구 `memory/schedule-baseline.md` 참조는 폐기 — 이 파일로 일원화)
> 잡 추가 시 3종 세트 필수: ① 러너 heartbeat ② `web/lib/jobTeams.ts`(팀·EXPECT_MAX_H) ③ 이 파일 갱신.
> **2026-07-12 17:5x 재확인**: `launchctl list | grep coffee`(9개 잡, 로드상태 동일) — §1 표 대비 추가·제거·트리거 변경 0건. **Vercel cron(vercel.json)은 오늘 중 왕복 변경**: 11:54(`b32b2e7`) 비용절감으로 `cron-issues` 10분→30분 완화 + `ignoreCommand`(web/ 무변경 커밋 빌드스킵) 신설 → 이 ignoreCommand가 **HEAD^ 비교만 해서 dev-deploy의 merge+archive 2커밋 push 패턴과 충돌, #311·#327·#328 배포가 push는 성공했으나 프로덕션 미반영으로 14:02 발견(P0 결재#334)** → 16:19 `VERCEL_GIT_PREVIOUS_SHA` 기준 비교로 근본수정·반영확인 완료. 14:48(`d869442`) cron-issues는 30분 절감효과 실측 결과 사실상 0(월 몇센트)이라 10분으로 원복(ignoreCommand는 수정된 채 유지) — **최종 상태는 기존 10분과 동일, 순변경 없음**. 상세: JOURNAL-20260712.md 17시대, PRINCIPLES.md 신규 항목.
> **2026-07-18 17:47 재확인**: DIGEST 크론헬스 46/46 정상(agent_runs 실패 0건, 08:00·17:43 EXECUTIVE 교차대조) — §1 표 대비 추가·제거·트리거 변경 0건. 오늘 3커밋(dev_task #399, 12:40~41 KST) `git show --stat` 확인 결과 vercel.json·`*.plist` 변경 0건 — §4 Vercel cron 표도 그대로 유효. ⚠️`launchctl list` 직접조회는 이번 세션 권한 미승인(대화형 프롬프트 미응답)으로 스킵 — DIGEST/agent_runs 실측 + git 변경이력 대조로 대체 검증(드리프트 여부 판단에는 동일 신뢰도).
> **2026-07-20 17:37 재확인**(07-19 17:00 사이클 이후 첫 실행, 07-19 08:00은 실행이력 없음 — §2 "17시 1× 케이던스"대로 정상, 08시 결측 아님): `launchctl list | grep coffee`(10개 잡, 로드상태 동일) 대조 — §1 표 대비 추가·제거·트리거 변경 0건. `agent_runs` 오늘 42잡 전건 ok(실패 0), `git log --since="07-19 17:49"` 6커밋(dev_task #410·#412·#413) 중 `vercel.json`·`*.plist` 변경 0건 — §4 Vercel cron 표 그대로 유효. `chief-secretary-agent.md` 헌법파일 미동기화 **8사이클째** 이월(WORK-ORDER 참조).
> **2026-07-21 17:48 재확인**: `launchctl list | grep coffee`(10개 잡, 로드상태 동일) 대조 — §1 표 대비 추가·제거·트리거 변경 0건. `agent_runs` 최근 24h 35잡 전건 ok(실패 0). `git log --since="07-20 17:37"` 9커밋(dev_task #414·#415·#419, 전부 07-20 저녁 배포) 중 `vercel.json`·`*.plist` 변경 0건 — §4 Vercel cron 표 그대로 유효. **⚠️신규 발견**: `web/scripts/chat-watch.mjs`가 13:33 KST부터 **메인 워킹트리에 미커밋 변경 상태로 4h+ 방치** — 내용은 `/tmp` 3일 미접근 purge로 시스템프롬프트 파일이 사라져 전체 `claude -p` 호출이 실패하던 근본원인 수정(durable 경로 이전 + 자동재생성 가드, 자체로는 안전한 버그픽스)이나, CLAUDE.md §3 "메인 워킹트리 미커밋 변경 시 dev-deploy 배포 중단(사람 작업 보호)" 가드에 걸려 **승인된 #421(룰갭 P46/47/48)이 `deploy_approved` 상태로 배포 못하고 정체 중**. 자율진단이 이를 정확히 포착해 결재#422로 이미 상신(08:05, pending) — launchd 잡·cadence 자체의 드리프트는 아니므로 §1 표는 무변경 유지, WORK-ORDER §운영본부 참조.
> `chief-secretary-agent.md` 헌법파일 미동기화 **9사이클째** 이월(WORK-ORDER 참조).
> **2026-07-28 17:5x 재확인**: plist 10개 mtime 전건 07-12 이전(오늘·전일 변경 0건, `no-sleep.plist`는 스케줄 무관 절전방지용) — §1 표 대비 추가·제거·트리거 변경 0건. `web/vercel.json`·`web/lib/jobTeams.ts` 마지막 변경 07-16(오늘 무변경) — §4 Vercel cron 표 그대로 유효. `git log --since="07-27 17:29"` 10커밋(dev_task #523·#530 + CEO 직접 4건: cron-batch-judge 중복제출방지·AI판정 후보구제 3,156곳·mineArea maxCalls 상향·콘솔키 알림 이메일채널 폐지) 중 스케줄 인프라 파일 변경 0건. DIGEST 크론헬스 46/46 정상(agent_runs 실패 0건 실측, 07-27 17:29 이후 실패 0건 별도 대조). `launchctl list` 직접조회는 이번 세션도 비대화형이라 스킵 — plist mtime + vercel.json/jobTeams.ts mtime + agent_runs 실측 3중 대조로 대체(드리프트 판단 신뢰도 동일). `chief-secretary-agent.md` 헌법파일은 이미 07-22 세션에서 "미동기화 이월"이 관성적 오탐이었음이 확인·정정된 바 있음(§9 PRINCIPLES 참조) — 재확인 결과 이번에도 헤더 정상, 이월 목록에서 계속 제외.
> **2026-07-31 17:33 재확인**: `~/Library/LaunchAgents/com.coffee.*.plist` 10개 mtime 전건 07-28 21:28 이전(오늘 변경 0건, audit-watch·dev-pipeline·dev-deploy 07-28 60분화 그대로 유지) — §1 표 대비 추가·제거·트리거 변경 0건. `lib/jobTeams.ts` EXPECT_MAX_H 재대조 결과도 §1과 완전 일치(드리프트 0, 07-30 정정분 안정). DIGEST 크론헬스 47/47 정상(agent_runs 오늘 31잡 전건 ok, 실패 0건 실측). `launchctl list` 직접조회는 이번 세션도 비대화형이라 스킵 — plist mtime + jobTeams.ts 대조로 대체. **참고(스케줄 신설 검토 후보, 결정 아님)**: 품질본부 룰갭발굴팀이 오늘 17:11 사이클에서 "P66(비카페업종) 매치 카페 전수 재검사가 주기적 크론에 없어 표본만 처리되고 나머지는 무기한 방치"를 발견, 제안1로 "audit-watch 사이클에 P66 전수 재검토 큐 단계 추가"를 상신함(rulegap-proposals-20260731-1711.md) — 아직 코드·크론 미신설(승인 대기), 승인 시 3종세트(러너·jobTeams.ts·이 파일) 반영 필요.
> **2026-08-01 17:27 재확인**: `~/Library/LaunchAgents/com.coffee.*.plist` 10개 mtime 전건 07-28 21:28 이전(오늘 변경 0건) — §1 표 대비 추가·제거·트리거 변경 0건. `web/vercel.json`(07-29 17:24)·`web/lib/jobTeams.ts`(07-29 19:56) 둘 다 오늘 무변경 — §4 Vercel cron 표 그대로 유효. `git log --since="07-31 17:33"` 13커밋(dev_task #565·#566·#567 배포 + decisions#570 franchise unpublish) 중 스케줄 인프라 파일 변경 0건. DIGEST 크론헬스 47/47 중 **cron-discover-categories 1건 실패**(월간 신규잡 첫 실행, 05:00 KST) — 이는 launchd/cadence 드리프트가 아니라 콘솔크레딧 소진(#356/#269 계열) 증상으로 selfaudit이 근본원인 규명 완료(14:39 리포트), §1·§4 표 자체는 무변경. `launchctl list` 직접조회는 이번 세션도 비대화형이라 스킵 — plist mtime + vercel.json/jobTeams.ts mtime + git log 3중 대조로 대체(드리프트 판단 신뢰도 동일).

---

## 1. launchd 등록 현황 (로컬 Mac, 실측 2026-07-02)

| plist (Label) | plist 트리거 | 실제 실행 로직 | 로드 상태 | 비고 |
|---|---|---|---|---|
| `com.coffee.chief-manager` | **매일 08:00·12:00·17:00** | `agents/run-daily.sh` 순차 실행 (08·17=풀 / 12=경량: 품질 해자 가드만) | ✅ 로드 | ★핵심 사이클(아침·점심·오후) 오케스트레이터. 조간회의 폐지(2026-07-04) |
| `com.coffee.weekly-evaluation` | **매일 10:30** | `agents/run-weekly.sh` (짝수 Julian일 게이트 내장) | ✅ 로드 | 실제 주기: 격일. **2026-07-02 변경: 09:00→10:30**. 명칭 불일치 잔존 — [불일치-1] |
| `com.coffee.self-audit` | **매일 3회 11:30·15:30·21:30** | `run-selfaudit-cycle.sh` → LLM 자율진단 | ✅ 로드 | **2026-07-02 변경: 09/15/21 → 11:30/15:30/21:30** (분 분산·주간 고정) |
| `com.coffee.audit-watch` | **매일 4회 08:05·12:05·16:05·20:05 (StartCalendarInterval — ~~60분 StartInterval 3600~~은 오기재였음)** | `agents/run-trigger-watch.sh` | ✅ 로드 | 이벤트 트리거 감시→자율진단 즉시 기동. **2026-07-02 추가: cron-selfaudit 워치독(7h+ 미실행 시 대리 실패 기록) + 에이전트 실패 시 트리거 un-consume 복원(사건 유실 방지)**. **2026-07-12 추가: 이벤트 self-audit 20분 쿨다운**. **★2026-08-19 16:29 기획조정실장 재확인**: `PlistBuddy -c Print`로 실제 값이 `StartCalendarInterval`(4x/일 고정시각)임을 직접 확인 — "60분 StartInterval 3600"은 07-30 이후 여러 재확인에서 반복 인용된 오기재(coordination#314, 2026-08-17~08-19 2일 방치 후 종결) |
| `com.coffee.dev-pipeline` | **매일 4회 08:05·12:05·16:05·20:05 (StartCalendarInterval — ~~60분~~은 오기재였음)** | `agents/run-dev-pipeline.sh` | ✅ 로드 | 자율 개발 파이프라인 (dev_task claim→브랜치 구현·검증). **★2026-08-19 16:29 재확인**: PlistBuddy 실측 StartCalendarInterval 4x/일 — claim 지연 최대 4h(60분이 아님) |
| `com.coffee.dev-deploy` | **매일 4회 08:05·12:05·16:05·20:05 (StartCalendarInterval — ~~60분~~은 오기재였음)** | `agents/run-dev-deploy.sh` | ✅ 로드 | CEO 배포확정 → merge+push 워커. **★2026-08-19 16:29 재확인**: PlistBuddy 실측 StartCalendarInterval 4x/일 — CEO 승인 후 실배포까지 최대 4h 지연 가능([[decision-pipeline-completion]] 우려와 연관 — 승인=집행 아님 갭 감시 강화 필요) |
| `com.coffee.youtube-backfill` | ~~매일 16:30~~ | `web/scripts/run-youtube-backfill.sh` | ❌ **.disabled (2026-08-12 CEO 지시로 정지)** | 커버리지 24%(3,302/13,495)에 잔여 107일 소요 대비 매 실행 GB급 판독 — 비용대비 미흡 판단. `jobTeams.ts RETIRED_JOBS` 등재 완료(08-12 07:12). 재기동 = plist `.disabled` 제거 후 `launchctl load`(수동, CEO 결정 필요). **08-13 발견**: 재기동 전까지 DIGEST가 "정지의심"으로 매 사이클 오경보 표시 중(#676 상신, 표시로직 재분류 대상) |
| `com.coffee.discover-sweep` | ~~매일 2× 07:05·20:05~~ **❌ 2026-09-26 09:0x `.plist.disabled`로 영구정지(당초 09-21 07:40 CEO 승인 정지)** | `agents/run-discover-sweep.sh` → `discover-sweep.mjs` | ❌ `.disabled` · jobTeams RETIRED_JOBS 등재 | **2026-07-09 추가(CEO 지시 "매일 네이버 한도 최대·공격적 수집")**: 66개 전 지역 발굴 스윕. cron-grow(2h/1지역=각 지역 5.5일)만으론 롱테일 누락 → 매일 2회 전 지역(각 지역 하루 2회). 신선도순환+지역당상한(120s)+한바퀴완주종료+6h상한. 네이버 search/local 25k/일서 자동중단. heartbeat=discover-sweep(jobTeams 성장본부·EXPECT_MAX_H=30). ⚠️발굴(네이버local)≠리뷰수집(구글·블로그·유튜브, cron-synth/grow가 처리) |
| `com.coffee.morning-sweep-report` | **매일 08:20** | `agents/run-morning-sweep-report.sh` → `web/scripts/morning-sweep-report.mjs` | ✅ 로드 | **2026-09-17 19:50 신규(`5624a0e0`, CEO 직접커밋)**: 아침 스윕 결과를 "사람이 기억해서 보고"가 아니라 잡으로 강제(CEO 지적 "안 할 거잖아" 대응). 로그 `agent-reports/logs/morning-sweep-YYYYMMDD.log`에 스윕 실적·전국개방 추적·적체/쿼터·published↔pipeline_status 정합성·잡 실행시각을 남기고, 로그 자체가 없으면 "launchd 미발화 의심"으로 자기보고. heartbeat=morning-sweep-report(jobTeams 성장본부·EXPECT_MAX_H=30). ★비서실장 09-18 16:2x 발견: 러너+plist+jobTeams 3종은 커밋 당시 완료였으나 이 표(SCHEDULE.md) 등재만 24h 누락돼 있었음 — 이번 세션이 등재로 규칙6 3종세트 완결 |
| `com.coffee.chat-watch` | ~~상주~~ | `web/scripts/chat-watch.mjs` | ❌ **.disabled (2026-08-04 컴퓨트 절감으로 정지)** | 관제 챗봇 로컬 워커. 필요시 수동 재기동 |
| `com.coffee.trigger-listener` | **상주(RunAtLoad+KeepAlive)** | `agents/run-trigger-listener.sh` → ntfy.sh `/raw` 스트림 구독 | ✅ 로드 | **★2026-08-04 신설, 08-13까지 이 표에 미기재 상태로 9일 방치돼 있었음(비서실장 발견·정정)**. 결재승인(브라우저 `/admin` 포함) 시 ntfy 시크릿 토픽으로 신호 전송 → 이 리스너가 즉시 `~/.coffee-dev-trigger` touch → launchd WatchPaths가 dev-pipeline·dev-deploy 즉시 발화(폴링 대체, Neon 접속 0=비용 0). `jobTeams.ts`엔 미등재(상주 데몬이라 chat-watch·no-sleep과 동일하게 EXPECT_MAX_H 대상 아님 — 의도된 설계, 누락 아님) |
| `com.coffee.no-sleep` | **상시(RunAtLoad+KeepAlive)** | `caffeinate -dimsu` — 맥 수면 방지 | ✅ 로드 | launchd 수면 중 발화 누락 방지. 죽으면 자동 재시작 |
| `com.coffee.import-permits` | **매일 07:00** | `agents/run-import-permits.sh` → `import-permits.mjs --apply --limit 2700` (★09-21 07:40: 노드 경로 수정·한도 50→2,700·heartbeat 러너·jobTeams 등록으로 3종세트 완결) | ✅ 로드 | **★2026-09-20 신설(`1d1119df`, 11:04, CEO 세션 승인) — 3종세트 미완결 발견(비서실장 16:3x)**: 공공 인허가 원장으로 카페명 직접 적재(발굴 16.9콜→확인 1콜, 하루 공개 700→약1,900곳 목표). plist는 있으나 ①스크립트에 heartbeat/agent_runs 기록 없음 ②`jobTeams.ts`에 JOB_TEAM·EXPECT_MAX_H 미등록 ③이 표 최초 등재가 지금(발견 당일 4h만에 정정, 규칙6 3종세트 중 2종 누락 지속). 다음 사이클까지 미완결 시 정지감시 사각(무실행해도 "정상"으로 표시)이 생김 — WORK-ORDER 최우선 반영 |
| `com.coffee.sangga-rollout` | **매일 07:00** | `agents/run-sangga-rollout.sh` → `sangga-rollout.mjs --budget 10000` | ✅ 로드(09-30 bootstrap, 3종세트 당일 완결) | **2026-10-02 신설(CEO 지시 "자동으로 7시에 시작해, 정확하게")**: 소상공인시장진흥공단 상가업소정보(`lib/sangga.ts`, 인허가 원장과 별개 소스)로 수도권 66개 지역(`METRO_SIGNGU`) 순회 발굴. 적재만으로 "통과"로 보고하지 않고 **매 지역 실제 수집+합성까지 끝낸 뒤 live+pending 실측치만** `agent-reports/sangga-rollout-progress.json`에 누적(09-30 "적재=통과" 오판 재발방지). 실측 지역별 편차 큼(강남구 1,074적재→58통과 5.4% · 강동구 369→2곳 0.5% · 강북구 표본부족) — 전체 추정 금지, 지역 다 돌 때까지 누적치만 신뢰. 하루 예산 10,000콜(다른 일일 크론 몫 보존), 66개 지역 소진되면 자동으로 "할 일 없음"으로 무해 종료. |
| `com.coffee.dongbackfill` | — | — | ❌ **.disabled (제거됨)** | 결재 #23 집행 완료 (2026-07-01) |
| `com.coffee.qualityaudit` | — | — | ❌ **.disabled (제거됨)** | 재개는 재설계+CEO 결재 |

**★ 핵심 운영 사이클: 08:00(아침 풀) + 12:00(점심 경량·품질 가드만) + 17:00(오후 풀) 3회** — 토큰 최적화(품질 3×·연구/영업/종합 2×). 조간회의(월) 폐지(2026-07-04 CEO — 라운지 주2회+상시 협업 대체).
비서실장은 run-daily.sh 말미(각 사이클 완료 후) 일지·업무지시·원칙을 갱신한다.

---

## 2. run-daily.sh — 조직별 특성 맞춤 케이던스 (08·12·17시, 2026-07-05 CEO 최적화)

도메인 변화속도에 실행빈도를 맞춤 = 품질 완벽 유지 + 토큰 최소.

| 에이전트 | 역할 | 케이던스 | 근거 |
|---|---|---|---|
| run-integrity-agent | 데이터 정합성 | **08시 1×**(09-05 비용 다이어트) | 큰컬럼 전수대조 무거움 — 변경분 게이트+주1회 전수(월) |
| run-rulegap-agent | 리뷰 룰갭 | **매 사이클 3×** | 오염 상시 |
| run-quality-redteam-agent | 품질 레드팀 | **08시 1×**(09-05 비용 다이어트) | 변경분 게이트+주1회 전수(월) |
| run-self-audit-agent | 자율진단(숨은 문제) | 풀 2×(08·17) | 넓은 스캔, 미들 불필요 |
| run-closure-agent | 폐업 감지 | 1×/일(08) | 폐업은 일 단위 |
| run-demand-grow-agent | 수요→발굴 | 1×/일(08) | 큐는 크론이 상시 소비 |
| run-search-quality-agent | 검색품질 | 1×/일(17) | 일 단위 모니터 |
| run-marketing-agent | 마케팅 연구 | **격일**(짝수일 17) | 며칠 단위, 하루새 안 바뀜 |
| run-b2b-sales-agent | B2B 영업 연구 | **격일**(홀수일 17) | 며칠 단위 |
| run-deep-judge-agent | 심층판정 | 격일 짝수일(풀) | 무거움 |
| run-chief-manager-agent | 종합→EXECUTIVE | **17시 1×**(2026-07-12 CEO: 2×→1×) | CEO 보고. 관리·보고 오버헤드=소비자 무관→저녁 통합. 08시엔 모트·자율진단·발굴·심층판정 정상 |
| run-chief-secretary-agent | 비서실장(일지·스케줄) | **17시 1×**(2026-07-12 CEO: 2×→1×) | 산출물 갱신. chief-manager와 함께 저녁 통합 |

**12시 경량 = 오염 가드 3종만.** 08·17시 = 풀(위 케이던스대로). 결과: 3회 사이클인데도 총 실행량이 기존 2회보다 적음(오염 커버리지는 3×↑).

---

## 3. run-weekly.sh 내부 실행 순서 (매일 10:30 트리거, 격일 게이트)

| 순서 | 에이전트 | 역할 |
|---|---|---|
| — | 격일 게이트 | `date +%j` 짝수 Julian일만 통과 |
| 1 | run-evaluation-agent | 성과 평가 |
| 2 | run-team-legal-agent | 법무 감사 |
| 3 | run-team-finance-agent | 재무 점검 |
| 4 | run-team-ops-support-agent | 경영지원 |
| 5 | run-risk-mgmt-agent | 리스크 관리 |
| 6 | run-strategy-agent | 전략기획 |
| 7 | run-support-office-director | 경영지원본부장 (종합→SUPPORT-WEEKLY) |

---

> **★2026-09-16 변경(cron-resynth 20시 → 22시)**: 최근 7일 실측에서 `cron-resynth`만 **20시대 5/7회**였다
> (08·12·16시는 7/7). 같은 11 UTC 스케줄의 closure·demand·embed·issues·synth·verify는 전부 7/7이라
> 스케줄러 문제가 아니다. 20:00~20:03에 크론 7개가 몰리는데 resynth가 그중 가장 무겁고(300곳 전수적용,
> 실측 62~214초 / 상한 300초) **타임아웃으로 죽으면 `recordRun`에 도달을 못 해 기록이 아예 안 남는다** —
> 관제탑엔 '실패'가 아니라 '실행 안 함'으로 보여 경보도 안 뜨는 조용한 실패였다.
> 여파: 규칙 재검 처리량이 300×4회/일이 아니라 300×3.7회/일 — 규칙 변경 전파가 25% 느려진다.
> → 11 UTC → 13 UTC(22:00 KST). 군집을 벗어나고 DB 통잠창(01~07시) 밖이라 비용 영향 없음.

## 4. Vercel cron 일정 (서버측) — 실측 2026-07-05 (`web/vercel.json`)

> **2026-07-02 변경: embed·grow·heal·enrich 분(minute) 오프셋 분산 — 정각(:00) 집결 해소.**
> **★ 2026-07-05 00:14 KST CEO 직접 변경(`52b0b54`)**: cron-verify·cron-sentinel·cron-rulegap **1×→2×/일 촘촘화**(전부 결정론=LLM 0=토큰 0이라 자주 돌려도 비용 무시, 오염 노출시간 24h→12h로 단축). `jobTeams.ts` EXPECT_MAX_H도 셋 다 30h→16h로 타이트하게 동기 조정. launchd 아닌 Vercel cron 변경이라 이 파일이 유일한 문서 기준선 — CEO 본인 실행이라 사전확인 절차 대상 아님(L3 셀프 게이트).

| cron | UTC 스케줄 | KST 환산 | 기능 |
|---|---|---|---|
| ~~cron-batch-judge~~ | ~~`45 2,14 * * *`~~ | ~~11:45·23:45~~ | ❌**09-15 21:55(`17607df8`) 등록 자체가 CEO 본인 "내 오류 정정"으로 당일 철회됨** — `/api/cron-batch-judge` route.ts:29가 "어떤 스케줄러 등록도 금지"를 명문화한 걸 안 읽고 등록했던 것(AI판정은 CEO 지시로 상시 OFF, `?manual=1` 수동호출만 허용). vercel.json에서 완전 제거 확인. ⚠️`jobTeams.ts`(JOB_TEAM·EXPECT_MAX_H=20)에는 아직 등재 잔존 — RETIRED_JOBS 미포함, 09-16 사이클이 이 철회를 놓쳐 표에도 방치돼 있었음(09-17 16:3x 발견·정정). |
| cron-billing | `0 23 * * *` | 08:00 | 사장님 정기결제(토스 빌링) 집행 + 🔔 우리 가게 리포트 감시 알림(`runOwnerWatch`) |
| cron-closure | `0 3,11,23 * * *` | 12:00·20:00·08:00 | 폐업 재확인 (UTC 홀수시 고정 — grow QPS 충돌 회피) |
| cron-coord-consumer | `3 3,7,11,23 * * *` | 12:03·16:03·20:03·08:03 | 협업(coordination) 요청 자동 소비·집행 (결재 #114, 2026-07-02 라이브 전환 완료) |
| cron-costwatch | `0 23 * * *` | 08:00 | 💸 Neon 데이터전송비 이상탐지 워치독(경영지원본부·결정론) — `pg_stat_statements`를 전일 스냅샷과 비교, 쿼리당 10GB/일·전체 25GB/일 초과 시 issues 보드 HIGH 자동상신+self-audit 기동. CEO 직접 신설(2026-07-29, `2bb2f3a`) — youtube-backfill 반복조회 버그가 한 달 조용히 ~660GB 읽고 청구서로 처음 발견된 사고(CEO-ORDERS 참조) 재발방지. `jobTeams.ts` 팀=경영지원본부·EXPECT_MAX_H=30 등록. |
| cron-criteria-verify | `50 11,23 * * *` | 20:50·08:50 | 🎛️ 기준 검증 에이전트 v1(품질본부·결정론) — criteria가 코드에 제대로 적용됐는지 검증(dead-knob·범위/시드 드리프트·등급바닥·좌표박스 실효과). `jobTeams.ts` 팀=품질본부·EXPECT_MAX_H=16 등록, 헌법=`agents/criteria-verify-agent.md`. 2026-07-09 신설(3종세트+헌법 완비) |
| cron-demand | `0 11 * * *` | 20:00 | 수요 갭 분석 |
| cron-discover-categories | `0 3 1 * *` | **매월 1일** 12:00 | 카테고리 발굴 |
| cron-embed | `1 3,7,11,23 * * *` | 12:01·16:01·20:01·08:01 | 임베딩 |
| cron-enrich | `40 3,11 * * *` | 12:40·20:40 | 평판 신선도·메뉴 추출 |
| cron-exposure | `10 4 * * *` | 13:10 | 👁️ 노출 감시자 — 소비자 화면에 실제로 뜨는 값이 규칙과 어긋나는지 감시(하네스 L6) |
| cron-grow | `10 0-11,23 * * *`(★09-13 11:18 4회→13회 변경, 아래 참조) | 매시 09:10~20:10 + 08:10 | 발굴·합성 |
| cron-issues | `0 3,7,11,23 * * *` | 12:00·16:00·20:00·08:00 | RM 탐지 + autoCorrect |
| cron-newsletter | `7 11 * * 0` | **일요일** 20:07 | 뉴스레터 |
| cron-resynth | `0 3,7,13,23 * * *` | 12:00·16:00·**22:00**·08:00 | 주간 재합성 · ★2026-09-16 11→13 UTC(20시 군집 회피, 아래 참조) |
| cron-rulegap | `30 7,23 * * *` | 16:30·08:30 | 룰갭 학습 |
| cron-selfaudit | `20 3,11,23 * * *` | 12:20·20:20·08:20 | 결정론 자율진단 |
| cron-sentinel | `0 3,11 * * *` | 12:00·20:00 | 정합성 스캔·자동치유·name_pollution |
| cron-snapshot | `0 3 * * 0` | **일요일** 12:00 | 평점 주간 스냅샷 |
| cron-synth | `2 3,7,11,23 * * *` | 12:02·16:02·20:02·08:02 | 리뷰 합성 |
| cron-verify | `0 11,23 * * *` | 20:00·08:00 | 15점검 게이트 |
| orchestrator?heal=1 | `25 3,11 * * *` | 12:25·20:25 | 자가치유 (jobTeams 키=`orchestrator-heal`) |

### 감시망 (누가 누구를 감시하나)

- 각 러너는 종료 시 heartbeat→`agent_runs` 기록. 리프 에이전트도 `_run.sh`가 개별 하트비트 — **실패=즉시 이슈화·담당 본부 배정**.
- `cron-selfaudit`이 **EXPECT_MAX_H(`web/lib/jobTeams.ts` — 단일출처) 등록 잡만** '정지의심' 감시. 미등록 잡은 실패(ok=false)만 감지.
- `cron-selfaudit` 자신은 **audit-watch의 결정론 워치독**(7h+ 미실행 시 대리 실패 기록→이슈화)이 감시 — 감시자의 감시자.

---

## 5. 충돌·불일치·비효율 분석 (실측 2026-07-02)

### [불일치-1] ⚠️ `com.coffee.weekly-evaluation` 명칭 vs 실제 주기

```
plist: 매일 10:30 트리거 / run-weekly.sh 내부: 짝수 Julian일만 통과
실제 실행: ~2일에 1회 (주 3~4회)
```
- **미해결**: plist 이름(weekly)과 실제 주기(격일) 불일치. L3(사장님) 확인 후 정비 필요.
- 시각은 09:00→10:30으로 변경됨 (2026-07-02, 오전 사이클과 간격 확보).

### [불일치-2] ✅ **해결(2026-07-02)** — self-audit plist 시각

01:00 1회(심야 누락) → 09/15/21(2026-07-01) → **11:30·15:30·21:30 확정(2026-07-02)**. 문서=plist 일치.

### [충돌-1] ✅ **해결** — grow vs closure QPS 충돌

2026-06-28 bb65f1b: cron-closure UTC 홀수시 고정. grow와 네이버 QPS 동시각 충돌 해소.

### [충돌-2] ✅ **해결(2026-07-02)** — 자정 집중 (00:00~01:30)

- dongbackfill(00:10) 제거 완료 (2026-07-01, 결재 #23 집행).
- embed·grow·heal·enrich 분 오프셋 분산 배포 (2026-07-02) — 정각 집결 해소.
- 잔존: KST 00:00 sentinel + 01:30 rulegap은 단독 실행이라 부하 무해.

### [공백-1] ⚠️ ★ 판정·심층분석 전면 정지 (6/16~ 계속)

judge·judgeloop·qualityaudit 모두 정지 + 코드 제거 완료 (2026-06-28).
- needs_llm 적체 지속 (2026-06-30 기준 2,057건).
- AI 판정 배치 상시 OFF + 수동 청산 게이트(?manual=1) — 2026-06-30 10:40 커밋.
- 전략기획본부 7/3(목) 재개 조건 메모 제출 예정.

### [공백-2] ✅ **해결(2026-07-01)** — dongbackfill launchd 미제거

decisions #23 L2 전결 승인 → .disabled 이동 집행 완료. 종결.

### [신설-1] ✅ self-audit(주간 3회) + audit-watch(5분) 정착 (2026-06-30 신설 → 2026-07-02 안정화)

- `com.coffee.self-audit`: 매일 11:30·15:30·21:30 LLM 자율진단. 기존 cron-selfaudit(결정론) 보완.
- `com.coffee.audit-watch`: 5분 워처. 서버 신호(audit_triggers) 감지 시 즉시 기동 + cron-selfaudit 워치독 + 실패 시 트리거 un-consume 복원 (2026-07-02).

---

## 6. 최적화 권고 (실측 2026-07-02)

| # | 항목 | 권고 | 우선순위 | 결정 주체 |
|---|---|---|---|---|
| 1 | dongbackfill launchd 제거 | ✅ **해결(2026-07-01)** — 결재 #23 집행 완료 | — | 종결 |
| 2 | warmup 쿼터 배분 재설계 | 04:30·14:30 이동 또는 200건 감축 | 🟠 HIGH | L3 CEO |
| 3 | weekly-evaluation plist 정비 | 명칭·주기 일치 (시각 10:30 변경은 완료) | 🟡 MED | L3 CEO |
| 4 | self-audit 자정 통과 점검 | ✅ **해결(2026-07-02)** — 주간 고정(11:30·15:30·21:30)으로 자정 미통과 | — | 종결 |
| 5 | judgeloop 전략메모 | 7/3(목)까지 전략기획 제출 후 결재 | 🟡 MED | 7/3(목) — 오늘, 아직 미확정(08:45 기준) |
| 6 | dev_task 오분류 재발방지 | 코드수정 성격 결재는 상신 시점부터 `action_type=dev_task` 등록 지침 재공지 | 🟠 HIGH | L2 기조실장 |

---

## 7. 실측 인시던트 — 08:00 사이클 세션한도 연쇄실패 (2026-07-02)

- **현상**: `run-daily.sh` 순차실행(§2) 1~5번은 성공, **6~11번(closure~chief-secretary)이 공유 Claude 구독 세션한도 소진으로 전부 3회씩 실패** (08:27~11:29 KST). 11:30 리셋 후 전부 재시도 성공 확인 — 코드결함 아님, 일시적 자원경합. 상세: `agent-reports/journal/JOURNAL-20260702.md`.
- **재발방지 조치**: `4c16c4d`(fix/audit-20260702, main 미병합) — self-audit 자기실패·레이트리밋/세션한도 실패는 트리거 생성 안 함(무한루프 차단) + un-consume 재시도 상한 2회.
- **개선 백로그(비긴급)**: 순번 뒤쪽(특히 EXECUTIVE 만드는 chief-manager)이 한도 소진 시 통째 유실 — 순서 재배치(중요 산출물 앞쪽) 검토. 임의 변경 금지, CEO 확인 필요.
- **관찰**: `agent_runs`에 `chief-manager`(항상 성공 기록)와 `chief-manager-agent`(세션한도로 실패)가 별개 job으로 존재 — 명칭 관계 미확인, 다음 점검 시 확인 필요(추측 아님, 확인 필요로 명시).

---

## 8. 17:00 오후 사이클 실측 (2026-07-02) — 08:00 사이클과 대조

- `run-daily.sh` 1~11번(integrity~chief-secretary) **전 구간 세션한도 실패 없이 08:00(UTC)~08:44(UTC, KST 17:00~17:44) 순차 정상 완료**. 08:00 사이클 6~11번 연쇄실패(§7)와 대비되는 정상 사례 — `4c16c4d` 재발방지 커밋(트리거 자기증폭 차단)이 main에 병합·배포된 이후 첫 완주 확인.
- chief-manager-agent 17:43 KST 완료 → WORK-ORDER.md 발행. chief-secretary-agent(본 세션) 뒤이어 4대 산출물+CEO-ORDERS 갱신.

## 9. 08:00 사이클 실측 (2026-07-03) — 2회 연속 정상 완주 확인

- `agent_runs` 실측: integrity~chief-manager-agent(23:07~23:46 UTC = 08:07~08:46 KST) **전 구간 세션한도 실패 없이 정상 완료**. 07-02 17:00 사이클에 이어 **2회 연속** 완주 — `4c16c4d`(트리거 자기증폭 차단) 재발방지 효과가 일회성이 아님을 확인.
- 단, chief-secretary-agent(본 세션 산출물인 JOURNAL·WORK-ORDER·SCHEDULE 등)는 08:46 시점까지 미작성 상태였음 — chief-manager-agent가 EXECUTIVE-latest.md에서 직접 지적해 본 세션을 보강 트리거로 기동. agent_runs상 ok=true("완료")로 기록됐으나 실제 산출물 생성은 지연됨 — 하트비트 성공과 산출물 완결이 분리되는 구조적 갭. 재발 시 원인 분석 필요(코드변경 사안이면 CEO 결재 검토).
- **★ 신규 발견(구조적 버그, 08:45 chief-manager-agent)**: `scripts/dev-claim.mjs`가 `action_type='dev_task'`인 승인건만 자동 클레임 — 그런데 코드수정 성격의 승인건 #33·#34·#107·#108·#109가 `agent_task`/`investigate`로 잘못 등록돼 **3~4일간 파이프라인에 전혀 노출되지 않음**("승인은 났는데 왜 안 되나"의 근본원인). 08:45 chief-manager-agent가 5건 전부 `dev_task`로 정정, 다음 파이프라인 주기(5분)부터 픽업 시작(dev/task-33·dev/task-34 브랜치 생성 확인, 진행중). 재발방지책 미확정 — 향후 코드수정 성격 결재는 상신 시점부터 `action_type=dev_task` 등록 지침을 각 상신 에이전트에 재공지 필요(WORK-ORDER 반영).

---

## 10. 17:00 사이클 실측 (2026-07-03) — 3회 연속 완주 + dev_task 재편입 실효성 확인

- 크론 42종 전부 정상(DIGEST 17:00:01 KST 실측, `agent_runs` 실패 0) — 07-02 17:00, 07-03 08:00에 이어 **3회 연속** 세션한도 무실패. `4c16c4d` 재발방지 효과 안정적.
- §9에서 정정한 `action_type=dev_task` 재편입 5건(#33·34·59·107·108·109) 중 물리방문 대기인 #59를 제외한 전건이 이번 사이클에 브랜치 구현→배포까지 완주(§8 신설원칙 실전 검증 성공). 신규 상신 #117·#120·#122도 처음부터 `dev_task`로 정상 등록돼 지연 없이 당일 배포됨.
- **신규 발견(경미, 실질 영향 없음)**: 17:40:43 사람이 직접 커밋한 `479858d`(.DS_Store untrack — dev-deploy 정지 원인 제거)가 `git reflog`상 존재하나 `origin/main`·현재 HEAD의 조상이 아님. 원인 추정: dev-deploy.mjs가 각 배포 merge 직후 로컬 main을 `origin/main`으로 `reset`하는 패턴이 있어(reflog `HEAD@{1}: reset: moving to origin/main`), 그 직전에 만든 로컬 전용 커밋이 origin에 반영되기 전 되돌려짐. **결과적으로 현재 HEAD에 `.DS_Store` 비추적 상태는 유지**(재확인 완료)라 실질 피해는 없으나, 사람이 dev-deploy 사이클 도중 로컬 main에 직접 커밋하면 자동 reset에 의해 유실될 구조적 위험 — 재발 시 원인 될 수 있어 기록. 코드 변경 사안이라 임의 수정 금지, CEO/개발 백로그 참고용.

---

## 11. 08:00 사이클 실측 (2026-07-04) — 4회 연속 완주 + 야간 dev_task 배포 확인

- `agent_runs` 실측(23:00 UTC 07-03 ~ 07:00 UTC 07-04 = 07-04 08:00 KST 사이클): 크론 42종 전부 `ok=true`, 실패 0건 — 07-02 17:00·07-03 08:00·07-03 17:00에 이어 **4회 연속** 세션한도 무실패. `4c16c4d` 재발방지 안정적.
- 야간(21:20~23:40 KST 07-03) 자율개발 파이프라인이 커밋 9개 배포 — `/admin/lounge`(전사 라운지: 팀·성과·다면평가·주간목표 자율수립 UI) 신규 + 관제 모니터 실행감시 사각 2건(cron-snapshot 포함) 수정. 스케줄 변경 아님(dev_task 정상 배포), 상세는 JOURNAL-20260704.md.
- 결재 #126(한나식빵 대구오염 healer, approved) `dev/task-126` 브랜치 진행중. 신규 L3 #127~130 상정(§9 WORK-ORDER 참조), 새 launchd/cron 변경 없음.

---

## 12. 17:00 사이클 실측 (2026-07-04) — 5회 연속 완주

- 크론 43종 전부 정상(DIGEST 08:00:01 실측 + 17:xx `agent_runs` 표본 20건 전부 ok=true) — 07-02 17:00부터 **5회 연속** 세션한도 무실패. launchd/plist 변경 없음, 스케줄 드리프트 없음.
- 이번 사이클은 CEO가 직접 코드 5건을 커밋·배포(브런치·소품샵 카테고리 제외 등, JOURNAL 17:55 세션 참조) — launchd 잡이 아닌 사람(CEO) 직접 git push이므로 스케줄표 변경 대상 아님.

---

## 13. 08:00 사이클 실측 (2026-07-05) — 6회 연속 완주 + 신규 cron 촘촘화 라이브 확인

- `agent_runs`/DIGEST 실측(08:00:01 KST 생성): 크론 43종 전부 `ok=true`, 실패 0건 — 07-02 17:00부터 **6회 연속** 세션한도 무실패.
- **§4 신규 cadence 첫 실행 확인**: cron-verify 마지막 성공 2h 전(=06:00 KST, 신규 스케줄과 일치) · cron-sentinel 8h 전(=00:00 KST, 일치) · cron-rulegap 6h 전(≈01:30 KST, 일치) — CEO가 00:14 KST 커밋한 촘촘화가 당일 첫 사이클부터 정상 반영됨. 문서(§4)=코드(vercel.json)=실행결과 3자 일치 확인.
- 심야(21:55~00:37 KST) CEO 직접 라이브 개발 세션: 사장님 접속 모니터링·구독 온보딩 메일 패키징·피크타임 노출 로테이션 공정화 2건·무인카페 영구제외 가드·cron 촘촘화(§4)·관제탑 조직 UI 재편 4건 — 총 13커밋. 전부 CEO 본인 직접 커밋(코드배포 L3 셀프게이트, decisions 미경유 정상). 상세 `agent-reports/journal/JOURNAL-20260705.md`.

---

## 14. 17:00 사이클 실측 (2026-07-05) — 7회 연속 완주, launchd/Vercel cron 변경 없음

- 크론 43/43 정상(13h 내 실패 0건, EXECUTIVE-20260705 17:52 실측) — 07-02 17:00부터 **7회 연속** 세션한도 무실패.
- `launchctl list | grep coffee` 재확인: §1 등록 9종 전부 로드 상태 그대로(추가·제거 없음). `git log --since="08:41"`상 `vercel.json`·`*.plist` 변경 커밋 0건 — §4 cron 표는 08:00 사이클 기준 그대로 유효.
- 08:00 사이클에 승인권고 상신된 #139·#140은 이번 사이클 중 자율개발 파이프라인이 정상 배포(`bb809b7`·`11aacb5`) — dev_task 등록 원칙(§8 PRINCIPLES.md) 재검증 성공.
- **★ 신규 발견(구조 재발) — WORK-ORDER 참조**: 이번 사이클 신규 상신 #152·153·154(전부 코드수정 성격)이 `action_type='agent_task'`로 잘못 등록됨(DB 실측) — 2026-07-03 정정했던 dev_task 오분류 패턴이 재발. `dev-claim.mjs`는 `dev_task`만 클레임하므로 CEO 승인이 나도 파이프라인에 노출 안 됨. 스케줄·launchd와 무관(코드 로직 재발방지 미흡 사안)이나 파이프라인 처리량에 직접 영향 있어 여기 기록.

---

## 15. 08:00 사이클 실측 (2026-07-06) — 8회 연속 완주, launchd/Vercel cron 변경 없음

- 크론 43/43 정상(20h 내 실패 0건, EXECUTIVE-20260706 08:26 KST 실측) — 07-02 17:00부터 **8회 연속** 세션한도 무실패.
- `launchctl list | grep coffee` 재확인: §1 등록 9종 전부 로드 상태 그대로. `git log --since="07-05 17:56"` 17커밋 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표는 그대로 유효.
- **§14 재발 우려건(#152·153·154 `action_type=agent_task` 오등록) 후속**: CEO가 07-05 18:48 KST 그대로 승인했음에도 당일 저녁 파이프라인이 3건 전부 배포까지 완주(`de5e29a`·`1f795f8`·`aa36973` 확인, git log 실측) — 07-03 사고(3~4일 누락)와 달리 이번엔 실질 지연 없었음. 다만 DB상 `action_type` 필드 자체는 여전히 `agent_task`로 남아있어 **등록 버그 자체는 미수정**(PRINCIPLES §8 참조, 코드레벨 검증 게이트 도입 검토 이월 유지).
- 신규 상신 #156~159(룰갭 4건, 전부 `dev_task` 정상 등록 확인)·L2 전결 #155(더 리버사이드 호텔 라운지 9308) — 등록 형식 정상.

---

## 16. 08:00 사이클 실측 (2026-07-07) — 10회 연속 완주, launchd/Vercel cron 변경 없음

- `agent_runs` 실측(최근 18h): 크론 43/43 `ok=true`, 실패 0건(33건 전부 성공) — 07-02 17:00부터 **10회 연속** 세션한도 무실패.
- `launchctl list | grep coffee` 재확인: §1 등록 9종 전부 로드 상태 그대로. `git log --since="07-06 17:41"` 21커밋(야간 자율개발 dev_task #173~183 + 사람 직접커밋 1건) 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표는 그대로 유효.
- §14에서 확인했던 dev_task 등록 원칙(action_type)은 이번 사이클 신규 상신 #186~189(품질본부, 전부 `dev_task`)에서도 정상 유지 — 재발 없음(PRINCIPLES §8 참조).
- 전날 발견된 13373류 승인-회귀 재발 여부: 오늘 신규 L2 전결 #184(13956)·#185(15501) 모두 cron-issues 자동집행 후 `published=false` 유지 확인(DB 실측) — #172(synthStore.ts 구조수정) 배포 이후 회귀 재발 없음.

---

## 17. 17:00 사이클 실측 (2026-07-08) — 11회 연속 완주, launchd/Vercel cron 변경 없음

- `agent_runs` 실측(08:50~17:40 KST 구간, 29건): 전 크론 `ok=true`, 실패 0건 — 07-02 17:00부터 **11회 연속** 세션한도 무실패.
- `launchctl list | grep coffee` 재확인(17:40): 등록 9종 전부 로드 상태 그대로(추가·제거 없음). `git log --since="07-08 08:50"` 11커밋(전부 dev_task 자율배포 #200·#210·#212·#213) 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표는 그대로 유효.
- **★ 신규 구조갭 발견(결재#211·#212)**: `dev_status`가 "배포대기"→"deploy_approved"로 자동승격되는 조건이 `chat-watch.mjs`(source=chat AND dev_autodeploy=true)뿐이라, self-audit(자율진단)발 결재는 구현이 끝나도 이 경로를 못 타 영원히 배포되지 않는 별도 파이프라인 갭이었음(#200 사례, 08:37 KST 멈춤). #211(배포확정 요청)이 이 문제로 CEO 폐기되고, #212가 근본수정 배포 후 #200 정상 배포 완료(`42395e7`). PRINCIPLES.md §8에 반영.

---

## 18. 08:00 사이클 실측 (2026-07-09) — 크론 44종(신규 cron-criteria-verify 편입), launchd 무변경

- `agent_runs` 실측(09:03 KST 조회): 크론 **44종 전부 `ok=true`, 실패 0건** — §4 신설 `cron-criteria-verify`(07:50·19:50 KST)가 오늘 07:50 첫 정기실행 성공 확인(43→44종 편입). 07-02 17:00부터 이어온 세션한도 무실패 기록 지속. `launchctl` 9종 무변경.
- **★ 대형 배포 세션(23:08 07-08 ~ 08:57 07-09, CEO 직접 8커밋)**: 비즈니스 기준 관제 플레인(criteria) 전면 신설 — Phase1(하드코딩 임계값 9종 DB 외부화 `efc18de`) + 자체 결함 2건 당일 발견·수정(`d335c70`) + 자율조직 편입/검증 에이전트 v1 신설(`cd122b1`, cron-criteria-verify 3종세트 등록 — 이번 사이클 신규 편입의 원인) + Phase2(오염게이트·검색가중치 외부화 `ada0a2d`, 키워드/리스트 외부화 `0c5dca8`, split-brain 결함 2건 당일 해소 `6f38628`). 스케줄 변경은 cron-criteria-verify 신설 1건뿐, 기존 43종 무변경.
- **🔴 실측 인시던트(08:54~08:57 KST, 약 3분)**: Phase2 A(`6f38628`)가 `'use client' → cafeProfile → charScore → criteriaLists → lib/db.ts` 임포트 체인을 형성해 홈 화면 전체가 "This page couldn't load"로 다운(SSR은 200이라 서버헬스·런타임에러 모니터링엔 미포착). CEO 본인이 3분 내 `2c988d4`로 즉시 수정·배포(원인=서버전용 `neon()` 클라이언트가 `DATABASE_URL` 부재 시 모듈 로드 시점 throw). 상세·재발방지 원칙은 JOURNAL-20260709.md·PRINCIPLES.md §3(운영본부) 참조.

---

## 19. 17:00 사이클 실측 (2026-07-09) — launchd/Vercel cron 변경 없음, 단 모니터링 침묵 발견(스케줄 변경 아님)

- `launchctl list | grep coffee`(17:52 KST) 재확인: §1 등록 9종 전부 로드 상태 그대로(추가·제거 없음). `git log --since="07-09 09:03"` 13커밋(dev_task #221·#224·#226·#227 자율배포 + `e370942` server-only 컴파일 트립와이어) 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표는 그대로 유효.
- **★ 스케줄 자체 변경은 아니나 유의**: `e370942`(11:40 KST 배포)의 `import "server-only"`가 로컬 launchd 러너(`audit-watch`·`dev-deploy`·`dev-pipeline`)의 heartbeat 기록 경로(`scripts/heartbeat.mjs`→`lib/agentLog.ts`→`lib/db.ts`)를 크래시시켜 **06:16 UTC(15:16 KST)부터 세 잡의 `agent_runs` 기록이 침묵**(DB 실측 확인, 17:52 KST 현재도 신규 row 0). 잡 자체(dev-deploy.mjs·dev-claim.mjs)는 `lib/db.ts`를 안 거쳐 정상 작동 확인됨 — **launchd 등록·트리거·cadence는 무변경**, 망가진 건 모니터링 가시성뿐. 근본수정은 CEO 결재대기 **#235**(상세는 JOURNAL-20260709.md·decisions#235). 이 표(§1·§4)는 갱신 대상 아님.
- 부수효과로 `lib/issues.ts` investigate 자동종결(6번)이 최신성 미검사 구조 결함으로 #229~250(8사이클) 좀비 재상신을 유발 — 이것도 스케줄 문제가 아니라 결재 자동화 로직 버그(#251 신규 상신, PRINCIPLES.md §9 갱신 참조).

---

## 20. 모니터링 블랙아웃 해소 확인 (2026-07-09 20:21 KST 실측) — 스케줄 원상복구, 변경 없음

- **완전 해소 확인**: CEO 직접커밋 `dd6cf27`(18:25 KST, `server-only` 제거로 로컬 tsx 워커 전멸 회귀 복구) + 결재 **#251** 20:04 KST 배포(`9951ffc`, staleness 미검사 구조 결함 수정)로 이중 차단. `agent_runs` 실측(20:21 KST): audit-watch 11:18Z(20:18 KST)·dev-pipeline 11:20Z·dev-deploy 11:21Z 전부 신규 row 정상 기록 재개 — §19의 15:16~20:04 KST 약 4h48m 침묵 종료.
- 결재 **#235**도 CEO 직접수정으로 근본원인 해소돼 기조실장 전결 `done` 종결(19번 §의 상신건). 8사이클·24건 좀비 investigate 재상신(#229~250) 패턴도 #251 배포 이후 재현 없음(#252~254 마지막 재상신분 전부 `done`, 신규 재발 0건).
- launchd/Vercel cron 편성 자체는 이번 블랙아웃 전 구간 내내 무변경(§1·§4 유효, 갱신 대상 아님) — 순수 모니터링 가시성 사고였음이 최종 확정.

---

*비서실장 에이전트 | 실측 2026-07-04 08:58 → 2026-07-05 17:56 → 2026-07-06 08:38 → 2026-07-07 08:44 → 2026-07-08 17:40 → 2026-07-09 09:03 → 17:52 → 20:21 → 2026-07-10 08:34 → 17:42 → 2026-07-11 08:34 갱신 | ★ 핵심 사이클 08:00·17:00 2회 | **이 파일 = 스케줄 기준선 — 변경 시 CEO 확인**

---

## 21. 08:00 사이클 실측 (2026-07-10) — launchd 9종 무변경, 크론 45종(discover-sweep 반영 완료), youtube-backfill 정지 원인 확정·복구검증은 오늘 16:30 대기

- `launchctl list | grep coffee`(08:34 KST) 9종 그대로(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill), 로드상태 동일 — §1 표 갱신 불요. `agent_runs` DISTINCT job 45종(07-09 08:00 44종 → discover-sweep 편입 완료 반영, §1에 이미 기재돼 표 변경 없음).
- **youtube-backfill "정지의심" 근본원인 확정(허위경보 아님)**: 마지막 정상실행 07-08 16:40 KST. 다음 정기실행(07-09 16:30 KST)이 `e370942`(server-only) 잔재로 `Cannot find module 'server-only'` 크래시(`/tmp/coffee-youtube-backfill.err` 실측 확인, `lib/db.ts`→`synthStore.ts` 임포트 체인) → `agent_runs` row 자체가 안 남음. 근본원인은 `dd6cf27`(07-09 18:25 KST)로 이미 해소됐으나, **cadence가 1일 1회(16:30)** 라 실제 복구 여부는 **오늘 07-10 16:30 KST 정기실행에서만 검증 가능** — 그 전까지 "정지의심" 표시가 계속 뜨는 건 스케줄 결함이 아니라 정상(다음 실행 대기 중).
- **cron-selfaudit 자체 dedup 버그 발견**(결재 #266, pending): 알림 ikey에 경과시간(Xh)이 포함돼 동일 정지건이 사이클마다 새 알림으로 중복 생성(#264→#265→#267 연쇄). 크론 편성 자체 결함 아니고 자율진단 dedup 로직 코드버그 — CEO 승인 대기.
- 그 외 §1~§20 무변경(신규 추가·제거·트리거 변경 0건).

---

## 22. 17:00 사이클 실측 (2026-07-10) — youtube-backfill 정지의심 완전 해소, launchd/Vercel cron 무변경, 신규 모델방침 반영(스케줄 대상 아님)

- `launchctl list | grep coffee`(17:42 KST) 9종 그대로(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill), 로드상태 동일 — §1 표 갱신 불요. `git log --since="08:34"` 15커밋 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표 그대로 유효. `agent_runs` 최근 9h 실패 0건(32건 전건 성공).
- **§21 youtube-backfill "정지의심" 종결**: 오늘 16:30 KST 정기실행(cadence 1일 1회)이 `dd6cf27` 수정 이후 첫 정상 완주(추가86·처리90·남은16160, `agent_runs` 신규row 확인) — 어제부터 이어온 정지의심 표시가 정상 데이터 부재(대기)였을 뿐 실제 결함이 아니었음이 최종 확증. 재발 시 참조할 근본원인 이력은 §21 그대로 보존.
- **launchd 스케줄과 무관한 신규 CEO 방침 1건 참고(스케줄 표 변경 대상 아님)**: `4f8ef3e`(16:44 KST) — dev-agent 코드작업 기본모델을 opus 고정→sonnet5 기본/opus는 risk=high(스키마·마이그레이션·광범위리팩터·핵심로직)만로 변경. 크론 잡 자체 실행주기·트리거는 무변경, 잡 내부에서 호출하는 LLM 모델 티어만 조정된 것이라 이 표(§1·§2·§4)엔 반영 대상 없음(참고로만 기록).
- 그 외 신규 추가·제거·트리거 변경 0건.

---

## 23. 08:00 사이클 실측 (2026-07-11) — launchd 9종·Vercel cron 45종 전부 무변경

- `launchctl list | grep coffee`(08:34 KST) 9종 그대로(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill), 로드상태 동일 — §1 표 갱신 불요. `git log --since="07-10 17:42"` **55커밋**(대부분 야간 자율개발 dev_task #280~#297 연쇄 배포 — 챗봇 기능강화·대화기록저장·모델배지·유입경로필터·근접매칭가드·검색rerank캐싱 등) 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표 그대로 유효. `agent_runs` 최근 16h 실패 0건.
- **참고(스케줄 대상 아님)**: 야간 사이클에 자율진단이 "배포완료≠실행완료" 구조갭 4연쇄(coord#163→165→170→171, 07-10 22:57~23:02 KST)를 재검증해 즉시 handoff(#171~175 전건 07-10 23:19 KST까지 resolved) — 오염 리뷰 정리 5곳 중 4곳 offctx_rate=0 확인, H36(브랜드명 부분매칭 오귀속) 3곳(8489·7242·13313) 즉시 비공개 완료. 크론 편성 자체와 무관한 데이터정합성 사안이라 PRINCIPLES.md §8에 원칙 반영, 이 표는 갱신 대상 없음.
- 신규 결재대기 1건(#297, 룰갭 P28) 외 이상 없음.

---

## 24. 17:00 사이클 실측 (2026-07-11) — launchd 10종·Vercel cron 45종 전부 무변경

- `launchctl list | grep coffee`(17:37 KST) **10줄**(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill·**self-audit**) — §1 표(로드 10종, self-audit 포함) 그대로, 추가·제거·트리거 변경 0건. *(참고: §21~23 텍스트가 "9종"으로 self-audit을 이름 나열에서 누락해왔으나 §1 표 자체는 처음부터 10종 전체를 담고 있었음 — 실제 변경 아님, 표기 정정만.)*
- `git log --since="07-11 08:38"` 21커밋(#297 P28 배포, naver 429 자가치유 버그 수정 3건, #299·#301·#302·#306·#307 dev_task 배포 5건) 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표 그대로 유효. `agent_runs` dev-agent 1건 트랜지언트(16:39 KST, #307 관련 claude-p 무응답) 외 실패 0건, 2분 내 자가복구·배포 완주(#308 조사종결).
- 신규 결재대기 1건(#311, 룰갭 P29) — 단 `action_type='agent_task'`로 등록돼 dev_task 파이프라인 미픽업 위험(JOURNAL·PRINCIPLES §8 참조, 스케줄표 대상 아님).

---

## 25. 08:00 사이클 실측 (2026-07-12) — launchd 10종·Vercel cron 45종 전부 무변경

- `launchctl list | grep coffee`(08:39 KST) **10줄** 그대로(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill·self-audit) — §1 표 갱신 불요, 추가·제거·트리거 변경 0건.
- `git log --since="07-11 17:40"` **27커밋**(야간 자율개발 dev_task #316·#321·#322 배포 3건 + naver 429 구분수정 등) 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표 그대로 유효. DIGEST 크론헬스 45/45 정상.
- **참고(스케줄 대상 아님)**: 00:09~01:22 KST 야간 자율개발 dev_task 3건(#321·#322·#316) 당일배포 완주. 05:16 KST `coord_overdue`(ref=178) 이벤트 트리거로 self-audit 1회 기동(트리거 자체는 프로세스 갭으로 판명, 크론 편성과 무관). 08:00 정기 사이클에서 coordination#178 실 원인규명(룰갭발굴팀) 완료·resolved 전환, 결재#326 done, 신규 결재#327(P0 크레딧 재소진)·#328(룰갭 P30) 상신 — 상세 JOURNAL-20260712.md 참조.
- ⚠️**관측(스케줄 대상 아님, self-audit-agent 라벨링)**: `selfaudit-report-20260712-1130.md` 파일이 실제로는 08:02 KST에 생성됐는데 파일명·본문 모두 "11:30 KST 정기 사이클"로 표기됨(정합성조사팀 report-20260712.md 동료평가에서 발견) — 사이클 라벨 결정 로직이 실제 실행시각과 어긋난 것으로 보임, self-audit-agent 점검 권고(WORK-ORDER 반영).

---

## 26. 17:00 사이클 실측 (2026-07-13) — launchd 10종·Vercel cron 45종 전부 무변경, chief-secretary-agent 케이던스 변경(2×→1×) 첫 적용일

- `launchctl list | grep coffee`(17:44 KST) **10줄** 그대로(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill·self-audit) — §1 표 갱신 불요, 추가·제거·트리거 변경 0건. `git log --since="07-12 17:53"` 5커밋 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표 그대로 유효. `agent_runs` 실측(18h): 45개 잡 전부 최신 row `ok=true`, 실패 0건.
- **§2 신규 케이던스 첫 실행 확인**: 07-12 CEO 결정(chief-manager-agent·chief-secretary-agent 08:00·17:00 2×→17:00 1×)에 따라 오늘은 `chief-secretary-agent`(본 세션)가 **17:00 1회만** 실행 — `agent_runs`에 chief-secretary-agent job 자체가 08:00 시점엔 존재하지 않았음(정상, 케이던스 설계대로). `JOURNAL-20260713.md`는 08:00~17:00 하루 전체를 이번 1회 세션에서 소급 종합해 작성.
- **⚠️신규 관측 — 조간회의(월요일) 편성 vs 실제 CEO 결정 불일치 문서화**: 오늘 EXECUTIVE-20260713-1741.md(chief-manager-agent)가 "월요일 08:00 조간회의 미실행, MEETING-latest.md 2주+ 정체"를 이상 신호로 지적했으나, 본 §1 상단 기록에 따르면 **조간회의는 2026-07-04 CEO 결정으로 이미 폐지**(라운지 주2회+상시 협업 대체)돼 애초에 생성되지 않는 것이 정상 설계다. chief-manager-agent가 이 폐지 이력을 인지하지 못하고 매주 월요일 재지적할 가능성 — 코드/데이터 문제 아님, **비서실장 소관 문서 정합성 이슈**로 이 표에 기록. 조치는 불필요(폐지 결정 유효), 재지적 반복 시 chief-manager-agent 프롬프트에 폐지 이력 참조 추가를 다음 dev_task 후보로 검토할 것.
- CEO 직접 라이브 개발 2건(13:48·16:45 KST, 홈 500m 반경 리스트 + 위치버튼 통일·PWA 설치유도) — launchd/cron 스케줄과 무관(코드 배포, CEO 셀프게이트), CEO-ORDERS CEO-16 참조.

---

## 27. 17:00 사이클 실측 (2026-07-14) — launchd 10종·Vercel cron 45종 전부 무변경, chief-secretary 신규 케이던스 2일차

- `launchctl list | grep coffee`(17:42 KST) **10줄** 그대로(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill·self-audit) — §1 표 갱신 불요. `git log --since="07-13 17:44"` 16커밋(dev_task #367~370 배포 4건 + CEO 직접 cron-sentinel 커밋 3건, 아래 참고) 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표 그대로 유효. `agent_runs` 3사이클(08:00·12:00·17:00) 전 구간 실패 0건.
- **참고(스케줄 대상 아님, launchd/Vercel cron 편성 자체 무변경)**: CEO가 07:43·07:54·08:48 KST 직접 커밋 3건으로 `web/app/api/cron-sentinel/route.ts`에 명소·행사 오염 탐지기+약한이름(1글자) 흡수오염 탐지·자율조치를 추가 — 잡의 **실행주기·트리거는 무변경**, 잡 내부 검사 로직만 확장(CEO-ORDERS CEO-17). 이 표(§1·§4) 변경 대상 없음.
- **⚠️신규 관측(코드/스케줄 아님, 프로세스 갭)**: decisions#369(09:15 상신)·#370(15:34 상신) 둘 다 CEO 승인·빌드 완료 후 `dev_status` 자동승격 협소 갭(PRINCIPLES §8, `chat-watch.mjs`가 `source=chat`만 처리)에 걸려 **15시간+ 무배포 정체** — #370 자신이 이 갭을 고치는 dev_task였음에도 스스로 같은 갭에 재귀적으로 갇힘(17:01 selfaudit 확인). 17:09~17:11 KST CEO 직접 개입(챗 트리거 추정)으로 양쪽 다 배포 완료. launchd/cron 편성과는 무관한 애플리케이션 레벨 갭 — 상세 JOURNAL-20260714.md.
- 그 외 신규 추가·제거·트리거 변경 0건. 다음 사이클(07-15 08:00)은 신규 케이던스상 chief-secretary 미실행 — 17:00 세션에서 종합 예정.

---

## 28. 17:00 사이클 실측 (2026-07-16) — launchd 10종·Vercel cron 45종 전부 무변경, CEO 직접 코드배포 5건(토스빌링 신설 포함)

- `launchctl list | grep coffee`(17:39 KST) **10줄** 그대로(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill·self-audit) — §1 표 갱신 불요, 추가·제거·트리거 변경 0건. `agent_runs` 실측(당일 08:00~17:39 KST 구간): 45개 잡 전부 최신 row `ok=true`, 실패 0건.
- **참고(스케줄 대상 아님, launchd/Vercel cron 편성 자체 무변경)**: CEO가 06:58~13:14 KST 직접 커밋 5건(`e8aaeff`·`925a8da`·`e2753d0`·`eaf87f1`·`fdd50c2`) — 이용약관 데이터보관 문구 수정, **토스페이먼츠 정기결제(빌링) 모듈 신설**, DB 요청경로 성능최적화, recharts 지연로드(owner/admin 차트 next/dynamic), main↔feat/toss-billing 병합. 전부 코드/기능 추가이며 **잡의 실행주기·트리거는 무변경** — 이 표(§1·§4) 변경 대상 없음. 상세는 CEO-ORDERS CEO-18·JOURNAL-20260716.md.
- 07-15 세션은 §28 신설 없이 상단 블록쿼트 재확인 문구로만 기록됐음(누락 아님, 스타일 차이) — 이번 사이클부터 번호 섹션 재개.
- 다음 사이클(07-17 08:00)은 신규 케이던스상 chief-secretary 미실행 — 17:00 세션에서 종합 예정.

---

## 29. 17:00 사이클 실측 (2026-07-17) — launchd 10종·Vercel cron 45종 전부 무변경, CEO 직접 sentinel 확장 2건

- `~/Library/LaunchAgents/com.coffee.*` 실측(17:47 KST, `launchctl list` 권한거부로 plist 파일목록으로 대체 확인): 등록 10종(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill·self-audit) + disabled 2종(dongbackfill·qualityaudit) — §1 표와 정확히 일치, 추가·제거·트리거 변경 0건. `git log --since="07-16 17:39"` 6커밋 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표 그대로 유효.
- **참고(스케줄 대상 아님)**: CEO가 17:05·17:14 KST 직접 커밋 2건(`c36715e`·`9a4a2b6`, Claude Sonnet 5 co-author) — `web/app/api/cron-sentinel/route.ts`에 프랜차이즈 지점간 오염 탐지기(`scanFranchiseBranchPollution`)·흔한단어/동음이의어 이름 오염 탐지기(`scanGenericTermPollution`) 2종 신설, 오늘 전수감사로 확정된 패턴 코드화. **잡의 실행주기·트리거는 무변경** — 이 표(§1·§4) 변경 대상 없음. CEO-ORDERS CEO-19·PRINCIPLES.md §3 반영.
- 그 외 야간~낮 자율개발 dev_task #393(브라운테일커피 로그인·체험활성화 후속, 13:18~19 배포)·품질 회귀수정(`81924a9`, quoteMatchConfidence bareWeak 4자이하 오탐 2681건) 포함, 신규 launchd/Vercel cron 변경 0건.

---

*비서실장 에이전트 | 2026-07-13 17:44 → 2026-07-14 17:47 → 2026-07-16 17:39 → 2026-07-17 17:47 갱신 추가 | ★ chief-secretary 케이던스: 2026-07-12 CEO 결정으로 08:00·17:00 2회 → **17:00 1회**로 변경(§2). 위 상단 "핵심 사이클 2회" 표기는 전사 공통 운영 리듬 기준선이며 chief-manager/chief-secretary 자체 실행 빈도만 1회로 조정된 것— 혼동 방지용 헌법파일(chief-secretary-agent.md) 동기화는 미완료 이월 항목(5사이클째, WORK-ORDER 참조)*

---

## 30. 17:00 사이클 실측 (2026-07-19) — launchd 10종·Vercel cron 46종 전부 무변경, CEO 직접 sentinel 신규탐지기 2건

- `launchctl list` 직접조회는 이번 세션도 권한 미승인(비대화형)으로 스킵 — `~/Library/LaunchAgents/com.coffee.*.plist` 파일목록 대체 확인(17:44 KST): 등록 10종(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill·self-audit) + disabled 2종(dongbackfill·qualityaudit) — §1 표와 정확히 일치, 추가·제거·트리거 변경 0건. plist `StartCalendarInterval` 실측도 §1·§2 표 그대로(chief-manager 08·12·17시, self-audit 11:30·15:30·21:30 등). `git log --since="07-18 17:47"` 12커밋 중 `vercel.json`·`*.plist` 변경 0건 — §4 Vercel cron 46종 표 그대로 유효(DIGEST 08:00·EXECUTIVE 17:43 실측 46/46 정상, `agent_runs` 실패 24h 0건).
- **참고(스케줄 대상 아님)**: CEO가 00:41·01:19 KST 직접 커밋 2건(`bcf7a7a`·`f1da454`) — `web/app/api/cron-sentinel/route.ts`에 **문구형 이름 오염 탐지기** 신설("바닷가에서카페" 사후 대응) + 지점표식(○○점) 제외 FP 정정. 07-14·07-17에 이은 sentinel 탐지기 확장 계열(CEO-17·19)의 연속 — **잡의 실행주기·트리거는 무변경**, 잡 내부 검사 로직만 확장. CEO-ORDERS CEO-20 반영.
- **★ 결재#395(69곳 검증배지 교차오귀속) 47h+ 방치 해소 + 신규 파이프라인 구조 발견**: 08:40 KST 기획조정실장이 확정 2건(id14779 재합성큐잉·id15799 기해결확인)을 L2 전결로 직접 집행·종결, 잔여 51그룹 분류+근본원인 코드조사는 결재#410(dev_task, L3, CEO 승인대기)으로 분리 상신. 이 과정에서 coordination#215(경영지원팀 진단)가 **`action_type='agent_task'` 승인건을 픽업하는 결정론 컨슈머가 코드에 전무**함을 확인(dev_task=dev-claim.mjs 대응 있음, agent_task는 없음) — 다만 chief-manager-agent 최종 판단은 "설계상 기조실장 수동배분 대상(코드결함 아님)"으로 재확인, resolved 종결. §8 dev_task 오분류 계열과는 **별개의 새로운 파이프라인 패턴**이라 PRINCIPLES.md §8에 반영. 이 표(§1·§4)는 스케줄 변경 대상 없음(파이프라인/결재 로직 사안).
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건.

---

*비서실장 에이전트 | … → 2026-07-18 17:47 → 2026-07-19 17:44 갱신*

---

## 31. 17:00 사이클 실측 (2026-07-22) — Vercel cron 46종 전부 무변경, dev-agent 1회성 blip 완전해소·22커밋 배포 완주

- `launchctl list` 직접조회 이번 세션도 권한 미승인(비대화형)으로 스킵 — `git log --since="07-21 17:48"` **22커밋** 중 `vercel.json`·`*.plist` 변경 0건, `web/agents/*.plist` 관련 파일 변경 없음 — §1·§4 launchd 10종·Vercel cron 46종 표 그대로 유효. `agent_runs` 실측: 08:00 이후(당일) 실패 0건 확인.
- **dev-agent ❌ 표시 완전 해소**: DIGEST(08:00 생성)에 남아있던 "❌dev-agent 3~3.5h전" 표시는 `agent_runs.ran_at` UTC 04:32(=KST 13:32) 1회성 claude-p 무응답 blip — 08:00 이후 재발 0건, 결재#431(self-audit 13:36~15:30 반복확인)로 조사완료·종결 확인. 크론 자체는 현재 46/46 정상.
- **22커밋 배포 완주(#421~#432)**: 결재#421(rulegap P46/47/48, "DB만 배포오류 stale — deployed로 정합화")·#422(chat-watch.mjs dirty가드, "tracked 변경 정리돼 해제 확인")·#423(룰갭P51 무배포 리스트)·#424(coord#226 FAQ구조화)·#425(구독상태 구분표시)·#427(coord#231 3차재상신 rulegap+**신규기능**: 사장님發 구독전환요청 신호+CEO알림+대시보드)·#428(coord#227 재확인)·#429(coord#225 SLA위반 에스컬레이션 — 프랜차이즈 형제지점 매칭 파이프라인 지점앵커 근본수정, `f327824`)·#430(#429로 근본수정 완료 확인, 잔여 데이터정정은 #432 L2 즉시전결)·#431(dev-agent blip 조사종결)·#432(잔여 오귀속 6곳 재합성 큐 재등록, L2) — 전건 `done`, 당일 배포·완결. CEO 직접 커밋 1건(`fea2850` 13:26, 관리자 알림메일 env우회 제거·`dongnecoffeenote@gmail.com` 고정, 코드 안전성 강화).
- **chief-secretary-agent.md 헌법파일 케이던스 동기화 — ★확인 결과 이미 완료**: 07-13부터 9사이클째 "미동기화" 이월 표기가 누적됐으나, 이번 세션이 파일 헤더를 직접 재확인한 결과 이미 "핵심 사이클 하루 2회 — 08:00·17:00"(전사 공통 리듬 기준선)로 정확히 기술돼 있고 stale한 "1회" 문구가 실제로 존재하지 않음 — **이월 항목 종결**(PRINCIPLES.md §9 정정 반영). 언제 수정됐는지는 비서실장 읽기전용 권한상 추적 불가(git 미추적 디렉토리)이나, 현재 상태는 정상.
- **⚠️미해소 지속**: 인천 신설구 area 태그 백필 128건 — 07-14 최초 제안 이후 관련 decisions/coordination row 0건(DB 재확인), **10사이클째 완전 방치**. coordination#94(경험본부 리텐션) 18.3일째, decisions#385(07-15) 재배정 예고 7일째 미집행.
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건.

---

## 32. 17:00 사이클 실측 (2026-07-23) — launchd 10종·Vercel cron 46종 전부 무변경, ★DIGEST 미인입 감시 로직 자체의 오탐 확정(품질본부)

- `launchctl list | grep coffee`(17:42 KST 직접실행, 이번 세션 권한 승인됨) **10줄** 그대로(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill·self-audit) — §1 표와 정확히 일치, 추가·제거·트리거 변경 0건. `git log --since="07-22 17:55"` **21커밋** 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표 그대로 유효.
- **★핵심 발견 — DIGEST "제안서 미인입 감시" 표시 로직 자체의 오탐 확정(coordination#234→decisions#450, 07-23 01:41 완료)**: DIGEST가 12h+ 된 rulegap/redteam/selfaudit 제안서 25건을 "미인입 의심(결재행 미생성)"으로 표시하고 있었으나, 품질본부(룰갭발굴팀)가 직접 코드(grep)·DB 대조한 결과 최소 P46/P47/P48 3건은 **decisions#428(07-22, done)이 실제로 코드 배포까지 완료**돼 있었음 — `make-digest.mjs`의 미인입 매칭이 "결재 제목 문자열 ↔ 원본 제안 파일명"을 대조하는 방식으로 추정되는데, #428의 title이 "P46/P47/P48" 약칭만 담고 원본 파일명(`rulegap-proposals-20260719-0813.md` 등)을 담지 않아 매칭 실패 → 실제로 이미 처리된 건이 계속 미인입으로 오탐 표시됨. **근본원인은 결재 파이프라인이 아니라 DIGEST 표시(감시) 로직 자체**. 반면 같은 배치에서 P49·P50(rulegap-proposals-20260721-0814/1213.md)은 실제로 미생성이 맞아 이번 사이클 decisions#448·449로 정상 상신·배포 완료 — 즉 25건 전부가 오탐인 것은 아니고 **개별 실측 없이는 진짜/오탐 구분 불가**. 이 표(§1·§4)는 launchd/Vercel cron 편성 자체와 무관해 변경 대상 없음, PRINCIPLES.md §8에 신규 항목 반영·WORK-ORDER에 잔여 22건 개별 재확인 지시.
- **coord#225(프랜차이즈 지점간 리뷰증거 교차오귀속) 재발 확인(coord#235→decisions#451, 07-23 01:44 완료)**: 07-22 13:34 배포된 근본수정(#429) 이후에도 신규 합성분에서 동일 패턴 재발(#6179/#19576 베이커리차차 지점간 리뷰공유, #1689/#3611 베즐리 주소중복) 확인 — #429가 기존 6곳은 해소했으나 지점 특정 로직이 미완결로 판단, 08:39 KST decisions#458(agent_task, 56쌍 전수 재검증)로 후속배분. coord#225 원본 자체는 2.2일째 기획조정실장 재배정 단계에서 정체 지속(coord#240이 스팟체크로 지적).
- **coord#94(경험본부 리텐션) 19.3일째 방치 → 08:39 KST 강제상신 완료(decisions#457, pending·dev_task)**: 지난 사이클 WORK-ORDER 지시가 이번 사이클에 실행으로 이어짐 — 잔여 2과제(재방문훅 PWA/알림, 유입경로 직접미상 188건 규명) 코드변경 필요항목으로 CEO 결재 대기 전환. coord#94 자체 status는 아직 accepted(미종결) — 다음 사이클 CEO 승인·착수 여부 확인 필요.
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건. `agent_runs` 오늘 실패 0건(DIGEST 46/46 정상).

---

## 34. 17:00 사이클 실측 (2026-07-26) — launchd 10종·크론 46종 전부 무변경, CEO 일요일 직접개발 29커밋(스케줄 대상 아님)

- `launchctl list` 직접조회 이번 세션도 권한 미승인(비대화형, `Bash` 승인거부)으로 스킵 — `~/Library/LaunchAgents/com.coffee.*.plist` 파일목록 대체 확인(17:2x KST): 등록 10종(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill·self-audit), 최종수정일 전부 07-24 이전 그대로(신규·삭제 0건) — §1 표와 정확히 일치. `git log --since="07-25 17:38"` `web/lib/jobTeams.ts` 변경 0건 — §4 크론 46종 표 그대로 유효. `agent_runs` 24h 실패 0건(46/46 정상), DIGEST와 일치.
- **참고(스케줄 대상 아님)**: CEO가 00:09~17:24 KST 29커밋 직접 배포 — 분석봇필터 5건, DAU 43% 오탐 긴급수정(관제탑 봇필터 단일출처 위반 재발, PRINCIPLES.md §5 반영), 인천 신설구 지역필터 대수술 6건, 사장님 랭킹 타이브레이크, 홈 정체성 디자인 반복 12건(스프링제본 시도 후 제거). CEO-ORDERS.md CEO-24~27 반영. **잡의 실행주기·트리거는 무변경.**
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건.

---

## 36. 17:00 사이클 실측 (2026-07-29) — launchd 10종 무변경, ★Vercel cron 47종째 신설(cron-costwatch), CEO 재발방지 지시 반영

- `git log --since="07-28 17:52"` 15커밋 확인 — `web/vercel.json`·`web/lib/jobTeams.ts` **변경 있음**(`2bb2f3a`, 17:25 KST, CEO 직접): §4 Vercel cron 표 **46→47종**으로 갱신(cron-costwatch 신설, 매일 18:20 KST). `*.plist`(launchd 10종)는 무변경 — §1 표 그대로 유효.
- **배경(CEO 지시, 2026-07-29)**: "그런 일들이 원천적으로 일어나지 않아야지... 발견해서 빨리 조치할 수 있게 해줘야 정상"(youtube-backfill 반복조회 버그가 한 달간 조용히 ~660GB를 읽어 청구서로 처음 발견된 사고에 대한 재발방지 지시). CEO가 직접 워치독을 신설·배포까지 완료 — 결재 절차 대상 아님(L3 셀프 게이트).
- 그 외 오늘 15커밋 중 나머지 8건은 결재#536~539(정합성조사·룰갭 4건, 08:29~34 KST 배포)+선행 dev(#536·537·538·539) 커밋 — 전부 코드 배포이며 잡 자체의 실행주기·트리거는 무변경.
- `agent_runs` 오늘 실패 0건(DIGEST 08:00 46/46 정상, 17:39 재확인 시점 신규 실패 0건). WORK-ORDER §해소 참조(#536~539 전량 done, #540·541 L2 unpublish 자동집행 완료).
- 그 외 신규 launchd 추가·제거·트리거 변경 0건.

---

*비서실장 에이전트 | … → 2026-07-19 17:44 → 2026-07-22 17:55 → 2026-07-23 17:42 → 2026-07-26 17:29 → 2026-07-29 17:47 갱신*

---

## 33. 17:00 사이클 실측 (2026-07-24) — launchd 10종·크론 46종 전부 무변경, 3대 장기방치건(coord#94·#225·#240) 동시 해소

- `launchctl list | grep coffee`(17:42 KST) **10줄** 그대로(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill·self-audit) — §1 표와 정확히 일치, 추가·제거·트리거 변경 0건. `git log --since="07-23 17:42"` **25커밋**(dev_task #465·466·472·477·478·479 + CEO 직접 분석버그수정 2건) 중 `vercel.json`·`*.plist` 변경 0건 — §4 cron 표 그대로 유효. DIGEST 46/46 정상.
- **참고(스케줄 대상 아님)**: CEO가 14:52·15:59 KST 직접 커밋 2건(`bf5dc5a`·`3af377a`) — 오전 배포된 관제탑 트래픽 패널 봇제외 기능(#472, 08:58 배포)의 판정로직을 당일 중 2차례 실효화 수정(초판 과빡빡→봇172중1명만 걸름 수정, 이후 유입집계를 "확실한 사람만"으로 재정의). 잡의 실행주기·트리거는 무변경.
- **★핵심 진전(스케줄 아닌 결재/협업 사안, 기록용)**: coord#94(경험본부 리텐션, 20일 방치)가 03:40 KST CEO 직접 종결 — 재방문훅(PWA/웹푸시) dev_task는 오늘만 3차례(#462·473·474) CEO 반려, 유입경로 188건 조사(#463)만 승인. coord#225·#240(프랜차이즈 지점간 오염 재발, 2.2일 정체)은 08:36 KST 기획조정실장이 decisions#458(56쌍 전수재검증, approved)로 이관·종결. **인천 신설구 area 태그 백필 128건도 08:38 KST decisions#487로 기획조정실장 직접집행·완료**(11사이클째 방치 끝에 해소) — 상세는 JOURNAL-20260724.md·WORK-ORDER 참조.

---

## 35. 17:00 사이클 실측 (2026-07-27) — launchd 10종·크론 46종 전부 무변경, ★raw 데이터 봇오염(coord#262/#523) 신규 발견 + coord#260 #490 정체원인 정정(태만 아님)

- `launchctl list` 직접조회 권한 미승인으로 스킵 — plist `StartCalendarInterval` 직접 실측(§상단 헤더 참조) 전건 §1·§2 표와 일치. `git log --since="07-26 17:29"` 34커밋 중 `vercel.json`·`*.plist`·`jobTeams.ts` 변경 0건 — §4 표 무변경. DIGEST(08:01) 46/46 정상, 이후 신규 agent_runs 실패 0건(17:37 재확인).
- **★신규 발견(coordination#262→decisions#523, L3 pending, 08:28~30 KST 상신)**: 마케팅팀이 coord#248(07-25, dev_task#472 배포 후 "봇 재발 0건" 확인)을 스스로 재검증한 결과, 그 확인은 07-25 17:35 시점 스냅샷일 뿐이고 실제로는 direct 소스 봇오염(meta-externalagent 등 facebook 링크프리뷰 크롤러)이 매일 21:00~익일02:00 KST 주기로 재발 중(07-25~27 direct 신규 100건 중 86건이 봇)임을 실측 확인. #472는 **관제탑 화면에서 봇을 숨기는 것**뿐이라 `user_consents`/`traffic_events` 수집 원본 자체는 계속 오염 누적 — 마케팅팀 자체 지표(UA정규식 필터)는 정확하나 원천 차단(수집단계 UA필터·rate-limit)은 마케팅 권한 밖이라 성장본부·개발팀에 이관, CEO 결재 상신. **이 표(§1·§4) 스케줄 변경 대상 아님** — 잡 자체가 아니라 데이터 수집 파이프라인의 필터링 범위 문제. WORK-ORDER·PRINCIPLES.md §5에 반영.
- **★#490 정체원인 정정(coordination#260, 자율진단, 08:04 KST)**: 품질본부·전략기획본부가 반복 재상신해온 "#490(needs_llm 임계선 조치방침) 48h+ 미착수"는 태만이 아니라 구조적 차단으로 확인 — `.ai-paused` 플래그(2026-06-16 CEO 지시, "해제 금지" 명시)가 `run-deep-judge-agent.sh`를 41일째 전면 차단 중이라 판정 자체가 정지 상태이고, #490의 "우선순위 재조정" 방침은 판정이 재개돼야 의미가 생김. 자율진단은 이 건을 "미집행 태만"이 아니라 "판정 재개 대기(CEO 지시 필요)"로 상태 전환 권고 — WORK-ORDER §품질본부 지시 문구 정정 반영(다음부터 #490을 방치 항목으로 재상신하지 않도록).
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건.

---

## 37. 17:00 사이클 실측 (2026-07-30) — ★§1 표 2일 드리프트 발견·정정: audit-watch·dev-pipeline·dev-deploy **60분화 반영 누락**

- `launchctl list | grep coffee`(17:3x KST, 이번 세션 권한 승인) **10줄** 그대로(no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·chat-watch·audit-watch·youtube-backfill·self-audit) — 잡 등록·로드상태 자체는 §1과 일치, 추가·제거 0건.
- **★핵심 발견 — §1 표가 실제 plist와 2일간 어긋나 있었음**: `PlistBuddy -c "Print :StartInterval"` 직접 실측 결과 `audit-watch`·`dev-pipeline`·`dev-deploy` 3종 전부 **3600초(60분)**로 확인 — 그러나 이 표(§1, 27번째 줄대)는 07-02 이후 계속 "5분·5분·2분"으로 표기돼 있었다. plist 파일 mtime은 **Jul 28 21:28**(원 변경 시점 추정), CEO 커밋 `3ef99b8`(07-29 20:07, "전면 보안·비용·무결성 하드닝")의 코멘트가 "오늘 폴링 60분화 반영 시 놓친 관제화면 표기(5분/2분→60분) 정정"이라며 `web/lib/jobTeams.ts`(관제탑 단일출처)의 라벨은 이미 60분으로 고쳤으나, **이 SCHEDULE.md 원본 표는 그 이후로도 갱신되지 않은 채 남아 있었다** — 즉 관제탑 화면(jobTeams.ts 파생)은 정확했지만, 비서실장 문서(§1)만 최대 2일간 스테일. 이번 사이클에 §1 표를 60분으로 정정 완료(3줄).
- **영향 평가**: `audit-watch`·`dev-pipeline`은 5분→60분(12배 완화)이라 이벤트 감시·개발클레임 지연이 최대 1h로 늘었으나 치명적이지 않음. **`dev-deploy`는 2분→60분(30배)**로, CEO 승인 후 실배포까지 최대 1h 지연 가능 — [[decision-pipeline-completion]] 메모리의 "승인=집행 아님" 우려와 직결되므로 향후 "approved인데 배포 안 됨" 관측 시 이 60분 상한부터 우선 확인할 것(코드결함 오판 방지).
- **비용절감 배경 확인**: 같은 커밋(`3ef99b8`)에 `/api/discover` s-maxage 누락 수정(홈 진입마다 전량 재조회 방지)·`healNonCafeByReview` 전송량 급감(46GB→WHERE 사전필터)·9개 무인증 라우트에 CRON_SECRET 가드 신설(익명 curl 유료API 남용 차단)·대량 오비공개 차단기(HEAL_UNPUB_CAP=50)·autoCorrect 실패 은폐 수정(`.catch(()=>{})` 제거)까지 5대 항목 CEO 직접 하드닝 — **스케줄(§1·§4) 자체와 무관한 코드 변경**이나 폴링주기 항목만 이 표에 영향.
- `git log --since="07-29 17:47"` 확인: `vercel.json` 변경 0건(§4 Vercel cron 47종 표 그대로 유효), `web/lib/jobTeams.ts` 변경 1건(위 라벨 정정, 신규 크론 아님). 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건. `agent_runs` 24h 실패 0건(DIGEST 47/47 정상).
- **web/ 루트 임시 스크립트 파일 누적 확인(경미·기록용)**: `git status`에 미추적 파일 680개, 그중 최소 123개가 `_*_tmp.mjs` 패턴(각 에이전트가 DB조회용으로 생성 후 미삭제) — 07-29 11:30~07-30 17:2x 사이 누적, 서비스 영향 없으나 정리되지 않으면 무한 증가 구조. 비서실장은 읽기전용이라 직접 삭제하지 않음, 각 에이전트 실행스크립트에 자체 정리(`rm`) 습관화 권고(다음 WORK-ORDER 참고사항).

---

## 38. 17:06 사이클 실측 (2026-08-13) — ★★11일 공백(08-02→08-12) 근본원인 확정: EVENING 게이트 하드코딩이 크론 재클러스터링에 영구 침묵

**발견 경위**: 이번 세션이 일지·SCHEDULE·WORK-ORDER·PRINCIPLES·CEO-ORDERS 5개 산출물 전부가 2026-08-02 17:2x~17:3x 이후 갱신 정지돼 있음을 파일 mtime으로 최초 발견. `agent_runs` 직접 쿼리(neon)로 대조한 결과 `chief-secretary-agent`·`chief-manager-agent`·`search-quality-agent`·`marketing-agent`·`b2b-sales-agent` 5개 리프에이전트가 정확히 같은 시점부터 263h(11일)간 미실행 — 반면 `chief-manager`(오케스트레이터 launchd 잡) 자체는 4h 주기로 계속 정상 실행 중이었고, 품질가드 3종(정합성·룰갭·레드팀)·자율진단·발굴·폐업 등 08/12시 담당 잡도 전부 정상 가동(decisions/coordination/git log로 소급 실측, JOURNAL-20260803~20260812.md 참조) — **오케스트레이터는 살아있는데 그 안의 특정 5개 하위 실행만 조용히 스킵되는 구조적 증상**.

**근본원인**: `agents/run-daily.sh`의 저녁(EVENING) 블록 게이트가 `HOUR = "17"` 문자열 비교로 하드코딩돼 있었다. 2026-08-03 12:48~13:48(`c43f768`→`8da8c31`, CEO 직접 Neon 컴퓨트 절감 커밋) 전 크론이 하루 7개 창→낮 4개 창(KST **08·12·16·20**)으로 재클러스터링되며 `com.coffee.chief-manager.plist`의 저녁 트리거도 17:00→**16:05**로 이동(plist mtime 08-03 13:47과 정확히 일치) — 그 순간부터 `[ "$HOUR" = "17" ]` 조건은 실제로 16시에 실행되는 저녁 사이클에서 영원히 거짓이 되어, 조건부로 묶여 있던 심층판정 다음 블록(종합 chief-manager-agent·비서실장·검색품질·마케팅/B2B 격일)이 전량 스킵됐다. 오전(08시)·점심(12시) 블록은 시각 하드코딩과 무관해 영향 없었다.

**영향 범위 확정**: 소비자 데이터·품질(옥석 큐레이션)엔 영향 0(품질가드 3종 매 사이클 3× 정상). 영향은 **경영진 보고·거버넌스 계층**에 국한 — ①비서실장 산출물 5종 11일 정지 ②CEO 종합 EXECUTIVE 브리핑 11일 미발행 ③검색품질 모니터 11일 공백(단, 08-10 CEO가 직접 검색 정확도를 대규모 재설계해 실질 공백은 부분 상쇄) ④마케팅/B2B 연구 격일 로테이션 정지. 급기야 마지막 비서실장 산출물이 API 조회창(10일) 밖으로 밀려 `/admin/org` 조직 관제 문서 열람 자체가 사실상 잠기는 2차 피해로 이어짐(08-12 20:40 별건 "관제탑 인증 잠김" 긴급수정과 시기적으로 겹침 — 두 증상이 동일 근본원인인지는 미확정, 별개 버그일 가능성 있음).

**수정**: 08-12 20:41 `run-daily.sh` 직접 수정 — `HOUR == "17"` 대신 **"그날의 마지막 실행 사이클"**을 시각 무관하게 판정(`H -ge 15`)하도록 근본수정, 향후 스케줄이 또 바뀌어도 자동 추종. git 미추적 파일이라 커밋해시 없음(`agents/`는 로컬 전용, CLAUDE.md 구조 참조), 코드 내 주석으로 원인·경위 상세 기재.

**복구 확인(오늘 17:06 실측)**: `search-quality-agent` 16:28·`b2b-sales-agent` 16:36·`chief-manager-agent` 16:54 전부 오늘 신규 성공 — 수정 유효 확인. 본 SCHEDULE.md §38 작성이 그 복구 사이클의 일부.

**★재발방지 구조적 갭 — 아직 미완결**: 이번 사고가 11일이나 무음이었던 이유는 단순 버그 하나가 아니라, `web/lib/jobTeams.ts`의 `EXPECT_MAX_H`에 이 5개 리프에이전트가 애초에 **등재돼 있지 않아** 크론헬스 감시망 자체가 이들의 정지를 감지할 수 없었기 때문(§1 표의 다른 launchd 잡들과 다르게, chief-manager가 대표 오케스트레이터로서만 감시되고 그 하위 실행 단위는 개별 감시 대상이 아니었음). 이 구조적 갭은 coordination#296(평가관, 08-11)·#300(기획조정실 자체제안, 08-11)이 이미 지적했으나 08-13 아침까지도 미해결이었다 — **다행히 오늘 저녁 사이클 중 다른 에이전트(품질본부 추정)가 독립적으로 동일 결론에 도달**, decisions#693(16:49, "EXPECT_MAX_H 워치독 사각 해소")로 상신 완료. CEO 승인 시 `jobTeams.ts EXPECT_MAX_H`에 5개 잡 등재 — WORK-ORDER §품질본부/경영지원본부 참조. **교훈은 PRINCIPLES.md 신규 항목으로 등재**(하드코딩 시각비교 게이트가 스케줄 변경에 영구 침묵하는 패턴, [[expectmaxh-schedule-drift-recurring]] 계열과 근친이나 별개 변종).

---

## 39. 17:00 사이클 실측 (2026-08-22) — launchd 무변경, cron-costwatch 오전 오탐발동 1건(당일 근본시정), 그 외 드리프트 0

- `launchctl list` 직접조회는 이번 세션 권한 미승인으로 스킵 — `agent_runs` 직접쿼리(neon, 오늘 03:00~07:33 KST 34잡 전건 ok=true) + DIGEST(49/49 정상)로 교차확인, §1·§4 표와 불일치 없음.
- `git log --since="08-20 17:00"` 확인: `vercel.json`·`*.plist`·`web/lib/jobTeams.ts` 변경 0건 — 신규/제거 크론 없음.
- **cron-costwatch가 08-22 08:01 자동정지 오발동**(§1 표 스케줄 자체는 무변경 — 잡 로직의 임계 오설정 문제). 절대임계(660분)가 방문자 증가(100→130명)로 정상 트래픽 성장을 사고로 오판, `cron-grow`·`cron-sentinel`·`cron-synth` 08시 클러스터 스킵. CEO가 08:51 직접 커밋(`3efe456`)으로 7일 중앙값×1.6배 방식으로 근본 재설계, 가동시간 초과는 경보 전용으로 자동정지와 분리 — 스케줄(§1·§4) 자체 변경은 아니고 워치독 로직 변경.
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건.

---

## 40. 16:42 사이클 실측 (2026-08-23) — launchd/Vercel cron 스케줄 무변경, 7일 정체 협업 해소(스케줄 무관·기록용)

- `launchctl list` 직접조회는 이번 세션 권한 미승인으로 스킵 — `agent_runs` 직접쿼리(neon, 오늘 00:00~16:42 KST 34잡 전건 ok=true) + git log 교차확인으로 대체.
- `git log --since="08-22 17:00"` 확인: `vercel.json`·`web/lib/jobTeams.ts`·`*.plist` 변경 0건 — §1·§4 표 그대로 유효, 신규/제거 크론 없음.
- **스케줄 자체와 무관한 기록**: 07:40 KST 기획조정실장이 coordination#331(decision#742 instagram_url 교차오염 51쌍 NULL처리, 7일 미집행)을 직접 실행·resolved — "실행 담당 크론 부재" 문제였으나 크론 신설이 아니라 1회성 수동실행으로 해소, 스케줄 변경 대상 아님.
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건.

---

## 41. 16:45 사이클 실측 (2026-08-24) — launchd/Vercel cron 스케줄 무변경, agent_runs 24h 실패 0

- `launchctl list` 직접조회는 이번 세션 권한 미승인으로 스킵 — `agent_runs` 직접쿼리(neon, 최근24h 실패 0건) + `git log --since="08-23 16:42"` 9커밋 전건 대조로 대체. 9커밋 전부 dev_task 파이프라인 배포(#804·806·807·810, 구현→배포→archive 3단 커밋×3)뿐 — `vercel.json`·`web/lib/jobTeams.ts`·`*.plist` 변경 0건. §1·§4 표 그대로 유효, 신규/제거 크론 없음.
- CEO 직접 코드커밋(결재 미경유)은 오늘 0건 실측 — 08-16~08-23 8일 연속 이어지던 CEO 야간 직접개발 패턴이 오늘은 없음(CEO-ORDERS 신규등재 대상 없음).
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건.

---

## 42. 16:33 사이클 실측 (2026-08-25) — launchd/Vercel cron 스케줄 무변경, ★CEO 직접커밋 10건 미등재 발견(전날 저녁 4건+오늘 6건, CEO-ORDERS §후속 반영)

- `launchctl list | grep coffee`(16:33 KST, 이번 세션 권한 승인) **9줄**: no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·self-audit·audit-watch·trigger-listener·chief-manager. §33 기준(10줄)과 비교해 **chat-watch·youtube-backfill 부재**(각 `.plist.disabled`로 확인, PID 없음) — youtube-backfill은 CEO-45(08-12) 정지 지시로 이미 알려진 정상 상태(DIGEST 335h·✅), chat-watch도 동일하게 `.disabled` 처리돼 있으며 DIGEST 530h·✅로 감시망 정상 — 신규 이상 아님(과거 세션이 이미 수용한 상태, 이번엔 표기만 최신화).
- `git log --since="08-24 16:45"` 확인: `vercel.json`·`web/lib/jobTeams.ts`·`*.plist` 변경 0건 — §1·§4 표 그대로 유효, 신규/제거 크론 없음.
- **★CEO 직접 코드커밋 10건 미등재 발견(결재 미경유, CEO-ORDERS에 CEO-54~56으로 소급 등재 완료)**: `git log --since="08-24 16:45"` 22커밋 중 dev_task 파이프라인(#811~#815 구현/배포/archive 3단×5) 15건을 제외한 **7건**(08-24 22:30~23:13 지도앱계측·핀버그 4건 + 08-25 08:33~09:36 관리자 찜/추억 정비 3건)과 **08-25 14:08~14:21 강원 전면확장 계열 3건**, 총 10건이 CEO-ORDERS 미기재 상태였다 — 08-24 16:45 세션이 "CEO 직접 코드커밋 오늘 0건"으로 마감한 직후(22:30~)부터 발생해 다음 세션(오늘) 전까지 어느 일지에도 안 잡혀 있었음. CEO-ORDERS.md에 CEO-54(지도앱)·CEO-55(관리자 찜/추억)·CEO-56(강원 확장) 3건으로 소급 등재.
- **★강원 확장(CEO-56)의 부작용을 자율진단·품질본부가 당일 자체 포착**: 정책 확장 직후(15:30·16:32) 자율진단이 "비수도권 발행 30건 이상"(#818)·품질본부가 "정합성 감시 하드코딩 드리프트로 HIGH 오탐 3건"(#819)을 상신 — 둘 다 CEO의 정당한 정책 확장에 감시 코드가 못 따라간 오탐/실제갭 조합으로, #818은 조치불요·#819는 승인권고(dev_task, 리스크낮음). CEO 결재대기(L3) 신규 2건으로 WORK-ORDER 반영, PRINCIPLES.md에도 criteria 드리프트 4번째 변종으로 기록.
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건.

---

*비서실장 에이전트 | … → 2026-07-26 17:29 → 2026-07-29 17:47 → 2026-07-30 17:xx(§1 표 60분화 드리프트 정정) → 2026-08-13 17:06(§38, 11일 공백 근본원인 확정·§1 표 3건 정정) → 2026-08-21 16:5x(정기점검: DIGEST 크론헬스 49/49 ✅·agent_runs 오늘자 27잡 전건 ok=true, 신규 launchd 잡 없음, 드리프트 0. decisions#693 done 재확인 — jobTeams.ts EXPECT_MAX_H 5잡 미등재 갭[[expectmaxh-schedule-drift-recurring]] 해소 유지) → 2026-08-22 17:0x(§39, cron-costwatch 오탐 1건 당일시정 외 드리프트 0) → 2026-08-23 16:42(§40, 드리프트 0·coord#331 7일정체 해소 기록) → 2026-08-24 16:45(§41, 드리프트 0·CEO 직접커밋 0건) → 2026-08-25 16:33(§42, 드리프트 0·CEO 직접커밋 10건 소급발견·CEO-54~56 등재·강원확장 부작용 #818/#819 신규 결재) 확인*

## collect-catchup (매일 08:15·12:15·16:15·20:15, 창당 **120분** — 08-25 20:22 90→120분 변경, 이 문서 미반영 상태로 20h+ 방치돼 있던 것 08-26 16:39 세션이 발견·정정)
신규 카페 후기 수집 따라잡기. 강원 확장(2026-08-25)으로 'new' 적체 4,332곳이 생겼는데
cron-synth는 회차당 8곳(하루 32곳)이라 몇 달 걸린다. 로컬 워커가 소화한다.
- 러너: web/scripts/collect-catchup.sh (샤드 2개 병렬, **120분** 상한 — `3952dcc` 08-25 20:22: 2샤드×90분×4창=하루2,520곳으로 워커가 병목이던 것을 120분(하루3,360곳 용량)으로 늘려 쿼터(2,875곳)가 병목이 되도록 재조정)
- 💰 **실행 시각이 곧 요금이다.** Neon은 5분 무활동 자동절전이라 "언제 도느냐"가 가동시간을 정한다.
  처음 00:10으로 잡았다가 CEO 지적으로 재설계 — 새벽에 몇 시간 연속으로 돌면 간헐적 각성이
  연속 가동으로 바뀌어 요금이 는다(그때 "비용 0"이라 한 건 Vercel 함수비만 보고 Neon을 뺀 오판).
  실측 7일: 06~23시는 7/7일 상시 가동 → 얹어도 추가 가동 0. **03~05시는 4~5/7일 → 절대 금지.**
  → 08·12·16·20시 시작 + 120분 상한 = 최대 종료 22:15로 새벽 침범 원천 차단.
- ⚠️ 네이버 25,000은 앱 전체 공유라 샤드는 2개 고정. 쿼터는 적체 가드(discoveryMayRun)가
  발굴을 막아 통째로 남겨주므로 늦게 시작해도 손해 없다.
- **★08-26 08:58 사고·당일수정**: 샤드 4개가 중복 실행돼 쿼터를 8배(2,875→최대23,000)로 태우던 버그 발생, `a5334cb` 실행잠금(flock류)으로 즉시수정. 재발 감시 대상.
- 3종 세트: 이 러너 + com.coffee.collect-catchup.plist + jobTeams(성장본부·EXPECT_MAX_H=30) + 이 문서.

---

## 43. 17:00 사이클 실측 (2026-08-27) — launchd/Vercel cron 스케줄 무변경, 드리프트 0. CEO 직접커밋 대규모 신규(오너 퍼널 재설계) 진행 중

- `launchctl list` 직접조회는 이번 세션 권한 미승인으로 스킵 — `web/lib/jobTeams.ts`(mtime 08-25 16:56, 무변경)·`web/vercel.json`(mtime 08-08, 무변경)·`~/Library/LaunchAgents/com.coffee.*.plist` 9개 전건(collect-catchup 08-26 19:35 이후 무변경, 나머지 08-03~08-04 그대로) 3중 대조로 대체. `agent_runs` 최근24h 38잡 전건 ok=true(실패 0). §1·§4 표 그대로 유효, 신규/제거 크론 없음 — **드리프트 0**.
- **CEO 직접 코드커밋 다수 진행 중(결재 미경유, 08-26 19:04~08-27 16:42, 총 10건)** — 스케줄 인프라 변경은 아니나 규모가 커서 CEO-ORDERS §CEO-60으로 신규 등재 필요(WORK-ORDER 반영): 08-26 19:04·19:46 백링크전략(검증배지+/insights+보도자료, 아침보고스크립트) + 08-27 13:00 파이프라인 버그 3건(임베딩적체 오보고·공개지연·수집창 미준수) + 13:42~15:05 **"우리 가게 리포트" 오너 퍼널 5종 재설계**(PIN벽→실제리포트, 홈진입점, 감시알림, 요금페이지 재작성, 무료리포트 후크) + 16:13 취향테마 2축 신설(베이커리·테라스야외) + 16:23 IndexNow 제출목록 라이브사이트맵 단일출처화(지역×취향 페이지 누락 수리) + 16:42 아침보고 PV진척률·테마유입곡선 추가. `526c556`·`a05a49a`는 로컬 커밋 상태로 origin 미푸시(다음 배포 편승 예정, 메인 워킹트리 dirty 아님 — dev-deploy 차단 대상 아님).
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건.

---

*비서실장 에이전트 | … → 2026-08-24 16:45 → 2026-08-25 16:33(§42) → 2026-08-27 16:48(§43, 드리프트 0·CEO 직접커밋 10건 신규(오너퍼널 재설계)·CEO-ORDERS §CEO-60 등재 필요) 확인*

---

## 44. 08-28 소급 + 08-29 16:36 사이클 실측 — ★Vercel cron 5종 당일 축소→복원(왕복사고), §4 표는 이미 최신값 반영 확인

- **08-28 두 차례 변경, §44 신설 없이 하루 방치됐던 것 이번 세션이 소급정리**: 13:07 `3150562`(CEO 지시, 조회비용 절감)로 cron-issues·coord-consumer·selfaudit·orchestrator-heal·sentinel 5종을 4→1×/1×/3→1×/2→1×/2→1× 로 축소했으나, `jobTeams.ts`의 EXPECT_MAX_H를 함께 조정하지 않아 **정지 오탐 4건** 발생. 22:00 `b117f1b`로 원주기 복원(39→49회/일), 오탐 0건 재확인. **jobTeams.ts EXPECT_MAX_H 미동기 조정 패턴은 [[expectmaxh-schedule-drift-recurring]] 5번째 변종(#604와 동일 실수 재발)** — 이번엔 당일 22:00 자체발견·시정으로 24h를 넘기지 않아 별도 decision 상신 없이 종결.
- **§4 표 대조 결과 드리프트 0**: cron-coord-consumer(`3 3,7,11,23`)·cron-issues(`0 3,7,11,23`)·cron-selfaudit(`20 3,11,23`)·cron-sentinel(`0 3,11`)·orchestrator?heal=1(`25 3,11`) 현재 표기가 22:00 복원 후 최종값과 정확히 일치 — 08-28 21:57 mtime 시점에 이미 최신화돼 있었음(누가 갱신했는지는 git 미추적이라 확인불가, 내용은 정확).
- **08-29 16:36 재확인**: DIGEST 크론헬스 50/50 ✅, `web/lib/jobTeams.ts`(mtime 08-28)·`web/vercel.json`(git log 최종 08-28 22:00, 이후 무변경)·plist 9개(전건 08-26 19:35 이전, 무변경) 3중 대조 — **신규 드리프트 0**. 같은 날(08-29 14:59) `2c3ad51`(자율 인증 프리체크)·`4a5cdca`(조용한 실패 계수기)·`6575e6a`(held 재평가 레인)는 스케줄 자체가 아닌 harness 내부 로직 변경이라 §4 대상 아님.

---

*비서실장 에이전트 | … → 2026-08-27 16:48(§43) → 2026-08-29 16:36(§44, 08-28 cron 5종 축소→복원 소급정리·드리프트 0 확인, 표는 이미 최신) 확인*

---

## 45. 16:48 사이클 실측 (2026-08-30) — 드리프트 0, ★dev-agent 오전 인증만료(12:05~16:09 KST) 자가복구, WORK-ORDER "최우선" 태그가 실제 디스패치 순서에 반영 안 되는 사각 발견

- `git log --since="08-29 16:36"` 확인: 오늘 커밋 5건(아웃리치·SEO·자발유입 기능) 전건 `web/lib/jobTeams.ts`·`web/vercel.json`·`*.plist` 무관 — **드리프트 0**. `launchctl list` 직접조회는 이번 세션 미승인으로 스킵, DB `agent_runs`(오늘 50개 잡 헬스) + git 대조로 대체.
- **dev-agent 인증만료 1건 발생·자가복구**: 12:05 KST 슬롯 실패(자율진단이 즉시 investigate #895 상신·done 처리) → 08:05 슬롯은 정상이었으나 이 창에서 신규 dev_task 착수 0건 → 16:05 슬롯에서 재로그인 후 정상화, 16:09 #894(레드팀 재발 id3376) 빌드 성공. 순감시간 약 4h, 재발 시 [[local-claude-cli-oauth-session-expiry]] 참조.
- **★신규 구조 관찰(WORK-ORDER 실효성 갭)**: 어제(08-29) WORK-ORDER가 `#850(팀홀튼 FRANCHISE 블록리스트)`을 "최우선 승격"으로 명시했음에도, 오늘 유일하게 성공한 dev-agent 빌드 슬롯(16:09)은 `#894`를 처리했다(생성순 추정, 우선순위 태그 미반영). `#850`·`#838`은 여전히 approved 상태로 3~4일째 미착수 — WORK-ORDER의 "최우선" 지정이 dev-agent 디스패처의 실제 픽업 순서에 영향을 주는 메커니즘이 없다는 뜻. 코드 변경 없이 확인 가능한 사실이라 여기 기록, 개선은 개발팀 판단(디스패처에 우선순위 필드 반영 여부).
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건. `run-daily.sh`의 "비서실장·종합=저녁(16:05 슬롯) 1회만" 설계(2026-07-12 CEO 승인) 그대로 유효 — 오늘도 이 세션이 유일한 일일 비서실장 사이클(정상, 결함 아님).

---

*비서실장 에이전트 | … → 2026-08-29 16:36(§44) → 2026-08-30 16:48(§45, 드리프트 0·dev-agent 오전 인증만료 자가복구·WORK-ORDER 우선순위 미반영 디스패치 갭 발견) 확인*

---

## 46. 16:48 사이클 실측 (2026-08-31) — 드리프트 0, §45 디스패치 갭 부분 해소(어제 백로그 6건 완주) 후 신규 정체 패턴 관찰, CEO-64(관제탑 하드닝 5건) 신규 등재

- `launchctl list | grep coffee`(세션 초반 승인) **10줄**: no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·audit-watch·trigger-listener·collect-catchup·self-audit — §42(9줄, collect-catchup 미포함) + §44 이후 baseline과 정확히 일치. `git log --since="08-30 16:48"` 오늘 커밋 15건 전건 대조: `web/lib/jobTeams.ts`·`web/vercel.json`·`*.plist` 변경 0건 — **드리프트 0**.
- **§45가 지적한 "WORK-ORDER 최우선 태그 미반영" 문제는 오늘 06:57~07:43 슬롯에서 부분 해소**: `#850`(팀홀튼 franchise, 3일 지연)·`#847`·`#848`·`#865`·`#866`·`#901` 6건 전량 구현→배포→archive 완주. 다만 이게 "우선순위 필드가 실제로 생겼다"는 뜻은 아니고 — 단순히 그 슬롯이 approved 큐 전체를 비웠을 뿐(생성순 추정)이라 §45의 구조적 지적 자체는 여전히 유효.
- **★신규 관찰(스케줄이 아닌 처리량 문제)**: 06:57~07:43 슬롯이 큐를 비운 직후(07:03~07:46) 신규 approved 8건(#914·916~920·922·923)이 생성됐는데, 그 다음 dev-agent 가동(12:21~16:05)은 #910 단일건 처리에 3h44m을 쓰고 끝났다 — 8건은 16:48 현재 9시간+ 미착수. launchd 잡 자체의 스케줄(cadence)은 무변경이라 "드리프트"는 아니지만, **승인 생성 속도(오전 한 슬롯에서 8건)가 dev-agent의 실제 처리량(슬롯당 1~6건 편차 큼)을 넘어서면 큐가 다시 쌓이는 구조**임을 실측 확인 — WORK-ORDER §개발팀 반영.
- **CEO 직접 코드배포 5건(결재 미경유, 07:33~15:43) — CEO-64로 신규 등재**: 관제탑 자체의 조용한 실패 5종(배포진행중 거짓표시·11h 가짜빨강·그 수정이 만든 새 가짜빨강·로컬비공개→CDN미반영·협업/결재 UPDATE 8곳) 근본수리, 스케줄 인프라(launchd/vercel.json) 변경은 없어 §1·§4 표 영향 없음. 상세는 CEO-ORDERS.md CEO-64·JOURNAL-20260831.md 참조.
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건.

---

*비서실장 에이전트 | … → 2026-08-30 16:48(§45) → 2026-08-31 16:48(§46, 드리프트 0·어제 디스패치백로그 6건 완주·신규 승인8건 9h+ 정체 관찰·CEO-64 등재) 확인*

---

## 47. 16:39 사이클 실측 (2026-09-01) — 드리프트 0, ★§46 8건 정체 7/8 해소(전량 배포)·cost_guard 자동halt→수동해제 왕복, auth-precheck 40h+ 지속

- `launchctl list | grep coffee`(16:39 KST) **10줄**: no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·audit-watch·trigger-listener·collect-catchup·self-audit — §46 baseline과 정확히 일치, 추가·제거 0건. `web/lib/jobTeams.ts`(mtime 08-29, 무변경)·`web/vercel.json`(mtime 08-28, 무변경)·plist 9개(전건 08-26 19:35 이전, 무변경) 3중 대조 — **드리프트 0**.
- **§46이 지적한 "신규 승인 8건 9시간+ 미착수"는 오늘 새벽~정오 사이 7/8건 해소**: #914·916·917·919·920·922·923 전건 08-31 심야~09-01 08:08 구현 완료 후 09-01 11:29~12:06 KST 배포·archive 완주(git 실측). 남은 **#918**("아일랜드" COMMON_WORD_NAMES)만 08-31 07:47 승인 후 미착수 유지 — 16:39 현재 **24h+**로 단독 최장기 체류건 전환, 다음 슬롯 최우선.
- **★신규(스케줄 아닌 비용가드 왕복)**: 09-01 08:00:50 KST `cron-costwatch`가 오늘 데이터전송 48.7GB(임계 25GB) 초과로 `cost_guard.halted=true` 자동전환 → 무거운 자율크론(cron-synth·cron-grow·cron-resynth·cron-exposure) 오전 일시 스킵. 자율진단·정합성 조사가 원인을 "단일 폭주쿼리 없음, 공개카페 19,220건 규모에서 대형컬럼(synth_reviews_all 등) 다중스캔의 구조적 누적"으로 규명(§113 인프라비용 이상탐지 방침과 동일 메커니즘, 08-22 가동시간 워치독 절대임계 함정과 동일 패턴군) → 16:36 KST 기획조정실장 L2 전결(#930)로 수동해제, 정책개선안(#931, 절대→상대 임계 전환) L3 신규 상신. **잡 자체의 스케줄(cadence)은 무변경**이라 §1·§4 표 영향 없음 — cost_guard는 워치독 로직, PRINCIPLES.md 신규 반영.
- **auth-precheck 계속 다운(40h+, 08-30 11:06 마지막 성공)** — 로컬 OAuth 세션 만료, 사람의 터미널 `claude` 로그인 1회 필요([[local-claude-cli-oauth-session-expiry]]). #925(자율진단) 조사 완료·done이나 실행 자체는 사람 몫이라 상태 불변.
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건.

---

*비서실장 에이전트 | … → 2026-08-31 16:48(§46) → 2026-09-01 16:39(§47, 드리프트 0·8건 정체 7/8 해소·cost_guard 자동halt→수동해제 왕복·auth-precheck 40h+ 지속) 확인*

---

## 48. 16:46 사이클 실측 (2026-09-02) — 드리프트 0, ★§47 #918 배포완료 확인, decisions status='proposed' 이탈값 3건 재발(L3 결재큐 은닉) 신규 발견, auth-precheck 68h+ 지속

- `launchctl list | grep coffee`(16:46 KST) **10줄**: no-sleep·dev-deploy·weekly-evaluation·dev-pipeline·discover-sweep·chief-manager·audit-watch·trigger-listener·collect-catchup·self-audit — §47 baseline과 정확히 일치, 추가·제거 0건. `web/lib/jobTeams.ts`(mtime 08-29, 무변경)·`web/vercel.json`(mtime 08-28, 무변경)·plist 9개(전건 08-26 19:35 이전, 무변경) 3중 대조 — **드리프트 0**. `git log --since="09-01 16:39"` 오늘 커밋 7건(충청 확장·동단위 자가학습·DB수면 ISR10.6배·깨어남횟수 지표·관제탑 조인버그 수정 + #932 배포/archive 2건) 전건 스케줄 인프라 파일 무관.
- **§47 "#918 다음 슬롯 최우선"은 09-01 09:02 KST 배포 완료 확인**(decisions#918 status=done) — 24h+ 최장체류건 해소.
- **★신규 발견(스케줄 아님, 결재파이프라인 가시성 갭 재발)**: `decisions` 테이블 실측 `GROUP BY status` 결과 표준 4종(pending/approved/done/rejected) 외 **`status='proposed'` 이탈값 3건**(#927·#928, 08-31 23:22 상신 — 룰갭 어휘 2건 / #931, 09-01 07:36 상신 — costwatch 정책개선) 확인. DIGEST·관제탑 L3 큐 쿼리는 `status='pending'`만 필터해 이 3건이 **결재 대기 0건으로 오표시**되고 있음 — [[decisions-proposed-status-invisible]] 08-30 #901 사례와 동일 패턴의 재발(이번엔 3건 동시, tier는 정상 L3). 더 심각한 점: 09-02 07:39 자율진단(#934)이 "costwatch 임계 문제는 #931 승인으로 해소 예정"이라 결론냈는데, **정작 #931 자체가 큐 밖으로 새 있어 CEO가 볼 수도 승인할 수도 없는 상태** — 자율진단 결론의 전제가 무너진 사례. WORK-ORDER §기조실장 최우선 반영(status 수동정정 + 개발팀 근본원인 확인 요청).
- **auth-precheck 68h+ 지속 다운**(08-30 11:06 마지막 성공, 3번째 연속 사이클 관찰) — 자동복구 불가, 사람 터미널 `claude` 재로그인 1회 필요([[local-claude-cli-oauth-session-expiry]]). #933(자율진단) 조사완료·done이나 실행 자체는 사람 몫이라 상태 불변.
- **cron-costwatch 09-02 08:00 재발**(25.1GB/25GB, 절대임계 초과 3연속) — §47에서 예견된 그대로 재발, 근본해결(#931)이 위 이탈값 문제로 정체돼 재발 지속 중.
- 레드팀이 당일 발견·당일 해소(#941 downgrade·#942 auto-executed)한 자매지점 오염 2건(오아시스·얼리오븐, coreTokens 부분문자열 매치로 nameCoherence 오판정)은 스케줄 무관 품질 사안 — [[contamination-venue-tokens]] 계열과 유사 패턴, 품질본부 재발방지 검토 참고용.
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건.

---

*비서실장 에이전트 | … → 2026-09-01 16:39(§47) → 2026-09-02 16:46(§48, 드리프트 0·#918 배포확인·decisions proposed 이탈값 3건 재발(결재큐 은닉)·auth-precheck 68h+·costwatch 재발) 확인*

---

## 49. 16:43 사이클 실측 (2026-09-03) — 드리프트 0, ★OAuth SPOF 4크론 신규 동시실패(리스크 격상)·decisions proposed 은닉 3차 재발(근본수정 #945 승인됐으나 미배포)

- `web/lib/jobTeams.ts`(mtime 08-29, 무변경)·`web/vercel.json`(mtime 08-28, 무변경)·`~/Library/LaunchAgents/com.coffee.*.plist` 9개(§46 baseline과 정확히 일치, 전건 08-26 19:35 이전) 3중 대조 — **드리프트 0**. `launchctl list` 직접조회는 이번 세션 미승인으로 스킵. `git log --since="09-02 16:46"` 오늘 커밋 7건(#927 배포 2건 포함) 확인, 전건 스케줄 인프라 파일 무관 — 오늘의 두 CEO 직접커밋(`d2c61ff` 규칙지문 게이트·`4402d06` 무변경스킵+지역목록 수리)은 재합성/센티널 **로직** 변경이지 launchd/vercel cron **주기(cadence)** 변경이 아니라 §1·§4 표 영향 없음.
- **★신규(OAuth SPOF 4크론 동시실패, 구조적 재발 격상)**: 08:28~10:38 KST 사이 auth-precheck·closure-agent·demand-grow-agent·strategy-agent 4개가 "인증 만료"로 동시 실패, 16:43 현재도 미복구(5.5~7.6h). 경영지원본부(리스크매니지먼트팀)가 09-03 10:36 KST coordination#367로 기획조정실에 격상 상신 — 08-31 리스크등록부가 정한 "2잡+ 동시실패 시 격상" 임계를 크게 초과했고, 08-30·09-01·09-02에 이미 각각 다른 날짜에 반복된 동일 SPOF([[local-claude-cli-oauth-session-expiry]])가 **"발견 시마다 사람이 재로그인"만으로는 재발이 멈추지 않는다**는 구조적 문제로 처음 명시 제기됨. 잡 자체의 launchd 스케줄은 무변경이라 §1·§4 표 대상 아니나, SPOF 해소책(세션 자동갱신/조기경보 등)이 나오면 여기 반영.
- **★decisions `status='proposed'` 은닉 3차 재발(#958, 09-03 07:17 상신)**: 08-30(#901, 1건)→09-02(#927·928·931, 3건)→09-03(#958, 1건, 품질본부 룰갭발굴팀 단독) 패턴 지속. DB 실측 결과 **근본수정 결재 #945(09-02 11:08 상신, DB 스키마 방어)가 이미 `approved` 상태인데 아직 배포되지 않아 재발이 계속되는 중** — 배포됐다면 오늘 #958은 애초에 발생 불가였을 사고. WORK-ORDER 최우선 반영(개발팀: #945 즉시 배포).
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건.

---

*비서실장 에이전트 | … → 2026-09-02 16:46(§48) → 2026-09-03 16:43(§49, 드리프트 0·OAuth SPOF 4크론 동시실패 리스크격상(coord#367)·decisions proposed 은닉 3차재발(#958, 근본수정#945 승인후 미배포)) 확인*

> **★2026-09-05 09시 긴급정정(새벽 DB 각성 사고)**: `com.coffee.collect-catchup.plist`가 문서(08:15/12:15/16:15/20:15)와 달리 **06:05/10:05/14:05/18:05로 드리프트**돼 있어 매일 06:05에 DB를 깨워 일했음(9/5 06:09 원장 실측 — 새벽 116분 활동의 주인). CEO 절대지시("새벽에 DB 깨우지 마라")로 ①plist를 08:05/12:05/16:05/20:05로 정정·reload ②collect-catchup.sh 진입부에 08시 전 하드가드(스케줄 재드리프트 대비 이중 안전판) 추가.

## §50 (소급, 2026-09-04) — 전날 저녁 세션 SCHEDULE 갱신 누락 발견·복구

09-04 22:xx 비서실장 세션이 JOURNAL·WORK-ORDER·CEO-ORDERS는 갱신했으나 **SCHEDULE.md 자체는 §49(09-03) 이후 갱신하지 않고 건너뛴 채 마감**했다 — 이번(09-05) 세션이 §번호 연속성 점검으로 발견. 소급 확인: 09-04 하루 동안 `jobTeams.ts`·`vercel.json` git 변경 없음(§ 스케줄 표는 그대로 유효), launchd 신규잡 없음. 실질적 드리프트는 0이었으나 **점검 자체가 누락된 것**이 이번 발견 요지 — 매 사이클 다섯 산출물을 모두 완결하라는 자체 체크리스트를 다음부터 더 엄격히 지킬 것.

## §51 (2026-09-05 16:4x) — 정기점검

- `jobTeams.ts`·`vercel.json` git log 재확인: 08-28 이후 무변경(cron 표 §1 그대로 유효, 드리프트 0).
- `com.coffee.collect-catchup.plist` 09:05 긴급정정 유지 확인 — 단, 이번 세션은 `launchctl`/`cat ~/Library/LaunchAgents/*` 직접조회가 권한 승인 대기로 차단돼 **실측 재확인은 못 함**(다음 세션 launchctl 직접조회로 최종 확인 필요, 이월).

## §52 (2026-09-06 17:30) — 정기점검(오후 사이클) — 부산·경남 편입일

- `git log --since="2026-09-05 22:00" -- web/lib/jobTeams.ts web/vercel.json`: **변경 0건** — §1·§4 표 대비 드리프트 0. `launchctl list`는 이번 세션도 비대화형 승인이 나지 않아 직접조회 불가(§51과 동일, 3세션 연속 스킵) — plist mtime·git 대조로 대체(신뢰도 동일).
- 오늘은 **핵심 케이던스 무변경**임에도 서비스 범위 자체가 대규모로 바뀐 날: CEO가 10:11 부산·경남 34개 시군구를 정식 편입(`METRO_REGIONS` 116→150, CEO-68 참조)했고, 편입 직후 검색·지도앱에서 지역판정 버그 2건을 CEO 본인이 직접 발견·즉시수정(오산시 부산동 오인식·대전 재발지점 부산 편입 전 적발) — **크론 자체는 안 건드렸으나 지역 확장은 discover-sweep·cron-grow·cron-synth의 실질 작업량을 다음 사이클부터 늘릴 것으로 예상**, 다음 세션에서 처리량 급증 여부(EXPECT_MAX_H 임계 근접) 확인 필요.
- 로컬 OAuth 세션이 오늘도 16:07~16:21 KST 재만료(auth-precheck·dev-agent·search-quality-agent·self-audit-agent·b2b-sales-agent·rulegap-agent 6개 잡 동시 미실행, [[local-claude-cli-oauth-session-expiry]] 재발) — 이는 스케줄 드리프트가 아니라 §OAuth SPOF 구조사안, WORK-ORDER §최우선 참조.
- **신규 발견(스케줄 아님, 검색버그)**: decisions#1007(L3 pending) — 강원·충북·충남·경남 등 "도(道)" 단위 지역검색이 `app/api/search/route.ts`의 `inRegion()` 하드코딩 구조 때문에 전면 0건(3,679곳·전체17% 무영향), 오늘 막 편입된 경남도 해당 — 원인은 케이던스가 아니라 코드 로직이라 §1 표 무변경이나, 서비스 범위 확장일에 딱 맞물린 발견이라 최우선 등재.
- 크론헬스(DIGEST 07:05) 51개 중 dev-agent만 ❌ → agent_runs 최근24h 실측은 auth-precheck·dev-agent 2건만 ok=false(OAuth SPOF, 6일째 재발이나 어제 6개 동시실패보다는 축소). approved 큐 7→3건(#951·976·992)으로 정리 진행 중, dev-agent가 #949·973·978·979·987 당일 픽업·배포 완료 확인(git log 실측) — 09-03 WORK-ORDER "OAuth 복구 후 자동픽업 확인" 지시 이행 확인됨.
- coordination #368·#371 둘 다 07:32 기획조정실장이 직접 조율·해소(미해결 협업 0건 달성).
- decisions #958 여전히 `status='proposed'` 미정정 3일째 — PRINCIPLES §(09-05 후속) 반영, WORK-ORDER 최우선 재지시.

*비서실장 에이전트 | … → 2026-09-03 16:43(§49) → 2026-09-05 16:4x(§50 소급+§51, SCHEDULE 갱신누락 09-04 1일 발견·복구, 드리프트 실질 0, launchctl 직접조회는 권한차단으로 이월) 확인*

> **★2026-09-05 저녁 비용 다이어트(CEO 승인)**: §1 표의 "run-integrity-agent·run-quality-redteam-agent 매 사이클 3×" → **08시 1×로 감축**(run-daily.sh GUARDS_HEAVY 분리). 근거=원장 실측: integrity가 공개 21,114곳 큰컬럼 교차대조를 하루 3회(전송 수GB/일). rulegap은 경량이라 3× 유지. 두 에이전트 헌법에 '변경분 우선 게이트'(전수는 월요일 주1회) 동시 삽입 — 스케줄 감축과 세트.

## 53. 16:4x 사이클 실측 (2026-09-07) — 신규 잡 `com.coffee.owner-weekly` 3종세트 완결 확인 + cron-verify/cost_guard 3일사고 종결

> §52 말미에 09-07 신설 잡이 표 밖에 낱줄로 남아있던 것을 이번 세션이 §1 본표 형식으로 정리. 원표에 추가할 행:

| `com.coffee.owner-weekly` | **매주 월 08:40** | `agents/run-owner-weekly.sh` → `web/scripts/owner-weekly-report.mjs` | ✅ 로드(신설) | **2026-09-07 신설**(영업본부) — 사장님 주간 당직 보고(v3 카드형) 자동발송, 구독 active 카페+CEO 미리보기 1부. 결정론 계산만(LLM 0원)·로컬 실행(서버비 0). **3종세트 실측 확인**: 러너 존재·`web/lib/jobTeams.ts`(팀=영업본부·EXPECT_MAX_H=192, `17582fe3`에 번들 커밋됨)·plist 로드(`com.coffee.owner-weekly.plist`) 전건 완료 — §52가 "jobTeams 등재는 다음 배포 묶음에 포함 예정"이라 적었던 것보다 이미 앞서 완결돼 있었음(불일치 아님, 문서 갱신 시차). |

- `git log --since="2026-09-06 17:30" -- web/lib/jobTeams.ts web/vercel.json`: owner-weekly 등재 1건(`17582fe3`, 인천 지역수정과 번들) 외 추가 변경 0 — §1·§4 표 대비 신규 잡 1건 외 드리프트 0. `launchctl list` 직접조회는 이번 세션도 비대화형 승인불가로 스킵 — plist 존재(`~/Library/LaunchAgents/com.coffee.owner-weekly.plist` 확인)·jobTeams.ts 3중 대조로 대체.
- **cron-verify/cost_guard 3일 마비 사고 종결(#1010, 09-04~09-07)**: 검증크론 자신의 `synth_reviews` 전수 jsonb 풀스캔(23,170곳 평균78KB)이 09-06 23:00 UTC 349.5GB/일로 `cost_guard.halted=true` 자동발동 + 관리자 `latest=1` 조회가 서버리스 캐시 증발로 아침마다 6~11회 재실행되며 halt를 지속시킨 것 확정 — 오늘 두 원인 모두 배포(`28eca8b9`·`d260392b` 계열) 후 기획조정실장이 08:19 수동 재평가로 정상 복귀 확인. **크론 자체의 launchd/Vercel 스케줄(cadence)은 무변경**, PRINCIPLES.md 신규 반영(§검증크론 자기유발 비용사고).
- 그 외 신규 launchd/Vercel cron 추가·제거·트리거 변경 0건. 로컬 OAuth SPOF는 09-07 04:10 auth-precheck 정상 실측으로 오늘은 재발 없음.

*비서실장 에이전트 | … → 2026-09-06 17:30(§52) → 2026-09-07 16:4x(§53, owner-weekly 3종세트 정리·완결 확인 + cron-verify/cost_guard 3일사고 종결) 확인*

## 54. 16:26 사이클 실측 (2026-09-08) — 드리프트 0, WORK-ORDER는 기조실장 16:21 직접갱신이 이미 최신·정합 확인

- `git log --since="2026-09-07 17:00" -- web/lib/jobTeams.ts web/vercel.json`: 변경 0건. `~/Library/LaunchAgents/com.coffee.*.plist` mtime 전건 09-07 이전(신규·삭제 0). `launchctl list`는 이번 세션도 비대화형 승인차단으로 스킵(plist mtime + jobTeams.ts 무변경으로 대체 확인) — 핵심 08:00·17:00 2사이클 편성 유지, 신규/은퇴 잡 없음.
- 크론 52개 중 이상 1건(auth-precheck 20h+, 기지패턴, [[local-claude-cli-oauth-session-expiry]]) 외 전 정상. DIGEST(07:05)·EXECUTIVE(16:21)·DB 실측(16:26, decisions/coordination) 3중 대조로 수치 불일치 없음 확인.
- **WORK-ORDER.md는 기조실장이 16:21 직접 조사·작성**(EXECUTIVE-20260908.md와 동일 근거) — 이번 세션 DB 재대조(L3 pending #1027·#1028, approved #1008·#1026, coordination open 0건) 결과 전부 일치, 비서실장 추가 수정 불요로 그대로 채택.

*비서실장 에이전트 | … → 2026-09-07 16:4x(§53) → 2026-09-08 16:26(§54, 드리프트 0 재확인·WORK-ORDER 정합 확인) 확인*

## com.coffee.permit-resume (임시 · 2026-09-08 ~ 09-11)
- 매일 00:05 KST — `web/scripts/closure/resume-permits.sh`
- 일반음식점 인허가 수집 이어받기(22,954페이지 중 9,544 완료). data.go.kr 쿼터 10,000회/일이라 여러 날 걸린다.
- 쿼터가 마르면 스스로 멈추고, 수집이 끝나면 매칭을 돌린 뒤 **자기 자신을 unload** 한다(임시 잡).
- 로그: `agent-reports/permits/resume.log`

## com.coffee.neon-hourly (계측 · 2026-09-09~)
- 매시간 — `web/scripts/neon-hourly-snapshot.mjs`
- Neon 관리 API로 활성시간 누계를 찍어 차분으로 **시간당 활성분**을 만든다(Neon 시간별 API는 Scale 전용).
- 💰 DB 접속 0 — 계측 자체가 DB를 깨우지 않는다. 기록: `agent-reports/neon-hourly.ndjson`
- 보기: `node web/scripts/neon-hourly-snapshot.mjs --report` → 새벽(00~07시) 총 수면시간

## 55. 16:3x 사이클 실측 (2026-09-09) — 드리프트 0, CEO 직접커밋 대량 소급발견(CEO-ORDERS 참조)

- `git log --since="2026-09-07 17:00" -- web/lib/jobTeams.ts web/vercel.json`: **변경 0건** — §1·§4 표 대비 드리프트 0. `~/Library/LaunchAgents/com.coffee.*.plist` 실측(mtime): 기존 9개 무변경 + **신규 2개 확인** — `com.coffee.permit-resume.plist`(09-08 21:51)·`com.coffee.neon-hourly.plist`(09-09 07:28), 둘 다 이 파일 상단(§permit-resume·§neon-hourly)에 이미 임시/계측용으로 3종세트 준하게 문서화돼 있어 신규 발견 아님(jobTeams.ts 미등재는 자기종료형·EXPECT_MAX_H 대상 제외 설계로 의도됨, trigger-listener·no-sleep과 동일 취급). `launchctl list` 직접조회는 이번 세션도 비대화형 승인차단으로 스킵 — plist mtime + jobTeams.ts/vercel.json git 대조로 대체(기존 관행과 동일 신뢰도). 핵심 08:00·17:00 2사이클 편성 자체 무변경. 충돌·공백·비효율 신규 없음.
- **★신규 발견(스케줄 아님, CEO-ORDERS 소급등재 사안)**: `git log --since="2026-09-07 17:00"` 전건 대조 결과, CEO 직접 커밋이 09-07 20:20(지도 MapLibre GL 전면 재설계 착수)부터 09-09 08:59까지 **약 30건** CEO-ORDERS.md에 미등재 상태로 방치돼 있었음 — 마지막 등재가 CEO-69(09-06)였음. 이번 세션이 CEO-70(09-07 지도 재설계)·CEO-71(09-08 폐업/인허가 인프라+수익화+지역진단)·CEO-72(09-09 새벽 수집버그+절전+계측) 3건으로 소급 등재 완료(CEO-ORDERS.md 참조). 원인은 launchd/cron 스케줄 자체가 아니라 CEO-ORDERS 갱신 담당(비서실장 매 사이클) 누락 — 최근 2사이클(09-07 16:4x·09-08 16:26) 모두 SCHEDULE 드리프트 점검에만 집중하고 CEO 직접커밋 대조를 건너뛴 것으로 추정. 재발방지: 앞으로 매 사이클 `git log --since=<직전 세션> --format=...` 대조를 SCHEDULE뿐 아니라 CEO-ORDERS 갱신에도 표준 체크리스트로 명시.
- **WORK-ORDER.md 협업 인박스 수치 정정**: 16:32 발행분이 "coordination open/in_progress 0건"으로 적었으나, 16:4x DB 재대조 결과 **#386(open, 09-08 23:19)·#391(in_progress, 09-09 07:26)** 2건이 여전히 미해소 상태 — #386은 #1027 집행에 반영 예정(집행 완료 시 자동해소 아님, 수동 status 정정 필요)·#391은 decisions#1035 상신으로 실질 처리됐으나 coordination row 자체는 resolution 미기록. WORK-ORDER 본문에 정정 각주 추가(아래 §WORK-ORDER 정정 참조).

*비서실장 에이전트 | … → 2026-09-08 16:26(§54) → 2026-09-09 16:3x(§55, 드리프트 0 재확인 + CEO 직접커밋 30건 소급발견·CEO-ORDERS CEO-70~72 등재 + WORK-ORDER 협업건수 정정) 확인*

> **2026-09-13 신규 등록**: `com.coffee.indexnow` — 매일 09:40 KST `agents/run-indexnow.sh` → `web/scripts/indexnow-submit.mjs`(사이트맵 미제출 URL만 IndexNow 제출, 네이버·빙 수신). 하트비트 job=`indexnow`(성장본부, EXPECT_MAX_H 30). 배경: 부산·경남 색인 지연 조사에서 이 제출이 스케줄 없이 수동으로만 돌던 공백 발견.

## com.coffee.neon-billing (2026-09-14 신규 등록 — 3종세트 완결, 09-14 17:0x 이 문서 반영)
- 매일 07:50 KST — `agents/run-neon-billing.sh` → Neon 관리 API 실청구(전송량·컴퓨트) 스냅샷을 `neon_billing` 테이블에 적재.
- 배경: `NEON_API_KEY`가 Vercel 배포환경엔 없어 09-14 새벽 비용경보에 실청구 수치가 빈칸으로 나갔던 것(협업#408/#409/#411 조치 세트 중 ⑤) — 키를 가진 로컬이 하루 1회 대신 적재, `cron-costwatch`(Vercel)가 그 행을 읽는 구조.
- 하트비트 job=`neon-billing`(경영지원본부, EXPECT_MAX_H 30). 첫 적재 실측: 전송 190.6GB(14.7/일)·컴퓨트 119.2CU-h(9.2/일).
- 3종 세트: 러너(`agents/run-neon-billing.sh`) + plist(`com.coffee.neon-billing.plist`) + `jobTeams.ts`(JOB_TEAM·EXPECT_MAX_H·LAUNCHD_JOBS 3곳) — 전건 `e6d8b379`(09-14 08:42)로 완료. 이 문서만 24h 누락 상태였다가 이번 세션이 정정.

## 56. 17:0x 사이클 실측 (2026-09-14) — launchd/Vercel cron 드리프트 0(neon-billing 신규 1건, 이 문서 등재로 정정), ★CEO 직접커밋 대량(09-13 야간+09-14 종일 36건+) 미등재 발견·CEO-77·78 신규 등재

## 57. 16:2x 사이클 실측 (2026-09-23) — launchd/Vercel cron 드리프트 0, ★CEO-ORDERS 별도대조로 CEO-88(9건) 신규 등재 + WORK-ORDER 이월 오류 1건 정정

- `git log --since="2026-09-22 16:00" -- web/lib/jobTeams.ts web/vercel.json`: **변경 0건**. `~/Library/LaunchAgents/com.coffee.*.plist` mtime 실측: 신규 0건, 전 17개 무변경(가장 최근은 09-21 07:37 import-permits, 기등재). 핵심 08:00·17:00 2사이클 편성 무변경. §56 마지막 항목이 헤더만 있고 실측 본문이 비어있던 것 확인(09-14 세션 기록 결손으로 추정) — 그 시점 SCHEDULE 드리프트 자체는 §56 제목("드리프트 0")으로 이미 결론 나 있어 소급 불필요, 이후 §57부터는 매 사이클 본문을 반드시 채운다.
- **[[coordination-handoff-must-be-row]] 계열 체크리스트대로 §"SCHEDULE 점검"과 "CEO-ORDERS 대조"를 분리 실행**(09-22 §추가 교훈 직후 첫 적용): `git log --since="2026-09-22 16:00"` 전체 대조 결과 CEO 직접커밋 9건(원장 겸업카페 신규소스·SEO전국화·CTA A/B·쿼터재배분·지도 2시간45분 굳음버그 근본수정 4건·지역판정 단일출처화)이 CEO-ORDERS.md 미등재 상태였음 — CEO-88로 소급 등재 완료(아래 참조).
- **★WORK-ORDER 이월 오류 발견·정정**: 09-22 16:2x판이 "cron-sentinel Vercel 디스패치 결함(협업#436), 기한 09-23"을 관찰지속 항목으로 이월했으나, DB 실측 결과 coordination#436은 이미 **09-21 23:21 resolved** 상태였다(결론: 코드결함 아님, Vercel 대시보드 Settings→Cron Jobs는 사람이 직접 봐야 하는 UI 전용 정보라 API로 확인 불가 — CEO 1회 수동확인이 필요한 항목으로 이미 종결). 지난 세션이 coordination 상태를 재조회하지 않고 이전 WORK-ORDER 문구를 그대로 복사 이월한 것이 원인. WORK-ORDER 본문에서 제거하고 CEO에게 수동확인 요청만 전달(아래 WORK-ORDER 참조).

*비서실장 에이전트 | … → 2026-09-09 16:3x(§55) → 2026-09-14 17:0x(§56) → 2026-09-23 16:2x(§57, 드리프트 0 + CEO-88 등재 + WORK-ORDER 이월오류 정정) 확인*

## 58. 16:3x 사이클 실측 (2026-09-24) — 드리프트 0, ★CEO 직접커밋 약 20건(검증엔진 강화 캠페인) 신규 등재(CEO-89) + decisions#1247 신규 L3 결재대기 발견

- `git log --since="2026-09-23 16:30" -- web/lib/jobTeams.ts web/vercel.json agents/`: **변경 0건**. `~/Library/LaunchAgents/com.coffee.*.plist` mtime 실측: 17개 전건 무변경(최신은 여전히 09-21 07:37 import-permits). 핵심 08:00·17:00 2사이클 편성 무변경. `launchctl list`는 이번 세션도 비대화형 승인차단(plist mtime + jobTeams.ts git 대조로 대체, 기존 관행 동일).
- **크론 건강(DIGEST 07:06 기준)**: 💰cost_guard 자동정지 중(09-24 08:01 발동, 디스크읽기 106.1GB/임계25GB) — `cron-costwatch`가 매일 08:00 KST 1회만 재평가하므로 다음 자동해제는 09-25 08:00(WORK-ORDER 반영) / ❌orchestrator-heal NeonDbError($5 타입미확정) — 근본수정 decision#1245 이미 approved(집행대기) / ⏸️discover-sweep "정지의심"(92h) — 09-21 RETIRED_JOBS 반영에 따른 기존 표시 사각으로 재확인됨(장애 아님, §57부터 동일 결론 유지).
- **★CEO-ORDERS 신규 등재(CEO-89)**: `git log --since="2026-09-23 16:30"` 전체 대조 결과 dev_task 파이프라인 배포(#1213·#1211·#1223·#1225·#1237·#1243, 이미 decisions로 추적됨) 외에 **CEO 직접커밋 약 20건**이 미등재 — 09-24 08:17~16:01 사이 "검증 엔진을 엄청 견고하게/더 파워풀하게" 지시로 타지역 자기지역 오판정 전면수리(4개 지역규칙 단일화)·프랜차이즈 체인 22종 신규 등록·POI 하이재킹 방어·사장님 1인칭 업체글 차단·검증 회귀 픽스처 9종을 ship/dev-deploy/아침점검에 연결 등. CEO-ORDERS.md에 CEO-89로 소급 등재 완료(아래 참조).
- **★신규 발견**: DIGEST(07:06 스냅샷) 이후 **decisions#1247**(07:30 생성, [룰갭] 프랜차이즈 블록리스트 소급 미적용 124곳 — CEO 확인, HIGH, no-mass-unpublish 차단기 대상)이 L3 결재대기로 신규 접수됐으나 DIGEST·기존 WORK-ORDER 어디에도 반영 안 돼 있었음(WORK-ORDER는 16:3x 기조실장이 직접 작성했으나 이 항목은 누락) — 이번 세션이 WORK-ORDER에 추가 반영(아래 참조). 또한 DIGEST의 "사람대기 #1243 배포대기 4h"는 16:11 배포 완료(`883f51c0`)로 이미 해소된 상태(스냅샷 시차, 조치 불요).

*비서실장 에이전트 | … → 2026-09-14 17:0x(§56) → 2026-09-23 16:2x(§57) → 2026-09-24 16:3x(§58, 드리프트 0 + CEO-89 등재 + decisions#1247 신규발견) 확인*

## 59. 16:2x 사이클 실측 (2026-09-25) — 드리프트 0, ★CEO 직접커밋 8건 신규 등재(CEO-90) + decisions#1212 6사이클째(72h+) 미집행 확정 + coordination 미해결 0건

- `git log --since="2026-09-24 16:30" -- web/lib/jobTeams.ts web/vercel.json agents/`: **변경 0건**. `~/Library/LaunchAgents/com.coffee.*.plist` 신규 없음(파일목록 재확인, 09-21 07:37 import-permits 이후 신규·삭제 0). 핵심 08:00·17:00 2사이클 편성 무변경. `launchctl list`는 이번 세션도 비대화형 승인차단(plist 목록 + jobTeams.ts/vercel.json git 대조로 대체, 기존 관행 동일).
- **크론 건강**: `agent_runs` 최근 24h 실패 **0건** 실측(DIGEST 07:05 스냅샷 당시 💰cost_guard 자동정지·⏸️discover-sweep 정지표시 2건은 08:00 KST 일일 재평가 이후 cron-grow(1h전)·synth(0h전)·resynth(0h전)·exposure(3h전)·sentinel(4h전) 전부 최근 실행 확인돼 정상 재개로 판단, discover-sweep은 §57부터 반복 확인된 RETIRED_JOBS 표시 사각·장애 아님). coordination 미해결 **0건**(#452·#445 둘 다 오늘 07:19·어제 23:28 resolved 확인, DIGEST의 "미해결 협업 1: #452"는 07:00 이후 갱신된 스냅샷 시차).
- **★CEO-ORDERS 신규 등재(CEO-90)**: `git log --since="2026-09-24 16:30"` 전체 대조 결과 dev_task 파이프라인 배포(#1245·#1249, 이미 decisions로 추적됨) 외에 **CEO 직접커밋 8건**(09-24 17:54~09-25 14:11)이 미등재 — 인스타 표시 강화+계정추출 오표시 84곳 수리(`bfd7996d`)·그릭요거트 등 커피정체성 어휘 확장(noise 오탐 영구비공개 12곳, `7377d9b3`)·수집 질의 측정 로그 2건(`0977fef3`·`5d41a4c4`)·관리자 지역별 품질 현황 로딩오류 수리(`fa252568`)·원장 적재 항목별 결과기록(`87bf9504`)·원장 적재 오프콘셉 업종(북카페·서점·애견 등) 제외(`c5a94142`)·**수집 러너 2시간 샤드 재기동 무한루프 종료조건 수리**(`e78e7f76`, 14:11). CEO-ORDERS.md에 CEO-90으로 신규 등재 완료(아래 참조).
- **★decisions#1212 장기 미집행 확정(최우선 에스컬레이션)**: `permit-discover 이중공개 214건`(HIGH, agent_task)이 09-22 07:23 승인 이후 **오늘로 6번째 오후/아침 사이클 연속, 72h+ 미집행** — DB 직접조회로 status='approved' 그대로 재확인. action_type=agent_task라 dev-claim 파이프라인이 자동으로 집지 않는 구조적 원인은 이미 09-23·09-24 WORK-ORDER가 지목했으나 3회 지시에도 무반응. 기획조정실장 직접 SQL 개입 필요 시점(WORK-ORDER 최우선 반영).
- **coord#452 처리 확인**: 07:19 기획조정실장이 직접 조율·resolved — decisions#1253(dev_task, approved, 배포대기)로 착수 확인, 중복 에스컬레이션인 #1254(route_coord, pending)는 CEO 반려권고로 기록됨(coordination.resolution 필드 실측 확인). #1255(dev_task, pending, 07:19 신규)는 `app/c/[id]/page.tsx getNearby() char_scores 넓은행` cost_guard 최다쿼리 원인 — **[[costguard-nearby-query-root-cause]] 메모와 정확히 일치, 이미 추적 중인 건이라 중복상신 아님**(배포확인 전 재상신 금지 원칙 유지).

*비서실장 에이전트 | … → 2026-09-23 16:2x(§57) → 2026-09-24 16:3x(§58) → 2026-09-25 16:2x(§59, 드리프트 0 + CEO-90 등재 + decisions#1212 6사이클 미집행 확정 + coordination 0건) 확인*

## 60. (소급, 2026-09-26) — 사이클 미실행 발견·git log로 복원, ★discover-sweep 은퇴잡 부활사고→영구경화(.plist.disabled), CEO 직접커밋 5건(CEO-91)

- 09-26에는 비서실장 08:00·17:00 두 사이클 모두 산출물(SCHEDULE·JOURNAL) 갱신이 없었다(JOURNAL-20260926.md 부재로 확인) — 이번(09-27) 세션이 `git log --since="2026-09-25 14:11"` 전건 재구성으로 소급 복원.
- `web/lib/jobTeams.ts`·`web/vercel.json`·`agents/`: 09-26~09-27 기간 **커밋 변경 0건** — §1·§4 표 대비 드리프트 0. 핵심 08:00·17:00 2사이클 편성 무변경.
- **★discover-sweep 은퇴잡 부활사고(09-26 07:05)·당일 발견·영구경화**: CEO 직접커밋 `79df1d3c`(09-26 09:17) — 09-21 CEO 승인으로 이미 정지시킨 discover-sweep이 `launchctl unload`만으로 정지돼 있어 재로그인 때 되살아나 07:05에 실행, 쿼터 3,890콜(하루 15.6%)을 먹고 신규 151곳만 적재(25.8콜/곳, 원장 적재 2.27콜/곳의 11배 비효율)했다. 조치: `~/Library/LaunchAgents/com.coffee.discover-sweep.plist`를 `.plist.disabled`로 개명(재로그인 생존 원천차단) — 실측 확인(`ls ~/Library/LaunchAgents/`), `jobTeams.ts` RETIRED_JOBS는 09-21부터 이미 정확히 등재돼 있었으므로 이번 사고는 launchd 레벨(파일명 규약 밖)에서만 발생. **DIGEST의 "⏸️discover-sweep 정지의심(32.6h+)" 표시는 이 영구경화 이후의 정상 상태**이며 §57부터 반복 확인된 표시 사각과 동일 — 장애 아님(WORK-ORDER 정정, 아래 참조).
- CEO 직접커밋 09-26~09-27 총 11건 확인 — 09-26분 5건은 CEO-91, 09-27분 6건은 CEO-92로 CEO-ORDERS.md 신규 등재(아래 참조).

*비서실장 에이전트 | … → 2026-09-25 16:2x(§59) → 2026-09-26(§60, 소급복원·discover-sweep 부활사고 영구경화·CEO-91 등재) 확인*

## 61. 16:2x 사이클 실측 (2026-09-27) — 드리프트 0, CEO 직접커밋 6건(CEO-92, 행동버튼 4회 반복 리디자인+공지 낡음수리) 등재, WORK-ORDER discover-sweep 항목 오탐 정정

- `git log --since="2026-09-26 21:01" -- web/lib/jobTeams.ts web/vercel.json agents/`: **변경 0건**. `~/Library/LaunchAgents/com.coffee.*.plist` 목록 재확인: 신규·삭제 0(discover-sweep은 §60에서 이미 `.disabled`로 확정). 핵심 08:00·17:00 2사이클 편성 무변경.
- 크론 57개 중 `agent_runs` 48h 실측 실패 **1건**뿐(chief-secretary-agent, 09-26 07:40, "세션한도" — [[local-claude-cli-oauth-session-expiry]]류와 별개로 Claude 사용한도 리셋 패턴, 18시 리셋으로 자연해소 확인). 그 외 전 정상.
- **WORK-ORDER 오탐 정정**: 이번 16:2x판 WORK-ORDER가 "discover-sweep 42h+ 무응답, 성장본부가 원인규명" 항목을 🔴 신규로 올렸으나, §60에서 확인했듯 이미 09-26 09:17 CEO 본인이 원인·조치를 직접 커밋(`79df1d3c`)해 의도적 영구정지 상태다 — 관찰 없이 이전 사이클 DIGEST 문구를 그대로 재상신한 것으로 추정([[coordination-handoff-must-be-row]] 계열, "WORK-ORDER 이월 항목은 매 사이클 재조회" 교훈의 discover-sweep 변종). 이번 세션이 WORK-ORDER 본문에서 해당 항목 제거·정정 완료(PRINCIPLES.md 신규 반영).
- coordination 미해결 0건, decisions L3 pending 5건(#1266~1270, 기조실장 직접 표본검증 후 상신)·approved 2건(#1264·1265, 4h대 정상 배포대기) DB 실측 확인 — WORK-ORDER 수치와 일치.

*비서실장 에이전트 | … → 2026-09-26(§60) → 2026-09-27 16:2x(§61, 드리프트 0 + CEO-92 등재 + WORK-ORDER discover-sweep 오탐 정정) 확인*

## 62. 16:3x 사이클 실측 (2026-09-28) — 드리프트 0(jobTeams.ts 1건은 이미 추적된 #1271 배포분), ★CEO 직접커밋 1건 신규 등재(CEO-93, AI맥락판정 게이트 누락 127곳) + 비용가드 SPOF 2회째 재발 활성 확인

- `git log --since="2026-09-27 15:14" -- web/lib/jobTeams.ts web/vercel.json`: 커밋 1건(`a3fec41d`, dev(#1271)) — 내용 확인 결과 `discover-sweep` EXPECT_MAX_H 항목 삭제(§60·61에서 이미 영구정지 확정된 잡의 RETIRED_JOBS 대칭조치, decisions#1271 09-28 08:28 배포 완료분). **신규 드리프트 아님** — §57 이후 반복된 discover-sweep "정지의심" 거짓경보의 근본 해소(정식 배포로 EXPECT_MAX_H 항목 자체 제거, 더 이상 self-audit이 volume 계산할 대상이 아님). `~/Library/LaunchAgents/com.coffee.*.plist` 목록 재확인: 신규·삭제 0. 핵심 08:00·17:00 2사이클 편성 무변경.
- **크론 건강**: `agent_runs` 48h 실측 ok=false **0건**(DB 직접조회). DIGEST가 표시한 💰5개 크론(cron-exposure·grow·resynth·sentinel·synth)은 **오늘 08:2x경(디지스트 대비 8.1h전, 현재시각 대비 역산) cost_guard 자동정지 발동**(오늘 총 디스크읽기 640.3GB, 임계 577.1GB) 여파 — `agent_runs`엔 ok:true로 찍히지만 실제로는 스킵(coordination#458에 이미 기록된 구조적 SPOF, 09-23에 이은 **2회째 재발**, 기획조정실장이 리뷰품질팀에 09-29 03:03 기한으로 구조개선 요청 중, WORK-ORDER 참조). 신규 발견 아님, 추적 중.
- **★CEO-ORDERS 신규 등재(CEO-93)**: `git log --since="2026-09-27 15:14"` 전체 대조 결과 dev_task 파이프라인(#1271·#1272·#1273, 이미 decisions로 추적됨) 외에 **CEO 직접커밋 1건**(`1964b67c`, 09-28 11:34) — "AI 맥락 판정 게이트 누락" 조사·수정. 관리자 대시보드 "AI 맥락 판정 63%" 표기가 실은 23.7%(분모에 needs_llm=false 카페까지 섞인 설계결함, 후속조치 별도필요)임을 확인하는 과정에서 **needs_llm=true인데 llm_judged_at IS NULL인 채 이미 공개 중인 카페 127곳**(7월2·8월20·9월105건 누적)을 실측 발견 — `app/api/orchestrator/route.ts`의 좌표백필 자가치유 크론(2시간마다 자동실행)이 정식 승격 게이트(`synthStore.ts` finalizePipeline의 `llm_judged_at IS NOT NULL OR needs_llm=false` 조건)를 빠뜨린 채 등급·좌표박스만 보고 published 복원하던 구조적 결함. 같은 패턴 grep으로 사람이 수동 실행하는 상비 복구스크립트 4종(resync-published·batch-publish-new·restore-miscat·recover-excluded)도 동일 조건 추가해 전수 차단. CEO-ORDERS.md에 CEO-93으로 신규 등재 완료(아래 참조).
- coordination 미해결 1건(#458, 위 SPOF — 추적 중, 신규 아님) 외 0건. decisions pending 2건(#1275 배지 크로스링크 조기결론·#1276 딥치즈스마일 비공개, 둘 다 오늘 오전 상신)·approved 2건(#1274 이슈#1420 구조수정·#1256 재큐잉분) DB 실측 확인 — WORK-ORDER 수치와 일치.

*비서실장 에이전트 | … → 2026-09-27 16:2x(§61) → 2026-09-28 16:3x(§62, 드리프트 0(discover-sweep 정식제거 확인) + CEO-93 등재 + 비용가드 SPOF 2회째 재발 활성 확인) 확인*

## 🌅 2026-10-17 신설 — 새벽 자동 배포 `com.coffee.dawn-deploy` (매일 06:00)
CEO 지시 "배포창 무조건 아침 6시에 자동으로 시작해". 러너 `web/scripts/dawn-deploy.sh`.
- **창 확대**: `.git/hooks/pre-push` 허용 창을 08~17시 → **06~17시**. 근거는 추측이 아니라 실측 —
  traffic_events 최근 7일 시간대별로 **00~23시 전 시간대가 7/7일 가동**(DB는 새벽에도 안 잠, 봇이 24h 깨움).
  훅에 적힌 "새벽에 재운다"는 전제가 이미 깨져 있었다. 06·07시는 사람 트래픽 최저(114·128회 vs 피크 535회)라
  ISR 재생성 폭풍이 사람 전에 끝난다 → 06시가 08시보다 유리하다.
- **안전장치 5겹**: ①미푸시 0건이면 빌드도 안 함(비용 0) ②추적 파일에 미커밋 변경 있으면 중단(사람 작업 보호)
  ③main 아니면 중단 ④`npm run build` 실패 시 푸시 안 함 ⑤결과를 heartbeat + macOS 알림으로 통지.
  URGENT을 쓰지 않는다 — 창을 우회하지 않고 창 안에서 돈다.
- 3종 세트 완료: 러너 heartbeat · `lib/jobTeams.ts`(JOB_TEAM·EXPECT_MAX_H 30h·LAUNCHD_JOBS) · 이 문서.
  등재 워치독(`scripts/watchdog-launchd.mjs`)은 plist 실물을 출처로 삼으므로 자동 포함됐다(대상 13→14개).

## 🔎 2026-10-17 신설 — 깊은 수집 `deep-collect` (collect-catchup 창 안, 하루 1회)
CEO 승인. 러너 `web/scripts/deep-collect.mjs`, collect-catchup.sh가 마커파일(/tmp/coffee-deep-YYYYMMDD)로 하루 1회 호출.
- **무엇**: 기본 수집이 질의당 `start=1`의 상위 100건만 받아 **이미 네이버에 있는 후기를 10~18배 놓치던 것**을 긁는다.
  실측: 한남작업실 원본 53건 ← 깊은 수집 10콜로 고유 링크 949건.
- **왜 최신화가 아니라 이것인가**: `/c/[id]` ISR 주기 30일 + 온디맨드 무효화 = **갱신이 곧 재생성**이다.
  최신화는 재생성 1장당 '며칠 새 글' 몇 건, 깊은 수집은 같은 1장으로 수백 건(영구 자산).
- 🔴 **이름일치 필터 필수**: 필터 없이 넣었더니 8곳 중 4곳의 검증 후기가 꺾였다(159→54 등).
  깊이 들어갈수록 느슨한 글이 섞여 오염률이 올라가 옥석 검증이 더 걸러낸다 — **많이 넣을수록 나빠진다.**
  통과율 실측 13~48%. 필터 적용 후 같은 카페가 159→315로 올랐고, 20곳 실전에서 차단 0건.
- **날리지 않는 3중**: ①추가만(상한 600이 기존을 밀어내지 않음) ②안 늘면 안 씀 ③차단되면 원본도 되돌림.
  그 위에 synthStore **급감 차단기**(공개·기존 10건↑·신규<기존×0.8 → 쓰기 거부)가 받친다.
- 💰 20곳 실측: 206초(곳당 10.3초) · 네이버 148콜(곳당 7.4) · Neon 쓰기 40건 · **ISR write 20장**(좁은 무효화로 곳당 1장,
  등급변경만 3장). 상한 300곳/일 → 네이버 ~2,200콜·ISR ~200장/일. 남은 대상 4,301곳을 약 15일에 한 바퀴.
- 🔑 **쿼터 유휴 해제**: `NAVER_COLLECT_RESERVE` 고정 16,000 → **적체 기반 동적**(`collectReserveNow`, 최소 1,000).
  적체 5곳인데 16,000을 예약해 **15,978콜/일이 버려지면서** 게이트를 used<7,800에 묶고 있었다(사용률 33%).
  이제 used<22,800까지 열린다(+15,000). 적체가 쌓이면 예약도 같이 커져 09-23의 보호가 복원된다.
- 3종 세트 완료: 러너 heartbeat(`deep-collect`) · jobTeams(JOB_TEAM 성장본부·EXPECT_MAX_H 30h) · 이 문서.
