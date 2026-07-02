// 🗺️ 잡 → 담당 본부 + 정상 최대 경과(시간) — **단일 사실 출처**.
//   과거 JOB_TEAM(cron-selfaudit)·CRONFAIL_TEAM(agentLog)·CRON_TEAM(issues) 3벌이 제각각 drift해
//   cron-issues가 10분마다 담당 본부를 '경영지원본부'로 덮어쓰던 사고의 근본 수리(2026-07-02 전수감사).
//   ⚠️ 잡 추가/제거 시 여기 **한 곳만** 갱신한다. (이 모듈은 아무것도 import하지 않아 순환참조 불가.)

export const JOB_TEAM: Record<string, string> = {
  // Vercel 크론
  "cron-synth": "운영본부", "cron-resynth": "운영본부", "cron-embed": "운영본부", "cron-snapshot": "운영본부",
  "cron-closure": "운영본부", "cron-enrich": "운영본부",
  "orchestrator-heal": "품질본부", "cron-sentinel": "품질본부", "cron-verify": "품질본부", "cron-rulegap": "품질본부",
  "cron-selfaudit": "품질본부", "cron-batch-judge": "품질본부",
  "cron-grow": "성장본부", "cron-demand": "성장본부", "cron-newsletter": "성장본부", "cron-discover-categories": "성장본부",
  "cafe-collect": "성장본부",
  "cron-issues": "경영지원본부", "cron-coord-consumer": "경영지원본부",
  // 로컬 launchd 잡(하트비트 경유)
  "youtube-backfill": "품질본부",
  "weekly-evaluation": "전략기획본부",
  "chief-manager": "기획조정실", "self-audit": "기획조정실", "audit-watch": "기획조정실",
  "dev-pipeline": "기획조정실", "dev-deploy": "기획조정실",
  "chat-watch": "경영지원본부",
  // 리프 에이전트(run-daily/weekly 내부, _run.sh 하트비트) — 실패만 감지(staleness는 chief-manager가 대표)
  "integrity-agent": "품질본부", "rulegap-agent": "품질본부", "quality-redteam-agent": "품질본부", "deep-judge-agent": "품질본부",
  "demand-grow-agent": "성장본부", "marketing-agent": "성장본부",
  "search-quality-agent": "경험본부", "b2b-sales-agent": "영업본부", "closure-agent": "운영본부",
  "chief-manager-agent": "기획조정실", "chief-secretary-agent": "기획조정실", "self-audit-agent": "기획조정실",
  "morning-meeting-agent": "기획조정실", "dev-agent": "기획조정실",
  "evaluation": "전략기획본부", "strategy-agent": "전략기획본부",
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
  "cron-snapshot": 200, "cron-resynth": 200, "cron-newsletter": 200, "cron-discover-categories": 800,
  "cron-verify": 30, "cron-sentinel": 30, "cron-demand": 30, "cron-rulegap": 30, "cron-closure": 12,
  "cron-grow": 6, "cron-enrich": 8, "cron-embed": 4, "cron-synth": 4, "cron-issues": 2, "cron-coord-consumer": 2,
  "orchestrator-heal": 6,
  // 로컬 launchd 잡
  "youtube-backfill": 30, // 일배치 16:30 KST + 버퍼
  "chief-manager": 20,    // 일간 사이클 08·17시 KST
  "self-audit": 16,       // 매일 11:30·15:30·21:30 KST 3회 + 일간 사이클 내 실행 (최대 공백 밤 14h + 버퍼)
  "weekly-evaluation": 30, // 매일 10:30 KST(격일 게이트지만 스킵도 하트비트)
  "audit-watch": 1,       // 이벤트 워처 5분
  "chat-watch": 1,        // 관제 챗봇 상주(60초 하트비트)
  "dev-pipeline": 1,      // 개발 파이프라인 5분
  "dev-deploy": 1,        // 배포 워처 2분
  // ⚠️ cron-selfaudit 자신은 여기 못 넣는다(자기 정지를 자기가 감지 불가) — 로컬 run-trigger-watch.sh의
  //   결정론 워치독이 감시(7h+ 미실행 시 ok=false 하트비트로 에스컬레이션).
};
