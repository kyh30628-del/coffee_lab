import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const { sql } = await import("../lib/db.ts");
const { embedBatch, toVectorLiteral, EMBED_DIM, hasEmbedKey, buildCafeEmbedText } = await import("../lib/embed.ts");
if (!hasEmbedKey()) { console.log("embed key 없음"); process.exit(0); }
let total = 0, rounds = 0, quota = false;
while (true) {
  const rows = await sql`SELECT id,name,synth_identity,signature,note,vibe,uses,beans,char_scores,synth_reviews FROM cafes
    WHERE (published OR pipeline_status='pending') AND synth_updated IS NOT NULL
      AND (embedding IS NULL OR embed_updated IS NULL OR embed_updated < synth_updated)
    ORDER BY (pipeline_status='pending') DESC NULLS LAST, embed_updated ASC NULLS FIRST LIMIT 100`;
  if (!rows.length) break;
  let vecs;
  try { vecs = await embedBatch(rows.map(buildCafeEmbedText), "RETRIEVAL_DOCUMENT"); }
  catch (e) { const s=String(e); if(/429|quota|RESOURCE_EXHAUSTED|rate/i.test(s)){quota=true;console.log("쿼터 한도 — 중단:",s.slice(0,80));break;} console.log("에러:",s.slice(0,80)); break; }
  let okThis=0;
  for (let i=0;i<rows.length;i++){ const v=vecs[i]; if(!v||v.length!==EMBED_DIM) continue; await sql`UPDATE cafes SET embedding=${toVectorLiteral(v)}::vector, embed_updated=now() WHERE id=${rows[i].id}`; okThis++; total++; }
  rounds++;
  if (okThis===0){ console.log("이번 배치 0건 임베드(전부 null) — 쿼터 의심, 중단"); quota=true; break; }
  if (rounds%5===0) console.log(`  …${total}곳 임베드 (round ${rounds})`);
  await new Promise(r=>setTimeout(r,500));
}
const [r]=await sql`SELECT count(*) FILTER(WHERE (published OR pipeline_status='pending') AND (embedding IS NULL OR embed_updated<synth_updated))::int need FROM cafes`;
console.log(`\n완료: ${total}곳 임베드. 남은 필요분: ${r.need}. ${quota?'(쿼터 한도 도달 — 나머지는 내일 cron 또는 재실행)':''}`);
process.exit(0);
