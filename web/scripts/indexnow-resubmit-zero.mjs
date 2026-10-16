// 🔁 크롤 0인 지역만 **강제 재제출**(2026-10-16, CEO 지시).
//
// 왜: 사이트맵에도 있고 페이지도 200인데 **60일간 크롤러가 한 번도 안 온 지역이 22개**(카페 1,773곳).
//   울산 남구 321곳·군산시 249곳이 대표적 — 사람도 0, 봇도 0이다. 제출은 했지만 네이버가 안 집은 것으로 보인다.
//   indexnow-submit.mjs는 indexnow_log로 중복을 막아 "이미 보냈다"며 다시 안 보낸다. 그래서 이 지역만 골라 푼다.
//
// ⚠️ 전체 재제출(--all)은 하지 않는다 — 같은 URL을 반복해 보내면 스팸으로 취급돼 사이트 신뢰가 깎인다.
//   여기서는 **크롤이 실제로 0인 지역의 URL만** 대상으로 한다. 그 지역 로그만 지우고 다시 보낸다.
//
// 💰 비용: 로컬 실행(Vercel 함수시간 0) · 사이트맵 1회 fetch · 아웃바운드 HTTP 1~2건.
//
// 사용: node --import tsx scripts/indexnow-resubmit-zero.mjs [--dry]
import { readFileSync, readdirSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

const HOST = "dongnecoffeenote.com";
const SITE = `https://${HOST}`;
const DRY = process.argv.includes("--dry");

const keyFile = readdirSync(new URL("../public", import.meta.url)).find((f) => /^[a-z0-9-]{8,128}\.txt$/i.test(f));
if (!keyFile) { console.log("🔴 public/<key>.txt 없음"); process.exit(1); }
const KEY = keyFile.replace(/\.txt$/, "");

// ① 크롤·방문이 60일간 0인 지역 산출(사람·봇 모두 0)
const areas = await sql`SELECT area, count(*)::int cafes FROM cafes WHERE published AND area IS NOT NULL AND area <> '' GROUP BY 1`;
const hits = await sql`SELECT substring(path from '^/area/([^/?]+)') seg, count(*)::int n
  FROM traffic_events WHERE ts > now() - interval '60 days' AND path LIKE '/area/%' GROUP BY 1`;
const seen = new Map();
for (const h of hits) { try { const d = decodeURIComponent(h.seg); seen.set(d, (seen.get(d) ?? 0) + h.n); } catch {} }
const zero = areas.filter((a) => !(seen.get(a.area) > 0)).map((a) => a.area);
if (!zero.length) { console.log("✅ 크롤 0 지역 없음 — 할 일 없음"); process.exit(0); }
console.log(`대상 지역 ${zero.length}개: ${zero.slice(0, 8).join(", ")}${zero.length > 8 ? " …" : ""}`);

// ② 그 지역에 속한 URL을 사이트맵 전체에서 고른다(지역·취향·시설·동 + 그 지역 카페 상세)
const smIndex = await fetch(`${SITE}/sitemap.xml`).then((r) => r.text());
const subs = [...smIndex.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /\/sitemaps\//.test(u));
const all = [];
for (const s of [`${SITE}/sitemap.xml`, ...subs]) {
  const xml = await fetch(s).then((r) => r.text()).catch(() => "");
  all.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
}
const uniq = [...new Set(all)];

const zeroSet = new Set(zero);
const cafeIds = new Set(
  ((await sql`SELECT id FROM cafes WHERE published AND area = ANY(${zero}::text[])`)).map((r) => String(r.id)),
);
const targets = uniq.filter((u) => {
  const mArea = u.match(/\/area\/([^/?]+)/);
  if (mArea) { try { return zeroSet.has(decodeURIComponent(mArea[1])); } catch { return false; } }
  const mC = u.match(/\/c\/(\d+)$/);
  if (mC) return cafeIds.has(mC[1]);
  return false;
});

console.log(`사이트맵 ${uniq.length.toLocaleString()}개 중 대상 ${targets.length.toLocaleString()}개`);
if (!targets.length) { console.log("대상 URL 없음"); process.exit(0); }
if (DRY) { console.log("▶ 미리보기(--dry). 샘플:"); targets.slice(0, 5).forEach((u) => console.log("  ", decodeURIComponent(u))); process.exit(0); }

// ③ 이 지역 로그만 비워 '신규'로 만든다(전체는 건드리지 않는다)
const del = await sql`DELETE FROM indexnow_log WHERE url = ANY(${targets}::text[]) RETURNING url`;
console.log(`기존 제출기록 ${del.length.toLocaleString()}건 해제(해당 지역만)`);

// ④ 제출 — IndexNow는 1회 10,000개 상한
let ok = 0, fail = 0;
for (let i = 0; i < targets.length; i += 9000) {
  const batch = targets.slice(i, i + 9000);
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: batch }),
  }).catch((e) => ({ ok: false, status: String(e) }));
  if (res.ok) {
    ok += batch.length;
    await sql`INSERT INTO indexnow_log (url, engine) SELECT u, 'indexnow' FROM unnest(${batch}::text[]) u
      ON CONFLICT (url) DO UPDATE SET submitted_at = now()`;
  } else { fail += batch.length; console.log(`  ⚠️ 배치 실패 HTTP ${res.status}`); }
}
console.log(`✅ 재제출 완료 — 성공 ${ok.toLocaleString()} · 실패 ${fail.toLocaleString()}`);
console.log("   7일 뒤 같은 지역에 크롤이 오는지 확인하면 '제출이 안 먹혔던 것'인지 '페이지 문제'인지 갈린다.");
