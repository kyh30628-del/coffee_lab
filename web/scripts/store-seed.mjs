// 🏪 상가(상권)정보 API 시드 — 부산·경남 카페 후보 전수 수집 → 스테이징(seed_candidates)
//   (CEO 지시 09-07 "상가 API 시드부터, 비용 염두") — cafes에 직접 안 넣는다:
//   ①정답 대조 10건 통과 후 ②일 상한 통제 투입(수집비 폭주 방지). API 무료·매칭 로컬 0원.
import { readFileSync } from "node:fs";
for (const l of readFileSync("./.env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const KEY = readFileSync("/Users/wangwida/budongsan-note/.env.local", "utf8").match(/^DATA_GO_KR_API_KEY=(.*)$/m)[1].replace(/["']/g, "");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

const SGG = { // 표준 시군구코드 — 응답의 시군구명 에코로 검증
  "26110":"부산 중구","26140":"부산 서구","26170":"부산 동구","26200":"부산 영도구","26230":"부산 부산진구","26260":"부산 동래구","26290":"부산 남구","26320":"부산 북구","26350":"부산 해운대구","26380":"부산 사하구","26410":"부산 금정구","26440":"부산 강서구","26470":"부산 연제구","26500":"부산 수영구","26530":"부산 사상구","26710":"부산 기장군",
  "48121":"창원시","48123":"창원시","48125":"창원시","48127":"창원시","48129":"창원시","48170":"진주시","48220":"통영시","48240":"사천시","48250":"김해시","48270":"밀양시","48310":"거제시","48330":"양산시","48720":"의령군","48730":"함안군","48740":"창녕군","48820":"경남 고성군","48840":"남해군","48850":"하동군","48860":"산청군","48870":"함양군","48880":"거창군","48890":"합천군",
};
const norm = (s) => String(s||"").toLowerCase().replace(/[\s\-·.&()']/g, "");

await sql`CREATE TABLE IF NOT EXISTS seed_candidates (
  id SERIAL PRIMARY KEY, biz_no TEXT UNIQUE, name TEXT, branch TEXT, area TEXT,
  address TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, scls TEXT,
  matched_cafe_id INT, status TEXT DEFAULT 'candidate', created_at TIMESTAMPTZ DEFAULT now())`;

// 우리 등록분(부산·경남) 로드 — 작은 컬럼만
const ours = await sql`SELECT id, name, lat, lng FROM cafes WHERE address LIKE '부산%' OR address LIKE '경상남도%'`;
const oursNorm = ours.map(c => ({ id: c.id, n: norm(c.name), lat: Number(c.lat), lng: Number(c.lng) }));
const distM = (a1,o1,a2,o2) => { const R=6371000,t=x=>x*Math.PI/180; const dLa=t(a2-a1),dLo=t(o2-o1); const h=Math.sin(dLa/2)**2+Math.cos(t(a1))*Math.cos(t(a2))*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };

let calls = 0, total = 0, missing = 0, matched = 0, codeErr = 0;
const pending = [];
for (const [code, label] of Object.entries(SGG)) {
  for (let page = 1; page <= 30; page++) {
    const u = `https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong?serviceKey=${KEY}&divId=signguCd&key=${code}&indsMclsCd=I212&numOfRows=1000&pageNo=${page}&type=json`;
    let j; try { j = await (await fetch(u)).json(); } catch { break; }
    calls++;
    const items = j?.body?.items ?? [];
    if (!items.length) break;
    // 코드 자가검증: 응답 시군구명이 기대 라벨과 정합하는지(광역시명 제거 비교)
    const echo = items[0]?.signguNm ?? "";
    if (echo && !label.includes(echo.replace(/시$/,"")) && !echo.includes(label.replace(/^부산 |^경남 /,"").replace(/시$|군$|구$/,""))) codeErr++;
    for (const it of items) {
      total++;
      const nn = norm(it.bizesNm);
      if (nn.length < 2) continue;
      const la = Number(it.lat), lo = Number(it.lon);
      const hit = oursNorm.find(o => (o.n === nn) || (Number.isFinite(o.lat) && distM(o.lat,o.lng,la,lo) < 100 && (o.n.includes(nn.slice(0,4)) || nn.includes(o.n.slice(0,4)))));
      if (hit) { matched++; continue; }
      missing++;
      // 💰 Neon 왕복 금지 — 메모리에 모아 마지막에 묶음 INSERT(jsonb 언네스트)
      pending.push({ b: String(it.bizesId), n: it.bizesNm, br: it.brchNm||"", a: label, ad: it.rdnmAdr||it.lnoAdr||"", la, lo, s: it.indsSclsNm||"" });
    }
    if (items.length < 1000) break;
  }
  console.log(`${label}(${code}) 누적: 후보 ${total} · 기등록 매칭 ${matched} · 신규후보 ${missing}`);
}
// 💰 묶음 적재: 500건 × jsonb 배열 → INSERT SELECT (왕복 ~수십 회로 끝)
for (let i = 0; i < pending.length; i += 500) {
  const chunk = pending.slice(i, i + 500);
  await sql`INSERT INTO seed_candidates (biz_no, name, branch, area, address, lat, lng, scls)
    SELECT x->>'b', x->>'n', x->>'br', x->>'a', x->>'ad', (x->>'la')::float, (x->>'lo')::float, x->>'s'
    FROM jsonb_array_elements(${JSON.stringify(chunk)}::jsonb) x
    ON CONFLICT (biz_no) DO NOTHING`;
}
console.log(`── 완료: API ${calls}콜 · 상가DB 카페 ${total} · 우리와 매칭 ${matched} · 신규 후보 ${missing}(적재 ${pending.length}) · 코드검증오류 ${codeErr}`);
