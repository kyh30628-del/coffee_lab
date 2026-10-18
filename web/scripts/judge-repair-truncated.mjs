// 🩹 잘린 응답이 만든 오판정 복구 — "AI가 보지도 않고 버린" 후보를 미결로 되돌린다. (2026-10-19)
//
// 왜 필요한가(실측·배치 응답 원본 검시):
//   배치 경로의 max_tokens가 1500 고정이라 35항목 요청이 가끔 잘렸다(stop_reason=max_tokens).
//   JSON이 깨지면 parseVerdicts가 null인데, 옛 라우트는 **모든 키에 false**를 박았다 →
//   그 카페 후보 전원이 "AI 판정: 무관/저품질 제외"로 judge_decisions에 영구 저장됐다(재합성에도 유지).
//   코드는 고쳤지만(decisionsFromVerdicts) **이미 박힌 값은 코드 수정으로 사라지지 않는다.**
//
// 무엇을 하는가:
//   ① 결과를 아직 받을 수 있는 배치(29일 보관)를 다시 읽는다 — **무과금**(결과 조회는 과금 없음).
//   ② 파싱 실패 또는 잘림 응답의 매니페스트 키를 모은다.
//   ③ 그 키 중 **지금 값이 false인 것만** judge_decisions에서 제거한다.
//      (나중 배치가 true로 제대로 판정한 키는 건드리지 않는다 — 근거 있는 결정은 보존)
//   ④ llm_judged_at을 비워 판정 큐로 되돌린다. 재합성은 cron-resynth/판정 수거가 한다.
//
// 사용: node --import tsx scripts/judge-repair-truncated.mjs [--apply]   (기본 = 드라이런)
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { getBatch, streamResults } = await import("../lib/anthropicBatch.ts");
const { parseVerdicts } = await import("../lib/reviewJudge.ts");
const sql = neon(process.env.DATABASE_URL);
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("🔴 ANTHROPIC_API_KEY 미설정"); process.exit(1); }
const APPLY = process.argv.includes("--apply");
const n = (v) => Number(v ?? 0).toLocaleString();

const batches = await sql`SELECT batch_id, manifest FROM judge_batches ORDER BY created_at DESC`;
console.log(`🩹 잘린 응답 복구 ${APPLY ? "(실행)" : "(드라이런 — 쓰지 않는다)"} · 배치 ${n(batches.length)}건 조회`);
const bad = new Map(); // cafeId -> Set(keys)
let readable = 0, gone = 0, scanned = 0, truncResp = 0;
for (const row of batches) {
  let b;
  try { b = await getBatch(KEY, row.batch_id); } catch { gone++; continue; }
  if (b.processing_status !== "ended" || !b.results_url) { gone++; continue; }
  const cafes = row.manifest?.cafes ?? {};
  // ⚠️ processing_status=ended·results_url 있어도 보관기간(29일) 지나면 결과 다운로드가 404다.
  //   그대로 던지면 스크립트가 죽어 뒤 배치를 못 본다 — 못 읽는 배치는 세고 넘어간다.
  let it;
  try { it = streamResults(KEY, b.results_url); const first = await it[Symbol.asyncIterator]().next(); 
    if (first.done) { readable++; continue; }
    var pending = [first.value]; }
  catch { gone++; continue; }
  readable++;
  for await (const res of (async function* () { for (const x of pending) yield x; yield* it; })()) {
    if (res.result?.type !== "succeeded") continue;
    scanned++;
    const msg = res.result.message;
    const text = msg?.content?.find((x) => x.type === "text")?.text || "";
    const mp = parseVerdicts(text);
    const e = cafes[res.custom_id];
    if (!e) continue;
    const keys = e.keys ?? [];
    if (!mp) {                           // 파싱 실패 → 전원이 false로 박혔다
      truncResp++;
      if (!bad.has(e.id)) bad.set(e.id, new Set());
      for (const k of keys) bad.get(e.id).add(k);
      continue;
    }
    const miss = keys.filter((_, i) => !mp.get(i));   // 답을 못 받은 번호도 false로 박혔다
    if (miss.length) {
      truncResp++;
      if (!bad.has(e.id)) bad.set(e.id, new Set());
      for (const k of miss) bad.get(e.id).add(k);
    }
  }
}
console.log(`   읽은 배치 ${n(readable)}건 · 회수불가(29일 경과) ${n(gone)}건 · 응답 ${n(scanned)}건`);
console.log(`   🔴 오판정 유발 응답 ${n(truncResp)}건 · 대상 카페 ${n(bad.size)}곳`);
if (!bad.size) { console.log("   ✅ 되돌릴 것이 없다."); process.exit(0); }

let removed = 0, cafesFixed = 0, keptTrue = 0;
for (const [id, keys] of bad) {
  const row = (await sql`SELECT judge_decisions d FROM cafes WHERE id=${id}`)[0];
  const d = row?.d;
  if (!d || typeof d !== "object" || Array.isArray(d)) continue;
  const next = { ...d };
  let hit = 0;
  for (const k of keys) {
    if (!(k in next)) continue;
    if (next[k] === true) { keptTrue++; continue; }   // 근거 있는 채택은 보존
    delete next[k]; hit++;
  }
  if (!hit) continue;
  cafesFixed++; removed += hit;
  if (APPLY) {
    await sql`UPDATE cafes SET judge_decisions=${JSON.stringify(next)}::jsonb, llm_judged_at=NULL WHERE id=${id}`;
  }
}
console.log(`   ${APPLY ? "되돌림" : "되돌릴 예정"}: 카페 ${n(cafesFixed)}곳 · 오판정 결정 ${n(removed)}건 제거 · 보존한 채택 ${n(keptTrue)}건`);
console.log(`   ${APPLY ? "→ llm_judged_at 비움 — 다음 판정 사이클에서 제대로 다시 본다." : "→ 실제로 적용하려면 --apply"}`);
