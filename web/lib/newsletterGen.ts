import { sql } from "@/lib/db";
import { ensureNewsletterSchema, applyGuards, type Newsletter, type NLItem } from "@/lib/newsletter";

// ── 🆓 네이버 오픈 API(검색)로 무료 생성 — Anthropic 크레딧 불필요. 관리자 버튼 기본 경로. ──
const NID = process.env.NAVER_CLIENT_ID, NSEC = process.env.NAVER_CLIENT_SECRET;
const strip = (s: string) => (s || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
async function naver(kind: "news" | "blog", query: string, sort = "date"): Promise<{ title: string; desc: string; link: string }[]> {
  if (!NID || !NSEC) return [];
  try {
    const r = await fetch(`https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(query)}&display=15&sort=${sort}`, { headers: { "X-Naver-Client-Id": NID, "X-Naver-Client-Secret": NSEC } });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.items ?? []).map((it: any) => ({ title: strip(it.title), desc: strip(it.description), link: it.originallink || it.link })).filter((x: any) => x.title.length >= 8);
  } catch { return []; }
}

// 섹션 개수·필수필드는 newsletter.ts의 NL_SPEC가 최종 강제. 여기 n은 SPEC(각 3개)에 맞춤.
const CAT = [
  { key: "coffee", title: "☕ 커피 인사이트", q: ["커피 트렌드", "디카페인 커피", "스페셜티 커피 카페"], n: 3, tip: "원두·로스팅·디카페인 기준을 메뉴판에 한 줄로 명시 → 신뢰 포인트." },
  { key: "dessert", title: "🍰 디저트 스포트라이트", q: ["디저트 신메뉴 카페", "빙수 신메뉴", "베이커리 인기 메뉴"], n: 3, tip: "사진 잘 받는 시그니처 1종을 주말 한정으로 테스트." },
  { key: "cafes", title: "🔥 뜨는 카페 동향", q: ["요즘 뜨는 카페", "신상 카페 성수 연남", "카페 트렌드"], n: 3, tip: "큰 인테리어 대신 우리만의 '한 장면'(사진 포인트)을 만들기." },
];

export async function generateNewsletterFree(): Promise<{ ok: boolean; newsletter?: Newsletter; id?: number; cost?: number; error?: string }> {
  if (!NID || !NSEC) return { ok: false, error: "NAVER_CLIENT_ID/SECRET 미설정" };
  await ensureNewsletterSchema();
  const seenLink = new Set<string>(), seenTitle = new Set<string>();
  const pick = (items: { title: string; desc: string; link: string }[], n: number): NLItem[] => {
    const out: NLItem[] = [];
    for (const it of items) {
      const tkey = it.title.slice(0, 16);
      if (!it.link || seenLink.has(it.link) || seenTitle.has(tkey)) continue;
      seenLink.add(it.link); seenTitle.add(tkey);
      out.push({ text: it.title, note: it.desc ? it.desc.slice(0, 90) : undefined, source_url: it.link });
      if (out.length >= n) break;
    }
    return out;
  };
  const sections: any[] = [];
  const leads: string[] = [];
  for (const c of CAT) {
    let pool: { title: string; desc: string; link: string }[] = [];
    for (const q of c.q) pool = pool.concat(await naver("news", q));
    if (pool.length < c.n) for (const q of c.q) pool = pool.concat(await naver("blog", q, "sim"));
    const items = pick(pool, c.n);
    if (!items.length) continue;
    // 섹션 팁(우리 가게엔)을 마지막 항목 why에 합치지 않고 별도 인트로로
    sections.push({ key: c.key, title: c.title, intro: `우리 가게엔: ${c.tip}`, items });
    if (items[0]) leads.push(items[0].text);
  }
  if (!sections.length) return { ok: false, error: "네이버 검색 결과 없음(쿼터 초과 가능)" };
  // 📊 트렌드 레이더(SPEC 필수 섹션) — 키워드 3개 + 출처
  let radarPool: { title: string; desc: string; link: string }[] = [];
  for (const q of ["카페 트렌드 키워드", "요즘 카페 인기 메뉴", "카페 신메뉴 트렌드"]) radarPool = radarPool.concat(await naver("news", q));
  if (radarPool.length < 3) for (const q of ["카페 트렌드"]) radarPool = radarPool.concat(await naver("blog", q, "sim"));
  const radarItems = pick(radarPool, 3);
  const radar = radarItems.length ? [{ key: "radar", title: "📊 트렌드 레이더", intro: "우리 가게엔: 이번 주 키워드 중 우리 컨셉에 맞는 1개만 골라 작게 적용해보세요.", items: radarItems }] : [];
  // 짧은 뉴스 모음
  let newsPool: { title: string; desc: string; link: string }[] = [];
  for (const q of ["카페 신메뉴", "카페 베이커리 트렌드", "프랜차이즈 커피 신메뉴"]) newsPool = newsPool.concat(await naver("news", q));
  const news = pick(newsPool, 4).map((i) => ({ text: i.text, source_url: i.source_url }));
  const tldr = { key: "tldr", title: "📌 이번 주 한눈에", items: leads.slice(0, 3).map((t) => ({ text: t })) };
  const action = { key: "action", title: "💡 이번 주 사장님 액션", items: CAT.map((c) => ({ text: c.tip })) };
  // 순서·제목은 applyGuards(NL_SPEC)가 최종 강제하므로 조립 순서는 무관 — 필수 섹션을 모두 넣기만 하면 됨.
  const allSections = [tldr, ...radar, ...sections, action, ...(news.length ? [{ key: "news", title: "📰 짧은 업계 뉴스", items: news }] : [])];

  const d = new Date();
  const title = `이번 주 커피·디저트 트렌드 (${d.getMonth() + 1}월 ${d.getDate()}일)`;
  const guarded = applyGuards({ title, sections: allSections });
  const issueNo = ((await sql`SELECT COALESCE(MAX(issue_no),0)+1 n FROM newsletters`)[0] as any).n;
  const row = (await sql`INSERT INTO newsletters (issue_no, week_of, status, title, sections, flags, model, cost)
    VALUES (${issueNo}, ${d.toISOString().slice(0, 10)}, 'draft', ${guarded.title}, ${JSON.stringify(guarded.sections)}, ${JSON.stringify(guarded.flags || [])}, 'naver-free', 0)
    RETURNING id`)[0] as any;
  return { ok: true, newsletter: { ...guarded, id: row.id, issue_no: issueNo }, id: row.id, cost: 0 };
}

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
6) 섹션은 tldr·radar·coffee·dessert·cafes·action·news 7개를 모두 포함하고 순서를 지킨다.
   각 섹션은 정확히 3개 항목(news만 3~4개). radar·coffee·dessert·cafes는 항목마다 source_url과 why 필수.
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
