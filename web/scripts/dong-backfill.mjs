// 동(洞) 백필 — dong 없는 카페를 '이름+구'로 네이버 검색 → 좌표 일치 결과의 지번에서 동/읍/면 파싱 → 저장.
// 카페당 1쿼리(효율적). 좌표 근사 일치로 오매칭 방지. 한도(429) 도달 시 깨끗이 중단 → 다음날 자동 재개.
// 커서(id>last)로 전진 처리 → 한 회차에 같은 카페 반복 안 함.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { parseDong } = await import("../lib/discover.ts");
const { sql } = await import("../lib/db.ts");
const { isFranchise, isNonCafe } = await import("../lib/discover.ts");
const ID = process.env.NAVER_CLIENT_ID, SECRET = process.env.NAVER_CLIENT_SECRET;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => (s || "").replace(/<[^>]+>/g, "").trim();

async function search(q) {
  const u = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=5`;
  const r = await fetch(u, { headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SECRET } });
  if (r.status === 429) return { quota: true, items: [] };
  if (!r.ok) return { items: [] };
  const d = await r.json();
  return { items: (d.items ?? []).map((it) => ({ name: strip(it.title), jibun: it.address || "", category: strip(it.category || ""), lat: it.mapy ? Number(it.mapy) / 1e7 : null, lng: it.mapx ? Number(it.mapx) / 1e7 : null })) };
}

await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS naver_category TEXT`.catch(() => {});
let done = 0, miss = 0, refiltered = 0, cursor = 0, stop = "";
const MAX = Number(process.env.DONG_MAX || 20000);
try {
  let republished = 0;
  while (done + miss < MAX && !stop) {
    // 카테고리 없는 카페 우선(검증 대기 보류분 → 카페면 공개 복귀, 비카페면 차단). 그다음 동만 없는 것.
    const rows = await sql`SELECT id, name, area, lat, lng, synth_grade, needs_category FROM cafes WHERE (naver_category IS NULL OR naver_category='' OR dong IS NULL) AND lat IS NOT NULL AND id > ${cursor} ORDER BY (naver_category IS NULL OR naver_category='') DESC, id LIMIT 25`;
    if (!rows.length) { stop = "동·카테고리 미보유 카페 소진 — 완료"; break; }
    for (const c of rows) {
      cursor = c.id;
      try {
        const res = await search(`${c.name} ${c.area}`);
        if (res.quota) { stop = "네이버 한도 도달 — 중단(다음날 재개)"; break; }
        const m = res.items.find((it) => it.lat && Math.abs(it.lat - c.lat) < 0.001 && Math.abs(it.lng - c.lng) < 0.001)
          || res.items.find((it) => it.name.replace(/\s/g, "") === c.name.replace(/\s/g, ""))
          || res.items[0];
        const dong = m ? parseDong(m.jibun) : null;
        const cat = m ? (m.category || "") : "";
        if (dong) { await sql`UPDATE cafes SET dong = ${dong} WHERE id = ${c.id}`; done++; }
        else miss++;
        await sql`UPDATE cafes SET naver_category = ${cat || ""} WHERE id = ${c.id}`;
        // 카테고리 확보 → 자가 검증: 카페·디저트면 (보류였으면) 공개 복귀, 비카페·프랜차이즈면 차단.
        const bad = isFranchise(c.name) || isNonCafe(c.name, cat) || !cat;
        if (bad) {
          const u = await sql`UPDATE cafes SET published = false, needs_category = false, pipeline_status = CASE WHEN ${!cat} THEN pipeline_status ELSE 'rejected' END WHERE id = ${c.id} AND published = true RETURNING 1`;
          if (u.length) { refiltered++; console.log(`  ⛔ 비공개: ${c.name} [${cat || '카테고리없음'}]`); }
        } else if (c.needs_category) {
          // 카페로 검증됨 → 공개 복귀(등급 보유 + 좌표 유효)
          const u = await sql`UPDATE cafes SET needs_category = false, published = (synth_grade IN ('검증','참고') AND lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9), pipeline_status = CASE WHEN synth_grade IN ('검증','참고') THEN 'live' ELSE pipeline_status END WHERE id = ${c.id} RETURNING published`;
          if (u[0]?.published) republished++;
        }
        if ((done + miss) % 100 === 0) console.log(`  …진행 ${done + miss} (동 ${done}·복귀 ${republished}·차단 ${refiltered})`);
      } catch (e) { miss++; }
      await sleep(210);
    }
  }
} catch (e) { stop = "예외 — 중단: " + String(e).slice(0, 60); }

let remain = "?", held = "?", pub = "?";
try { remain = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE (naver_category IS NULL OR naver_category='') AND lat IS NOT NULL`)[0].n; } catch {}
try { const r = await sql`SELECT count(*) FILTER(WHERE published)::int pub, count(*) FILTER(WHERE needs_category AND NOT published)::int held FROM cafes`; held = r[0].held; pub = r[0].pub; } catch {}
console.log(stop || "상한 도달");
console.log(`자율검증 백필: 동채움 ${done} · 카페복귀 ${republished} · 비카페차단 ${refiltered} · 카테고리미보유 남음 ${remain}`);
console.log(`→ 공개(검증완료) ${pub} · 검증대기 보류 ${held}`);
process.exit(0);
