// 카카오 로컬 검색으로 전수 자가 검증 — 좌표+이름 매칭 → 카테고리(카페 여부)·동 확정.
//  카페면 공개 복귀, 비카페/프랜차이즈면 차단. 카카오 category_group_code 'CE7'=카페가 가장 정확한 신호.
// 우선순위: 검증대기 보류(needs_category) → 카테고리 없음 → 동 없음. 키 오류/한도 시 중단(재실행 시 이어감).
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { isFranchise, isNonCafe, parseDong } = await import("../lib/discover.ts");
const { sql } = await import("../lib/db.ts");
const KEY = process.env.KAKAO_REST_KEY;
if (!KEY) { console.log("KAKAO_REST_KEY 없음 — .env.local에 추가 필요"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function kakao(name, lat, lng) {
  const u = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(name)}&x=${lng}&y=${lat}&radius=300&size=5&sort=distance`;
  const r = await fetch(u, { headers: { Authorization: "KakaoAK " + KEY } });
  if (r.status === 401 || r.status === 403) return { auth: false };
  if (r.status === 429) return { quota: true };
  if (!r.ok) return { docs: [] };
  const d = await r.json();
  return { docs: d.documents || [] };
}

const MAX = Number(process.env.KAKAO_MAX || 30000);
let done = 0, cafe = 0, block = 0, republish = 0, miss = 0, cursor = 0, stop = "";
try {
  while (done < MAX && !stop) {
    const rows = await sql`SELECT id, name, area, lat, lng, synth_grade, needs_category FROM cafes
      WHERE (needs_category = true OR naver_category IS NULL OR naver_category='' OR dong IS NULL)
        AND lat IS NOT NULL AND id > ${cursor}
      ORDER BY (needs_category = true) DESC, id LIMIT 30`;
    if (!rows.length) { stop = "전수 검증 완료"; break; }
    for (const c of rows) {
      cursor = c.id; done++;
      try {
        const res = await kakao(c.name, c.lat, c.lng);
        if (res.auth === false) { stop = "카카오 키 인증 실패(401/403) — 키 확인 필요"; break; }
        if (res.quota) { stop = "카카오 한도 도달 — 중단(재실행 시 이어감)"; break; }
        const m = res.docs[0]; // 거리순 첫 결과(가장 가까운 동일 장소)
        const cat = m ? (m.category_name || "") : "";
        const group = m ? (m.category_group_code || "") : "";
        const dong = m ? parseDong(m.address_name || m.road_address_name || "") : null;
        if (dong) await sql`UPDATE cafes SET dong = ${dong} WHERE id = ${c.id}`;
        await sql`UPDATE cafes SET naver_category = ${cat || ""} WHERE id = ${c.id}`;
        // 카페 판정: 카카오 그룹코드 CE7(카페) 또는 카테고리 리프가 카페·디저트류. + 프랜차이즈 아님.
        const isCafe = !!cat && group === "CE7" ? true : (!!cat && !isNonCafe(c.name, cat));
        const bad = isFranchise(c.name) || !cat || !isCafe;
        if (bad) {
          const u = await sql`UPDATE cafes SET published = false, needs_category = false, pipeline_status = CASE WHEN ${!cat} THEN pipeline_status ELSE 'rejected' END WHERE id = ${c.id} AND published = true RETURNING 1`;
          if (u.length) { block++; console.log(`  ⛔ ${c.name} [${cat || '미확인'}]`); }
        } else {
          cafe++;
          if (c.needs_category) {
            const u = await sql`UPDATE cafes SET needs_category = false, published = (synth_grade IN ('검증','참고') AND lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9), pipeline_status = CASE WHEN synth_grade IN ('검증','참고') THEN 'live' ELSE pipeline_status END WHERE id = ${c.id} RETURNING published`;
            if (u[0]?.published) republish++;
          }
        }
        if (done % 100 === 0) console.log(`  …검증 ${done} (카페 ${cafe}·복귀 ${republish}·차단 ${block})`);
      } catch (e) { miss++; }
      await sleep(60);
    }
  }
} catch (e) { stop = "예외: " + String(e).slice(0, 60); }

let pub = "?", held = "?", nocat = "?";
try { const r = await sql`SELECT count(*) FILTER(WHERE published)::int pub, count(*) FILTER(WHERE needs_category AND NOT published)::int held, count(*) FILTER(WHERE (naver_category IS NULL OR naver_category='') AND lat IS NOT NULL)::int nocat FROM cafes`; pub = r[0].pub; held = r[0].held; nocat = r[0].nocat; } catch {}
console.log(stop || "상한 도달");
console.log(`카카오 자가검증: 검사 ${done} · 카페 ${cafe}(복귀 ${republish}) · 비카페차단 ${block} · 매칭실패 ${miss}`);
console.log(`→ 공개(검증완료) ${pub} · 보류 ${held} · 카테고리 미보유 ${nocat}`);
process.exit(0);
