// 사장님 쇼케이스 AI 홍보 카피 생성 배치 (Claude Max 구독으로 실행).
// 사장님이 글·사진 올리면 ai_pending=true로 큐에 쌓임 → 이 배치가 사장님 맥에서
// Max 구독(Claude 비전)으로 홍보 카피 생성 → DB 저장 → 화면은 그냥 출력.
// Vercel/콘솔 키 불필요. 환경변수: scripts/.judge.env 재사용(APP_URL·ADMIN_PASSWORD·토큰).
// 실행: node scripts/promo-batch.mjs   (즉시 생성) / launchd로 주기 실행 가능.

import { query } from "@anthropic-ai/claude-agent-sdk";

const APP_URL = process.env.APP_URL || "https://coffee-lab-product-builder.vercel.app";
const PW = process.env.ADMIN_PASSWORD || "";
const MODEL = process.env.PROMO_MODEL || process.env.JUDGE_MODEL || "claude-sonnet-4-5";

const SYSTEM = `너는 동네 카페를 사랑받게 만드는 대한민국 최고의 브랜드 카피라이터다.
사장님이 적은 글에서 '이 가게에만 있는 진짜 매력 한 가지'를 포착해, 소비자의 마음이 움직여 '여긴 꼭 가봐야겠다'고 느끼는 카피로 다듬는다.

핵심 원칙:
1. 뻔한 표현 금지 — "맛있는 커피", "분위기 좋은 카페", "감성 가득" 같은 일반론은 절대 쓰지 않는다.
2. 구체적인 한 장면·감각·이유로 말한다 — 손님이 그 순간을 떠올리게(향, 온도, 빛, 손길, 시간대 등).
3. 사장님 글에 실제로 있는 사실만 근거로(과장·허위·없는 메뉴 금지).
4. 헤드라인은 감정·장면을 건드리고, 태그라인은 그 약속을 구체화하고, 포인트는 진짜 차별점만.
5. 한국어 입말로 자연스럽고 따뜻하게. 광고 티 나는 상투어·느낌표 남발 금지.

반드시 JSON으로만 답한다(설명·코드블록 금지):
{"headline":"7~16자, 마음을 건드리는 한 줄","tagline":"22자 내외, 구체적인 약속·이유","points":["진짜 차별점1(8자 내외)","2","3"]}`;

// 텍스트 전용 요약(비전 미사용 → 토큰 절감). Agent SDK(query) = Max 구독 안정 동작.
// 사진은 배너 배경으로만 쓰이고, 카피는 사장님 글을 요약해 생성.
async function callClaude(name, area, intro) {
  const prompt = `카페: "${name}" (${area})\n사장님 홍보 문구: ${intro || "(없음)"}\n\n위 글을 요약해 어필 홍보 카피를 만들어줘.`;
  let text = "";
  for await (const msg of query({ prompt, options: { systemPrompt: SYSTEM, model: MODEL, maxTurns: 1, allowedTools: [] } })) {
    if (msg.type === "result" && msg.subtype === "success") text = msg.result;
  }
  const m = text.match(/\{[\s\S]*\}/); if (!m) return null;
  try { const j = JSON.parse(m[0]); if (!j.headline) return null; return { headline: String(j.headline), tagline: String(j.tagline ?? ""), points: Array.isArray(j.points) ? j.points.map(String) : [] }; }
  catch { return null; }
}

async function main() {
  if (!PW || !process.env.CLAUDE_CODE_OAUTH_TOKEN) { console.error("ADMIN_PASSWORD / CLAUDE_CODE_OAUTH_TOKEN 필요(scripts/.judge.env)"); process.exit(1); }
  const q = await (await fetch(`${APP_URL}/api/promo-queue`, { headers: { "x-admin-password": PW } })).json();
  const pend = q.pending || [];
  if (!pend.length) { console.log("생성 대기 중인 홍보 없음."); return; }
  console.log(`대기 ${pend.length}건 — 홍보 카피 생성 시작`);
  let ok = 0;
  for (const p of pend) {
    const ai = await callClaude(p.name, p.area, p.intro);
    if (ai) {
      await fetch(`${APP_URL}/api/promo-queue`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": PW }, body: JSON.stringify({ cafeId: p.cafe_id, ...ai }) });
      console.log(`  ✓ ${p.name}: "${ai.headline}"`); ok++;
    } else {
      console.log(`  · ${p.name}: 생성 보류(레이트리밋/오류) — 다음 실행 때 재시도`); // pending 유지
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`완료: ${ok}/${pend.length} 생성.`);
}
const isLimit = (e) => /session limit|rate limit|429|usage limit|overloaded|exceeded/i.test(String(e?.message ?? e));
process.on("unhandledRejection", (e) => { console.log(isLimit(e) ? "구독 한도 — 홍보 생성 오늘 종료, 내일 이어서." : "promo unhandled: " + String(e).slice(0, 120)); process.exit(0); });
main().catch((e) => { if (isLimit(e)) console.log("구독 한도 — 홍보 생성 오늘 종료, 내일 이어서."); else console.error(e); process.exit(0); });
