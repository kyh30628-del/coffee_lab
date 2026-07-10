// 협업#170 후속(결재#289): coord#163/#165가 offctx_ok 플래그만 재설정해 표시 리뷰 원문(옆업종·타업소 혼입)이
// 그대로 라이브 노출되던 문제를 실제로 해결한다. 품질레드팀이 원문 재확인으로 특정한 5곳의 오염 근거를
// auditItems(규칙상 on-topic 전체, verified/reference 오분류 포함)에서 골라 applyDecisions로 drop(judge_decisions
// 영구 저장) → 재합성·재저장. 결정론·LLM 불요·가역(judge_decisions를 되돌리면 복원 가능).
// ⚠️ 실행 후 반드시 invalidateCafeCaches로 캐시 무효화(공개상태 변경 시 필수, CLAUDE.md §2-5).
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { collectAndSynthesize } = await import("../lib/collectOrchestrator.ts");
const { applyDecisions } = await import("../lib/synthStore.ts");
const { invalidateCafeCaches } = await import("../lib/cafeCacheInvalidate.ts");
const { sql } = await import("../lib/db.ts");

// 카페별 오염 판정(품질레드팀 원문 재확인 근거, coord#170) — auditItems 중 매칭되면 drop.
const TARGETS = [
  { id: 8422, bad: /써니네\s*집|커낼웨이|시금치파스타/ },      // 써니21 — 청라 "써니네집" 식당 리뷰 혼입
  { id: 11358, bad: /오늘제빵소|포인트빌|POINTVILL/i },        // 나무그늘아래 — 제빵소/포인트빌 리뷰 혼입
  { id: 12307, bad: /르씨엘가구|리퍼가구|마석가구|르씨엘퍼니처/ }, // 르씨엘 — 가구단지 "르씨엘가구" 혼입(라벨 겹침)
  { id: 15622, bad: /요양원|누수/ },                           // 24 OUR — 요양원/누수업체 서비스 후기 혼입
  { id: 16913, bad: /수유리조트/ },                            // 숲이 있는 — 별개 카페 "수유리조트" 리뷰 혼입
];

let cleaned = 0, totDrop = 0;
const publishChanged = [];
for (const t of TARGETS) {
  const c = (await sql`SELECT id, name, area, dong, raw_reviews, published FROM cafes WHERE id=${t.id}`)[0];
  if (!c?.raw_reviews?.length) { console.log(`✗ #${t.id} raw 없음`); continue; }
  const loc = [c.area, c.dong].filter(Boolean).join(" ");
  const raw = c.raw_reviews;
  const g = raw.filter((r) => r.source === "google").map((r) => ({ text: r.text, time: r.time }));
  const mk = (s) => raw.filter((r) => r.source === s).map((r) => ({ text: r.text, title: r.title, desc: r.desc, time: r.time, link: r.link, date: r.date, source: r.srcName }));
  const sources = [];
  if (g.length) sources.push({ source: "google", texts: g });
  const b = mk("blog"); if (b.length) sources.push({ source: "blog", texts: b });
  const y = mk("youtube"); if (y.length) sources.push({ source: "youtube", texts: y });
  const r = collectAndSynthesize(c.name, loc ? [loc] : [], sources, {});
  const dec = {}; let drop = 0;
  for (const it of r.auditItems || []) {
    const body = (it.title || "") + " " + (it.body || "");
    if (t.bad.test(body)) { dec[it.key] = false; drop++; }
  }
  totDrop += drop;
  const res = await applyDecisions({ id: c.id, name: c.name, area: loc }, dec);
  console.log(`✓ #${t.id} ${c.name}: 오염 ${drop}건 drop → grade=${res?.grade} count=${res?.collected} published=${res?.published}`);
  if (res && res.published !== c.published) publishChanged.push(c.id);
  cleaned++;
}
// 공개상태 바뀐 카페만 전 캐시 레이어 무효화(그 외는 search_cache만) — CLAUDE.md §2-5 단일 경유.
if (publishChanged.length) await invalidateCafeCaches(publishChanged).catch(() => {});
else await sql`DELETE FROM search_cache`.catch(() => {});
console.log(`\n완료 — ${cleaned}/${TARGETS.length}곳 정리, 총 drop ${totDrop}건, 공개상태 변경 ${publishChanged.length}곳(${publishChanged.join(",")})`);
process.exit(0);
