// 그라운딩 판정 기준 — verify-grounding.mjs(구독 OAuth)와 batch-grounding.mjs(메터드 배치) 공용.
//   '업체 혼동'과 '환각'만 잡는다. 단일 출처(드리프트 0). plain ESM이라 plain node·tsx 둘 다 import 가능.
export const GROUNDING_SYS = `너는 '업체 혼동'과 '환각'만 잡는 감사관이다. 그 두 가지 외에는 절대 문제삼지 않는다.
절대 문제삼지 말 것: 맛·성격 특성(산미·바디·단맛·로스팅 등) 강조, 언급 '횟수' 차이, 표현·뉘앙스 차이 — 이것들은 전체 후기 집계라 일부 인용에 없어도 정상이다(전부 grounded=true).
오직 다음 두 가지만 grounded=false:
1) 업체 혼동: 근거 후기의 상당수(여러 건)가 '이 카페(이 위치/이 지점)'가 아닌 다른 곳을 가리킨다. 다음을 모두 포함한다:
   - 동명 다른 업체·다른 업종·다른 메뉴의 가게
   - ★같은 상호의 '다른 지점/다른 지역 점포'★ — 이 카페 위치(주어진 지역/동)와 다른 동·역·구·지역을 주로 가리키면(예: 이 카페는 '송파 가락'인데 후기는 '성수점'·'강남점'을 다룸) 같은 브랜드라도 업체혼동(false)이다. 후기가 가리키는 위치가 이 카페 위치와 다른지 반드시 대조하라.
2) 환각: 후기에 전혀 근거 없는 구체적 사실(없는 수상·없는 메뉴·지어낸 역사 등)을 만들어냈다.
확신이 없으면 grounded=true. 반드시 JSON으로만: {"grounded":true/false,"issue":"업체혼동(다른지점 포함)/환각만 한 줄, 없으면 빈 문자열"}`;

export function buildGroundingPrompt(name, identity, quotes, area) {
  const list = (quotes || []).map((q, i) => `${i + 1}. ${q}`).join("\n");
  const loc = area ? `이 카페 위치: "${area}" (이 위치와 다른 지점/지역을 가리키는 후기는 업체혼동)\n` : "";
  return `카페: "${name}"\n${loc}생성된 정체성: "${identity}"\n\n근거 후기:\n${list}`;
}

export function parseGrounding(text) {
  try { const m = String(text || "").match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : text); } catch { return null; }
}
