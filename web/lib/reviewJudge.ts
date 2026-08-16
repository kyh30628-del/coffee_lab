// LLM 리뷰 맥락 판정 (PRINCIPLES §1·§5): 규칙이 애매하다고 본 '경계 리뷰'를
// LLM이 내용·맥락을 읽어 "정말 이 카페의 양질 후기인지" 재판정한다.
// - 카페명이 글자 그대로 없어도, 내용이 그 카페(지역·컨셉·메뉴)의 실제 방문 후기면 살린다.
// - 광고·나열식·무관·내용없는 글은 버린다.
// 우선순위: Anthropic Claude(ANTHROPIC_API_KEY) → 없으면 Google Gemini.
// LLM은 '판정'만 한다(데이터 생성 금지). 실패/쿼터 시 null → 호출측은 규칙 결과 유지(무회귀).

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_KEY = process.env.GOOGLE_AI_KEY || process.env.GOOGLE_API_KEY_1;
export const CLAUDE_MODEL = "claude-haiku-4-5";
const GEMINI_MODEL = "gemini-2.0-flash-lite";

export const hasJudgeKey = () => !!(ANTHROPIC_KEY || GOOGLE_KEY);
export const judgeProvider = () => (ANTHROPIC_KEY ? "claude" : GOOGLE_KEY ? "gemini" : "none");

export type JudgeItem = { i: number; title: string; body: string };
export type JudgeVerdict = { i: number; about: boolean; helpful: boolean; reason: string };

// 정적 판정 기준(프롬프트 캐싱 대상 — 모든 카페 판정에서 재사용)
// ⚠️ 입력의 구조적 한계(2026-08-16 확인·CEO 지적) — 이 파일을 고칠 사람이 반드시 알아야 한다.
//   여기 들어오는 body는 블로그 **원문이 아니라** 네이버 검색 API가 돌려준 발췌(평균 153자)다.
//   그 발췌는 '도입부'가 아니라 **검색어(카페명) 주변**을 잘라준다 — 실측 확인: 제목이 「경기투어패스 동선」인
//   글에서도 우리 카페가 언급된 글 중간 부분이 발췌돼 왔다. 따라서
//     · 귀속 판정(이 글이 이 카페 얘기인가) → 가능. 카페명 주변 문맥이 항상 온다.
//     · 협찬 공시 탐지 → **불가**. 공시는 카페명과 다른 자리에 있어 발췌에 안 들어온다.
//   루브릭이 못 하는 일을 시키면 모델이 추측으로 답한다. 그래서 협찬 판정을 명시적으로 금지했다.
export const RUBRIC = `너는 카페 리뷰 품질 심사관이다. 블로그 스니펫들이 특정 카페의 '진짜 방문 후기'이면서 소비자에게 도움이 되는 양질의 글인지 각각 판정한다.

판정 기준:
- about=true: 그 카페(또는 같은 지역·컨셉·메뉴가 일치하는 그 가게)를 실제로 방문해 쓴 글. 이름이 글자 그대로 없어도 내용·맥락(지역, 분위기, 메뉴, 방문 경험)이 그 카페를 가리키면 true.
- about=false: 다른 가게·동명 카페·무관한 글(단순히 '정원','책방' 같은 단어만 우연히 겹침), 나열식 맛집 모음에 이름만 끼인 글.
- helpful=true: 맛·분위기·메뉴·서비스 등 구체적 경험/평가가 담겨 소비자에게 도움됨. false: 홍보성 문체(정보 나열만·개인 경험 없음), 내용 없는 단순 언급, 사진만.

⚠️ 협찬/대가성 여부는 판정하지 마라. 너에게 주어지는 건 블로그 원문이 아니라 **검색어(카페명) 주변을 잘라낸
   발췌**라, 협찬 공시("소정의 원고료를 지원받아")는 대개 이 발췌에 들어오지 않는다. 없는 근거로 추측하면
   오판이 된다. 눈에 보이는 **문체·내용**만으로 helpful을 판단하고, 협찬 탐지는 별도 장치(템플릿 지문·
   캠페인 클러스터·리뷰어 이력)가 담당한다.

반드시 JSON 배열로만 답한다(설명·코드블록 금지): [{"i":번호,"about":true/false,"helpful":true/false,"reason":"15자 이내"}]`;

export function buildUserText(cafeName: string, area: string, items: JudgeItem[]): string {
  const list = items.map((it) => `#${it.i} 제목:"${(it.title || "").slice(0, 120)}" 내용:"${(it.body || "").slice(0, 300)}"`).join("\n");
  return `대상 카페: "${cafeName}" (${area})\n\n스니펫:\n${list}`;
}

export function parseVerdicts(text: string): Map<number, JudgeVerdict> | null {
  try {
    const m = text.match(/\[[\s\S]*\]/); // JSON 배열만 추출(코드블록 등 방어)
    const arr = JSON.parse(m ? m[0] : text) as JudgeVerdict[];
    const map = new Map<number, JudgeVerdict>();
    for (const v of arr) if (typeof v?.i === "number") map.set(v.i, v);
    return map;
  } catch { return null; }
}

async function judgeClaude(cafeName: string, area: string, items: JudgeItem[]): Promise<Map<number, JudgeVerdict> | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: Math.min(8000, 600 + items.length * 40), // 항목수 비례 동적(100건≈4600) — 출력 잘림→JSON 파싱 실패 방지
        // 정적 기준은 캐시(ephemeral)로 재사용 → 비용·지연 절감
        system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildUserText(cafeName, area, items) }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.find((b: any) => b.type === "text")?.text ?? data?.content?.[0]?.text;
    return text ? parseVerdicts(text) : null;
  } catch { return null; }
}

async function judgeGemini(cafeName: string, area: string, items: JudgeItem[]): Promise<Map<number, JudgeVerdict> | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_KEY}`;
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${RUBRIC}\n\n${buildUserText(cafeName, area, items)}` }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? parseVerdicts(text) : null;
  } catch { return null; }
}

// 경계 리뷰들을 한 번의 호출로 일괄 판정. 반환: 인덱스→판정. 실패 시 null.
export async function judgeReviews(cafeName: string, area: string, items: JudgeItem[]): Promise<Map<number, JudgeVerdict> | null> {
  if (items.length === 0) return null;
  if (ANTHROPIC_KEY) return judgeClaude(cafeName, area, items);
  if (GOOGLE_KEY) return judgeGemini(cafeName, area, items);
  return null;
}
