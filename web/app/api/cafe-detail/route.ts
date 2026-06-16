import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 리뷰 게시일 파싱(YYYY.MM.DD / YYYY-MM / YYYY년 MM월 등) → ms
function parseYmd(d?: string): number | null {
  if (!d) return null;
  const m = String(d).match(/(\d{4})[.\-/년\s]+(\d{1,2})(?:[.\-/월\s]+(\d{1,2}))?/);
  if (!m) return null;
  const t = new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 15).getTime();
  return isNaN(t) ? null : t;
}
// 최신성 보너스(0~45): 이번 달 45, 이후 월 2점씩 감쇠, 날짜미상 12(중립). 최신성을 강하게 반영.
function recencyBonus(d: string | undefined, nowT: number): number {
  const t = parseYmd(d);
  if (t == null) return 12;
  const months = (nowT - t) / 2.63e9;
  if (months <= 1) return 45;
  return Math.max(0, 45 - months * 2);
}
// 복합 랭크 = 정확도(score) + 신뢰등급(검증 강하게 우대/거절 강한 페널티) + 최신성. '정확도 높고 가장 최신'이 위로.
function rankScore(e: any, nowT: number): number {
  const score = typeof e?.score === "number" ? e.score : 50;
  const trust = e?.trust === "verified" ? 25 : e?.trust === "reference" ? 0 : -40;
  return score + trust + recencyBonus(e?.date, nowT);
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
    const rows = await sql`SELECT synth_reviews, synth_reviews_all, synth_quality, llm_judged_at FROM cafes WHERE id=${id} LIMIT 1`;
    // 전체보기용: synth_reviews_all(옥석 전체) 우선, 없으면 기존 top6
    const raw = (rows[0]?.synth_reviews_all ?? rows[0]?.synth_reviews ?? []) as any[];
    // 정확도+신뢰+최신성 복합 정렬 → 상위 6건(대표)·전체보기 모두 '완벽한 리뷰' 순서로 노출
    const nowT = Date.now();
    const reviews = Array.isArray(raw) ? [...raw].sort((a, b) => rankScore(b, nowT) - rankScore(a, nowT)) : raw;
    const quality = rows[0]?.synth_quality ?? null;
    const llmJudged = !!rows[0]?.llm_judged_at;
    return NextResponse.json({ ok: true, reviews, quality, llmJudged }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
