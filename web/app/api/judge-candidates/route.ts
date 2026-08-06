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
      // 기본 큐(자율 판정 순서 고정): 기존 공개 → 기존 비공개 → 신규 공개 → 신규 비공개.
      //   기존/신규 경계 = 2026-06-14(동단위 신규 발굴 배치 시작일). 그 전 = 기존, 그 이후 = 신규.
      //   raw 있는 카페 전부 대상(비공개 포함) — 기존 비공개도 맥락 재판정해 옥석 가림. 그룹 내 그라운딩 의심·오래된 것 우선.
      //   [룰갭 H17, decisions#626] naver_category가 카페 계열 밖 + 상호명도 카페/커피/로스터리 토큰 無인 카페를
      //   그룹 내 최우선으로 올린다(자동비공개 아님 — lib/reviewQuality.ts isNonCafeFamilySignal과 동일 정의, SQL 복제).
      targets = (await sql`
        SELECT c.id, c.name, c.area FROM cafes c
        LEFT JOIN grounding_checks g ON g.cafe_id = c.id
        WHERE c.raw_reviews IS NOT NULL
          AND (c.llm_judged_at IS NULL OR c.llm_judged_at < c.raw_collected_at)
        ORDER BY COALESCE(c.created_at < '2026-06-14', true) DESC, c.published DESC,
          (c.naver_category IS NOT NULL AND c.naver_category !~ '카페|디저트|베이커리|제과|커피|다방|찻집|티룸|브런치|로스터리'
            AND c.name !~* '카페|커피|coffee|로스터리|로스터스') DESC,
          (g.grounded = false) DESC NULLS LAST, c.llm_judged_at ASC NULLS FIRST
        LIMIT ${limit}`) as unknown as typeof targets;
    }

    const cafes = [];
    let advanced = 0;
    for (const cafe of targets) {
      const { candidates, hasRaw } = await getAuditCandidates(cafe);
      if (!hasRaw || candidates.length === 0) { await markJudged(cafe.id); advanced++; continue; }
      cafes.push({ cafeId: cafe.id, name: cafe.name, area: cafe.area, candidates: candidates.slice(0, 50) });
    }
    const remaining = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE raw_reviews IS NOT NULL AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)`)[0].n;
    // 기존/신규 그룹별 남은 판정 수도 함께 — 자율 진행률 가시화
    const byGroup = (await sql`SELECT COALESCE(created_at < '2026-06-14', true) AS existing, published, COUNT(*)::int n FROM cafes WHERE raw_reviews IS NOT NULL AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at) GROUP BY 1,2`) as { existing: boolean; published: boolean; n: number }[];
    const g = (e: boolean, p: boolean) => byGroup.find((x) => x.existing === e && x.published === p)?.n || 0;
    const queue = { existingPublished: g(true, true), existingUnpublished: g(true, false), newPublished: g(false, true), newUnpublished: g(false, false) };
    return NextResponse.json({ ok: true, cafes, scanned: targets.length, noBorderline: advanced, remaining, queue });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
