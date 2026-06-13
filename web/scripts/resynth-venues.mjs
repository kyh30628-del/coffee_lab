// 몰/백화점/신도시 토큰이 이름에 든 카페만 재합성(오염 수정). API 0, 토큰 0.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
delete process.env.ANTHROPIC_API_KEY;
const { synthAndStore } = await import("../lib/synthStore.ts");
const { sql } = await import("../lib/db.ts");

const VENUE = ["스타필드","롯데몰","롯데백화점","롯데마트","현대백화점","더현대","신세계","이마트","홈플러스","코스트코","타임스퀘어","아이파크몰","스퀘어원","엔터식스","갤러리아","아울렛","메가박스","이케아","가든파이브","디큐브","세이브존","뉴코아"];
const DIST = ["위례","미사","다산","별내","광교","동탄","운정","송도","청라","마곡"];
const KEYS = [...VENUE, ...DIST];

const all = await sql`SELECT id,name,area,published,synth_count FROM cafes WHERE raw_reviews IS NOT NULL`;
const hits = all.filter(c => KEYS.some(k => (c.name||"").includes(k)));
console.log(`대상: ${hits.length}곳 (이름에 몰/신도시 토큰)`);
let changed=0, unpub=0;
for (const c of hits) {
  const before = c.synth_count ?? 0, wasPub = c.published;
  try {
    await synthAndStore({id:c.id,name:c.name,area:c.area}, {refresh:false});
    const [a] = await sql`SELECT synth_count, published FROM cafes WHERE id=${c.id}`;
    const after = a?.synth_count ?? 0;
    if (after !== before || a?.published !== wasPub) {
      changed++;
      if (wasPub && !a?.published) unpub++;
      console.log(`  ${c.name}: ${before}→${after} ${wasPub&&!a?.published?'[비공개전환]':a?.published?'':'[비공개]'}`);
    }
  } catch(e){ console.log(`  ✗ ${c.name}: ${String(e).slice(0,60)}`); }
}
console.log(`\n완료: ${hits.length}곳 재합성, 변동 ${changed}곳, 비공개 전환 ${unpub}곳`);
process.exit(0);
