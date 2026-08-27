// 📰 동(洞) 단위 관광지 판정 배치 — 네이버 뉴스로 "언론이 이 동네를 관광 맥락으로 다루나"를 잰다.
//
// 💰 비용: 동당 뉴스 1콜. 고유 (지역,동) 1,207개 = 하루 한도 25,000의 4.8%. **1회성**이다
//   (한 번 판정하면 그 동에 새 카페가 들어와도 재조회 없음. --stale 로만 갱신).
//   ⚠️ 네이버 뉴스는 local·blog와 **같은 25,000 한도를 공유**한다. 수집 적체가 있으면 돌리지 말 것.
//
// 사용:
//   node --import tsx scripts/classify-tourism.mjs --calibrate --limit=40   # 판정 안 하고 분포만 본다
//   node --import tsx scripts/classify-tourism.mjs --apply --filter=강원      # 저장
//   node --import tsx scripts/classify-tourism.mjs --apply                   # 전체
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { tourismSignal, isTouristDong, TOURISM_MIN_SAMPLE, TOURISM_RATE } = await import("../lib/tourismSignal.ts");
const { naverHeaders, markKeyExhausted, NAVER_KEY_COUNT } = await import("../lib/naverKeys.ts");
const { bumpNaver, markNaverExhausted } = await import("../lib/naverBudget.ts");
const sql = neon(process.env.DATABASE_URL);

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const APPLY = process.argv.includes("--apply");
const CALIB = process.argv.includes("--calibrate");
const LIMIT = Number(arg("limit", 0));
const FILTER = arg("filter", "");

await sql`CREATE TABLE IF NOT EXISTS dong_tourism (
  area TEXT NOT NULL, dong TEXT NOT NULL,
  sampled INT, touristic INT, residential INT, rate REAL,
  is_tourist BOOLEAN,
  judged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (area, dong)
)`;

// 판정 대상: 공개 카페가 있는 (지역,동). 이미 판정된 곳은 건너뛴다(재조회=쿼터 낭비).
const rows = await sql`
  SELECT c.area, c.dong, count(*)::int cafes
  FROM cafes c LEFT JOIN dong_tourism t ON t.area = c.area AND t.dong = c.dong
  WHERE c.published AND c.dong IS NOT NULL AND c.dong <> '' AND t.area IS NULL
    AND (${FILTER} = '' OR c.address LIKE ${FILTER + "%"})
  GROUP BY 1,2 ORDER BY count(*) DESC`;

const targets = LIMIT ? rows.slice(0, LIMIT) : rows;
console.log(`대상 ${targets.length}개 (지역,동) · 예상 ${targets.length}콜 = 하루 한도의 ${(targets.length / 250).toFixed(1)}%`);
console.log(`판정 기준(잠정): 표본 ${TOURISM_MIN_SAMPLE}건 이상 + 관광기사 비율 ${(TOURISM_RATE * 100).toFixed(0)}% 이상\n`);

async function news(query) {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=30&sort=sim`;
  for (let i = 0; i < Math.max(1, NAVER_KEY_COUNT); i++) {
    const k = naverHeaders();
    if (!k) return null;
    const res = await fetch(url, { headers: k.headers });
    if (res.status === 429) { markNaverExhausted().catch(() => {}); if (!markKeyExhausted(k.label)) return null; continue; }
    if (!res.ok) return null;
    bumpNaver(1).catch(() => {});
    return (await res.json()).items ?? [];
  }
  return null;
}

const out = [];
for (const r of targets) {
  // 질의도 일상 표기("평창 봉평")로 — 공식 행정명 질의는 보도자료·공문서형 기사로 쏠린다(2026-08-27).
  const qArea = r.area.replace(/(특별자치도|광역시|특별시)$/, "").replace(/(시|군|구)$/, "");
  const qDong = r.dong.replace(/(동|면|읍|가)$/, "");
  const items = await news(`${qArea} ${qDong.length >= 2 ? qDong : r.dong}`);
  if (items === null) { console.log("  ⚠️ 쿼터 소진 — 중단(재실행 시 이어감)"); break; }
  const sig = tourismSignal(items.map((i) => ({ title: i.title, description: i.description })), r.area, r.dong);
  const verdict = isTouristDong(sig);
  out.push({ ...r, ...sig, verdict });
  if (APPLY) {
    await sql`INSERT INTO dong_tourism (area, dong, sampled, touristic, residential, rate, is_tourist)
      VALUES (${r.area}, ${r.dong}, ${sig.sampled}, ${sig.touristic}, ${sig.residential}, ${sig.rate}, ${verdict})
      ON CONFLICT (area, dong) DO UPDATE SET sampled=EXCLUDED.sampled, touristic=EXCLUDED.touristic,
        residential=EXCLUDED.residential, rate=EXCLUDED.rate, is_tourist=EXCLUDED.is_tourist, judged_at=now()`;
  }
  await new Promise((s) => setTimeout(s, 220)); // 버스트 429 방지(발굴과 같은 간격)
}

console.log(`\n처리 ${out.length}개 · 관광지 판정 ${out.filter((o) => o.verdict).length}개 (${(out.filter((o) => o.verdict).length / (out.length || 1) * 100).toFixed(1)}%)`);
if (CALIB) {
  console.log("\n── 관광기사 비율 분포(임계 보정용) ──");
  for (const [lo, hi] of [[0, 0.1], [0.1, 0.2], [0.2, 0.3], [0.3, 0.4], [0.4, 0.6], [0.6, 1.01]]) {
    const n = out.filter((o) => o.sampled >= TOURISM_MIN_SAMPLE && o.rate >= lo && o.rate < hi).length;
    console.log(`  ${(lo * 100).toFixed(0).padStart(3)}~${(hi * 100).toFixed(0).padStart(3)}%  ${String(n).padStart(4)}개`);
  }
  console.log(`  표본부족(<${TOURISM_MIN_SAMPLE}건)  ${out.filter((o) => o.sampled < TOURISM_MIN_SAMPLE).length}개`);
  console.log("\n── 상위 20(비율순) ──");
  for (const o of out.filter((x) => x.sampled >= TOURISM_MIN_SAMPLE).sort((a, b) => b.rate - a.rate).slice(0, 20))
    console.log(`  ${String(o.area).padEnd(10)}${String(o.dong).padEnd(10)} 표본${String(o.sampled).padStart(3)} 관광${String(o.touristic).padStart(3)} 생활${String(o.residential).padStart(3)} = ${(o.rate * 100).toFixed(0).padStart(3)}%  ${o.verdict ? "🧳" : ""}  (카페 ${o.cafes})`);
  console.log("\n── 하위 10(관광 아님으로 판정된 곳 — 오탐 역검증) ──");
  for (const o of out.filter((x) => x.sampled >= TOURISM_MIN_SAMPLE).sort((a, b) => a.rate - b.rate).slice(0, 10))
    console.log(`  ${String(o.area).padEnd(10)}${String(o.dong).padEnd(10)} = ${(o.rate * 100).toFixed(0).padStart(3)}%  (카페 ${o.cafes})`);
}
if (!APPLY) console.log("\n🔍 미리보기 — DB에 쓰지 않았다(--apply 로 저장).");
