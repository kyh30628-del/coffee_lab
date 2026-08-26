// 🔎 IndexNow 색인 제출 — 새로 공개된 카페·지역 URL을 검색엔진에 **직접 알린다**.
//
// 왜 이걸 쓰나(2026-08-26, CEO "서치콘솔 제출도 니가 다 해라"):
//   · 구글 Search Console API는 OAuth(사람 로그인) 또는 속성 소유자로 등록된 서비스계정이 필요하다.
//     우리가 가진 GOOGLE_API_KEY(일반 키)로는 불가 — 이건 CEO가 직접 눌러야 한다.
//   · 구글의 옛 사이트맵 핑(google.com/ping?sitemap=)은 **폐지됐다**(실측 HTTP 404).
//   · 대신 IndexNow는 로그인 없이 키 파일만으로 제출할 수 있고,
//     공식 FAQ 기준 **Naver·Bing·Yandex·Seznam·Amazon·Yep이 수신**한다(Google은 미참여).
//     우리 유입의 큰 축이 네이버라 실익이 크다.
//
// 💰 비용: 우리 서버에서 나가는 아웃바운드 HTTP 몇 건. DB는 읽기 1회(공개 카페 id 목록).
//   로컬에서 돌리므로 Vercel 함수시간 0.
//
// ⚠️ 한 번에 최대 10,000 URL. 이미 제출한 건 다시 보내지 않는다(indexnow_log로 중복 차단) —
//   같은 URL을 반복 제출하면 스팸으로 취급돼 사이트 신뢰가 깎인다.
//
// 사용: node --import tsx scripts/indexnow-submit.mjs [--all] [--dry]
import { readFileSync, readdirSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

const HOST = "dongnecoffeenote.com";
const SITE = `https://${HOST}`;
const DRY = process.argv.includes("--dry");
const ALL = process.argv.includes("--all");

// 키는 public/<key>.txt 파일명에서 읽는다 — 값과 파일명이 어긋나면 검증이 실패하므로 한 곳에서만 관리.
const keyFile = readdirSync(new URL("../public", import.meta.url)).find((f) => /^[a-z0-9-]{8,128}\.txt$/i.test(f));
if (!keyFile) { console.log("🔴 public/<key>.txt 없음 — 키 파일을 먼저 두세요."); process.exit(1); }
const KEY = keyFile.replace(/\.txt$/, "");

await sql`CREATE TABLE IF NOT EXISTS indexnow_log (
  url TEXT PRIMARY KEY, submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(), engine TEXT
)`;

// 제출 대상: 공개 카페 상세 + 지역/취향 페이지(사이트맵과 같은 기준).
const cafes = await sql`SELECT id FROM cafes WHERE published ORDER BY id`;
const regions = await sql`SELECT area, count(*)::int n FROM cafes WHERE published AND area IS NOT NULL AND area <> ''
  GROUP BY area HAVING count(*) >= 5`;
const urls = [
  SITE, `${SITE}/area`,
  ...regions.map((r) => `${SITE}/area/${encodeURIComponent(r.area)}`),
  ...cafes.map((c) => `${SITE}/c/${c.id}`),
];

let targets = urls;
if (!ALL) {
  const done = new Set((await sql`SELECT url FROM indexnow_log`).map((r) => r.url));
  targets = urls.filter((u) => !done.has(u));
}
console.log(`전체 ${urls.length.toLocaleString()} URL · 이번 제출 대상 ${targets.length.toLocaleString()}${ALL ? " (--all: 전량 재제출)" : " (미제출분만)"}`);
if (!targets.length) { console.log("제출할 새 URL이 없습니다."); process.exit(0); }
if (DRY) { console.log("🔍 --dry: 실제 전송 안 함\n  샘플:", targets.slice(0, 5)); process.exit(0); }

// 검증: 키 파일이 실제로 공개돼 있어야 엔진이 받아준다. 아니면 전부 403이라 헛제출이 된다.
const keyOk = await fetch(`${SITE}/${KEY}.txt`).then((r) => r.ok).catch(() => false);
if (!keyOk) { console.log(`🔴 키 파일 접근 불가: ${SITE}/${KEY}.txt — 배포 후 다시 실행하세요.`); process.exit(1); }
console.log(`키 파일 확인 ✅ ${SITE}/${KEY}.txt`);

let sent = 0;
for (let i = 0; i < targets.length; i += 10000) {
  const chunk = targets.slice(i, i + 10000);
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: chunk }),
  });
  const ok = res.status === 200 || res.status === 202;
  console.log(`  ${i + 1}~${i + chunk.length}: HTTP ${res.status} ${ok ? "✅" : "🔴 " + (await res.text()).slice(0, 120)}`);
  if (!ok) break;
  sent += chunk.length;
  // 중복 제출 방지 기록 — 같은 URL을 반복 보내면 스팸 취급된다.
  for (let j = 0; j < chunk.length; j += 500) {
    await sql`INSERT INTO indexnow_log (url, engine) SELECT unnest(${chunk.slice(j, j + 500)}::text[]), 'indexnow'
      ON CONFLICT (url) DO UPDATE SET submitted_at = now()`;
  }
}
console.log(`\n제출 완료 ${sent.toLocaleString()} URL → Naver·Bing·Yandex·Seznam 등이 수신(Google 미참여).`);
