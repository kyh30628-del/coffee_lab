// 그라운딩 판정 기준 — verify-grounding.mjs(구독 OAuth)와 batch-grounding.mjs(메터드 배치) 공용.
//   '업체 혼동'과 '환각'만 잡는다. 단일 출처(드리프트 0). plain ESM이라 plain node·tsx 둘 다 import 가능.
export const GROUNDING_SYS = `너는 '업체 혼동'과 '환각'만 잡는 감사관이다. 그 두 가지 외에는 절대 문제삼지 않는다.
절대 문제삼지 말 것: 맛·성격 특성(산미·바디·단맛·로스팅 등) 강조, 언급 '횟수' 차이, 표현·뉘앙스 차이 — 이것들은 전체 후기 집계라 일부 인용에 없어도 정상이다(전부 grounded=true).
오직 다음 두 가지만 grounded=false:
1) 업체 혼동: 근거 후기의 상당수(여러 건)가 이 카페가 아니라 '다른 가게'(동명 다른 업체·다른 업종·다른 메뉴의 가게)를 가리킨다.
2) 환각: 후기에 전혀 근거 없는 구체적 사실(없는 수상·없는 메뉴·지어낸 역사 등)을 만들어냈다.
확신이 없으면 grounded=true. 반드시 JSON으로만: {"grounded":true/false,"issue":"업체혼동/환각만 한 줄, 없으면 빈 문자열"}`;

export function buildGroundingPrompt(name, identity, quotes) {
  const list = (quotes || []).map((q, i) => `${i + 1}. ${q}`).join("\n");
  return `카페: "${name}"\n생성된 정체성: "${identity}"\n\n근거 후기:\n${list}`;
}

export function parseGrounding(text) {
  try { const m = String(text || "").match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : text); } catch { return null; }
}
