// 🗺️ 잡 → 담당 본부 + 정상 최대 경과(시간) — **단일 사실 출처**.
//   과거 JOB_TEAM(cron-selfaudit)·CRONFAIL_TEAM(agentLog)·CRON_TEAM(issues) 3벌이 제각각 drift해
//   cron-issues가 10분마다 담당 본부를 '경영지원본부'로 덮어쓰던 사고의 근본 수리(2026-07-02 전수감사).
//   ⚠️ 잡 추가/제거 시 여기 **한 곳만** 갱신한다. (이 모듈은 아무것도 import하지 않아 순환참조 불가.)

export const JOB_TEAM: Record<string, string> = {
  "cron-exposure": "경험본부",   // 👁️ 노출 감시자(2026-08-08 신설) — 사용자가 실제로 보는 상위 6건 품질
  // Vercel 크론
  "cron-synth": "운영본부", "cron-resynth": "운영본부", "recollect-purged": "운영본부", "cron-embed": "운영본부", "cron-snapshot": "운영본부",
  "cron-closure": "운영본부", "cron-enrich": "운영본부",
  "orchestrator-heal": "품질본부", "cron-sentinel": "품질본부", "cron-verify": "품질본부", "cron-rulegap": "품질본부",
  "cron-batch-judge": "품질본부", "morning-sweep-report": "성장본부", "cron-criteria-verify": "품질본부",
  "cron-grow": "성장본부", "collect-catchup": "성장본부", "cron-demand": "성장본부", "cron-newsletter": "성장본부", "cron-discover-categories": "성장본부",
  "cafe-collect": "성장본부",
  "cron-issues": "경영지원본부", "cron-coord-consumer": "경영지원본부", "cron-billing": "경영지원본부",
  // 🔑 인증 프리체크(2026-08-29) — 사이클 시작 전 OAuth 생존 확인. **실패했을 때만** 기록되는 신호용 잡이라
  //   EXPECT_MAX_H에는 넣지 않는다(성공하면 아무 기록도 안 남는 게 정상 = staleness 감시 대상 아님).
  "auth-precheck": "기획조정실",
  "cron-costwatch": "경영지원본부", // Neon 데이터전송비 이상탐지 워치독(2026-07-29, CEO 지시 — youtube-backfill 663GB 사고 재발방지)
  // 로컬 launchd 잡(하트비트 경유)
  "dawn-deploy": "기획조정실", // 🌅2026-10-17 매일 06:00 자동 배포(미푸시 있을 때만 빌드·푸시)
  "deep-collect": "성장본부", // 🔎2026-10-17 깊은 수집(collect-catchup 창 안 하루 1회) — 이미 있는데 안 긁던 후기
  "discover-sweep": "성장본부", // 🔄2026-08-04 KST 12·20시 전 지역 발굴 스윕 — ⏸ 2026-09-21 정지(공공원장 적재로 대체, RETIRED_JOBS)
  "import-permits": "성장본부", // 🧾2026-09-21 매일 07:00 공공 인허가 원장 적재(--limit 2700, 실측 1.69콜/곳)
  "sangga-rollout": "성장본부", // 🏪2026-10-02 매일 07:00 소상공인 상가업소정보 수도권 롤아웃(CEO 지시, 원장과 별개 소스)
  "indexnow": "성장본부", // 🔎2026-09-13 KST 09:40 IndexNow 일일 제출(사이트맵 미제출분만 → 네이버·빙 수신)
  "neon-billing": "경영지원본부", // 💳2026-09-14 KST 07:50 Neon 실청구 지표 스냅샷(키가 로컬에만 있어 로컬이 DB에 적재)
  "youtube-backfill": "품질본부",
  "weekly-evaluation": "전략기획본부",
  "owner-weekly": "영업본부", // 🆕2026-09-07 매주 월 08:40 사장님 주간 당직 보고(v3) 자동발송 — 결정론·LLM 0원
  "chief-manager": "기획조정실", "self-audit": "기획조정실", "audit-watch": "기획조정실",
  "dev-pipeline": "기획조정실", "dev-deploy": "기획조정실",
  "chat-watch": "경영지원본부",
  // 리프 에이전트(run-daily/weekly 내부, _run.sh 하트비트) — 실패만 감지(staleness는 chief-manager가 대표)
  "integrity-agent": "품질본부", "rulegap-agent": "품질본부", "quality-redteam-agent": "품질본부", "deep-judge-agent": "품질본부",
  "demand-grow-agent": "성장본부",
  "marketing-agent": "영업본부", // ⚠️ org.ts(조직도 단일출처)는 마케팅팀=영업본부(B2C). 여기가 성장본부로 drift해 org-activity 롤업에서 영업본부가 b2b-sales만 남아 격일공백 37h→오탐 🟡. 2026-07-06 정합.
  "search-quality-agent": "경험본부", "b2b-sales-agent": "영업본부", "closure-agent": "운영본부",
  "chief-manager-agent": "기획조정실", "chief-secretary-agent": "기획조정실", "self-audit-agent": "기획조정실",
  "cron-selfaudit": "기획조정실", // ⚠️ org.ts(조직도 단일출처): 자율진단 감사실=기조실장 직할. 여기가 품질본부로 drift(sibling self-audit-agent는 기획조정실인데 혼자 어긋남)해 org-activity 롤업에서 감사실 활동이 품질본부로 잘못 귀속. 2026-07-09 정합(orgTeamDrift 감지).
  "dev-agent": "기획조정실",
  "strategy-agent": "전략기획본부",
  "evaluation": "경영지원본부", // ⚠️ org.ts: 평가 에이전트=인사팀(경영지원본부·주간평가·스코어카드·MVP·문화). 여기가 전략기획본부로 drift. 2026-07-09 org.ts에 정합(orgTeamDrift 감지). 방향 바꾸려면 org.ts 평가 에이전트 소속을 옮기면 자동 전파.
  "team-legal-agent": "경영지원본부", "team-finance-agent": "경영지원본부", "team-ops-support-agent": "경영지원본부",
  "risk-mgmt-agent": "경영지원본부", "support-office-director": "경영지원본부",
  // 제거된 잡(plist .disabled) — 재활성 시 팀 배정용으로만 유지. EXPECT_MAX_H엔 절대 넣지 말 것(정지 오탐).
  "dong-backfill": "운영본부", "qualityaudit": "품질본부",
};
export const teamOf = (job: string) => JOB_TEAM[job] ?? "경영지원본부";

// 크론별 정상 최대 경과(시간) — **여기 등록된 잡만 '정지의심' 감시 대상**(등록=감시 계약).
//   미등록 잡은 실패(ok=false)만 감지하고 staleness는 안 본다 — 일회성 스크립트·제거된 잡의
//   잔류 기록이 영구 오탐을 만들던 것(dormantIdle 우회 포함)의 구조적 차단.
export const EXPECT_MAX_H: Record<string, number> = {
  "cron-exposure": 30,   // 하루 1회 + 버퍼
  // Vercel 크론 (스케줄 + 버퍼)
  "cron-snapshot": 200, "cron-resynth": 14, "cron-newsletter": 200, "cron-discover-categories": 800,
  "cron-verify": 16, "cron-sentinel": 18, "cron-demand": 30, "cron-rulegap": 20, "cron-closure": 14,
  "cron-criteria-verify": 16, // 기준 검증 에이전트 2×/일 + 버퍼
  // 🔄 2026-08-04 4창 클러스터링(커밋 8da8c31, KST 08·12·16·20=UTC 3,7,11,23) 재계산: 4창 잡 최대공백 20→08시=12h(+버퍼14),
  //   2창 잡(enrich·orchestrator·sentinel UTC3,11) 최대공백 11→익일3시=16h(+버퍼18). EXPECT_MAX_H 미갱신이 정지 오탐 원인이었음(자율진단 #604).
  "cron-grow": 14, "collect-catchup": 30, // 🔄09-05: 4창(KST 08:05·12:05·16:05·20:05, 06:05 새벽드리프트 정정) 최대공백 12h + 버퍼(창 스킵 허용)
  "cron-enrich": 18, "cron-embed": 14, "cron-synth": 14, "morning-sweep-report": 30, "cron-issues": 14, "cron-coord-consumer": 14,
  "cron-billing": 30,     // 정기결제 크론 매일 1회 + 버퍼
  "orchestrator-heal": 18, // 2창(UTC 3,11) 최대공백 16h + 버퍼
  // 로컬 launchd 잡
  "import-permits": 30,    // 🧾2026-09-21 매일 07:00 원장 적재 + 버퍼
  "sangga-rollout": 30,    // 🏪2026-10-02 매일 07:00 상가업소정보 롤아웃 + 버퍼
  "indexnow": 30,          // 🔎2026-09-13 KST 09:40 하루 1회 + 버퍼
  "dawn-deploy": 30,      // 🌅2026-10-17 매일 06:00 + 버퍼(할 일 없는 날도 하트비트를 찍어 오탐 없음)
  "deep-collect": 30,     // 🔎2026-10-17 하루 1회(collect-catchup 창) + 버퍼
  "neon-billing": 30,      // 💳2026-09-14 KST 07:50 하루 1회 + 버퍼
  "chief-manager": 20,    // 일간 사이클 KST 08·12·16시
  "self-audit": 18,       // 🔄KST 12·16·20시 (최대공백 20→익일12시=16h + 버퍼)
  "weekly-evaluation": 30, // 매일 10:30 KST(격일 게이트지만 스킵도 하트비트)
  "owner-weekly": 192,     // 매주 월 08:40 KST — 주 1회(168h) + 버퍼 24h
  "search-quality-agent": 30, // 저녁블록 일 1회 + 버퍼 (coordination#296/#300, decisions#663·664)
  "b2b-sales-agent": 54,      // 격일(짝수/홀수 DOY 로테이션) + 버퍼 (coordination#296/#300, decisions#663·664)
  // 🩹 2026-09-29 — deep-judge-agent가 EXPECT_MAX_H 밖이라 .ai-paused(07-01)로 81일 무실행이 아무 경보 없이
  //   방치됐다(대표님 지시로 발견). 정지 중엔 heartbeat.mjs가 ok=true로 매회 갱신하므로(run-deep-judge-agent.sh)
  //   여기 등록해도 오탐 없다 — 정지가 풀렸는데 진짜로 죽으면 그때만 이 임계가 잡아준다.
  "deep-judge-agent": 60,     // 격일 08·17시 + 버퍼(정지 중엔 heartbeat가 항상 갱신해 오탐 없음)
  // 🔄 2026-08-04: chat-watch 폴링(1.5초) 정지로 DB 24h깨우기 제거(컴퓨트 절감) → 로컬 폴러 3개도 60분→KST 08·12·16·20시(최대공백 12h+버퍼14).
  "audit-watch": 14,      // 이벤트 워처 KST 08·12·16·20시
  "dev-pipeline": 14,     // 개발 파이프라인 KST 08·12·16·20시
  "dev-deploy": 14,       // 배포 워처 KST 08·12·16·20시
  "cron-costwatch": 30,   // Neon 비용 이상탐지, 매일 09:20 UTC(18:20 KST) + 버퍼(2026-07-29 CEO 지시)

  // 🔴 2026-10-16 **부모만 보던 감시의 근본수리**(CEO "자율 서비스 만들었는데 작동 안 시킨다").
  //   실측 사고: `chief-manager`(부모)는 하트비트 1.4h전으로 **초록**이었는데, 그 안에서 돌아야 할
  //   리프 에이전트 6개가 13~15일 무실행이었다. 08시 블록 전용 잡들이라 16시 사이클만 돈 날엔 아예 안 돈다.
  //   orchestrator.log 증거: 일간 사이클이 **10-03 16:05 → 10-16 16:05, 13일 공백**(10-04~15 launchd 미등재).
  //   부모 하트비트가 자식의 침묵을 덮어 "감시 초록 + 실제 정지"가 13일간 공존했다.
  //   → 리프 에이전트도 **자기 계약을 갖는다**. 임계는 run-daily.sh/run-weekly.sh의 실제 분기에서 역산한 최대공백+버퍼.
  //   ⚠️ 과거 리프를 뺀 이유(= lib/issues.ts가 '계약 없음'을 은퇴로 *추론*해 결재를 오종결, #200)는
  //      2026-07-07 근본수리로 사라졌다(이제 RETIRED_JOBS 명시 집합만 본다, issues.ts:278) → 넣어도 안전.
  // ── run-daily.sh (launchd 08:05·12:05·16:05)
  "rulegap-agent": 20,          // 매 사이클 3× — 최대공백 16:05→익일 08:05=16h + 버퍼
  "self-audit-agent": 20,       // 풀 사이클(08·16) — 최대공백 16h + 버퍼
  "integrity-agent": 30,        // 08시 1×(09-05 비용다이어트로 3×→1×) — 24h + 버퍼
  "quality-redteam-agent": 30,  // 08시 1× — 위와 짝
  "closure-agent": 30,          // 08시 1× — 폐업 감지
  "demand-grow-agent": 30,      // 08시 1× — 발굴
  "marketing-agent": 54,        // 격일 저녁(b2b와 DOY 로테이션) — 48h + 버퍼
  "chief-manager-agent": 30,    // 저녁(H≥15) 1× 종합 — 24h + 버퍼
  "chief-secretary-agent": 30,  // 저녁 1× 비서실장 — 위와 짝
  // ── run-weekly.sh (launchd 10:30, 월·목 게이트)
  "evaluation": 192,              // 월요일만 — 168h + 버퍼 24h
  "team-legal-agent": 192,        // 월요일만
  "team-finance-agent": 192,      // 월요일만
  "team-ops-support-agent": 192,  // 월요일만
  "support-office-director": 192, // 월요일만
  "risk-mgmt-agent": 120,         // 월·목 2× — 최대공백 목→월 96h + 버퍼
  "strategy-agent": 120,          // 월·목 2× — 위와 짝

  // ⚠️ cron-selfaudit 자신은 여기 못 넣는다(자기 정지를 자기가 감지 불가) — 로컬 run-trigger-watch.sh의
  //   결정론 워치독이 감시(7h+ 미실행 시 ok=false 하트비트로 에스컬레이션).
  // ⚠️ auth-precheck도 넣지 않는다 — **실패할 때만 기록**하는 잡이라 무기록=정상이다(위 17행 규칙).
  //   실측 2026-10-16: 마지막 기록 33일 전 = 33일간 인증 실패 0건. 계약에 넣으면 영구 오탐이 된다.
  // ⚠️ dev-agent는 dev-pipeline 경유로만 돌아 부모가 은퇴 중이면 같이 멈춘다 → RETIRED_JOBS에 짝으로 둔다.
};

// 🛠 **로컬 launchd 잡의 표시 메타(라벨·스케줄) 단일 출처** — /admin/org '핵심 잡 신선도' 카드용.
//   과거 app/api/admin/jobs/route.ts가 팀·maxH를 손으로 3번째 복사했다가 어긋난 전례(2026-07-02) →
//   이제 그 라우트는 이 맵을 순회하며 team=JOB_TEAM[k]·maxH=EXPECT_MAX_H[k]로 파생한다. 여기 잡을 추가하면
//   (JOB_TEAM·EXPECT_MAX_H와 함께 3종 세트로) 신선도 카드에 **자동 반영**. label=화면명, sched=사람이 읽는 주기.
//   ⚠️ 여기 넣는 잡은 반드시 EXPECT_MAX_H에도 있어야(정지 감시 계약). 은퇴 잡은 넣지 말 것.
export const LAUNCHD_JOBS: Record<string, { label: string; sched: string }> = {
  "chief-manager":     { label: "일간 사이클",     sched: "08·12·16시" },
  "self-audit":        { label: "자율진단",        sched: "12·16·20시" },
  "audit-watch":       { label: "이벤트 워처",     sched: "08·12·16·20시" },
  "dev-pipeline":      { label: "개발 파이프라인", sched: "승인 즉시+08·12·16·20시" },
  "dev-deploy":        { label: "배포 워커",       sched: "승인 즉시+08·12·16·20시" },
  "weekly-evaluation": { label: "주간 거버넌스",   sched: "10:30(격일)" },
  "discover-sweep":    { label: "발굴 스윕",       sched: "정지(09-21)" },
  "import-permits":    { label: "원장 적재",       sched: "07:00" },
  "sangga-rollout":    { label: "상가업소 롤아웃", sched: "07:00" },
  "indexnow":          { label: "IndexNow 제출",   sched: "09:40" },
  "neon-billing":      { label: "Neon 청구 스냅샷", sched: "07:50" },
  "dawn-deploy":       { label: "새벽 자동 배포",   sched: "06:00" },
};

// 🛑 **의도적으로 은퇴(plist .disabled)한 잡의 명시적 단일 출처.**
//   과거 lib/issues.ts는 '은퇴'를 "JOB_TEAM엔 있으나 EXPECT_MAX_H엔 없음"으로 *추론*했는데,
//   그 조건엔 staleness를 chief-manager가 대표 감시하는 **활성** 리프 에이전트 ~20개(self-audit-agent·
//   quality-redteam-agent·team-legal-agent·dev-agent 등)가 전부 걸린다 → 그들의 investigate 결재가
//   CEO가 보기도 전에(수십초~2분) '은퇴 확인'으로 오종결돼 L3 에스컬레이션이 무력화됐다(2026-07-07 #200).
//   → 진짜 은퇴는 여기 **명시적으로만** 표기한다. 은퇴 시 추가, 재활성 시 제거(위 JOB_TEAM 주석과 동기).
export const RETIRED_JOBS: ReadonlySet<string> = new Set(["dong-backfill", "qualityaudit", "chat-watch", "youtube-backfill", "recollect-purged", "cron-batch-judge", "discover-sweep",
  // 🔴 2026-10-16 정리(CEO "관제탑 에러 좀 잡아라") — 10-03 비용비상으로 전부 내린 뒤 13일간 방치돼
  //   감시계약 36개 중 22개가 '정지의심'으로 떠 있었다. 다시 켠 것은 계약에 그대로 두고(다음 회차에 자동 해소),
  //   **의도적으로 안 켜는 것만** 여기로 내린다 — 안 고칠 걸 빨갛게 띄워두면 진짜 문제가 묻힌다.
  //   ⚠️ 아래 넷은 '폐기'가 아니라 **CEO 승인 대기**다. 승인되면 이 Set에서 빼고 plist/gate를 켜면 된다.
  "owner-weekly",     // 사장님 주간 메일 — 고객에게 직접 발송이라 CEO 승인 전엔 안 켠다
  "cron-newsletter",  // 주간 뉴스레터 발송 — 같은 이유
  "dev-deploy",       // 자동 배포 — CEO가 배포 시점을 직접 통제 중(10-10 사고 이후)
  "dev-pipeline",     // 자동 개발 파이프라인 — 위와 짝
  // 🔴 2026-10-16 **정정(제 오판)** — search-quality-agent·b2b-sales-agent를 "plist가 없어 영구 오탐"이라며
  //   여기 내렸는데, 둘은 **plist가 아니라 run-daily.sh의 저녁 블록에서 실행된다**(부모 = com.coffee.chief-manager).
  //   실측 반증: 같은 날 16:05 사이클에서 search-quality 1.7h전·b2b-sales 1.6h전 정상 하트비트.
  //   '호출처를 plist에서만 찾은' 탐색 실수였다 → 은퇴 해제, 계약(위 73·74행) 유지.
  "dev-agent",        // dev-pipeline 경유로만 실행 — 부모가 승인 대기 중이라 짝으로 은퇴(단독 실행수단 없음)
  // sangga-rollout: 10-10 cost_guard 전역정지(399.9GB)의 진범 경로. 쿼리는 인덱스로 고쳤지만
  //   **공개 전환율이 1%**(discover 69%·permit 47% 대비)라 같은 쿼터를 여기 쓰는 게 손해다(10-16 실측).
  "sangga-rollout",
]); // discover-sweep: 2026-09-21 CEO 승인 정지 — 공공원장 적재(import-permits, 1.69콜/곳)가 발굴(16.9콜/곳)을 대체. plist unload. // chat-watch: 2026-08-04 컴퓨트 절감 위해 정지(관제 챗봇, 필요시 수동 재기동)
// youtube-backfill: 2026-08-12 CEO 지시로 정지 — 몇 달간 커버리지 24%(3,302/13,495)에 남은 분량 107일 소요 대비 매 실행 GB급 판독. 재기동 = plist에서 .disabled 제거 후 launchctl load.
// recollect-purged: 2026-09-17 13:22 CEO 승인 폐지(24a60fbe, plist .disabled). cron-batch-judge: vercel.json crons에서 제거된 폐지 잡.
export const isRetired = (job: string) => RETIRED_JOBS.has(job);
