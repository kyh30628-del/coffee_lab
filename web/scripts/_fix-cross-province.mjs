import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);
const real = JSON.parse(readFileSync("/tmp/cross-province.json","utf8"));
let fixed=0, skip=0;
for(const r of real){
  if(!r.fix){ console.log(`  SKIP id${r.id} (fix 미산출) ${r.area} | ${r.addr}`); skip++; continue; }
  await sql`UPDATE cafes SET area=${r.fix}, updated_at=now() WHERE id=${r.id}`;
  console.log(`  ✓ id${r.id} ${r.area} → ${r.fix} (${r.pub?'공개':'비공개'}) | ${r.name}`);
  fixed++;
}
console.log(`\n수정 ${fixed}곳, 스킵 ${skip}곳`);
// 검증: 남은 교차오염
const SEOUL_GU=new Set("강남구 강동구 강북구 강서구 관악구 광진구 구로구 금천구 노원구 도봉구 동대문구 동작구 마포구 서대문구 서초구 성동구 성북구 송파구 양천구 영등포구 용산구 은평구 종로구 중구 중랑구".split(" "));
const ap=a=>!a?null:a.startsWith("서울")?"서울":a.startsWith("인천")?"인천":a.startsWith("경기")?"경기":null;
const arp=x=>!x?null:x.startsWith("인천")?"인천":SEOUL_GU.has(x.trim())?"서울":/(시|군)$/.test(x.trim())?"경기":null;
const rows=await sql`SELECT area,address FROM cafes WHERE address IS NOT NULL AND address<>''`;
let left=rows.filter(c=>{const a=ap(c.address),b=arp(c.area);return a&&b&&a!==b;}).length;
console.log(`남은 도 교차오염: ${left}곳`);
