// 로컬 Sonnet 리뷰 판정 배치 (Claude Max 구독으로 실행).
// 사장님 머신에서 주기 실행 → 공유 DB의 '경계 리뷰'를 Sonnet이 맥락 판정 → 양질만 공개.
// 웹앱(Vercel)은 LLM 호출 없이 결과만 서빙. (PRINCIPLES §1·§5)
//
// 준비(최초 1회):
//   1) npm i @anthropic-ai/claude-agent-sdk        (web/ 폴더에서)
//   2) claude setup-token                          → 출력된 토큰 복사
//   3) export CLAUDE_CODE_OAUTH_TOKEN="발급토큰"
//      unset ANTHROPIC_API_KEY                      (있으면 구독 대신 API키로 가버림)
//   4) export APP_URL="https://coffee-lab-product-builder.vercel.app"
//      export ADMIN_PASSWORD="관리자비밀번호"
// 실행: node scripts/judge-batch.mjs

import { query } from "@anthropic-ai/claude-agent-sdk";

const APP_URL = process.env.APP_URL || "https://coffee-lab-product-builder.vercel.app";
const PW = process.env.ADMIN_PASSWORD || "";
const MODEL = process.env.JUDGE_MODEL || "claude-sonnet-4-5";
const MAX_CAFES = Number(process.env.JUDGE_MAX || 400); // 1회 실행 상한(크레딧 보호)

const RUBRIC = `너는 카페 리뷰 품질의 '최종 심사관'이다. 규칙 필터를 통과한 후보 스니펫들을 다시 엄격히 심사해, 그 카페의 '진짜 방문 후기'이면서 소비자에게 도움되는 양질의 글만 통과시킨다(거짓양성도 걸러낸다).
- about=true: 그 카페(또는 같은 지역·컨셉·메뉴가 일치하는 그 가게)를 실제로 방문해 쓴 글. 이름이 글자 그대로 없어도 내용·맥락(지역·분위기·메뉴·방문경험)이 그 카페를 가리키면 true.
- about=false: 다른 가게·동명 카페·무관한 글(단어만 우연히 겹침), 나열식 맛집 모음에 이름만 끼인 글.
- helpful=true: 맛·분위기·메뉴·서비스 등 구체 경험/평가가 담겨 도움됨. false: 광고·협찬 위주, 내용 없는 단순 언급, 사진만.
판정이 애매하면 보수적으로 false. 반드시 JSON 배열로만 답한다(설명·코드블록 금지): [{"i":번호,"about":true/false,"helpful":true/false}]`;

async function judge(cafeName, area, items) {
  const list = items.map((b, i) => `#${i} 제목:"${(b.title || "").slice(0, 120)}" 내용:"${(b.body || "").slice(0, 300)}"`).join("\n");
  const prompt = `대상 카페: "${cafeName}" (${area})\n\n스니펫:\n${list}`;
  let text = "";
  for await (const msg of query({ prompt, options: { systemPrompt: RUBRIC, model: MODEL, maxTurns: 1, allowedTools: [] } })) {
    if (msg.type === "result" && msg.subtype === "success") text = msg.result;
  }
  try { const m = text.match(/\[[\s\S]*\]/); return JSON.parse(m ? m[0] : text); }
  catch { return null; }
}

async function getCandidates(limit) {
  const r = await fetch(`${APP_URL}/api/judge-candidates?limit=${limit}`, { headers: { "x-admin-password": PW } });
  if (!r.ok) throw new Error(`candidates ${r.status}`);
  return r.json();
}
async function apply(cafeId, decisions) {
  const r = await fetch(`${APP_URL}/api/judge-apply`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": PW }, body: JSON.stringify({ cafeId, decisions }) });
  return r.json();
}

async function main() {
  if (!PW) { console.error("ADMIN_PASSWORD 미설정"); process.exit(1); }
  let done = 0, published = 0;
  while (done < MAX_CAFES) {
    const { ok, cafes, remaining, noBorderline } = await getCandidates(25);
    if (!ok) { console.error("candidates 실패"); break; }
    if (cafes.length === 0) { console.log(`심사 대상 카페 없음(스킵 ${noBorderline}). 남은 후보 ${remaining}.`); if (remaining === 0) break; continue; }
    for (const c of cafes) {
      const verdicts = await judge(c.name, c.area, c.candidates);
      // 후보 전체에 대한 keep/drop 결정(Sonnet 최종)
      const decisions = {};
      if (Array.isArray(verdicts)) for (const v of verdicts) { const key = c.candidates[v?.i]?.key; if (key) decisions[key] = !!(v.about && v.helpful); }
      const approved = Object.values(decisions).filter(Boolean).length;
      const res = await apply(c.cafeId, decisions);
      if (res?.published) published++;
      done++;
      console.log(`[${done}] ${c.name}: 후보 ${c.candidates.length} → 양질 ${approved} | 등급 ${res?.grade ?? "?"} 공개 ${res?.published ?? "?"}`);
      if (done >= MAX_CAFES) break;
    }
    console.log(`  …진행 ${done} (공개 ${published}), 남은 후보 ${remaining}`);
  }
  console.log(`\n완료: ${done}곳 판정, 공개 ${published}곳.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
