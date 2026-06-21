// 판정 모델 교체 검증 — Haiku가 이미 판정한 카페를, 같은 후보·같은 루브릭으로 Gemini 2.5 Flash가
//  재판정 → keep/drop 일치율 비교. 부작용 없음(읽기만). 결과로 교체 가부 결정.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { getAuditCandidates } = await import("../lib/synthStore.ts");
const { sql } = await import("../lib/db.ts");
const KEY = process.env.GOOGLE_AI_KEY || process.env.GOOGLE_API_KEY_1 || process.env.GOOGLE_API_KEY;
const MODEL = process.env.GEMINI_JUDGE_MODEL || "gemini-2.5-flash";
const N = Number(process.env.SAMPLE || 60);

const RUBRIC = `너는 카페 리뷰 품질의 '최종 심사관'이다. 규칙 필터를 통과한 후보들을 '본문 내용'으로 엄격·공정하게 심사한다.
- about=true: 본문에 '이 카페'에 대한 구체적 내용(메뉴·맛·커피·분위기·방문경험)이 '충분히' 담긴 글. 한 글에서 다른 가게(점심·디저트·다른 코스 등)를 함께 언급하더라도, 이 카페 내용이 충분하면 true. 상호가 글자 그대로 없어도 맥락(지역·메뉴·경험)이 이 카페를 가리키면 true.
- about=false: 이 카페 내용이 거의 없이 '상호만 스쳐 지나간' 글(맛집 나열에 이름만 끼인 경우), 또는 본문이 '동명의 다른 가게'를 가리키는 글.
- ★업종 구분: 대상은 '카페/커피 전문점'이다. 본문이 명백히 '다른 업종'(와인바·레스토랑·술집·해산물·고기집·떡볶이·베이커리 전문점 등)을 가리키면, 상호에 같은 단어가 들어가도 about=false.
- ★상호 변형: 상호 앞뒤에 다른 고유명사가 붙은 가게(예: '더즌 오이스터' ≠ '오이스터')는 다른 가게일 가능성이 높으니 본문 업종·위치로 신중히 구분.
- ★지점 구분: 대상이 '○○점'(지점)이면, 본문이 '그 지점(지점명·동·지역)'을 가리켜야 about=true. 다른 지점이면 false. 지점·지역 없이 브랜드명만 있으면 false.
- helpful=true: 이 카페에 대한 구체 경험·평가가 있어 도움됨. false: 광고·협찬 위주, 내용 없는 단순 언급, 사진만.
- ★제목 우선: 제목이 '다른 카페'를 명시하면 본문에 우리 카페가 잠깐 나와도 about=false.
- ★엄격 기본값: 이 후보들은 '규칙이 애매하다고 판단한 것'만 모은 것이다. 확신이 없으면 무조건 false.
핵심 원칙: 의심스러우면 버린다. 정확도가 생명이다. 판정이 조금이라도 애매하면 false. 반드시 JSON 배열로만 답한다(설명·코드블록 금지): [{"i":번호,"about":true/false,"helpful":true/false}]`;

async function geminiJudge(name, area, items) {
  const list = items.map((b, i) => `#${i} 제목:"${(b.title || "").slice(0, 90)}" 내용:"${(b.body || "").slice(0, 380)}"`).join("\n");
  const prompt = `대상 카페: "${name}" (${area})\n\n스니펫:\n${list}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: RUBRIC }] },
    contents: [{ parts: [{ text: prompt }] }],
    // thinkingBudget:0 → 사고 토큰 끔(분류 작업엔 불필요, 잘림 방지 + 비용↓). 출력 넉넉히.
    generationConfig: { temperature: 0, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 1500 * (attempt + 1))); continue; }
    if (!r.ok) return { err: `http${r.status}` };
    const d = await r.json();
    const fr = d.candidates?.[0]?.finishReason;
    const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    if (!text) return { err: `empty(${fr})` };
    try { const m = text.match(/\[[\s\S]*\]/); return { verdicts: JSON.parse(m ? m[0] : text) }; }
    catch { return { err: `parse(${fr})` }; }
  }
  return { err: "429재시도초과" };
}

const cafes = await sql`SELECT id, name, area, judge_decisions FROM cafes
  WHERE judge_decisions IS NOT NULL AND judge_decisions::text <> '{}' AND raw_reviews IS NOT NULL
  ORDER BY id LIMIT ${N}`;

let cmp = 0, agree = 0, gStricter = 0, gLooser = 0, cafesUsed = 0, errs = 0, noCand = 0;
const errTypes = {};
const disagrees = [];
for (const c of cafes) {
  let cands;
  try { cands = (await getAuditCandidates(c)).candidates; } catch { continue; }
  if (!cands?.length) { noCand++; continue; }
  const res = await geminiJudge(c.name, c.area, cands);
  if (res.err || !Array.isArray(res.verdicts)) { errs++; errTypes[res.err || "non-array"] = (errTypes[res.err || "non-array"] || 0) + 1; continue; }
  const haiku = c.judge_decisions || {};
  let usedHere = false;
  for (const v of res.verdicts) {
    const item = cands[v?.i];
    if (!item) continue;
    const key = item.key;
    if (!(key in haiku)) continue; // Haiku가 판정한 키만 비교
    const g = !!(v.about && v.helpful), h = !!haiku[key];
    cmp++; usedHere = true;
    if (g === h) agree++;
    else { if (h && !g) gStricter++; else gLooser++; if (disagrees.length < 12) disagrees.push(`${c.name}: Haiku ${h ? "keep" : "drop"} → Gemini ${g ? "keep" : "drop"} | "${(item.title || "").slice(0, 30)}"`); }
  }
  if (usedHere) cafesUsed++;
  await new Promise((r) => setTimeout(r, 80));
}

console.log(`\n===== 판정 일치율 검증 (Gemini ${MODEL} vs Haiku) =====`);
console.log(`표본 ${cafes.length}곳 → 비교 카페 ${cafesUsed}곳 · 리뷰 결정 ${cmp}건 · 후보없음 ${noCand}곳 · API오류 ${errs}곳`);
if (errs) console.log(`  오류유형:`, JSON.stringify(errTypes));
console.log(`일치: ${agree}/${cmp} = ${cmp ? (agree / cmp * 100).toFixed(1) : 0}%`);
console.log(`불일치: ${cmp - agree}건 — Gemini가 더 엄격(Haiku keep→Gemini drop) ${gStricter} · 더 느슨(Haiku drop→Gemini keep) ${gLooser}`);
console.log(`\n불일치 샘플:`); disagrees.forEach((d) => console.log("  · " + d));
console.log(`\n판단 기준: 일치율 ≥90% + '더 느슨'(오염 통과)이 적으면 교체 가능. 더 느슨이 많으면 오염 위험 → 교체 금지.`);
process.exit(0);
