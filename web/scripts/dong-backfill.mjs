// 동(洞) 백필 — dong 없는 카페를 '이름+구'로 네이버 검색 → 좌표 일치 결과의 지번에서 동/읍/면 파싱 → 저장.
// 카페당 1쿼리(효율적). 좌표 근사 일치로 오매칭 방지. 한도(429) 도달 시 깨끗이 중단 → 다음날 자동 재개.
// 커서(id>last)로 전진 처리 → 한 회차에 같은 카페 반복 안 함.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { parseDong } = await import("../lib/discover.ts");
const { sql } = await import("../lib/db.ts");
const ID = process.env.NAVER_CLIENT_ID, SECRET = process.env.NAVER_CLIENT_SECRET;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => (s || "").replace(/<[^>]+>/g, "").trim();

async function search(q) {
  const u = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=5`;
  const r = await fetch(u, { headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SECRET } });
  if (r.status === 429) return { quota: true, items: [] };
  if (!r.ok) return { items: [] };
  const d = await r.json();
  return { items: (d.items ?? []).map((it) => ({ name: strip(it.title), jibun: it.address || "", lat: it.mapy ? Number(it.mapy) / 1e7 : null, lng: it.mapx ? Number(it.mapx) / 1e7 : null })) };
}

let done = 0, miss = 0, cursor = 0, stop = "";
const MAX = Number(process.env.DONG_MAX || 20000);
try {
  while (done + miss < MAX && !stop) {
    const rows = await sql`SELECT id, name, area, lat, lng FROM cafes WHERE dong IS NULL AND lat IS NOT NULL AND id > ${cursor} ORDER BY id LIMIT 25`;
    if (!rows.length) { stop = "동 없는 카페 소진 — 완료"; break; }
    for (const c of rows) {
      cursor = c.id;
      try {
        const res = await search(`${c.name} ${c.area}`);
        if (res.quota) { stop = "네이버 한도 도달 — 중단(다음날 재개)"; break; }
        // 좌표 100m 이내 일치 우선, 없으면 이름 일치, 없으면 1순위
        const m = res.items.find((it) => it.lat && Math.abs(it.lat - c.lat) < 0.001 && Math.abs(it.lng - c.lng) < 0.001)
          || res.items.find((it) => it.name.replace(/\s/g, "") === c.name.replace(/\s/g, ""))
          || res.items[0];
        const dong = m ? parseDong(m.jibun) : null;
        if (dong) { await sql`UPDATE cafes SET dong = ${dong} WHERE id = ${c.id}`; done++; if (done % 50 === 0) console.log(`  …${done}곳 동 채움 (${c.name}→${dong})`); }
        else miss++;
      } catch (e) { miss++; }
      await sleep(210);
    }
  }
} catch (e) { stop = "예외 — 중단: " + String(e).slice(0, 60); }

let remain = "?";
try { remain = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE dong IS NULL AND lat IS NOT NULL`)[0].n; } catch {}
console.log(stop || "상한 도달");
console.log(`동 백필: 이번 ${done}곳 채움 · 미매칭 ${miss} · 남은 동없음 ${remain}`);
process.exit(0);
