import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

// 🏪 사장님 퍼널 현황(관리자) — CEO가 「우리 가게 리포트」 효과를 직접 보기 위한 단일 창구(2026-08-27).
//
// 왜 필요한가: 유료 결제가 0건인데 **어디서 끊기는지**를 CEO가 카페를 하나씩 짚어 물어봐야 알 수 있었다.
//   실측으로 드러난 게 "전환율이 낮다"가 아니라 "홈 클릭 65%가 리포트를 아예 못 봤다"였다.
//   그런 걸 사람이 발견하게 두면 안 된다.
//
// 💰 비용: 집계 2회(owner_funnel_events는 ts 인덱스 있음 · subscriptions는 수십 행).
//   큰 컬럼 미접근. 관리자만 호출하고 화면은 기본 접힘이라 열 때만 돈다.

const authed = (req: NextRequest) =>
  !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    // 창(7일·30일)별 단계 집계 — source까지 갈라야 "어느 입구가 막혔나"가 보인다.
    const rows = (await sql`
      SELECT
        CASE WHEN ts > now() - interval '7 days' THEN 7 ELSE 30 END AS win,
        event, COALESCE(source, '(없음)') AS source, count(*)::int AS n
      FROM owner_funnel_events
      WHERE ts > now() - interval '30 days'
      GROUP BY 1, 2, 3`) as unknown as { win: number; event: string; source: string; n: number }[];

    const pick = (win: number, event: string, source?: string) =>
      rows.filter((r) => (win === 30 ? true : r.win === 7) && r.event === event && (!source || r.source === source))
        .reduce((s, r) => s + r.n, 0);

    const build = (win: number) => {
      const reportView = pick(win, "free_report_view");
      const ctaTotal = pick(win, "cta_click");
      const submit = pick(win, "submit_success");
      return {
        cta: { total: ctaTotal, home: pick(win, "cta_click", "home"),
               cafe_detail: pick(win, "cta_click", "cafe_detail"),
               free_report: pick(win, "cta_click", "free_report") },
        reportView,
        modalOpen: pick(win, "modal_open"),
        submit,
        // 리포트 도달률 = 무료 리포트를 실제로 본 비율. 이게 오늘 고친 것의 성적표다.
        reachRate: ctaTotal > 0 ? Math.round((reportView / ctaTotal) * 100) : null,
        submitRate: reportView > 0 ? Math.round((submit / reportView) * 100) : null,
      };
    };

    const subs = (await sql`
      SELECT count(*)::int total,
             count(*) FILTER (WHERE status = 'active')::int active,
             count(*) FILTER (WHERE COALESCE(price, 0) > 0)::int paid
      FROM subscriptions`)[0] as any;

    return NextResponse.json({ ok: true, d7: build(7), d30: build(30), subs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
  }
}
