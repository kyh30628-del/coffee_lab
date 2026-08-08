import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { extractHighlights } from "@/lib/cafeProfile";
import { quoteMatchConfidence } from "@/lib/reviewQuality";
import { ownBranch, isOtherBranchQuote } from "@/lib/branchQuote";
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
// 정확도(score) — 후기 한 건의 판정 정확도 수치(0~100). 등급 다음가는 정렬 기준(CEO 2026-08-05).
function accuracy(e: any): number {
  return typeof e?.score === "number" ? e.score : 50;
}
// 신뢰등급 티어 — 노출 우선순위의 최상위 기준. verified(검증)=그 카페가 글의 주제인 진짜 방문기,
//   reference(참고)=본문에 이름만 스친 약한 근거(옆가게·다른 맛집 글에 "맞은편 카페 ○○도" 식 언급).
function trustTier(e: any): number {
  return e?.trust === "verified" ? 2 : e?.trust === "reference" ? 1 : 0;
}
// 노출 정렬(CEO 확정 2026-08-05) — **①신뢰등급(검증 > 참고 > 그 외) ②같은 등급 안에서 정확도(score) 높은 순**
//   ③동점이면 최신순 ④그래도 동점이면 안정 타이브레이크. 검증 등급은 무조건 최우선으로 노출된다.
// ⚠️ 단 하나의 선행 관문 = 카페명 매칭 확신도(quoteMatchConfidence, 0/1). conf=0 = 인용문에 이 카페 이름조차
//   안 맞는 '다른 카페 의심' 건이라 등급과 무관하게 맨 뒤로 내린다(#307 '카페 여유'에 붙은 '노아브런치카페'
//   오염이 최상단을 차지한 사고의 방어선 — 저장 시점 등급만 믿으면 재발한다). 실제 데이터의 절대다수는
//   conf=1이라 이 관문은 오염 의심분만 걸러내고, 나머지 전부에 위 ①②③이 그대로 적용된다.
// 배경(CEO "피기스터하우스에 돈제당 리뷰가 6건 안에"): 예전 정렬은 conf→최신순이었는데 conf가 사실상 전건 1이라
//   '최신순'만 남아, 참고 등급(약한 근거)이 검증 후기를 밀어내고 대표 6칸을 차지했다(14075: 6칸 중 4칸).
//   전수 실측: 공개 13,460곳 중 9,927곳이 대표 6건에 참고를 노출, 그중 8,339곳은 아래에 검증 후기가 대기 중이었다.
// 🏪 두 번째 선행 관문(2026-08-08, CEO 선택안 C) — **다른 지점 후기**도 conf와 같은 급으로 뒤로 민다.
//   '쉐프부랑제 사우점' 상세에 '운양동 …쉐프부랑제 방문기'가 대표 6건에 뜨던 문제(센티넬 지점오염 22곳).
//   삭제하지 않는 이유: 한 글이 두 지점을 함께 다루는 경우가 흔해 지우면 정상 후기가 죽는다. 순서만 바꾼다.
//   ⚠️ 형제 지점 목록 조회 없음 — 카페 이름 하나로만 판정해 **추가 DB 비용 0**.
function sortReviews(raw: any[], name: string, areaTerms: string[], nowT: number, dong?: string | null): any[] {
  const own = ownBranch(name, dong);
  return [...raw]
    .map((e) => ({
      e,
      conf: quoteMatchConfidence(name, e?.quote || "", areaTerms),
      mine: own && isOtherBranchQuote(e?.quote || "", own) ? 0 : 1, // 0 = 다른 지점 글 → 맨 뒤
    }))
    .sort((a, b) => {
      if (b.conf !== a.conf) return b.conf - a.conf;
      if (b.mine !== a.mine) return b.mine - a.mine;
      const tier = trustTier(b.e) - trustTier(a.e);
      if (tier !== 0) return tier;
      const acc = accuracy(b.e) - accuracy(a.e);
      if (acc !== 0) return acc;
      return recencyBonus(b.e?.date, nowT) - recencyBonus(a.e?.date, nowT);
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
