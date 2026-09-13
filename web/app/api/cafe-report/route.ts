import { NextRequest, NextResponse } from "next/server";
import { sql, ensureOnce } from "@/lib/db";
import { enqueueRecheck } from "@/lib/recheckQueue";

export const runtime = "nodejs";

// 📣 소비자 신고(2026-09-13 해자 감사 — "소비자를 검증자로"): 카페 상세의 한 탭 신고 두 종류.
//   closed  = 문 닫았어요        → 그 카페의 closure_checked_at을 비워 cron-closure가 다음 회차에 **우선 재확인**(자동 비공개 아님)
//   wrong   = 다른 가게 얘기예요  → 30일 내 서로 다른 신고 2건이면 recheck_queue(사람 검토)에 올린다
//   비용: 작은 테이블 INSERT 1 + 카운트 1(인덱스). 큰 컬럼 접촉 0. 익명 기기키+카페당 하루 1건으로 도배 차단.
//   🔴 원칙: 신고는 '재확인 신호'일 뿐 어떤 경우에도 공개 상태를 직접 바꾸지 않는다(폐업 자동 비공개 금지).
const KINDS = new Set(["closed", "wrong"]);

async function ensure() {
  await ensureOnce("db.cafeReports.v2", async () => {
    await sql`CREATE TABLE IF NOT EXISTS cafe_reports (
      id BIGSERIAL PRIMARY KEY, cafe_id INT NOT NULL, kind TEXT NOT NULL, anon TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`CREATE INDEX IF NOT EXISTS idx_cafe_reports_cafe ON cafe_reports (cafe_id, created_at DESC)`;
    // (날짜 캐스트 유니크 인덱스는 timestamptz→date가 IMMUTABLE이 아니라 불가 — 24h 중복은 INSERT 조건으로 막는다)
  });
}

export async function POST(req: NextRequest) {
  try {
    const { cafeId, kind, anon } = await req.json().catch(() => ({}));
    const id = Number(cafeId); const a = String(anon ?? "").slice(0, 64);
    if (!Number.isFinite(id) || !KINDS.has(String(kind)) || a.length < 8) return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
    await ensure();
    const ins = (await sql`INSERT INTO cafe_reports (cafe_id, kind, anon)
      SELECT ${id}, ${String(kind)}, ${a}
      WHERE NOT EXISTS (SELECT 1 FROM cafe_reports WHERE cafe_id = ${id} AND kind = ${String(kind)} AND anon = ${a} AND created_at > now() - interval '24 hours')
      RETURNING id`) as any[];
    if (!ins.length) return NextResponse.json({ ok: true, dup: true }); // 같은 기기·같은 날 중복 — 조용히 접수 처리
    const [{ n }] = (await sql`SELECT count(DISTINCT anon)::int n FROM cafe_reports WHERE cafe_id = ${id} AND kind = ${String(kind)} AND created_at > now() - interval '30 days'`) as any[];
    let routed = "";
    if (kind === "closed") {
      await sql`UPDATE cafes SET closure_checked_at = NULL WHERE id = ${id} AND published`.catch(() => {});
      routed = "closure-recheck";
    }
    if (Number(n) >= 2) {
      await enqueueRecheck([{ cafeId: id, reason: `소비자 신고 ${n}건(30일): ${kind === "closed" ? "문 닫았어요" : "다른 가게 얘기예요"}`, policyRef: "consumer-report" }]);
      routed = routed ? routed + "+recheck-queue" : "recheck-queue";
    }
    return NextResponse.json({ ok: true, n, routed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
  }
}
