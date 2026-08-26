// 동(洞) 백필 — dong 없는 카페를 '이름+구'로 네이버 검색 → 좌표 일치 결과의 지번에서 동/읍/면 파싱 → 저장.
// 카페당 1쿼리(효율적). 좌표 근사 일치로 오매칭 방지. 한도(429) 도달 시 깨끗이 중단 → 다음날 자동 재개.
// 커서(id>last)로 전진 처리 → 한 회차에 같은 카페 반복 안 함.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { parseDong } = await import("../lib/discover.ts");
const { sql } = await import("../lib/db.ts");
const { isFranchise, isNonCafe } = await import("../lib/discover.ts");
const { recordRun, guardJob } = await import("../lib/heartbeat.ts");
// 🚨 좌표 박스는 criteria 단일출처(2026-08-26) — 하드코딩하면 범위 확대 후 이 스크립트가
//   정상 카페를 다시 비공개로 되돌린다(공개 상태를 직접 쓰는 경로라 특히 위험).
const { loadCriteria: _lc, getCriterionSync: _gc } = await import("../lib/criteria.ts");
await _lc();
const BOX = { aMin: _gc("geo.box.lat_min"), aMax: _gc("geo.box.lat_max"), oMin: _gc("geo.box.lng_min"), oMax: _gc("geo.box.lng_max") };
guardJob("dong-backfill"); // 잡히지 않은 크래시(ReferenceError 등)도 관제탑이 보게 기록
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
let done = 0, miss = 0, refiltered = 0, republished = 0, cursor = 0, stop = "";
const MAX = Number(process.env.DONG_MAX || 20000);
const REVAL = process.env.REVALIDATE === "1"; // 전수 재검증: 모든 카페 재조회, 구 불일치 동은 교정/제거
let corrected = 0;
try {
  while (done + miss < MAX && !stop) {
    // ★ 커서(id>cursor)와 정렬을 반드시 id로 일치시킬 것. 카테고리우선 정렬은 커서가 점프해
    //   하위 id의 동없는 카페를 통째로 스킵시키는 버그를 유발(45%에서 멈춘 원인). 순수 id 순으로 전수 처리.
    const rows = await sql`SELECT id, name, area, lat, lng, synth_grade, needs_category, dong FROM cafes WHERE (${REVAL} OR naver_category IS NULL OR naver_category='' OR dong IS NULL) AND lat IS NOT NULL AND id > ${cursor} AND (${Number(process.env.SHARDS || 1)} = 1 OR id % ${Number(process.env.SHARDS || 1)} = ${Number(process.env.SHARD || 0)}) ORDER BY id LIMIT 25`;
    if (!rows.length) { stop = "동·카테고리 미보유 카페 소진 — 완료"; break; }
    for (const c of rows) {
      cursor = c.id;
      try {
        const res = await search(`${c.name} ${c.area}`);
        if (res.quota) { stop = "네이버 한도 도달 — 중단(다음날 재개)"; break; }
        // ★ 매칭: 좌표 일치=같은 장소(그것만으로 충분). 이름매칭일 때만 구(區) 검증.
        //   구 토큰은 '인천 서구'→'서구'처럼 마지막 구/시/군 토큰만 뽑음(지번 '인천광역시 서구'와 매칭되게).
        const guTok = ((c.area || "").match(/[가-힣]+[구시군]/g) || []).pop() || "";
        const inGu = (it) => guTok && (it.jibun || "").replace(/\s/g, "").includes(guTok.replace(/\s/g, ""));
        const m = res.items.find((it) => it.lat && Math.abs(it.lat - c.lat) < 0.0015 && Math.abs(it.lng - c.lng) < 0.0015)
          || res.items.find((it) => it.name.replace(/\s/g, "") === c.name.replace(/\s/g, "") && inGu(it));
        const dong = m ? parseDong(m.jibun) : null;
        const cat = m ? (m.category || "") : "";
        if (dong) { if (dong !== c.dong) { await sql`UPDATE cafes SET dong = ${dong} WHERE id = ${c.id}`; if (c.dong) corrected++; } done++; }
        else { if (REVAL && c.dong) { await sql`UPDATE cafes SET dong = NULL WHERE id = ${c.id}`; corrected++; } miss++; }
        if (cat) await sql`UPDATE cafes SET naver_category = ${cat} WHERE id = ${c.id}`; // ★ 미스(cat 없음)면 기존 카테고리 안 지움
        // ★ 비공개는 '카테고리가 실제로 비카페일 때'만. 검색 미스(cat 없음)로는 절대 비공개 안 함(인천 대량삭제 버그 방지).
        const bad = isFranchise(c.name) || (cat && isNonCafe(c.name, cat));
        if (bad) {
          const u = await sql`UPDATE cafes SET published = false, needs_category = false, pipeline_status = 'rejected' WHERE id = ${c.id} AND published = true RETURNING 1`;
          if (u.length) { refiltered++; console.log(`  ⛔ 비공개: ${c.name} [${cat || '프랜차이즈'}]`); }
          // 🛑 안전 차단기: 한 회차 비공개가 40건 넘으면 대량삭제 의심 → 즉시 중단(점검 필요). 신뢰 보호.
          if (refiltered > 40) { stop = `안전차단: 비공개 ${refiltered}건 초과 — 대량 비공개 의심, 중단(점검 필요)`; break; }
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
console.log(`자율검증 백필: 동채움 ${done} · 동교정/제거 ${corrected} · 카페복귀 ${republished} · 비카페차단 ${refiltered} · 카테고리미보유 남음 ${remain}`);
console.log(`→ 공개(검증완료) ${pub} · 검증대기 보류 ${held}`);
await recordRun("dong-backfill", !stop.startsWith("예외") && !stop.startsWith("안전차단"), stop || `완료(동 ${done})`, done); // 예외·안전차단=실패(관제탑 경보)
process.exit(0);
