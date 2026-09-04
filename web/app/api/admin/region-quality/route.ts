import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 📊 지역별 품질 현황(CEO 지시 2026-09-04) — 관리자 화면 전용.
//   확장 때마다 "새 지역 품질이 수도권 동급인가"를 보고서가 아니라 화면에서 상시 확인한다.
//   💰 비용: 작은 컬럼 집계 1회(큰 컬럼·리뷰 JSONB 미접촉). 관리자가 섹션을 열 때만 호출.
//
// 🗺️ 시도 → 주소 접두 매핑. **미래 확장분까지 미리 등재** — 부산·경남 등이 발굴되기 시작하면
//   코드 변경 없이 표에 자동으로 나타난다(등록 0곳인 시도는 표에서 자동 생략).
const SIDO_PREFIX: [string, string][] = [
  ["서울", "서울"], ["경기", "경기"], ["인천", "인천"], ["강원", "강원"],
  ["충북", "충청북도"], ["충남", "충청남도"], ["대전", "대전"], ["세종", "세종"],
  ["부산", "부산"], ["경남", "경상남도"], ["대구", "대구"], ["경북", "경상북도"],
  ["광주", "광주광역시"], ["전북", "전북"], ["전남", "전라남도"], ["울산", "울산"], ["제주", "제주"],
];

export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const caseExpr = SIDO_PREFIX.map(([label, pre]) => `WHEN address LIKE '${pre}%' THEN '${label}'`).join(" ");
    const rows = (await sql.query(`
      SELECT CASE ${caseExpr} END sido,
        count(*)::int reg,
        count(*) FILTER (WHERE published)::int pub,
        round(100.0 * count(*) FILTER (WHERE published) / NULLIF(count(*), 0), 1)::float pass_pct,
        count(*) FILTER (WHERE published AND synth_grade = '검증')::int verified,
        round(100.0 * count(*) FILTER (WHERE published AND synth_grade = '검증')
          / NULLIF(count(*) FILTER (WHERE published), 0), 1)::float ver_pct,
        round(avg(synth_count) FILTER (WHERE published), 1)::float avg_rv,
        count(*) FILTER (WHERE published AND synth_coherence < 0.5)::int low_coh,
        count(*) FILTER (WHERE published AND COALESCE(offctx_rate, 0) > 0.4 AND COALESCE(offctx_ok, false) = false)::int offctx,
        count(*) FILTER (WHERE NOT published AND synth_updated IS NULL)::int queue
      FROM cafes WHERE CASE ${caseExpr} END IS NOT NULL
      GROUP BY 1 ORDER BY 3 DESC`)) as any[];
    return NextResponse.json({ ok: true, rows, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
  }
}
