import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { classifyArea } from "@/lib/regionList"; // 🧭 지도·검색·SEO와 같은 단일출처

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
    const raw = (await sql.query(`
      SELECT area,
        count(*)::int reg,
        count(*) FILTER (WHERE published)::int pub,
        round(100.0 * count(*) FILTER (WHERE published) / NULLIF(count(*), 0), 1)::float pass_pct,
        count(*) FILTER (WHERE published AND synth_grade = '검증')::int verified,
        round(100.0 * count(*) FILTER (WHERE published AND synth_grade = '검증')
          / NULLIF(count(*) FILTER (WHERE published), 0), 1)::float ver_pct,
        COALESCE(sum(synth_count) FILTER (WHERE published), 0)::int rv_sum,
        count(*) FILTER (WHERE published AND synth_coherence < 0.5)::int low_coh,
        count(*) FILTER (WHERE published AND COALESCE(offctx_rate, 0) > 0.4 AND COALESCE(offctx_ok, false) = false)::int offctx,
        count(*) FILTER (WHERE NOT published AND synth_updated IS NULL)::int queue,
        -- 🔍 통과율 미달 원인 분해(CEO 지시 09-04, 통과율 클릭 모달용) — 미공개분을 상호배타 버킷으로.
        --   버킷 우선순위: 영구제외 > 노이즈·보류 > 후기수 — 실측 검증(합계=미공개 전수)은 09-04 세션 기록.
        count(*) FILTER (WHERE NOT published AND (pipeline_status = 'excluded' OR exclude_at IS NOT NULL))::int b_excl,
        count(*) FILTER (WHERE NOT published AND exclude_at IS NULL AND pipeline_status IN ('noise','held'))::int b_noise,
        count(*) FILTER (WHERE NOT published AND exclude_at IS NULL AND COALESCE(pipeline_status,'') NOT IN ('excluded','noise','held')
          AND COALESCE(synth_count, 0) = 0)::int b_rv0,
        count(*) FILTER (WHERE NOT published AND exclude_at IS NULL AND COALESCE(pipeline_status,'') NOT IN ('excluded','noise','held')
          AND synth_count IN (1, 2))::int b_rv12,
        count(*) FILTER (WHERE NOT published AND exclude_at IS NULL AND COALESCE(pipeline_status,'') NOT IN ('excluded','noise','held')
          AND synth_count = 2)::int b_rv2,
        count(*) FILTER (WHERE NOT published AND exclude_at IS NULL AND COALESCE(pipeline_status,'') NOT IN ('excluded','noise','held')
          AND synth_count IN (3, 4))::int b_hys,
        count(*) FILTER (WHERE NOT published AND exclude_at IS NULL AND COALESCE(pipeline_status,'') NOT IN ('excluded','noise','held')
          AND synth_count >= 5 AND needs_llm)::int b_llm,
        count(*) FILTER (WHERE NOT published AND exclude_at IS NULL AND COALESCE(pipeline_status,'') NOT IN ('excluded','noise','held')
          AND synth_count >= 5 AND NOT COALESCE(needs_llm, false))::int b_etc
      FROM cafes WHERE area IS NOT NULL AND area <> ''
      GROUP BY 1`)) as any[];
    // 🧭 시도 롤업 — 지도와 같은 classifyArea. 합계 가능한 항목만 더하고, 비율·평균은 합계에서 다시 계산한다.
    const SUM_KEYS = ["reg", "pub", "verified", "rv_sum", "low_coh", "offctx", "queue",
      "b_excl", "b_noise", "b_rv0", "b_rv12", "b_rv2", "b_hys", "b_llm", "b_etc"] as const;
    const acc = new Map<string, Record<string, number>>();
    let unmapped = 0;
    for (const r of raw) {
      const sido = classifyArea(String(r.area)).sido;
      if (!sido) { unmapped += Number(r.reg) || 0; continue; }
      const cur = acc.get(sido) ?? Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
      for (const k of SUM_KEYS) cur[k] = (cur[k] ?? 0) + (Number(r[k]) || 0);
      acc.set(sido, cur);
    }
    const rows = [...acc.entries()].map(([sido, v]) => ({
      sido, ...v,
      pass_pct: v.reg ? Math.round((1000 * v.pub) / v.reg) / 10 : null,
      ver_pct: v.pub ? Math.round((1000 * v.verified) / v.pub) / 10 : null,
      avg_rv: v.pub ? Math.round((10 * v.rv_sum) / v.pub) / 10 : null,
    })).sort((a, b) => b.pub - a.pub);
    return NextResponse.json({ ok: true, rows, unmapped, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
  }
}
