// 임베딩 백로그 1회성 벌크 — embedding 없는 카페 전량(공개+보류+pending, rejected/noise 제외)을
//  100개씩 임베딩. 유료면 완주(~5분), 무료한도면 429에서 깨끗이 멈춤(재실행 시 이어감).
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { embedBatch, toVectorLiteral, EMBED_DIM, buildCafeEmbedText } = await import("../lib/embed.ts");
const { sql } = await import("../lib/db.ts");

const SHARDS = Number(process.env.SHARDS || 1), SHARD = Number(process.env.SHARD || 0);
let total = 0, stop = "";
const t0 = Date.now();
while (!stop) {
  const rows = await sql`SELECT id, name, area, synth_identity, signature, note, vibe, uses, beans, char_scores, synth_reviews
    FROM cafes WHERE embedding IS NULL AND synth_identity IS NOT NULL
      AND coalesce(pipeline_status,'') NOT IN ('rejected','noise')
      AND (${SHARDS} = 1 OR id % ${SHARDS} = ${SHARD}) LIMIT 100`;
  if (!rows.length) { stop = "완료 — 임베딩 백로그 소진"; break; }
  let vecs;
  try { vecs = await embedBatch(rows.map(buildCafeEmbedText), "RETRIEVAL_DOCUMENT"); }
  catch (e) { stop = /429|quota|exceeded|rate/i.test(String(e)) ? "무료한도 도달(429) — 결제 필요/재실행 시 이어감" : "오류: " + String(e).slice(0, 80); break; }
  let ok = 0, quota = false;
  for (let i = 0; i < rows.length; i++) {
    const v = vecs[i];
    if (!v || v.length !== EMBED_DIM) { quota = true; continue; }
    await sql`UPDATE cafes SET embedding = ${toVectorLiteral(v)}::vector, embed_updated = now() WHERE id = ${rows[i].id}`;
    ok++;
  }
  total += ok;
  console.log(`  +${ok} (누적 ${total})`);
  if (ok === 0 && quota) { stop = "무료한도 도달 — null 벡터 반환(결제 필요)"; break; }
}
const remain = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE embedding IS NULL AND synth_identity IS NOT NULL AND coalesce(pipeline_status,'') NOT IN ('rejected','noise')`)[0].n;
console.log(stop);
console.log(`벌크 임베딩: ${total}곳 완료 · ${Math.round((Date.now() - t0) / 1000)}초 · 남음 ${remain}`);
process.exit(0);
