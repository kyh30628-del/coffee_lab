// 성격 축(char) 키워드 점수 — 합성 경로와 char-compute가 공유하는 단일 출처.
// 검증 통과한 리뷰 텍스트에서만 계산한다(품질 필터 이후). 측정값이 아니라 '언급 빈도'.
//   ⚠️ 축별 키워드(kws)는 lib/criteriaLists.ts(BASE=폴백 진실원본)가 단일출처 — 무배포 편집 가능.
//   ax.kws 는 getter로 매 접근시 getListSync(BASE 폴백)를 읽는다(캐시 미프라임이어도 현재값 = 서비스 무변).
import { getListSync } from "./criteriaListsBase"; // ⚠️ base(클라 안전)에서 import — criteriaLists(db 포함)를 거치면 클라 번들에 neon 유입(사고 재발)

const CHAR_AXES_BASE = [
  { key: "roast", label: "직접로스팅", emoji: "🔥", listKey: "char.roast.kws" },
  { key: "work", label: "작업·공부", emoji: "💻", listKey: "char.work.kws" },
  // coord#114(2026-07-05): 바른 "고요" 단독 매칭이 '최고요'(=최고예요)·'아침고요수목원'(관광지명)에 오염 →
  //   quiet 점수 허위 급등(고요재 845·최고요 241). 조용함을 실제 서술하는 형태(고요한/고요함/고요히)만 인정.
  { key: "quiet", label: "조용·혼자", emoji: "🤍", listKey: "char.quiet.kws" },
  { key: "dessert", label: "디저트", emoji: "🍰", listKey: "char.dessert.kws" },
  { key: "mood", label: "분위기", emoji: "📸", listKey: "char.mood.kws" },
  { key: "space", label: "넓은공간", emoji: "🪑", listKey: "char.space.kws" },
];
export const CHAR_AXES: { key: string; label: string; emoji: string; kws: string[] }[] =
  CHAR_AXES_BASE.map((a) => ({ key: a.key, label: a.label, emoji: a.emoji, get kws() { return getListSync(a.listKey); } }));

function countHits(text: string, kws: string[]): number {
  const t = text.toLowerCase();
  return kws.reduce((s, k) => s + (t.split(k.toLowerCase()).length - 1), 0);
}

// 카페 이름 자체가 축 키워드를 우연히 포함하면(예: "고요재"·"최고요" → quiet 키워드 "고요") 리뷰가
// 상호를 반복 인용할 때마다 실제 분위기 묘사 없이 축이 허위로 카운트된다 — 카운트 전 상호 언급을 제거해 방지.
function stripNameMentions(text: string, cafeName?: string): string {
  if (!cafeName) return text;
  const variants = [cafeName.trim(), cafeName.trim().replace(/\s+/g, "")].filter((v) => v.length >= 2);
  let out = text;
  for (const v of variants) {
    const re = new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, " ");
  }
  return out;
}

// 여러 텍스트(검증 리뷰 본문들)에서 축별 언급 횟수 합산. cafeName을 주면 상호 자기인용을 제외한다.
export function computeCharScores(texts: string[], cafeName?: string): Record<string, number> {
  const blob = stripNameMentions(texts.filter(Boolean).join(" "), cafeName);
  const scores: Record<string, number> = {};
  for (const ax of CHAR_AXES) scores[ax.key] = countHits(blob, ax.kws);
  return scores;
}

// 디저트/베이커리 우세 카페가 '요즘 뜨는'·'새로 발견' 등 커피 랭킹을 리뷰 회전만으로 과점하는 편향 방지(결함C).
//   dominant: roast(커피 정체성) 언급 자체가 없고 디저트 언급이 유의미하면 제외.
//     ⚠️ coffeeAxes(roast+work+quiet+mood+space) 합산 대비 판정은 폐기 — mood·space 등 범용 축이 커서
//     조건이 사실상 안 걸렸다(결재#124 배포 후에도 roast=0 카페 비중 42%→58%로 악화, 결재#127 근본원인).
//   bonus: 디저트가 커피축을 넘지 않는 곳은(=커피 정체성 유지) 소폭 가점.
export function dessertDominance(cs: Record<string, number> | null | undefined): { bonus: boolean; dominant: boolean } {
  const c = cs ?? {};
  const dessert = c.dessert ?? 0;
  const roast = c.roast ?? 0;
  const coffeeAxes = roast + (c.work ?? 0) + (c.quiet ?? 0) + (c.mood ?? 0) + (c.space ?? 0);
  return { bonus: dessert <= coffeeAxes, dominant: roast === 0 && dessert > 20 };
}
