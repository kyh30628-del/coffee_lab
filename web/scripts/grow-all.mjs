import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const { discoverRegion, METRO_REGIONS } = await import("../lib/discover.ts");
let totalNew=0;
for (const r of METRO_REGIONS) {
  try { const res = await discoverRegion(r.region, r.areaLabel); totalNew+=res.inserted; console.log(`${r.areaLabel}: 발견 ${res.found} · 신규 ${res.inserted}`); }
  catch(e){ console.log(`${r.areaLabel}: 오류 ${String(e).slice(0,40)}`); }
}
console.log(`\n=== 전 지역 발굴 완료: 신규 ${totalNew}곳 추가(미공개 → 후기 수집되면 공개) ===`);
