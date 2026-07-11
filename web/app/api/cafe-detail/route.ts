import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { extractHighlights } from "@/lib/cafeProfile";
import { quoteMatchConfidence } from "@/lib/reviewQuality";
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
// 정확도(score) + 신뢰등급 복합 — 동일 확신도·동일 최신성 내 안정적 타이브레이크용(3순위).
function rankScore(e: any, nowT: number): number {
  const score = typeof e?.score === "number" ? e.score : 50;
  const trust = e?.trust === "verified" ? 25 : e?.trust === "reference" ? 0 : -40;
  return score + trust + recencyBonus(e?.date, nowT);
}
// #307: 정렬 = ①카페명 매칭 확신도(nameCoherence 기반, 동명 불일치·오염의심 리뷰를 하단으로) 내림차순
//   → ②동일 확신도 내 최신순 → ③동률 안정화용 정확도+신뢰등급. 저장 시점 score/trust만으로는
//   '카페 여유'에 붙은 '노아브런치카페' 언급 리뷰처럼 흔한 단어(여유) 하나로 겹친 오염이 최신성 덕에
//   최상단을 차지했다 — 읽기 시점에 매칭 확신도를 다시 계산해 이미 저장된 전체 카페에 즉시 적용한다.
function sortReviews(raw: any[], name: string, areaTerms: string[], nowT: number): any[] {
  return [...raw]
    .map((e) => ({ e, conf: quoteMatchConfidence(name, e?.quote || "", areaTerms) }))
    .sort((a, b) => {
      if (b.conf !== a.conf) return b.conf - a.conf;
      const rb = recencyBonus(b.e?.date, nowT) - recencyBonus(a.e?.date, nowT);
      if (rb !== 0) return rb;
      return rankScore(b.e, nowT) - rankScore(a.e, nowT);
    })
    .map(({ e }) => e);
}

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
    const reviews = Array.isArray(raw) ? sortReviews(raw, rows[0]?.name ?? "", areaTerms, nowT) : raw;
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
