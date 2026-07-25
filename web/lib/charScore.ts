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
// #359: 지점명이 붙은 상호("앤드테라스 파주점")는 리뷰가 지점명 없이 브랜드만 축약 인용("앤드테라스는...")하는
//   경우가 흔해 풀네임 매칭을 피해간다 — 마지막 공백토큰(지점명)을 뗀 브랜드 핵심명도 변형으로 함께 제거한다.
function stripNameMentions(text: string, cafeName?: string): string {
  if (!cafeName) return text;
  const trimmed = cafeName.trim();
  const tokens = trimmed.split(/\s+/);
  const variants = [trimmed, trimmed.replace(/\s+/g, ""), tokens.slice(0, -1).join(" ")].filter((v) => v.length >= 2);
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
  // dominant: 디저트 언급이 유의미(>20)하고 ①로스팅 절대량이 약하며(<5, 빵 리뷰 속 노이즈 수준) ②디저트가 로스팅을 압도(≥8배)하면 = 사실상 베이커리.
  //   ⚠️ 2026-07-25: 기존 roast===0 조건은 빵 리뷰 속 로스팅 노이즈 1~3회만 껴도 빠져나가, '삼남매 빵집'(디저트333·로스팅3)
  //   같은 순수 빵집이 커피 스페셜티로 노출됨(coherence 1.0=오염 아님, 순수 분류 오류). 비율만으로는 진짜 로스터리(레귤러리 로스팅53 등)까지
  //   오배제되어, 로스팅 절대량 하한(<5)을 함께 걸어 '로스팅 강한 진짜 커피집'은 디저트가 많아도 보호한다.
  return { bonus: dessert <= coffeeAxes, dominant: dessert > 20 && roast < 5 && dessert >= roast * 8 };
}

// 카페의 대표 결(char) 상위 N개 — OG카드·공유 배지 등 짧은 표시용(원시 언급량 순).
export function topCharTraits(cs: Record<string, number> | null | undefined, n = 2): string[] {
  const c = cs ?? {};
  return CHAR_AXES.filter((ax) => (c[ax.key] ?? 0) > 0)
    .sort((a, b) => (c[b.key] ?? 0) - (c[a.key] ?? 0))
    .slice(0, n)
    .map((ax) => `${ax.emoji} ${ax.label}`);
}
