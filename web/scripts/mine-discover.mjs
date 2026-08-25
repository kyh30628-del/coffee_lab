// 리뷰 속 숨은 카페 발굴 — 이미 수집된 raw_reviews에서 상호를 기계적 추출 → 네이버 이름매칭 검증 → 신규 적재.
//   토큰 0(LLM 없음). 네이버 지역검색으로 실재·좌표·카테고리·동 확정. 프랜차이즈/메뉴어/중복/동명 제거.
//   적재는 pipeline_status='new'(비공개) → 기존 파이프라인이 수집·합성·게이트 후 공개.
// 사용: AREA=강동 APPLY=1 node --import tsx scripts/mine-discover.mjs   (APPLY 없으면 dry-run)
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { coreTokens } = await import("../lib/reviewQuality.ts");
const { brandTokenOverlap } = await import("../lib/reviewQuality.ts");
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const ID = process.env.NAVER_CLIENT_ID, SEC = process.env.NAVER_CLIENT_SECRET;
const AREA = process.env.AREA || "강동";
const APPLY = process.env.APPLY === "1";
const MAXCALLS = Number(process.env.MAXCALLS || 400);
const norm = s => (s||"").toLowerCase().replace(/\s/g,"");

const FR = ["스타벅스","투썸","이디야","메가","메가엠지씨","빽다방","컴포즈","커피빈","할리스","엔제리너스","엔젤리너스","파스쿠찌","탐앤탐스","폴바셋","드롭탑","요거프레소","더벤티","더밴티","매머드","메머드","공차","스무디킹","카페베네","만랩","토프레소","셀렉토","더리터","달콤","커피스미스","주커피","백억","쥬씨","더치앤빈","하삼동","와플대학","빈브라더스","파리바게뜨","파리크라상","뚜레쥬르","던킨","크리스피크림","블루샥","폴인","나무카페","공차","설빙","배스킨","던킨도너츠","띠어리","카페봄봄","감성커피","더카페","청년다방"];
const isFr = n => { const x=norm(n); return FR.some(f=>x.includes(norm(f))); };
const MENU = ["드립","핸드드립","비엔나","더치","캡슐","필터","블랙","아메리카노","에스프레소","콜드브루","라떼","호주식","스페셜티","대형","감성","디저트","원두","로스팅","핸드","아이스","따뜻한","달달한","크림","고소한","진한","연한","달콤한","무료","주변","근처","우리","오늘","요즘","신상","예쁜","분위기"];
const isMenu = n => MENU.includes(n.replace(/(커피|로스터스|로스터리|로스터즈|베이커리)$/,""));
const dongOf = a => { const m=(a||"").match(/구\s+([가-힣]{2,4}동)\b/) || (a||"").match(/\s([가-힣]{2,4}동)\s*\d/); return m?m[1]:null; };

const all = await sql`SELECT name, lat, lng FROM cafes`;
const haveN = all.map(c => norm(c.name));
const rows = await sql`SELECT raw_reviews FROM cafes WHERE area ILIKE ${'%'+AREA+'%'} AND raw_reviews IS NOT NULL`;
let text = "";
for (const r of rows) for (const rv of (r.raw_reviews||[])) text += " " + (rv.title||"") + " " + (rv.desc||"");
const cand = new Map();
const re = /([가-힣A-Za-z0-9]{2,8})(커피|로스터스|로스터리|로스터즈|베이커리)/g;
let m;
while ((m = re.exec(text))) { const full=m[1]+m[2]; cand.set(norm(full),{name:full,count:(cand.get(norm(full))?.count||0)+1}); }
let pool = [...cand.values()]
  .filter(c => c.count >= 3 && !isFr(c.name) && !isMenu(c.name) && coreTokens(c.name,[AREA]).length>0)
  .filter(c => { const n=norm(c.name); return !haveN.some(h=>h.includes(n)||n.includes(h)); })
  .sort((a,b)=>b.count-a.count);
console.log(`[${AREA}] 표본 카페 ${rows.length}곳 · 추출 후보 ${pool.length}개 · APPLY=${APPLY}`);

async function naver(q){
  for (let attempt=0; attempt<4; attempt++) {
    const r=await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=3`,{headers:{"X-Naver-Client-Id":ID,"X-Naver-Client-Secret":SEC}});
    if(r.status===200) return {items:(await r.json()).items||[]};
    if(r.status===429){ await new Promise(x=>setTimeout(x, 1000*(attempt+1))); continue; } // 레이트리밋 백오프(재시도)
    return {err:r.status};
  }
  return {err:429};
}
let calls=0, inserted=0, skip=0;
const found=[];
for (const c of pool) {
  if (calls>=MAXCALLS) break;
  const res = await naver(AREA+" "+c.name); calls++;
  if (res.err){ console.log("네이버 오류",res.err); break; }
  const tok = coreTokens(c.name,[AREA]);
  const hit = res.items.find(it => {
    const pn=norm(it.title.replace(/<[^>]+>/g,'')); const inArea=it.address?.includes(AREA);
    const isCafe=/카페|커피|디저트|베이커리|로스터/.test(it.category||"");
    return inArea && isCafe && tok.some(t=>pn.includes(norm(t))) && !isFr(it.title.replace(/<[^>]+>/g,''));
  });
  if (!hit) { skip++; await new Promise(r=>setTimeout(r,110)); continue; }
  const name = hit.title.replace(/<[^>]+>/g,'').trim();
  const lat = Number(hit.mapy)/1e7, lng = Number(hit.mapx)/1e7;
  const nN = norm(name);
  // 최종 중복: 이름 또는 좌표 근사
  // 🐛 2026-08-25 전수점검: 좌표만으로 이름검증 없이 버리던 과잉차단 교정(decisions#814와 같은 버그·밀도 의존)
  const nearDup = all.find(a=>a.lat&&Math.abs(a.lat-lat)<0.0005&&Math.abs(a.lng-lng)<0.0005);
  if (haveN.some(h=>h.includes(nN)||nN.includes(h)) || (nearDup && brandTokenOverlap(nearDup.name, name)) || found.some(f=>norm(f.name)===nN)) { skip++; await new Promise(r=>setTimeout(r,110)); continue; }
  const dong = dongOf(hit.address);
  found.push({ name, addr:hit.address, dong, lat, lng, cat:hit.category, count:c.count });
  if (APPLY) {
    const pid = `mn_${name.replace(/\s/g,"")}_${Math.round(lat*1e5)}`;
    await sql`INSERT INTO cafes (place_id, name, area, dong, naver_category, address, lat, lng, source, published, roasts_own, pipeline_status)
      VALUES (${pid}, ${name}, ${AREA+'구'}, ${dong}, ${hit.category||''}, ${hit.address}, ${lat}, ${lng}, 'discover', false, false, 'new')
      ON CONFLICT (place_id) DO NOTHING`;
    inserted++;
  }
  await new Promise(r=>setTimeout(r,110));
}
console.log(`\n검증 통과(실재 신규): ${found.length}개 · ${APPLY?`적재 ${inserted}`:'dry-run(미적재)'} · 네이버 ${calls}콜`);
found.slice(0,45).forEach(f=>console.log(`  ${String(f.count).padStart(3)}회  ${f.name} | ${f.dong||'?'} | ${f.addr}`));
console.log(APPLY?`\n→ 적재 완료(비공개·pipeline_status=new). cron-grow가 수집·합성·게이트 후 공개.`:`\n→ dry-run. APPLY=1로 적재.`);
process.exit(0);
