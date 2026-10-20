#!/usr/bin/env node
// ⚠️ "이건 알고 가세요" AI 생성 (2026-10-19)
//
// 왜: 주의점은 **가기 전에 알아야 손해를 안 보는 정보**다(주차 어려움·브레이크타임·웨이팅·좌석 부족).
//   그런데 공개 50,039곳 중 **4,390곳(8.8%)** 에만 있다. 규칙(키워드)이 사실상 '주차'만 잡아서다 —
//   실측 분포: 주차 3,029 vs 웨이팅 89 · 소음 10 · 콘센트 7. 나머지는 후기에 적혀 있는데 못 읽은 것이다.
//   게다가 기존 근거 문장은 블로그 머리글이 통째로 들어간 게 많다("화,수 정기휴무 0507-… 주차 불가 독자 여러분…").
//
// 🔒 라벨은 **기존 13종 고정 어휘**만 쓴다 — 화면(이모지·정렬)과 어긋나지 않게. 새 라벨 생성 금지.
// 🔒 판정(caution_drafts)과 집행(--apply) 분리.
// 💰 Batch 반값 · 발췌 12건 · 카페당 ≈$0.0005.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { createBatch, getBatch, streamResults, batchPriceFor } = await import("../lib/anthropicBatch.ts");
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CAUTION_MODEL || "claude-haiku-4-5";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const LIMIT = Number(arg("limit", 900));
const APPLY = process.argv.includes("--apply");

// 화면이 아는 라벨만 — lib/cafeProfile.ts의 주의점 어휘와 같은 집합(실측 분포 기준)
const VOCAB = { "주차 어려움": "🅿️", "브레이크타임": "⏸️", "좌석 부족": "💺", "예약 필요": "📅",
  "공간 협소": "📐", "반려동물 불가": "🚫", "웨이팅 있음": "⏳", "계단 있음": "🪜",
  "가격대 높음": "💰", "소음 있음": "🔊", "콘센트 부족": "🔌", "주말 혼잡": "🧍", "화장실 외부": "🚻" };

// 후보를 뽑는 단서(넓게 잡고 판정은 AI가 좁힌다). 반대 뜻 걸러내기는 아래 수거 단계에서 한 번 더 한다.
const CUE = {
  "주차 어려움": /주차.{0,6}(불가|어렵|힘들|협소|없|전쟁|난)|주차장.{0,4}없/,
  "브레이크타임": /브레이크\s?타임|브레이크타임|휴게시간/,
  "좌석 부족": /자리.{0,4}(없|부족|적)|좌석.{0,4}(없|부족|적)/,
  "예약 필요": /예약.{0,4}(필수|제|해야|필요)/,
  "공간 협소": /협소|좁[은아다]|아담/,
  "반려동물 불가": /(애견|반려동물|강아지|펫).{0,8}(불가|안\s?[됩되]|금지|제한)/,
  "웨이팅 있음": /웨이팅|대기.{0,3}(줄|시간)|줄.{0,3}서/,
  "계단 있음": /계단/,
  "가격대 높음": /비싸|가격.{0,4}(높|센)|가성비.{0,4}(별로|아쉬)/,
  "소음 있음": /시끄|소음|웅성/,
  "콘센트 부족": /콘센트.{0,6}(없|부족|적)/,
  "주말 혼잡": /주말.{0,8}(혼잡|붐비|사람.{0,3}많)/,
  "화장실 외부": /화장실.{0,8}(외부|밖|공용|건물)/,
};

// 라벨과 **반대 뜻**인 근거를 거르는 사전(실사고 기반)
const NEGATE = {
  "반려동물 불가": /(동반|입장).{0,4}가능|애견\s?카페|펫.{0,2}프렌/,
  "브레이크타임": /브레이크\s?타임.{0,6}(없|무)/,
  "화장실 외부": /내부\s?화장실|화장실.{0,4}내부/,
  "주차 어려움": /주차.{0,4}(가능|편|넉넉|무료)/,
  "예약 필요": /예약.{0,4}(없|불필요|안\s?해)/,
  "웨이팅 있음": /웨이팅.{0,4}(없|짧)/,
  "콘센트 부족": /콘센트.{0,4}(많|충분)/,
};

await sql`CREATE TABLE IF NOT EXISTS caution_drafts (
  cafe_id INT PRIMARY KEY, items JSONB, model TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now(), applied BOOLEAN NOT NULL DEFAULT false)`;

if (APPLY) {
  const d = await sql`SELECT cafe_id, items FROM caution_drafts WHERE NOT applied AND jsonb_array_length(COALESCE(items,'[]'::jsonb)) > 0`;
  console.log(`반영 대상 ${d.length}곳`);
  for (const r of d) await sql`UPDATE cafes SET cautions = ${JSON.stringify(r.items)}::jsonb WHERE id=${r.cafe_id}`;
  await sql`UPDATE caution_drafts SET applied = true WHERE NOT applied AND jsonb_array_length(COALESCE(items,'[]'::jsonb)) > 0`;
  const ids = d.map((r) => Number(r.cafe_id));
  const { invalidateCafeDetailOnly } = await import("../lib/cafeCacheInvalidate.ts");
  for (let i = 0; i < ids.length; i += 50) await invalidateCafeDetailOnly(ids.slice(i, i + 50)).catch(() => {});
  console.log(`✅ ${d.length}곳 반영 · 캐시 무효화`);
  process.exit(0);
}

// 🔴 blob은 100곳씩 끊어 읽는다(한 번에 당기면 Neon 67MB 한도로 통째 실패)
const picks = await sql`SELECT id FROM cafes
  WHERE published AND jsonb_array_length(COALESCE(cautions,'[]'::jsonb)) = 0 AND COALESCE(synth_count,0) >= 8
    AND NOT EXISTS (SELECT 1 FROM caution_drafts d WHERE d.cafe_id = cafes.id)
  ORDER BY synth_count DESC NULLS LAST LIMIT ${LIMIT}`;
const rows = [];
for (let i = 0; i < picks.length; i += 100) {
  const ids = picks.slice(i, i + 100).map((x) => Number(x.id));
  rows.push(...await sql`SELECT id, name, COALESCE(synth_reviews_all, synth_reviews, '[]'::jsonb) rv FROM cafes WHERE id = ANY(${ids})`);
}
console.log(`대상 ${rows.length}곳`);
if (!rows.length) process.exit(0);

const reqs = [];
const srcQuotes = new Map();   // 지어낸 근거를 걸러내려면 '무엇을 보여줬는지'를 들고 있어야 한다
for (const r of rows) {
  const qs = (Array.isArray(r.rv) ? r.rv : []).map((x) => String(x?.quote ?? "").trim()).filter((q) => q.length > 15).slice(0, 12);
  if (qs.length < 4) continue;
  // 🔴 생성이 아니라 **검증**이다 — 규칙이 후보를 내고 AI는 맞는지만 본다.
  //   생성으로 돌렸더니 9건 중 6건이 틀렸다(「애견 동반 가능」을 '반려동물 불가'로, 「브레이크타임 없어요」를
  //   '브레이크타임'으로 뒤집었다). 시설 태그 검증은 같은 데이터로 잘 맞았다 — 차이는 생성이냐 검증이냐였다.
  const blob = qs.join(" ");
  const cand = Object.keys(VOCAB).filter((lb) => CUE[lb]?.test(blob));
  if (!cand.length) { await sql`INSERT INTO caution_drafts (cafe_id, items, model) VALUES (${r.id}, '[]'::jsonb, 'rule')
    ON CONFLICT (cafe_id) DO NOTHING`; continue; }
  srcQuotes.set(Number(r.id), qs);
  reqs.push({ custom_id: `u${r.id}`, params: { model: MODEL, max_tokens: 400, messages: [{ role: "user", content:
`카페 "${r.name}"의 공개 후기 발췌다. 아래 **후보 주의점이 사실인지** 하나씩 판정하라.

후보: ${cand.join(" / ")}

발췌:
${qs.map((q, i) => `${i + 1}. ${q}`).join("\n")}

규칙(어기면 틀린 경고가 소비자에게 나간다):
- 후보 라벨 외에 **새로 만들지 마라**.
- "애견 동반 **가능**", "브레이크타임 **없어요**", "**내부** 화장실" 처럼 **반대 뜻이면 거짓**이다.
- 발췌가 그 주의점을 말하지 않으면 **모름**이다. 추측·유추 금지.
- quote는 발췌에 **있는 그대로** 베껴라(지어내면 버려진다). 그 주의점을 직접 말하는 구절만.
- 전화번호·해시태그·영업시간 안내문은 근거로 쓰지 마라.
JSON만: {"판정":[{"label":"...","값":"참"|"거짓"|"모름","quote":"..."}]}` }] } });
}
console.log(`LLM 생성 ${reqs.length}건 제출`);
if (!reqs.length) process.exit(0);
const b0 = await createBatch(KEY, reqs, { allowDuplicate: true });
let b = b0;
while (b.processing_status !== "ended") { await new Promise((s) => setTimeout(s, 20000)); b = await getBatch(KEY, b0.id); process.stdout.write("."); }
console.log("\n수거");
const price = batchPriceFor(MODEL);
let tin = 0, tout = 0, made = 0, empty = 0;
for await (const res of streamResults(KEY, b.results_url)) {
  const id = Number(String(res.custom_id).slice(1));
  const msg = res?.result?.message; if (!msg) continue;
  tin += msg.usage?.input_tokens ?? 0; tout += msg.usage?.output_tokens ?? 0;
  const m = (msg.content ?? []).map((c) => c.text ?? "").join("").match(/\{[\s\S]*\}/);
  let j; try { j = JSON.parse(m?.[0] ?? "{}"); } catch { continue; }
  const seen = new Set();
  const src = (srcQuotes.get(id) ?? []).join(" ").replace(/\s+/g, "");
  const items = (j?.판정 ?? [])
    .filter((x) => x?.값 === "참" && VOCAB[x?.label] && !seen.has(x.label) && seen.add(x.label))
    .map((x) => ({ label: x.label, emoji: VOCAB[x.label], count: 1, quote: String(x.quote ?? "").slice(0, 60) }))
    // 🔒 지어낸 근거 차단 — quote가 **발췌에 실제로 있는 문자열**이 아니면 버린다(공백 무시 대조).
    .filter((x) => x.quote.length >= 6 && src.includes(x.quote.replace(/\s+/g, "").slice(0, 20)))
    // 🔒 반대 뜻 차단 — AI가 "애견 동반 가능"을 '반려동물 불가'로 뒤집던 실제 사고.
    .filter((x) => !(NEGATE[x.label]?.test(x.quote)))
    // 🔒 블로그 **제목** 차단 — "○○ 평일 웨이팅 주차 솔직후기"처럼 주제어만 나열한 머리글은
    //   "웨이팅이 있다"는 진술이 아니다. 기존 주의점의 근거가 이런 쓰레기였던 것도 같은 이유다.
    .filter((x) => !/(솔직후기|내돈내산|내돈 내산|후기$|맛집$|빵지순례|추천$)/.test(x.quote.trim())
                && !/\|/.test(x.quote))
    // 🔒 라벨-근거 축 불일치 차단 — "주차 … 협소한 편"을 '공간 협소'로 붙이던 실제 오분류.
    .filter((x) => !(x.label === "공간 협소" && /주차/.test(x.quote)))
    .slice(0, 3);
  if (items.length) made++; else empty++;
  await sql`INSERT INTO caution_drafts (cafe_id, items, model) VALUES (${id}, ${JSON.stringify(items)}::jsonb, ${MODEL})
    ON CONFLICT (cafe_id) DO UPDATE SET items=EXCLUDED.items, at=now()`;
}
console.log(`주의점 생성 ${made}곳 · 없음 ${empty}  |  토큰 ${tin}/${tout}  비용 $${(tin * price.in + tout * price.out).toFixed(4)}`);
