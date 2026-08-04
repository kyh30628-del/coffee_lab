// 🗺️ 잡 → 담당 본부 + 정상 최대 경과(시간) — **단일 사실 출처**.
//   과거 JOB_TEAM(cron-selfaudit)·CRONFAIL_TEAM(agentLog)·CRON_TEAM(issues) 3벌이 제각각 drift해
//   cron-issues가 10분마다 담당 본부를 '경영지원본부'로 덮어쓰던 사고의 근본 수리(2026-07-02 전수감사).
//   ⚠️ 잡 추가/제거 시 여기 **한 곳만** 갱신한다. (이 모듈은 아무것도 import하지 않아 순환참조 불가.)

export const JOB_TEAM: Record<string, string> = {
  // Vercel 크론
  "cron-synth": "운영본부", "cron-resynth": "운영본부", "cron-embed": "운영본부", "cron-snapshot": "운영본부",
  "cron-closure": "운영본부", "cron-enrich": "운영본부",
  "orchestrator-heal": "품질본부", "cron-sentinel": "품질본부", "cron-verify": "품질본부", "cron-rulegap": "품질본부",
  "cron-batch-judge": "품질본부", "cron-criteria-verify": "품질본부",
  "cron-grow": "성장본부", "cron-demand": "성장본부", "cron-newsletter": "성장본부", "cron-discover-categories": "성장본부",
  "cafe-collect": "성장본부",
  "cron-issues": "경영지원본부", "cron-coord-consumer": "경영지원본부", "cron-billing": "경영지원본부",
  "cron-costwatch": "경영지원본부", // Neon 데이터전송비 이상탐지 워치독(2026-07-29, CEO 지시 — youtube-backfill 663GB 사고 재발방지)
  // 로컬 launchd 잡(하트비트 경유)
  "discover-sweep": "성장본부", // 🔄2026-08-04 KST 12·20시 전 지역 발굴 스윕(새벽 02:30 → 낮으로 이동, DB통잠)
  "youtube-backfill": "품질본부",
  "weekly-evaluation": "전략기획본부",
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
  // Vercel 크론 (스케줄 + 버퍼)
  "cron-snapshot": 200, "cron-resynth": 14, "cron-newsletter": 200, "cron-discover-categories": 800,
  "cron-verify": 16, "cron-sentinel": 18, "cron-demand": 30, "cron-rulegap": 20, "cron-closure": 14,
  "cron-criteria-verify": 16, // 기준 검증 에이전트 2×/일 + 버퍼
  // 🔄 2026-08-04 4창 클러스터링(커밋 8da8c31, KST 08·12·16·20=UTC 3,7,11,23) 재계산: 4창 잡 최대공백 20→08시=12h(+버퍼14),
  //   2창 잡(enrich·orchestrator·sentinel UTC3,11) 최대공백 11→익일3시=16h(+버퍼18). EXPECT_MAX_H 미갱신이 정지 오탐 원인이었음(자율진단 #604).
  "cron-grow": 14, "cron-enrich": 18, "cron-embed": 14, "cron-synth": 14, "cron-issues": 14, "cron-coord-consumer": 14,
  "cron-billing": 30,     // 정기결제 크론 매일 1회 + 버퍼
  "orchestrator-heal": 18, // 2창(UTC 3,11) 최대공백 16h + 버퍼
  // 로컬 launchd 잡
  "discover-sweep": 30,    // 🔄2026-08-04 KST 12·20시 발굴 스윕 + 버퍼
  "youtube-backfill": 30, // 일배치 16:30 KST + 버퍼
  "chief-manager": 20,    // 일간 사이클 KST 08·12·16시
  "self-audit": 18,       // 🔄KST 12·16·20시 (최대공백 20→익일12시=16h + 버퍼)
  "weekly-evaluation": 30, // 매일 10:30 KST(격일 게이트지만 스킵도 하트비트)
  // 🔄 2026-08-04: chat-watch 폴링(1.5초) 정지로 DB 24h깨우기 제거(컴퓨트 절감) → 로컬 폴러 3개도 60분→KST 08·12·16·20시(최대공백 12h+버퍼14).
  "audit-watch": 14,      // 이벤트 워처 KST 08·12·16·20시
  "dev-pipeline": 14,     // 개발 파이프라인 KST 08·12·16·20시
  "dev-deploy": 14,       // 배포 워처 KST 08·12·16·20시
  "cron-costwatch": 30,   // Neon 비용 이상탐지, 매일 09:20 UTC(18:20 KST) + 버퍼(2026-07-29 CEO 지시)
  // ⚠️ cron-selfaudit 자신은 여기 못 넣는다(자기 정지를 자기가 감지 불가) — 로컬 run-trigger-watch.sh의
  //   결정론 워치독이 감시(7h+ 미실행 시 ok=false 하트비트로 에스컬레이션).
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
  "dev-pipeline":      { label: "개발 파이프라인", sched: "08·12·16·20시" },
  "dev-deploy":        { label: "배포 워커",       sched: "08·12·16·20시" },
  "youtube-backfill":  { label: "유튜브 수집",     sched: "16:30" },
  "weekly-evaluation": { label: "주간 거버넌스",   sched: "10:30(격일)" },
  "discover-sweep":    { label: "발굴 스윕",       sched: "12·20시" },
};

// 🛑 **의도적으로 은퇴(plist .disabled)한 잡의 명시적 단일 출처.**
//   과거 lib/issues.ts는 '은퇴'를 "JOB_TEAM엔 있으나 EXPECT_MAX_H엔 없음"으로 *추론*했는데,
//   그 조건엔 staleness를 chief-manager가 대표 감시하는 **활성** 리프 에이전트 ~20개(self-audit-agent·
//   quality-redteam-agent·team-legal-agent·dev-agent 등)가 전부 걸린다 → 그들의 investigate 결재가
//   CEO가 보기도 전에(수십초~2분) '은퇴 확인'으로 오종결돼 L3 에스컬레이션이 무력화됐다(2026-07-07 #200).
//   → 진짜 은퇴는 여기 **명시적으로만** 표기한다. 은퇴 시 추가, 재활성 시 제거(위 JOB_TEAM 주석과 동기).
export const RETIRED_JOBS: ReadonlySet<string> = new Set(["dong-backfill", "qualityaudit", "chat-watch"]); // chat-watch: 2026-08-04 컴퓨트 절감 위해 정지(관제 챗봇, 필요시 수동 재기동)
export const isRetired = (job: string) => RETIRED_JOBS.has(job);
