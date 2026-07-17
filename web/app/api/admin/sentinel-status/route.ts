import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

// 🛡️ 센티넬(품질본부 파수꾼) 오염 방어 실적 — 관제탑 표출용.
//   sentinel_reports(하루 2회 적재)에서 ①최신 런 상태(정합성·경과) ②최근 N런 누적 자동정리 실적
//   (명소·약한이름·비카페업종 오염 제거·비공개) ③현재 flag 잔여를 롤업. "센티넬이 실제로 뭘 막았나"를 한눈에.
const authed = (req: NextRequest) =>
  !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

const num = (v: any) => (typeof v === "number" && isFinite(v) ? v : 0);

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    // 최근 14런(≈7일) — 누적 실적 + 최신 상태
    const rows = (await sql`SELECT ran_at, clean, report FROM sentinel_reports ORDER BY ran_at DESC LIMIT 14`) as any[];
    if (!rows.length) return NextResponse.json({ ok: true, empty: true });
    const latest = rows[0];
    const rep = latest.report || {};
    const checks = rep.checks || {};
    const ageH = Math.round(((Date.now() - new Date(latest.ran_at).getTime()) / 3600000) * 10) / 10;
    const lastRanKst = new Date(latest.ran_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    // 탐지기별 누적(최근 14런) + 잔여(최신)
    const defs = [
      { key: "attraction", label: "🎡 명소·행사", healKey: "attractionHealed", residKey: "attraction_pollution" },
      { key: "weak", label: "🔤 약한이름(1글자)", healKey: "weakNameHealed", residKey: "weak_name_pollution" },
      { key: "noncafe", label: "🏢 비카페 업종", healKey: "nonCafeBizHealed", residKey: "noncafe_biz_pollution" },
      { key: "franchise", label: "🏪 프랜차이즈 지점", healKey: "franchiseBranchHealed", residKey: "franchise_branch_pollution" },
    ];
    const detectors = defs.map((d) => {
      let fixed = 0, dropped = 0, unpub = 0;
      for (const r of rows) { const h = (r.report || {})[d.healKey] || {}; fixed += num(h.fixed); dropped += num(h.dropped); unpub += num(h.unpub); }
      return { key: d.key, label: d.label, fixed, dropped, unpub, residual: num(checks[d.residKey]) };
    });
    // 최신 런 안전치유(area·박스·중복) + name_mismatch 워치
    const healed = rep.healed || {};
    return NextResponse.json({
      ok: true,
      lastRanKst, ageH, clean: !!latest.clean, runs: rows.length,
      detectors,
      safeHeal: { area: num(healed.area), box: num(healed.box), dup: num(healed.dup) },
      nameMismatchWatch: num(checks.name_mismatch),
      totalDropped14: detectors.reduce((s, d) => s + d.dropped, 0),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
