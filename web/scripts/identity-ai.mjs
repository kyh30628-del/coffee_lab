#!/usr/bin/env node
// 🪪 정체성 문장 AI 작성 (2026-10-19, CEO "크레딧으로 의미있는 일")
//
// 왜: synth_identity는 지도·검색·SEO 페이지에 전부 나오는 **우리 얼굴**이다.
//   그런데 2,134곳이 `"{동}의 카페"`라는 **기본 문구**만 달고 있다(synthEngine.ts:273의 폴백).
//   후기가 11~15건씩 있는데도 규칙이 용도 범주를 못 집어서 그렇다 — 재합성으로는 안 고쳐진다
//   (실측: 200곳 돌려 1곳만 채워졌다). 문장을 읽어 요약하는 일이라 LLM의 자리다.
//
// 🔒 판정과 집행 분리 — 여기선 identity_drafts에 **초안만** 쌓는다. 반영은 --apply.
// 💰 Batch API 반값. 노출 후기 10건만 보낸다. 카페당 ≈$0.0005.
// ⚠️ 집 스타일 고정: 짧은 구절 2~4개를 " · "로 잇는다. **후기에 없는 말은 쓰지 않는다**(추측 금지).
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { createBatch, getBatch, streamResults, batchPriceFor } = await import("../lib/anthropicBatch.ts");
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.IDENT_MODEL || "claude-haiku-4-5";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const LIMIT = Number(arg("limit", 1000));
const APPLY = process.argv.includes("--apply");

await sql`CREATE TABLE IF NOT EXISTS identity_drafts (
  cafe_id INT PRIMARY KEY, draft TEXT, prev TEXT, model TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now(), applied BOOLEAN NOT NULL DEFAULT false)`;

if (APPLY) {
  const d = await sql`SELECT cafe_id, draft FROM identity_drafts WHERE NOT applied AND draft IS NOT NULL AND length(draft) >= 10`;
  console.log(`반영 대상 ${d.length}곳`);
  for (const r of d) await sql`UPDATE cafes SET synth_identity = ${r.draft} WHERE id = ${r.cafe_id}`;
  await sql`UPDATE identity_drafts SET applied = true WHERE NOT applied AND draft IS NOT NULL AND length(draft) >= 10`;
  const ids = d.map((r) => Number(r.cafe_id));
  const { invalidateCafeDetailOnly } = await import("../lib/cafeCacheInvalidate.ts");
  for (let i = 0; i < ids.length; i += 50) await invalidateCafeDetailOnly(ids.slice(i, i + 50)).catch(() => {});
  console.log(`✅ ${d.length}곳 반영 · 캐시 무효화`);
  process.exit(0);
}

// 🔴 blob은 100곳씩 끊어 읽는다(한 번에 당기면 Neon 67MB 한도로 통째 실패)
const picks = await sql`SELECT id FROM cafes
  WHERE published AND (synth_identity IS NULL OR length(synth_identity) < 10 OR synth_identity ~ '^[^·]+의 카페$')
    AND NOT EXISTS (SELECT 1 FROM identity_drafts d WHERE d.cafe_id = cafes.id)
  ORDER BY synth_count DESC NULLS LAST LIMIT ${LIMIT}`;
const rows = [];
for (let i = 0; i < picks.length; i += 100) {
  const ids = picks.slice(i, i + 100).map((x) => Number(x.id));
  rows.push(...await sql`SELECT id, name, dong, synth_identity ident,
    COALESCE(synth_reviews_all, synth_reviews, '[]'::jsonb) rv FROM cafes WHERE id = ANY(${ids})`);
}
console.log(`대상 ${rows.length}곳`);
if (!rows.length) process.exit(0);

const reqs = [];
for (const r of rows) {
  const qs = (Array.isArray(r.rv) ? r.rv : []).map((x) => String(x?.quote ?? "").trim()).filter((q) => q.length > 15).slice(0, 10);
  // 근거가 너무 적으면 쓰지 않는다 — 지어내느니 비워 둔다.
  // 🔴 단, **건너뛴 것도 기록**해야 한다. 안 그러면 같은 카페가 매 회차 다시 뽑혀 루프가 영원히 돈다
  //   (실사고: 잔량 1,411곳이 5회차를 그대로 돌았다). "처리했다"의 정의에 '보류'도 들어가야 한다.
  if (qs.length < 3) { await sql`INSERT INTO identity_drafts (cafe_id, draft, prev, model)
    VALUES (${r.id}, NULL, ${r.ident ?? null}, 'skip:근거부족') ON CONFLICT (cafe_id) DO NOTHING`; continue; }
  reqs.push({ custom_id: `i${r.id}`, params: { model: MODEL, max_tokens: 200, messages: [{ role: "user", content:
`카페 "${r.name}"(${r.dong ?? ""})의 공개 후기 발췌다. 이 카페가 **어떤 곳인지** 한 줄로 정리하라.

발췌:
${qs.map((q, i) => `${i + 1}. ${q}`).join("\n")}

형식: 짧은 구절 2~4개를 " · "로 잇는다.
  예) 직접 로스팅하는 곳 · 산미가 또렷한 커피 · 단맛이 좋은 디저트
규칙:
- **발췌에 실제로 나온 것만** 쓴다. 추측·일반론 금지("분위기 좋은 카페" 같은 아무 데나 붙는 말 금지).
- 구절은 10자 안팎으로 짧게. 광고 문구처럼 쓰지 마라.
- 발췌가 특징을 말하지 않으면 draft를 빈 문자열로 둔다.
JSON만: {"draft":"..."}` }] } });
}
console.log(`LLM 작성 ${reqs.length}건 제출`);
if (!reqs.length) process.exit(0);
const b0 = await createBatch(KEY, reqs, { allowDuplicate: true });
let b = b0;
while (b.processing_status !== "ended") { await new Promise((s) => setTimeout(s, 20000)); b = await getBatch(KEY, b0.id); process.stdout.write("."); }
console.log("\n수거");
const price = batchPriceFor(MODEL);
let tin = 0, tout = 0, ok = 0, skip = 0;
const prev = new Map(rows.map((r) => [Number(r.id), r.ident]));
for await (const res of streamResults(KEY, b.results_url)) {
  const id = Number(String(res.custom_id).slice(1));
  const msg = res?.result?.message; if (!msg) continue;
  tin += msg.usage?.input_tokens ?? 0; tout += msg.usage?.output_tokens ?? 0;
  const txt = (msg.content ?? []).map((c) => c.text ?? "").join("");
  const m = txt.match(/\{[\s\S]*\}/); if (!m) { skip++; continue; }
  let j; try { j = JSON.parse(m[0]); } catch { skip++; continue; }
  const draft = String(j?.draft ?? "").trim();
  if (draft.length >= 10) ok++; else skip++;
  await sql`INSERT INTO identity_drafts (cafe_id, draft, prev, model) VALUES (${id}, ${draft || null}, ${prev.get(id) ?? null}, ${MODEL})
    ON CONFLICT (cafe_id) DO UPDATE SET draft=EXCLUDED.draft, at=now()`;
}
console.log(`초안 ${ok}건 · 건너뜀 ${skip}  |  토큰 ${tin}/${tout}  비용 $${(tin * price.in + tout * price.out).toFixed(4)}`);
