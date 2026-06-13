import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getAuditCandidates, markJudged } from "@/lib/synthStore";
export const runtime = "nodejs";
export const maxDuration = 60;

// 로컬 Sonnet 배치용: 'LLM 맥락 재판정이 필요한 경계 리뷰'를 가진 카페를 내려준다(LLM 없음).
// 경계 리뷰 없는 카페는 즉시 판정완료로 마킹(커서 전진). 인증: x-admin-password 또는 Bearer CRON_SECRET.
function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD) return true;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS llm_judged_at TIMESTAMPTZ`;
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 20, 1), 40);
    const area = (req.nextUrl.searchParams.get("area") || "").trim();
    const cafeId = Number(req.nextUrl.searchParams.get("cafeId")) || 0;

    await sql`CREATE TABLE IF NOT EXISTS grounding_checks (cafe_id INT PRIMARY KEY, grounded BOOLEAN, issue TEXT, checked_at TIMESTAMPTZ DEFAULT now())`;
    let targets: { id: number; name: string; area: string }[];
    if (cafeId) {
      // 특정 카페 강제 재판정
      targets = (await sql`SELECT id, name, area FROM cafes WHERE id = ${cafeId} AND raw_reviews IS NOT NULL`) as unknown as typeof targets;
    } else if (area) {
      // 지역 타겟: 판정 여부 무관하게 강제 재판정(오염 일괄 정리용)
      targets = (await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NOT NULL AND area ILIKE ${"%" + area + "%"} ORDER BY synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as typeof targets;
    } else {
      // 기본 큐: ① 신규 파이프라인(pending) 우선 — 공개 전 필수 판정 → ② 그라운딩 의심 → ③ 미판정/stale
      //   대상 = 공개 카페 OR 신규 pending(공개 전 게이트). 비카페·rejected·junk(NULL 미공개)는 제외 → 토큰 절약.
      targets = (await sql`
        SELECT c.id, c.name, c.area FROM cafes c
        LEFT JOIN grounding_checks g ON g.cafe_id = c.id
        WHERE c.raw_reviews IS NOT NULL
          AND (c.published = true OR c.pipeline_status = 'pending')
          AND (c.llm_judged_at IS NULL OR c.llm_judged_at < c.raw_collected_at)
        ORDER BY (c.pipeline_status = 'pending') DESC NULLS LAST, (g.grounded = false) DESC NULLS LAST, c.llm_judged_at ASC NULLS FIRST
        LIMIT ${limit}`) as unknown as typeof targets;
    }

    const cafes = [];
    let advanced = 0;
    for (const cafe of targets) {
      const { candidates, hasRaw } = await getAuditCandidates(cafe);
      if (!hasRaw || candidates.length === 0) { await markJudged(cafe.id); advanced++; continue; }
      cafes.push({ cafeId: cafe.id, name: cafe.name, area: cafe.area, candidates: candidates.slice(0, 50) });
    }
    const remaining = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE raw_reviews IS NOT NULL AND (published = true OR pipeline_status = 'pending') AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)`)[0].n;
    return NextResponse.json({ ok: true, cafes, scanned: targets.length, noBorderline: advanced, remaining });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
