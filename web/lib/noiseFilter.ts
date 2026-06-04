// 노이즈 필터 (PRINCIPLES.md 7조) — 수집 글이 '그 카페 리뷰'인지 검증
// 통과 못 하면 버린다(헌법1: 환각 방지). 일반교양글·동명·무관 글 배제.

const VISIT_CUES = ["갔","방문","다녀","마셨","주문","시켰","들렀","가봤","재방문",
  "visited","ordered","tried","went","stopped by","i had","we had"];
const GENERIC_CUES = ["란 무엇","이란?","뜻과","종류별","조절하는 방법","표현 방법",
  "what is","how to","guide to","정의","알아보"];

const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "");

export function isCafeReview(text: string, cafeName: string, areaTerms: string[]): { ok: boolean; why: string } {
  if (!text || text.length < 20) return { ok: false, why: "too_short" };
  const t = text, tl = text.toLowerCase();
  const tn = norm(text), nameN = norm(cafeName);
  const nameIn = !!nameN && tn.includes(nameN);

  const genericHits = GENERIC_CUES.filter((g) => tl.includes(g)).length;
  if (genericHits >= 1 && !nameIn) return { ok: false, why: "generic_article" };

  if (!nameIn) {
    const toks = cafeName.split(/\s+/).filter((x) => x.length >= 2);
    if (!toks.some((tok) => tn.includes(norm(tok)))) return { ok: false, why: "name_absent" };
  }
  const areaOk = areaTerms.length ? areaTerms.some((a) => t.includes(a)) : true;
  const visitOk = VISIT_CUES.some((c) => tl.includes(c));

  if (nameIn && (areaOk || visitOk)) return { ok: true, why: "ok_strong" };
  if (nameIn) return { ok: true, why: "ok_name_only" };
  if (areaOk && visitOk) return { ok: true, why: "ok_context" };
  return { ok: false, why: "weak_context" };
}

export function filterReviews(candidates: string[], cafeName: string, areaTerms: string[]) {
  const passed: string[] = [], log: { snip: string; ok: boolean; why: string }[] = [];
  for (const c of candidates) {
    const { ok, why } = isCafeReview(c, cafeName, areaTerms);
    log.push({ snip: c.slice(0, 40), ok, why });
    if (ok) passed.push(c);
  }
  return { passed, log };
}
