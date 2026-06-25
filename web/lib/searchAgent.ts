// 검색 에이전트 (PRINCIPLES §1·§2): 사용자 질문의 '맥락·의도'를 Claude Sonnet이 이해해
// 후보 카페 중 진짜 맞는 곳만 골라 정렬한다. 점수·데이터는 DB값만, LLM은 선별·설명만(환각 금지).
// 인증: 콘솔 API 키(ANTHROPIC_API_KEY, 종량·권장) 우선. 없으면 구독 토큰
// (CLAUDE_CODE_OAUTH_TOKEN, Bearer) 폴백 — 단 프로덕션 트래픽엔 레이트리밋/ToS 주의.
const CONSOLE_KEY = process.env.ANTHROPIC_API_KEY;
// 구독토큰은 사장님이 명시(ALLOW_SUB_TOKEN=1)할 때만 — 기본 OFF. 라이브 검색이 구독토큰으로 폴백돼
//   밤새 사장님 토큰 리밋 걸린 사고(2026-06-23) 방지. 콘솔키 없으면 LLM 재정렬 생략(기본 순위 사용).
const OAUTH = undefined; // 🛑 구독토큰 완전 차단(사장님 지시) — ALLOW_SUB_TOKEN 설정돼도 무시. 콘솔키 없으면 LLM 재정렬 생략.
export const hasSearchLLM = () => !!(CONSOLE_KEY || OAUTH);
const MODEL = process.env.SEARCH_MODEL || "claude-sonnet-4-5";
function authHeaders(): Record<string, string> {
  if (CONSOLE_KEY) return { "x-api-key": CONSOLE_KEY, "anthropic-version": "2023-06-01" };
  return { authorization: `Bearer ${OAUTH}`, "anthropic-version": "2023-06-01", "anthropic-beta": "oauth-2025-04-20" };
}

export type SearchCand = { id: number; name: string; area: string; identity?: string; tags?: string; quotes?: string };

const SYSTEM = `너는 동네 카페 검색 도우미다. 사용자의 자연어 질문의 '맥락·의도'를 이해하고, 후보 카페 중 그 의도에 진짜로 맞는 곳만 골라 적합한 순서로 정렬한다.
- 질문이 분위기/상황/용도/맛/동행 등 무엇을 원하는지 해석한다(예: "비 오는 날 혼자 조용히" → 조용하고 아늑하며 혼자 있기 좋은 곳).
- 각 카페의 정체성·특징(태그)·리뷰를 근거로 판단한다. 억지로 채우지 말고, 맞는 곳이 적으면 적게 반환한다.
- reason은 질문 맥락에 답하는 한국어 한 구절(예: "혼자 조용히 책 읽기 좋다는 후기가 많아요").
- 절대 없는 카페를 지어내지 말고, 주어진 후보의 id만 사용한다.
반드시 JSON 배열로만 답한다(설명·코드블록 금지): [{"id":번호,"reason":"..."}] — 가장 잘 맞는 순서, 최대 12개, 안 맞으면 제외.`;

// 후보를 Claude Sonnet이 질문 맥락에 맞게 선별·정렬. 실패/키없음 시 null(호출부 폴백).
export async function rerankWithClaude(query: string, region: string, cands: SearchCand[]): Promise<{ id: number; reason: string }[] | null> {
  if (!hasSearchLLM() || cands.length === 0) return null;
  const list = cands.map((c) => `- id:${c.id} | ${c.name} (${c.area}) | ${c.identity ?? ""} | 특징:${c.tags ?? "-"} | 후기:${(c.quotes ?? "").slice(0, 180)}`).join("\n");
  const user = `질문: "${query}"\n지역: ${region || "수도권 전체"}\n\n후보 카페 ${cands.length}곳:\n${list}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ model: MODEL, max_tokens: 1400, system: SYSTEM, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "";
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return null;
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return null;
    return arr.filter((x: any) => x && typeof x.id === "number").map((x: any) => ({ id: x.id, reason: String(x.reason ?? "").slice(0, 80) }));
  } catch { return null; }
}
