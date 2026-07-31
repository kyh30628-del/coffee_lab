// 사장님 쇼케이스 홍보 카피 생성 (PRINCIPLES §1: 과장·허위 금지 — 사진·글 근거).
// Claude는 이미지를 '생성'하지 못함 → 사진(비전) + 소개글을 읽고 '홍보 카피'를 만든다.
// 그 카피 + 사장님 사진을 합쳐 카페 상세 상단 '홍보 배너'로 렌더(=홍보물).
// 인증: 콘솔 ANTHROPIC_API_KEY 우선, 없으면 구독 CLAUDE_CODE_OAUTH_TOKEN(Bearer) 폴백.
import { sql } from "@/lib/db";
import { CHAR_AXES } from "@/lib/charScore";
const CONSOLE_KEY = process.env.ANTHROPIC_API_KEY;
// 구독토큰은 사장님이 명시(ALLOW_SUB_TOKEN=1)할 때만 — 기본 OFF. 콘솔키 없으면 홍보 생성 생략(구독토큰 미사용).
const OAUTH = undefined; // 🛑 구독토큰 완전 차단(사장님 지시) — ALLOW_SUB_TOKEN 설정돼도 무시. 콘솔키 없으면 LLM 생략.
export const hasPromoLLM = () => !!(CONSOLE_KEY || OAUTH);
const MODEL = process.env.PROMO_MODEL || "claude-sonnet-4-5";
function authHeaders(): Record<string, string> {
  if (CONSOLE_KEY) return { "x-api-key": CONSOLE_KEY, "anthropic-version": "2023-06-01" };
  return { authorization: `Bearer ${OAUTH}`, "anthropic-version": "2023-06-01", "anthropic-beta": "oauth-2025-04-20" };
}

export type PromoCopy = { headline: string; tagline: string; points: string[] };

const SYSTEM = `너는 동네 카페 전문 홍보 카피라이터다. 사장님이 준 사진과 소개글을 보고, 소비자가 '가보고 싶다'고 느끼게 만드는 짧고 감각적인 홍보 문구를 쓴다.
- 사진·소개글에 실제로 보이는 것만 근거로(과장·허위·없는 메뉴 금지).
- 따뜻하고 구체적으로. 진부한 표현("최고의 맛") 지양.
반드시 JSON으로만 답한다(설명·코드블록 금지):
{"headline":"6~14자 임팩트 헤드라인","tagline":"20자 내외 한 줄 소개","points":["특징1(8자내외)","특징2","특징3"]}`;

export async function generatePromo(cafeName: string, area: string, intro: string, photoDataUrl?: string): Promise<PromoCopy | null> {
  if (!hasPromoLLM()) return null;
  try {
    const content: any[] = [];
    if (photoDataUrl && /^data:image\/(jpe?g|png|webp);base64,/.test(photoDataUrl)) {
      const [meta, b64] = photoDataUrl.split(",");
      const mt = meta.match(/data:(image\/[\w]+)/)?.[1] || "image/jpeg";
      content.push({ type: "image", source: { type: "base64", media_type: mt, data: b64 } });
    }
    content.push({ type: "text", text: `카페: "${cafeName}" (${area})\n사장님 소개글: ${intro || "(없음)"}\n\n위 사진과 글을 바탕으로 홍보 카피를 만들어줘.` });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, system: SYSTEM, messages: [{ role: "user", content }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    if (!j.headline) return null;
    return { headline: String(j.headline).slice(0, 24), tagline: String(j.tagline ?? "").slice(0, 60), points: Array.isArray(j.points) ? j.points.slice(0, 3).map((p: any) => String(p).slice(0, 20)) : [] };
  } catch { return null; }
}

// 🆓 무료(무LLM) 홍보 카피 — 콘솔 크레딧 소진/키 없어도 항상 작동. 우리 고유 데이터(성향축·정체성·지역)로 결정론 조립.
//   과장 없음(PRINCIPLES §1): 전부 우리 검증 데이터에서 나온 값. LLM만큼 매끄럽진 않아도 근거 있는 홍보물.
const HL_BY_TRAIT: Record<string, string> = {
  roast: "직접 볶는 로스터리", dessert: "디저트가 맛있는 카페", quiet: "조용히 머무는 카페",
  work: "작업하기 좋은 카페", mood: "사진 찍기 좋은 카페", space: "넓고 편안한 카페",
};
export async function generatePromoFree(cafeId: number): Promise<PromoCopy | null> {
  try {
    const c = (await sql`SELECT name, area, dong, synth_identity, char_scores, signature FROM cafes WHERE id = ${cafeId}`)[0] as any;
    if (!c) return null;
    const cs = (c.char_scores || {}) as Record<string, number>;
    const traits = CHAR_AXES.map((a) => ({ key: a.key, label: a.label, v: Number(cs[a.key] || 0) })).filter((t) => t.v > 0).sort((a, b) => b.v - a.v);
    const points: string[] = traits.slice(0, 3).map((t) => t.label);
    for (const p of ["동네 카페", "커피 한잔", "편한 공간"]) { if (points.length >= 3) break; if (!points.includes(p)) points.push(p); }
    const place = (c.dong || c.area || "우리 동네").toString();
    const top = traits[0];
    const headline = (top ? `${place} ${HL_BY_TRAIT[top.key] || "동네 카페"}` : `${place} 동네 카페`).slice(0, 24);
    // 태그라인: 정체성 앞 2절(마지막 '○○에서 자주 언급되는' 위치문구는 어색해 제외)
    const clauses = String(c.synth_identity || "").split(/·|\||,/).map((s) => s.trim()).filter(Boolean);
    let tagline = clauses.slice(0, 2).join(" · ");
    if (!tagline) tagline = c.signature ? `추천 ${String(c.signature).slice(0, 24)}` : `${points.slice(0, 2).join(" · ")} 있는 ${place} 카페`;
    return { headline, tagline: tagline.slice(0, 44), points: points.slice(0, 3) };
  } catch { return null; }
}
