import { sql } from "@/lib/db";
import { ensureNewsletterSchema, applyGuards, type Newsletter } from "@/lib/newsletter";

// 📰 뉴스레터 생성기 — Claude Sonnet + web_search 서버툴로 수집·종합 → 섹션 JSON.
//   출처 URL 강제, 요약 only(저작권), 사장님 액션 포함. 결정적 가드는 applyGuards가 마무리.

const MODEL = "claude-sonnet-4-6";
const PIN = 3 / 1e6, POUT = 15 / 1e6; // Sonnet 입력/출력 단가

const SYS = `너는 한국 커피·카페·디저트 업계 주간 트렌드 뉴스레터의 '편집장'이다. 구독 카페 사장님이 바로 활용할 풍성하고 정확한 큐레이션을 만든다.
원칙(반드시 준수):
1) web_search로 '최신(이번 주/이번 달)' 한국 시장의 카페·커피·디저트 트렌드, 급상승 키워드, 핫한 메뉴·카페를 조사한다.
2) 모든 '사실 주장'에는 반드시 실제 검색에서 확인한 출처 URL(source_url)을 붙인다. 출처 없으면 항목에서 제외한다.
3) 원문을 베끼지 말고 '직접 요약'한다(항목당 1~2문장). 저작권 안전을 위해 길게 인용하지 않는다.
4) 과장·미검증 단정·의료효능 표현 금지. 차분하고 신뢰감 있는 톤.
5) 각 항목에 사장님이 '우리 가게에 어떻게 적용'할지 한 줄(why)을 단다.
출력: 아래 JSON '한 개'만. 설명·코드블록·여는말 금지.
{"title":"이번 주 제목","sections":[
 {"key":"tldr","title":"📌 이번 주 한눈에","items":[{"text":"요약 3개 정도"}]},
 {"key":"radar","title":"📊 트렌드 레이더","items":[{"text":"키워드 — 한 줄","why":"우리 가게엔?","source_url":"..."}]},
 {"key":"coffee","title":"☕ 커피 인사이트","items":[{"text":"...","why":"...","source_url":"..."}]},
 {"key":"dessert","title":"🍰 디저트 스포트라이트","items":[{"text":"...","why":"...","source_url":"..."}]},
 {"key":"cafes","title":"🔥 뜨는 카페 동향","items":[{"text":"...","why":"...","source_url":"..."}]},
 {"key":"action","title":"💡 이번 주 사장님 액션","items":[{"text":"실행 팁"}]},
 {"key":"news","title":"📰 짧은 업계 뉴스","items":[{"text":"한 줄 뉴스","source_url":"..."}]}
]}`;

async function momentumSeed(): Promise<string> {
  try {
    const rows = (await sql`SELECT name, area, synth_grade FROM cafes WHERE published AND synth_count>=60 ORDER BY synth_count DESC LIMIT 10`) as unknown as any[];
    if (!rows.length) return "";
    return "우리 플랫폼(동네 커피 노트)에서 검증 후기가 많은 수도권 카페 표본: " + rows.map((r) => `${r.name}(${r.area})`).join(", ") + ". '뜨는 카페 동향' 섹션에 참고하되, 외부 출처로 교차확인된 내용만 사실로 쓴다.";
  } catch { return ""; }
}

export async function generateNewsletter(): Promise<{ ok: boolean; newsletter?: Newsletter; id?: number; cost?: number; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "ANTHROPIC_API_KEY 없음" };
  await ensureNewsletterSchema();
  const seed = await momentumSeed();
  const today = new Date();
  const userMsg = `오늘은 ${today.toISOString().slice(0, 10)}. 이번 주 한국 커피·카페·디저트 트렌드로 주간 뉴스레터를 만들어줘. web_search로 최신 자료를 찾고, 각 사실에 출처 URL을 붙여. ${seed}`;
  let resp: any;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 6000,
        thinking: { type: "adaptive" },
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
        system: [{ type: "text", text: SYS }],
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!r.ok) return { ok: false, error: `API ${r.status}: ${(await r.text()).slice(0, 200)}` };
    resp = await r.json();
  } catch (e) { return { ok: false, error: String((e as any)?.message || e) }; }

  const text = (resp.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  let parsed: Newsletter | null = null;
  try { const m = text.match(/\{[\s\S]*\}/); parsed = JSON.parse(m ? m[0] : text); } catch { return { ok: false, error: "JSON 파싱 실패" }; }
  if (!parsed || !Array.isArray(parsed.sections)) return { ok: false, error: "형식 오류" };

  const u = resp.usage || {};
  const inTok = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const cost = inTok * PIN + (u.output_tokens || 0) * POUT + (u.server_tool_use?.web_search_requests || 0) * 0.01;

  const guarded = applyGuards(parsed);
  const issueNo = ((await sql`SELECT COALESCE(MAX(issue_no),0)+1 n FROM newsletters`)[0] as any).n;
  const weekOf = today.toISOString().slice(0, 10);
  const row = (await sql`INSERT INTO newsletters (issue_no, week_of, status, title, sections, flags, model, cost)
    VALUES (${issueNo}, ${weekOf}, 'draft', ${guarded.title || "이번 주 트렌드"}, ${JSON.stringify(guarded.sections)}, ${JSON.stringify(guarded.flags || [])}, ${MODEL}, ${cost})
    RETURNING id`)[0] as any;
  return { ok: true, newsletter: { ...guarded, id: row.id, issue_no: issueNo }, id: row.id, cost };
}
