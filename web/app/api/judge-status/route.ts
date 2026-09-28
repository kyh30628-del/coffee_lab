import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { dailyCounts } from "@/lib/metrics";
export const runtime = "nodejs";

const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
    await ensureSchema();
    // 🔴 2026-09-28 CEO 지적("63%인데 크레딧 더 부어야 하나") — total/done/pct가 전부 잘못 정의돼 있었다.
    //   전: total=raw_reviews 있는 전체(63,865, needs_llm=false 5.8만 곳까지 섞임) ·
    //       done=total−queue(judgeQueueCount, 이것도 needs_llm 안 보고 "pending 또는 참고등급 published"
    //       전부를 "대기"로 셈 — 실측 대기열 22,699곳 중 99.9%가 needs_llm=false, 즉 애초에 AI가
    //       필요 없던 정상 카페). "대기열에 없으면 done"이라는 논리라 needs_llm=false 카페가 전부
    //       done으로 잘못 집계돼 pct가 64%까지 부풀었다(진짜 값은 needs_llm=true 기준 40.2%).
    //   후: needs_llm=true(=이 지표가 원래 재려던 모수)로만 total/done/queue를 다시 정의한다.
    //   done은 더 이상 "total−queue"로 추론하지 않고 llm_judged_at 실측값을 그대로 쓴다(간접 추론 금지).
    // ⚠️ total/judged엔 raw_reviews 조건을 걸지 않는다 — 실측: needs_llm=true 13,039곳 중 1,924곳이
    //   "과거에 판정 완료 후 원본이 정리(purge)된 곳"이다(판정 사실 자체는 안 바뀐다). 여기 조건을 걸면
    //   그 1,924곳이 분모·분자에서 통째로 빠져 pct가 또 틀어진다(첫 수정 때 이 실수를 했다가 직접 잡음).
    //   raw_reviews 조건은 "지금 당장 (재)제출 가능한 대기열"에만 건다 — 원본 없으면 판정 자체가 불가하니까.
    const [j, c, y, daily] = await Promise.all([
      sql`SELECT
        count(*)::int total,
        count(*) FILTER (WHERE llm_judged_at IS NOT NULL)::int judged,
        count(*) FILTER (WHERE raw_reviews IS NOT NULL AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at))::int queue,
        max(llm_judged_at) AS last
        FROM cafes WHERE needs_llm = true`,
      sql`SELECT
        count(*)::int total,
        count(*) FILTER (WHERE published)::int pub,
        count(*) FILTER (WHERE raw_reviews IS NULL)::int collect_queue FROM cafes`,
      sql`SELECT
        count(*) FILTER (WHERE yt_checked_at IS NOT NULL)::int with_yt,
        count(*) FILTER (WHERE yt_checked_at IS NULL AND raw_reviews IS NOT NULL)::int yt_queue,
        max(yt_checked_at) AS yt_last FROM cafes`,
      dailyCounts(),
    ]);
    const jr = j[0] as any, col = c[0] as any, yt = y[0] as any;
    const done = jr.judged ?? 0;
    const pct = jr.total > 0 ? Math.round((done / jr.total) * 100) : 0;
    return NextResponse.json({ ok: true,
      total: jr.total, judged: jr.judged, queue: jr.queue, today: daily.judged, done, pct, last: jr.last,
      cafesTotal: col.total, cafesPub: col.pub, collectQueue: col.collect_queue, newToday: daily.newCafes,
      ytTotal: yt.with_yt, ytToday: daily.yt, ytQueue: yt.yt_queue, ytLast: yt.yt_last,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
