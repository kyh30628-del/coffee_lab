import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { detectStuck } from "@/lib/runLedger";
import { ALL_CONTRACT_IDS, getContract, verifyContracts } from "@/lib/jobContract";
export const runtime = "nodejs";

// 🩺 하네스 관제 — 설계한 6계층이 **지금 실제로 물려 있는지**를 한 화면에 모은다.
//   scripts/harness-check.mjs와 같은 사실을 보지만, 이건 조직 관제(/admin/org) 모달용이다.
//
// 💰 비용 규율: 집계 6회, 전부 작은 컬럼/숫자. 큰 컬럼(raw_reviews·synth_reviews*) 미조회.
//   run_ledger·heal_attempts·heal_leases는 모두 작은 메타 테이블이다.
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const [runs, stuck, frozen, budget, leases, overIssues] = await Promise.all([
      // L5 원장 — 최근 실행과 계층별 신호(지문·예산·동결스킵·스코프위반)
      sql`SELECT job, (started_at AT TIME ZONE 'Asia/Seoul')::text kst, ok,
            fingerprint IS NOT NULL AS fp,
            (metrics->>'blobReads')::int blob, (metrics->>'skipped')::int skipped,
            (metrics->>'noEffect')::int no_effect, (metrics->>'scopeViolations')::int scope_viol,
            LEFT(COALESCE(detail,''), 90) detail
          FROM run_ledger WHERE started_at > now() - interval '24 hours'
          ORDER BY id DESC LIMIT 40`,
      detectStuck(48, 3),
      // L4 효과검증 — 자동으로 못 고쳐 사람에게 넘긴 것(사람 판독 여부까지)
      sql`SELECT job, COUNT(*)::int n,
            COUNT(*) FILTER (WHERE note LIKE '[사람판독%')::int read,
            COUNT(*) FILTER (WHERE note LIKE '%오탐%')::int fp
          FROM heal_attempts WHERE frozen_until > now() GROUP BY job ORDER BY n DESC`,
      // L1 예산 — 24시간 큰컬럼 로드 실측(계약 대비)
      sql`SELECT job, SUM((metrics->>'blobReads')::int)::int used, COUNT(*)::int runs
          FROM run_ledger WHERE started_at > now() - interval '24 hours' AND metrics ? 'blobReads'
          GROUP BY job ORDER BY used DESC NULLS LAST LIMIT 12`,
      // L2 배차 — 현재 잡혀 있는 리스(치유기 동시집행 방지)
      sql`SELECT COUNT(*)::int n FROM heal_leases WHERE lease_until > now()`.catch(() => [{ n: 0 }]),
      sql`SELECT ikey, LEFT(COALESCE(detail,''),100) detail FROM issues WHERE ikey LIKE 'budget:%' AND status='open'`,
    ]) as any[];

    // L1 계약 검증 — ⚠️ 표시용 목록(LIMIT 40)으로 판정하면 **하루 1회 도는 잡이 '유령 계약'으로 오탐**된다.
    //   (실제로 cron-costwatch·cron-exposure가 정상 실행 중인데 유령으로 찍혔다.)
    //   판정은 잘리지 않은 DISTINCT 목록으로 한다 — 작은 컬럼 1개 집계라 비용은 무시할 수준.
    const jobRows = (await sql`SELECT DISTINCT job FROM run_ledger WHERE started_at > now() - interval '48 hours'`) as any[];
    const runningJobs = jobRows.map((r) => r.job);
    const contractIssues = verifyContracts(runningJobs);
    const budgets = (budget as any[]).map((b) => {
      const c = getContract(b.job);
      const limit = (c.budget.blobReads ?? 0) * Math.max(1, b.runs);
      return { job: b.job, used: b.used ?? 0, perRun: c.budget.blobReads ?? 0, runs: b.runs, limit, over: (b.used ?? 0) > limit, tier: c.tier };
    });

    // 계층별 한 줄 상태 — "설계한 6계층이 물려 있나"에 대한 직답
    const layers = [
      { id: "L1", name: "계약·예산", file: "lib/jobContract · lib/blobBudget",
        ok: contractIssues.length === 0 && (overIssues as any[]).length === 0,
        stat: `계약 ${ALL_CONTRACT_IDS.length}개 · 예산초과 ${(overIssues as any[]).length}건 · 계약이상 ${contractIssues.length}건`,
        note: "모든 잡이 자기 예산(큰컬럼 로드 상한)을 선언한다. 현재 관측 모드 — 초과해도 막지 않고 기록만." },
      { id: "L2", name: "배차(리스)", file: "lib/healLease",
        ok: true, stat: `활성 리스 ${(leases as any[])[0]?.n ?? 0}건`,
        note: "치유기 둘이 같은 카페를 동시에 고쳐 서로 덮어쓰는 것을 원자적 리스로 막는다. TTL 자동 회수." },
      { id: "L3", name: "격리(드라이런·스코프)", file: "lib/writeScope",
        ok: (runs as any[]).every((r) => !r.scope_viol),
        stat: `스코프 위반 ${(runs as any[]).reduce((a, r) => a + (r.scope_viol || 0), 0)}건`,
        note: "잡이 계약에 선언하지 않은 대상을 쓰면 잡아낸다. ?dry=1로 조치 전 확인이 표준." },
      { id: "L4", name: "효과검증·수렴", file: "lib/healHarness",
        ok: true, stat: `동결 ${(frozen as any[]).reduce((a, f) => a + f.n, 0)}건 · 판독완료 ${(frozen as any[]).reduce((a, f) => a + f.read, 0)}건`,
        note: "'실행했다'가 아니라 '효과가 있었다'를 잰다. 2회 무효과면 동결하고 사람에게 넘긴다." },
      { id: "L5", name: "원장·정체탐지", file: "lib/runLedger",
        ok: (stuck as any[]).length === 0,
        stat: `24h 실행 ${(runs as any[]).length}건 · 정체 ${(stuck as any[]).length}건`,
        note: "모든 실행을 추가전용으로 남기고, 같은 문제집합이 반복되면 '헛돎'으로 검출한다." },
      { id: "L6", name: "게이트·재판정", file: "lib/gateQueue · lib/recheckQueue",
        ok: true, stat: "SLA 6/24/72h",
        note: "사람 결재가 묵히지 않게 눈에 띄게 한다. L3 자동승인·자동 재공개는 하네스도 못 넘는다." },
    ];

    return NextResponse.json({
      ok: true,
      layers,
      runs: (runs as any[]).slice(0, 25),
      stuck, frozen, budgets, contractIssues,
      overBudget: overIssues,
      principles: [
        "실행했다를 성공으로 세지 않는다 — 효과가 성공이다.",
        "모든 자동 조치는 수렴하거나 멈춘다. 못 고치면 사람에게.",
        "모든 잡은 자기 예산을 선언한다. 선언 없는 잡은 큰 컬럼을 못 읽는다.",
      ],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
  }
}
