// 복합시설(몰·백화점·휴게소·병원·터미널·공항·캠퍼스·타워·역사·푸드코트·호텔 등) 이름 카페만 재합성. API 0, 토큰 0. 멱등.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
delete process.env.ANTHROPIC_API_KEY;
const { synthAndStore } = await import("../lib/synthStore.ts");
const { sql } = await import("../lib/db.ts");

const KEYS = ["스타필드","롯데몰","롯데백화점","롯데마트","롯데프리미엄","롯데아울렛","현대백화점","현대시티","현대프리미엄","더현대","신세계","이마트","트레이더스","홈플러스","코스트코","타임스퀘어","아이파크몰","스퀘어원","엔터식스","갤러리아","아울렛","이케아","가든파이브","디큐브","에이케이","akplaza","세이브존","뉴코아","모다아울렛",
  "푸드코트","푸드애비뉴","푸드홀","잇토피아","식품관","스위트파크",
  "휴게소","고속터미널","종합터미널","터미널","도심공항","공항","역사","환승센터",
  "병원","대학교","캠퍼스","롯데시네마","CGV","메가박스","아쿠아리움","컨벤션",
  "호텔","타워","광장시장","통인시장",
  "위례","미사","다산","별내","광교","동탄","운정","송도","청라","영종","마곡","지축","삼송","향동","고덕","감일","갈매"];
const hit = (n)=>{const x=(n||"").toLowerCase().replace(/\s/g,"");return KEYS.some(k=>x.includes(k.toLowerCase()));};

const all = await sql`SELECT id,name,area,published,synth_count FROM cafes WHERE raw_reviews IS NOT NULL`;
const hits = all.filter(c => hit(c.name));
console.log(`대상: ${hits.length}곳`);
let changed=0, unpub=0;
for (const c of hits) {
  const before=c.synth_count??0, wasPub=c.published;
  try {
    await synthAndStore({id:c.id,name:c.name,area:c.area},{refresh:false});
    const [a]=await sql`SELECT synth_count,published FROM cafes WHERE id=${c.id}`;
    const after=a?.synth_count??0;
    if(after!==before||a?.published!==wasPub){changed++;if(wasPub&&!a?.published){unpub++;console.log(`  [비공개전환] ${c.name}: ${before}→${after}`);}}
  } catch(e){ console.log(`  ✗ ${c.name}: ${String(e).slice(0,50)}`); }
}
console.log(`\n완료: ${hits.length}곳 재합성, 변동 ${changed}곳, 비공개 전환 ${unpub}곳`);
process.exit(0);
