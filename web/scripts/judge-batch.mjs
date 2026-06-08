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

// 구독 세션 한도/레이트 등은 '문제'가 아니라 정상 종료로 본다(진행분은 이미 저장됨, 내일 04:00 이어감).
const isLimit = (e) => /session limit|rate limit|429|usage limit|overloaded|exceeded/i.test(String(e?.message ?? e));
process.on("unhandledRejection", (e) => { if (isLimit(e)) { console.log("구독 한도 도달(비동기) — 오늘은 여기까지. 내일 04:00 이어서 심사."); process.exit(0); } console.error("unhandledRejection:", e); process.exit(0); });
process.on("uncaughtException", (e) => { if (isLimit(e)) { console.log("구독 한도 도달 — 오늘은 종료. 내일 이어서."); process.exit(0); } console.error("uncaughtException:", e); process.exit(0); });
const MODEL = process.env.JUDGE_MODEL || "claude-haiku-4-5"; // 분류 작업이라 Haiku로 충분 + 한도·속도 유리
const MAX_CAFES = Number(process.env.JUDGE_MAX || 150); // 1회 상한(Haiku는 한도 여유 큼 + 도달 시 우아한 중단)

const RUBRIC = `너는 카페 리뷰 품질의 '최종 심사관'이다. 규칙 필터를 통과한 후보들을 '본문 내용'으로 엄격·공정하게 심사한다.
- about=true: 본문에 '이 카페'에 대한 구체적 내용(메뉴·맛·커피·분위기·방문경험)이 '충분히' 담긴 글. 한 글에서 다른 가게(점심·디저트·다른 코스 등)를 함께 언급하더라도, 이 카페 내용이 충분하면 true. 상호가 글자 그대로 없어도 맥락(지역·메뉴·경험)이 이 카페를 가리키면 true.
- about=false: 이 카페 내용이 거의 없이 '상호만 스쳐 지나간' 글(맛집 나열에 이름만 끼인 경우), 또는 본문이 '동명의 다른 가게'를 가리키는 글.
- helpful=true: 이 카페에 대한 구체 경험·평가가 있어 도움됨. false: 광고·협찬 위주, 내용 없는 단순 언급, 사진만.
핵심 원칙: '다른 가게를 같이 언급했다'는 이유만으로 버리지 마라. 오직 '이 카페 내용의 충분함'으로 판단한다. 내용이 혼재되고 이 카페 분량마저 부실할 때만 false.
판정이 애매하면 보수적으로 false. 반드시 JSON 배열로만 답한다(설명·코드블록 금지): [{"i":번호,"about":true/false,"helpful":true/false}]`;

async function judge(cafeName, area, items) {
  const list = items.map((b, i) => `#${i} 제목:"${(b.title || "").slice(0, 120)}" 내용:"${(b.body || "").slice(0, 600)}"`).join("\n");
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
  let done = 0, published = 0, stop = false;
  while (done < MAX_CAFES && !stop) {
    const { ok, cafes, remaining, noBorderline } = await getCandidates(25);
    if (!ok) { console.error("candidates 실패"); break; }
    if (cafes.length === 0) { console.log(`심사 대상 카페 없음(스킵 ${noBorderline}). 남은 후보 ${remaining}.`); if (remaining === 0) break; continue; }
    for (const c of cafes) {
      let verdicts;
      try {
        verdicts = await judge(c.name, c.area, c.candidates);
      } catch (e) {
        const msg = String(e);
        if (/session limit|rate limit|429|usage limit|overloaded/i.test(msg)) {
          console.log(`\n구독 한도 도달 — 오늘은 여기까지(${done}곳 완료). 진행분은 저장됨, 내일 04:00 배치가 이어서 심사.`);
          stop = true; break;
        }
        console.log(`  ✗ ${c.name}: ${msg.slice(0, 80)} — 건너뜀`);
        continue;
      }
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
main().catch((e) => {
  if (isLimit(e)) { console.log("구독 한도 도달 — 오늘은 종료(진행분 저장). 내일 04:00 이어서."); process.exit(0); }
  console.error(e); process.exit(0); // 야간 best-effort 배치 — 에러도 로그만 남기고 깨끗이 종료(진행분은 저장됨)
});
