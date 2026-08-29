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
      { key: "generic", label: "🔠 흔한단어/동음이의어", healKey: "genericTermHealed", residKey: "generic_term_pollution" },
    ];
    const detectors = defs.map((d) => {
      let fixed = 0, dropped = 0, unpub = 0;
      for (const r of rows) { const h = (r.report || {})[d.healKey] || {}; fixed += num(h.fixed); dropped += num(h.dropped); unpub += num(h.unpub); }
      return { key: d.key, label: d.label, fixed, dropped, unpub, residual: num(checks[d.residKey]) };
    });
    // 🔴 2026-08-29: 화면이 **조치를 못 따라가던 문제** 수리.
    //   실측 사고 — 20:06 센티넬이 name_pollution=15를 기록 → 20:12 자가치유가 15곳을 전부 홀드했는데,
    //   화면은 저장된 스냅샷만 읽어 **다음 런(내일 12:00)까지 15시간 동안 빨강**이었다(CEO 지적).
    //   조치했는데 계속 빨강이면 관제탑을 못 믿게 된다 — 그게 경보 자체보다 나쁘다.
    //   → 싸게 다시 셀 수 있는 지표는 **지금 값**을 함께 보낸다(count 1회, 인덱스 없어도 ~10ms).
    //   무거운 스캔이 필요한 잔여(명소·약한이름 등)는 스냅샷 그대로 두고 '(다음런)' 표기를 유지한다.
    const nameLive = Number(((await sql`SELECT count(*)::int c FROM cafes
      WHERE published AND synth_coherence IS NOT NULL AND synth_coherence < 0.3
        AND COALESCE(offctx_ok, false) = false`.catch(() => [{ c: 0 }])) as any[])[0]?.c ?? 0);
    const nameSnap = num(checks.name_pollution);
    // 스냅샷이 빨강이었지만 지금 0이면 '조치 완료'로 본다 — clean 판정도 여기에 맞춘다.
    const resolvedSince = nameSnap > 0 && nameLive === 0;

    // 최신 런 안전치유(area·박스·중복) + name_mismatch 워치
    const healed = rep.healed || {};
    return NextResponse.json({
      ok: true,
      lastRanKst, ageH, clean: !!latest.clean || resolvedSince, runs: rows.length,
      namePollution: { snapshot: nameSnap, live: nameLive, resolvedSince },
      detectors,
      safeHeal: { area: num(healed.area), box: num(healed.box), dup: num(healed.dup) },
      nameMismatchWatch: num(checks.name_mismatch),
      totalDropped14: detectors.reduce((s, d) => s + d.dropped, 0),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
