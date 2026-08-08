import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { extractHighlights } from "@/lib/cafeProfile";
import { sortReviews } from "@/lib/exposureOrder"; // 👁️ 노출 정렬 단일 출처(감시자와 공유)
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
    // 감사수리: 비정수 id가 SQL 예외(500)로 새던 것 → 400으로 차단
    const idNum = Number(id);
    if (!Number.isInteger(idNum)) return NextResponse.json({ ok: false, error: "잘못된 id" }, { status: 400 });
    // 감사수리: published 조건 없이 비공개 카페 리뷰가 새던 누수 차단
    const rows = await sql`SELECT name, area, dong, synth_reviews, synth_reviews_all, synth_quality, llm_judged_at, reputation_note FROM cafes WHERE id=${idNum} AND published=true LIMIT 1`;
    if (!rows[0]) return NextResponse.json({ ok: false, error: "카페를 찾을 수 없어요" }, { status: 404 });
    // 전체보기용: synth_reviews_all(옥석 전체) 우선, 없으면 기존 top6
    const raw = (rows[0]?.synth_reviews_all ?? rows[0]?.synth_reviews ?? []) as any[];
    // 매칭 확신도 우선 + 동일 확신도 내 최신순 정렬 → 상위 6건(대표)·전체보기 모두 동일 순서로 노출
    const nowT = Date.now();
    const areaTerms = [rows[0]?.area, rows[0]?.dong].filter(Boolean) as string[];
    const reviews = Array.isArray(raw) ? sortReviews(raw, rows[0]?.name ?? "", areaTerms, nowT, rows[0]?.dong) : raw;
    const quality = rows[0]?.synth_quality ?? null;
    const llmJudged = !!rows[0]?.llm_judged_at;
    // 옥석 리뷰에서 소비자가 꼭 볼 구체 포인트를 빈도로 추출(데이터 기반 핵심)
    const highlights = extractHighlights((Array.isArray(reviews) ? reviews : []).map((r: any) => r?.quote || ""));
    return NextResponse.json({ ok: true, area: rows[0]?.area ?? null, reviews, quality, llmJudged, highlights, reputationNote: rows[0]?.reputation_note ?? null }, {
      headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  } catch {
    // 감사수리: 내부 예외 문자열 노출 제거
    return NextResponse.json({ ok: false, error: "일시적 오류 — 잠시 후 다시 시도해 주세요" }, { status: 500 });
  }
}
