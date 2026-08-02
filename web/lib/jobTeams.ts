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
  "discover-sweep": "성장본부", // 매일 02:30 KST 전 지역 발굴 스윕(네이버 한도 최대 수집)
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
  "cron-snapshot": 200, "cron-resynth": 9, "cron-newsletter": 200, "cron-discover-categories": 800,
  "cron-verify": 16, "cron-sentinel": 16, "cron-demand": 30, "cron-rulegap": 16, "cron-closure": 12, // verify·sentinel·rulegap 2×/일(12h)로 촘촘화 → 정지감지도 30→16h로 타이트하게(2026-07-05)
  "cron-criteria-verify": 16, // 기준 검증 에이전트 2×/일(07:50·19:50 KST=12h) + 버퍼 — dead-knob·기준드리프트 결정론 감시(품질본부)
  // 2026-08-01 47ffe86 통잠창(KST 01-07=UTC16-22 제외) 재배치로 최대 공백이 커져 재계산(2026-08-02, decisions#580):
  //   cron-grow(0-11시): 11→익일0시 13h 공백 + 버퍼=14. cron-resynth/embed/synth/issues/coord-consumer(0-15,23시): 15→23시 8h 공백 + 버퍼=9.
  "cron-grow": 14, "cron-enrich": 8, "cron-embed": 9, "cron-synth": 9, "cron-issues": 9, "cron-coord-consumer": 9,
  "cron-billing": 30,     // 정기결제 크론 매일 09:00 KST + 버퍼(dunning 재시도 일 1회)
  "orchestrator-heal": 6,
  // 로컬 launchd 잡
  "discover-sweep": 30,    // 매일 02:30 KST 발굴 스윕 + 버퍼(네이버 한도서 중단해도 익일 재개)
  "youtube-backfill": 30, // 일배치 16:30 KST + 버퍼
  "chief-manager": 20,    // 일간 사이클 08·17시 KST
  "self-audit": 16,       // 매일 11:30·15:30·21:30 KST 3회 + 일간 사이클 내 실행 (최대 공백 밤 14h + 버퍼)
  "weekly-evaluation": 30, // 매일 10:30 KST(격일 게이트지만 스킵도 하트비트)
  "audit-watch": 2,       // 이벤트 워처 60분(2026-07-28 CEO 지시: Neon 폴링비용 절감, 5분→60분)
  "chat-watch": 1,        // 관제 챗봇 상주(60초 하트비트)
  "dev-pipeline": 2,      // 개발 파이프라인 60분(2026-07-28 CEO 지시: Neon 폴링비용 절감, 5분→60분)
  "dev-deploy": 2,        // 배포 워처 60분(2026-07-28 CEO 지시: Neon 폴링비용 절감, 2분→60분)
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
  "chief-manager":     { label: "일간 사이클",     sched: "08·12·17시" },
  "self-audit":        { label: "자율진단",        sched: "11:30·15:30·21:30" },
  "audit-watch":       { label: "이벤트 워처",     sched: "60분" },
  "dev-pipeline":      { label: "개발 파이프라인", sched: "60분" },
  "dev-deploy":        { label: "배포 워커",       sched: "60분" },
  "youtube-backfill":  { label: "유튜브 수집",     sched: "16:30" },
  "weekly-evaluation": { label: "주간 거버넌스",   sched: "10:30(격일)" },
  "chat-watch":        { label: "관제 챗봇",       sched: "상주" },
  "discover-sweep":    { label: "발굴 스윕",       sched: "02:30·14:30" },
};

// 🛑 **의도적으로 은퇴(plist .disabled)한 잡의 명시적 단일 출처.**
//   과거 lib/issues.ts는 '은퇴'를 "JOB_TEAM엔 있으나 EXPECT_MAX_H엔 없음"으로 *추론*했는데,
//   그 조건엔 staleness를 chief-manager가 대표 감시하는 **활성** 리프 에이전트 ~20개(self-audit-agent·
//   quality-redteam-agent·team-legal-agent·dev-agent 등)가 전부 걸린다 → 그들의 investigate 결재가
//   CEO가 보기도 전에(수십초~2분) '은퇴 확인'으로 오종결돼 L3 에스컬레이션이 무력화됐다(2026-07-07 #200).
//   → 진짜 은퇴는 여기 **명시적으로만** 표기한다. 은퇴 시 추가, 재활성 시 제거(위 JOB_TEAM 주석과 동기).
export const RETIRED_JOBS: ReadonlySet<string> = new Set(["dong-backfill", "qualityaudit"]);
export const isRetired = (job: string) => RETIRED_JOBS.has(job);
