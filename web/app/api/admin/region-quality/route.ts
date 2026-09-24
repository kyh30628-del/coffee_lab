import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { classifyArea } from "@/lib/regionList"; // 🧭 지도·검색·SEO와 같은 단일출처
import { loadCriteria, getCriterionSync } from "@/lib/criteria"; // 🎛️ 공개 문턱·신선도 — 버킷이 현행 기준을 따라가게(09-24)
import { OLD_REVIEW_MONTHS } from "@/lib/cafeProfile";

export const runtime = "nodejs";

// 📊 지역별 품질 현황(CEO 지시 2026-09-04) — 관리자 화면 전용.
//   확장 때마다 "새 지역 품질이 수도권 동급인가"를 보고서가 아니라 화면에서 상시 확인한다.
//   💰 비용: 작은 컬럼 집계 1회(큰 컬럼·리뷰 JSONB 미접촉). 관리자가 섹션을 열 때만 호출.
//
// 🔴 2026-09-23 수리(CEO "지도 지역별 숫자와 관리자 숫자가 왜 다르냐") — **주소 접두 매핑이 범인이었다.**
//   이 표는 `address LIKE '전라남도%'`처럼 주소 앞글자로 시도를 갈랐는데, 2026 통합 표기
//   **"전남광주통합특별시"**가 목록에 없어 그 주소를 가진 공개 카페 1,998곳이 CASE=NULL로 빠져
//   표에서 통째로 사라졌다(광주 12곳·전남 5곳으로 보이던 이유). 지도가 맞고 이 표가 틀렸다.
//   → 주소 파싱을 버리고 **지도와 같은 단일출처**(lib/regionList.classifyArea(area))로 롤업한다.
//     area는 우리가 검증해 부여한 라벨이고, 지도·검색·SEO가 전부 이걸 쓴다. 표만 다른 기준을 쓸 이유가 없다.
//   비용: GROUP BY area(약 230행) 1회 → TS에서 시도로 합산. 행 수만 늘 뿐 스캔량은 동일.
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false }, { status: 401 });
  try {
    // 🕰️ 2026-09-24 CEO "지역별 품질 현황에도 최신성" — 공개 카페의 **최근 18개월 후기 보유율**과 '전부 오래된 카페' 수.
    //   review_dates(작은 jsonb 날짜 배열)만 본다 — 큰 후기 컬럼 미접촉. 경계는 고정 날짜가 아니라 오늘 기준으로 매번 계산.
    //   비공개 사유 버킷도 **현행 기준(DB criteria)**으로 가른다 — 09-24 공개선 3→2 변경 후 옛 '3~4건·5건 정책' 칸이 거짓이 됐다.
    await loadCriteria();
    const R = getCriterionSync("grade.floor.reference_new"), FRESH = getCriterionSync("grade.floor.reference_new_fresh_days");
    const cut = new Date(); cut.setMonth(cut.getMonth() - OLD_REVIEW_MONTHS);
    const cutStr = `${cut.getFullYear()}.${String(cut.getMonth() + 1).padStart(2, "0")}.${String(cut.getDate()).padStart(2, "0")}`;
    const hasDates = `jsonb_typeof(review_dates)='array' AND jsonb_array_length(review_dates) > 0`;
    const hasRecent = `EXISTS (SELECT 1 FROM jsonb_array_elements_text(review_dates) d WHERE d >= $1)`;
    const live = `NOT published AND exclude_at IS NULL AND COALESCE(pipeline_status,'') NOT IN ('excluded','noise','held')`;
    const raw = (await sql.query(`
      SELECT area,
        count(*)::int reg,
        count(*) FILTER (WHERE published)::int pub,
        count(*) FILTER (WHERE published AND synth_grade = '검증')::int verified,
        COALESCE(sum(synth_count) FILTER (WHERE published), 0)::int rv_sum,
        count(*) FILTER (WHERE published AND synth_coherence < 0.5)::int low_coh,
        count(*) FILTER (WHERE published AND COALESCE(offctx_rate, 0) > 0.4 AND COALESCE(offctx_ok, false) = false)::int offctx,
        count(*) FILTER (WHERE NOT published AND synth_updated IS NULL)::int queue,
        count(*) FILTER (WHERE published AND ${hasDates} AND ${hasRecent})::int fresh,
        count(*) FILTER (WHERE published AND ${hasDates} AND NOT ${hasRecent})::int all_old,
        count(*) FILTER (WHERE published AND NOT (${hasDates}))::int no_date,
        -- 🔍 통과율 미달 원인(상호배타 버킷, 현행 기준): 영구제외 > 노이즈·보류 > 후기 0 > 문턱 미달 > 수집 낡음 > AI 판정 대기 > 기타
        count(*) FILTER (WHERE NOT published AND (pipeline_status = 'excluded' OR exclude_at IS NOT NULL))::int b_excl,
        count(*) FILTER (WHERE NOT published AND exclude_at IS NULL AND pipeline_status IN ('noise','held'))::int b_noise,
        count(*) FILTER (WHERE ${live} AND COALESCE(synth_count, 0) = 0)::int b_rv0,
        count(*) FILTER (WHERE ${live} AND synth_count BETWEEN 1 AND $2 - 1)::int b_rvlow,
        count(*) FILTER (WHERE ${live} AND synth_count >= $2 AND $3 > 0 AND (raw_collected_at IS NULL OR raw_collected_at < now() - make_interval(days => $3::int)))::int b_stale,
        count(*) FILTER (WHERE ${live} AND synth_count >= $2 AND NOT ($3 > 0 AND (raw_collected_at IS NULL OR raw_collected_at < now() - make_interval(days => $3::int))) AND needs_llm AND llm_judged_at IS NULL)::int b_llm,
        count(*) FILTER (WHERE ${live} AND synth_count >= $2 AND NOT ($3 > 0 AND (raw_collected_at IS NULL OR raw_collected_at < now() - make_interval(days => $3::int))) AND NOT (needs_llm AND llm_judged_at IS NULL))::int b_etc
      FROM cafes WHERE area IS NOT NULL AND area <> ''
      GROUP BY 1`, [cutStr, R, FRESH])) as any[];
    // 🧭 시도 롤업 — 지도와 같은 classifyArea. 합계 가능한 항목만 더하고, 비율·평균은 합계에서 다시 계산한다.
    const SUM_KEYS = ["reg", "pub", "verified", "rv_sum", "low_coh", "offctx", "queue", "fresh", "all_old", "no_date",
      "b_excl", "b_noise", "b_rv0", "b_rvlow", "b_stale", "b_llm", "b_etc"] as const;
    const acc = new Map<string, Record<string, number>>();
    let unmapped = 0;
    for (const r of raw) {
      const sido = classifyArea(String(r.area)).sido;
      if (!sido) { unmapped += Number(r.reg) || 0; continue; }
      const cur = acc.get(sido) ?? Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
      for (const k of SUM_KEYS) cur[k] = (cur[k] ?? 0) + (Number(r[k]) || 0);
      acc.set(sido, cur);
    }
    const rows = [...acc.entries()].map(([sido, v]: [string, Record<string, number>]) => ({
      sido, ...v, pub: v.pub, reg: v.reg,
      pass_pct: v.reg ? Math.round((1000 * v.pub) / v.reg) / 10 : null,
      ver_pct: v.pub ? Math.round((1000 * v.verified) / v.pub) / 10 : null,
      avg_rv: v.pub ? Math.round((10 * v.rv_sum) / v.pub) / 10 : null,
      fresh_pct: (v.fresh + v.all_old) ? Math.round((1000 * v.fresh) / (v.fresh + v.all_old)) / 10 : null, // 날짜 있는 공개 카페 중 최근 18개월 후기 보유율
    })).sort((a, b) => b.pub - a.pub);
    return NextResponse.json({ ok: true, rows, unmapped, criteria: { floor: R, freshDays: FRESH, oldMonths: OLD_REVIEW_MONTHS, cut: cutStr }, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
  }
}
