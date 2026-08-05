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
// 신뢰등급 티어 — 상위 노출(대표 6건) 우선순위의 1차 기준. verified(검증)=그 카페가 글의 주제인 진짜 방문기,
//   reference(참고)=본문에 이름만 스친 약한 근거(옆가게·다른 맛집 글에 "맞은편 카페 ○○도" 식 언급).
function trustTier(e: any): number {
  return e?.trust === "verified" ? 2 : e?.trust === "reference" ? 1 : 0;
}
// #307: 정렬 = ①카페명 매칭 확신도(nameCoherence 기반, 동명 불일치·오염의심 리뷰를 하단으로) 내림차순
//   → ②신뢰등급(검증 > 참고) → ③동일 등급 내 최신순 → ④동률 안정화용 정확도+신뢰등급.
//   저장 시점 score/trust만으로는 '카페 여유'에 붙은 '노아브런치카페' 언급 리뷰처럼 흔한 단어(여유) 하나로
//   겹친 오염이 최신성 덕에 최상단을 차지했다 — 읽기 시점에 매칭 확신도를 다시 계산해 즉시 적용한다.
// 2026-08-05(CEO "피기스터하우스에 돈제당 리뷰가 6건 안에"): 확신도는 이름만 맞으면 전부 1이라
//   사실상 '최신순'만 남았고, 그 결과 **참고 등급(약한 근거)이 검증 후기를 밀어내고 대표 6건을 차지**했다.
//   (14075 피기스터하우스: 검증 17건이 있는데도 상위 6칸 중 4칸이 참고 — 돈제당 식당 글·피자집 글·샤브샤브 글.)
//   → 신뢰등급을 최신성보다 **위** 순위로 올려, 검증 후기가 있는 한 참고는 대표 6건에 못 들어오게 한다.
//   전수 실측: 공개 13,460곳 중 9,927곳이 대표 6건에 참고를 노출, 그중 8,339곳은 아래에 검증 후기가 대기 중.
function sortReviews(raw: any[], name: string, areaTerms: string[], nowT: number): any[] {
  return [...raw]
    .map((e) => ({ e, conf: quoteMatchConfidence(name, e?.quote || "", areaTerms) }))
    .sort((a, b) => {
      if (b.conf !== a.conf) return b.conf - a.conf;
      const tier = trustTier(b.e) - trustTier(a.e);
      if (tier !== 0) return tier;
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
