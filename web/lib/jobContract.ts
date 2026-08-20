import { JOB_TEAM, EXPECT_MAX_H, teamOf, isRetired } from "./jobTeams";

// 📜 작업 계약(Job Contract) — 하네스 L1.
//
// 왜 필요한가: 잡의 성질이 네 곳에 흩어져 있었다.
//   · 소유 팀      → jobTeams.JOB_TEAM
//   · 정지 임계     → jobTeams.EXPECT_MAX_H
//   · 권한(L0~L3)  → PRINCIPLES.md (문서만, 코드 강제 없음)
//   · **자원 예산**  → 어디에도 없음  ← 2026-08-03 청구 3배 사고 때 "누가 태웠는지"를 손으로 추적해야 했던 이유
//
// 설계: `criteria.ts`가 이미 검증한 패턴을 그대로 쓴다 — **코드에 진실원본 + 안전 폴백**.
//   jobTeams.ts는 **건드리지 않고 흡수**한다(8개 파일이 import 중). 여기서 team·expectMaxH를 파생하고,
//   계약에만 있는 신규 필드(tier·budget·effect)를 얹는다. 미등록 잡도 안전한 기본 계약으로 동작한다.
//
// ⚠️ 도입은 3단 완화(관측 → 경고 → 강제). 지금은 **관측 모드**다 — 예산을 넘겨도 막지 않고 기록만 한다.
//    34개 잡에 한 번에 강제하면 서비스가 멈출 수 있다.

export type EnforceMode = "observe" | "warn" | "enforce";

export type JobContract = {
  id: string;
  owner: string;                       // JOB_TEAM에서 파생(단일 사실 출처 유지)
  tier: "L0" | "L1" | "L2" | "L3";     // PRINCIPLES.md의 DoA를 코드로
  expectMaxH?: number;                 // EXPECT_MAX_H에서 파생
  budget: {
    blobReads?: number;                // raw_reviews·synth_reviews_all급 큰 컬럼 로드 상한
    rows?: number;                     // 일반 행 조회 상한
    wallMs?: number;                   // 시간 예산
  };
  effect?: {
    kind: "monotone-decrease" | "idempotent" | "none";
    maxNoEffectRuns: number;
  };
  writes?: string[];                   // 이 잡이 바꿔도 되는 대상(문서·검증용)
};

// 기본 계약 — 미등록 잡도 안전하게 동작(막지 않되, 큰 컬럼은 보수적으로 제한).
const DEFAULT_CONTRACT: Omit<JobContract, "id" | "owner"> = {
  tier: "L0",
  budget: { blobReads: 24, rows: 20000, wallMs: 300_000 },
  effect: { kind: "none", maxNoEffectRuns: 2 },
};

// 명시 계약 — 무거운 잡·데이터 변경 잡만 선언한다(나머지는 기본 계약).
//   ⚠️ 값의 근거를 주석에 남길 것. 근거 없는 숫자는 다음 사람이 못 고친다.
const CONTRACTS: Record<string, Partial<JobContract>> = {
  // 오염 감시·치유 — 2026-08-08 산정치(12곳×2=24)는 이후 issues#5548로 낡음이 드러났다: decision#499/#674로
  //   교차오염(경쟁상호·동일브랜드 지점) 탐지·힐러가 편입되면서 카테고리가 5→7종으로 늘었고, 그중 인용문 교차오염
  //   힐러(healCompetitorQuotePollution)는 개수 상한 없이 시간예산(270s)까지 flag된 카페 전량을 힐한다 —
  //   나머지 5종처럼 slice(0,12)로 고정 상한을 걸 수 없는 성격(오염 재발이 몰리는 주기엔 정상적으로 급증).
  //   9일 실측(run_ledger, 08-11~08-20, n=43): 평균 18·최댓값 151. 정상 변동폭을 예산으로 오탐하지 않으면서
  //   2026-08-03류 진짜 폭주(13,000곳×8스캔)는 여전히 잡도록, cron-resynth와 같은 상한 200으로 올린다.
  "cron-sentinel": {
    tier: "L2", budget: { blobReads: 200, rows: 40000, wallMs: 300_000 },
    effect: { kind: "monotone-decrease", maxNoEffectRuns: 2 },
    writes: ["cafes.synth_reviews", "cafes.synth_reviews_all", "cafes.judge_decisions", "cafes.published", "reviewer_cafes.*"],
  },
  // 재합성 — 전수 적용 배치. raw를 카페당 1회 로드하므로 상한이 곧 처리 곳수
  "cron-resynth": { tier: "L2", budget: { blobReads: 200, rows: 40000, wallMs: 300_000 }, writes: ["cafes.synth_*", "reviewer_cafes.*"] },
  "cron-synth": { tier: "L2", budget: { blobReads: 60, rows: 40000, wallMs: 300_000 }, writes: ["cafes.synth_*", "cafes.published", "reviewer_cafes.*"] },
  // 발굴·수집 — 네이버 쿼터가 진짜 제약(일 25,000). 신규 발굴 카페를 합성할 때 raw를 곳당 1회 로드한다
  //   (5일 실측: 런당 1~6회, 합성 상한 5곳+검증여유). 08-08의 blobReads:0 선언은 이 정당 경로를 몰랐던 오기 —
  //   실측 관찰 후 확정하기로 한 CEO 결정(08-09 "후자로")의 이행이 이 값이다.
  "cron-grow": { tier: "L0", budget: { blobReads: 12, rows: 20000, wallMs: 300_000 } },
  "discover-sweep": { tier: "L0", budget: { blobReads: 0, rows: 20000, wallMs: 900_000 } },
  // 유튜브 백필 — 2026-07 전송 663GB 사고의 주범이었던 경로(LIMIT 5 반복쿼리)
  "youtube-backfill": { tier: "L0", budget: { blobReads: 120, rows: 20000, wallMs: 1_800_000 } },
  // 합성·발굴·수집 — 쓰기 대상을 선언해야 L3 스코프가 드리프트를 잡는다(미선언이면 통과)
  "cron-embed": { tier: "L2", budget: { blobReads: 0, rows: 20000, wallMs: 300_000 }, writes: ["cafes.embedding", "cafes.embed_updated"] },
  "cron-enrich": { tier: "L2", budget: { blobReads: 0, rows: 20000, wallMs: 300_000 }, writes: ["cafes.reputation_note", "cafes.enriched_at", "cafes.rating", "cafes.rating_count"] },
  "cron-closure": { tier: "L2", budget: { blobReads: 0, rows: 20000, wallMs: 300_000 }, writes: ["cafes.closure_misses", "cafes.closure_checked_at"] },
  "cron-verify": { tier: "L0", budget: { blobReads: 0, rows: 20000, wallMs: 300_000 } },
  "cron-rulegap": { tier: "L2", budget: { blobReads: 12, rows: 20000, wallMs: 300_000 }, writes: ["cafes.synth_*", "cafes.published", "learned_terms.*"] },
  "cron-issues": { tier: "L2", budget: { blobReads: 0, rows: 20000, wallMs: 300_000 }, writes: ["cafes.published", "cafes.pipeline_status", "issues.*", "decisions.*"] },
  "cron-coord-consumer": { tier: "L2", budget: { blobReads: 0, rows: 10000, wallMs: 300_000 } },
  "cron-demand": { tier: "L0", budget: { blobReads: 0, rows: 10000, wallMs: 300_000 } },
  // 읽기 전용 감시류
  "cron-costwatch": { tier: "L0", budget: { blobReads: 0, rows: 5000, wallMs: 120_000 } },
  "cron-selfaudit": { tier: "L0", budget: { blobReads: 0, rows: 20000, wallMs: 300_000 } },
  "cron-criteria-verify": { tier: "L0", budget: { blobReads: 0, rows: 5000, wallMs: 120_000 } },
  // 노출 감시(하네스 L5 신설) — 샘플링만, 큰 컬럼 금지
  "cron-exposure": { tier: "L0", budget: { blobReads: 0, rows: 5000, wallMs: 120_000 } },
  // 코드 변경 라인 — 배포는 CEO 게이트
  "dev-deploy": { tier: "L3", budget: { blobReads: 0, rows: 5000, wallMs: 600_000 } },
  "dev-pipeline": { tier: "L3", budget: { blobReads: 0, rows: 5000, wallMs: 600_000 } },
};

export function getContract(job: string): JobContract {
  const c = CONTRACTS[job] ?? {};
  return {
    id: job,
    owner: teamOf(job),
    tier: c.tier ?? DEFAULT_CONTRACT.tier,
    expectMaxH: EXPECT_MAX_H[job],
    budget: { ...DEFAULT_CONTRACT.budget, ...(c.budget ?? {}) },
    effect: c.effect ?? DEFAULT_CONTRACT.effect,
    writes: c.writes,
  };
}

export const ALL_CONTRACT_IDS = Object.keys(CONTRACTS);

/**
 * 🔍 계약 검증 — `cron-criteria-verify`의 dead-knob 검사와 같은 취지.
 *   계약과 현실이 갈라지는 4가지를 결정론으로 잡는다. (조회는 호출부가 넘겨준 목록만 사용 — DB 추가 조회 없음)
 */
export function verifyContracts(runningJobs: string[]): { kind: string; job: string; note: string }[] {
  const out: { kind: string; job: string; note: string }[] = [];
  const running = new Set(runningJobs.filter((j) => !isRetired(j)));
  for (const j of running) {
    if (!(j in JOB_TEAM)) out.push({ kind: "고아 잡", job: j, note: "실행되는데 팀 배정이 없음(관리 밖)" });
  }
  for (const j of ALL_CONTRACT_IDS) {
    // ⚠️ 조직에 아직 등록되지 않은 잡(JOB_TEAM 미등재)은 '유령'이 아니라 **도입 예정**이다 — 오탐 방지.
    //   (신규 잡은 계약을 먼저 쓰고 배포 후 등록되는 순서라, 이 구분이 없으면 매번 오경보가 난다.)
    if (!(j in JOB_TEAM)) continue;
    if (!running.has(j) && !isRetired(j)) out.push({ kind: "유령 계약", job: j, note: "계약은 있는데 최근 실행 기록 없음" });
  }
  for (const j of running) {
    const c = getContract(j);
    if (c.tier === "L3" && !ALL_CONTRACT_IDS.includes(j)) out.push({ kind: "tier 미선언", job: j, note: "기본 L0로 취급됨 — 권한 명시 필요" });
  }
  return out;
}
