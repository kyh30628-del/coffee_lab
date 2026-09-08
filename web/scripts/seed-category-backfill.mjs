#!/usr/bin/env node
// 🏷️ 시드 유입 카페의 네이버 카테고리 보강 — CEO 결재(2026-09-08) "카테고리 보강 방식으로 진행".
//   실행: node scripts/seed-category-backfill.mjs [--limit=300] [--apply] [--source=sanga-seed]
//         (기본은 dry-run: 조회·매칭만 하고 DB에 안 씀. --apply 를 줘야 저장한다)
//
// 🔴 왜 필요한가(2026-09-08 실측):
//   신규 카페 공개 게이트(lib/synthStore.ts)는 `isCafeCat = hasCategory && !nonCafeReal` —
//   **네이버 카테고리가 없으면 등급과 무관하게 탈락**한다(비카페 차단 장치).
//   그런데 상가 시드로 들어온 297곳 중 282곳(95%)에 카테고리가 없어 전부 rejected로 굳었다.
//   그 안에 검증 22곳·참고 73곳이 섞여 있다 — 후기 근거는 충분한데 카테고리가 없어서 막힌 것.
//   대조군인 같은 지역 네이버 발굴분 76곳은 카테고리 없음 0곳.
//
// 🔒 안전 규칙(오염 방지가 최우선):
//   - 이름이 맞고 **주소 또는 좌표까지 일치할 때만** 카테고리를 가져온다. 이름만 비슷하면 옆가게 카테고리를 뒤집어쓴다.
//   - 카테고리만 채운다. 공개 여부는 건드리지 않는다 — 게이트가 다시 판단하게 둔다(자동 공개 없음).
//   - 네이버 쿼터는 발굴과 경쟁한다 → 호출 사이 220ms 간격, 기본 상한 300건.
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const val = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim().replace(/^['"]|['"]$/g, "");
const DB = val("DATABASE_URL"), NID = val("NAVER_CLIENT_ID"), NSEC = val("NAVER_CLIENT_SECRET");
if (!DB || !NID || !NSEC) { console.error("DATABASE_URL / NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요"); process.exit(1); }

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const LIMIT = Number(arg("limit", 300));
const SOURCE = arg("source", "sanga-seed");
const APPLY = process.argv.includes("--apply");

const { neon } = await import("@neondatabase/serverless");
const sql = neon(DB);

const strip = (s) => String(s || "").replace(/<[^>]*>/g, "");
const norm = (s) => strip(s).replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();
/** 도로명주소 → 시도|시군구|도로명|번호 (매칭 확인용, closure/match.mjs와 같은 규칙) */
const SIDO = { "서울특별시": "서울", "인천광역시": "인천", "경기도": "경기", "강원특별자치도": "강원", "강원도": "강원", "대전광역시": "대전", "세종특별자치시": "세종", "충청남도": "충남", "충청북도": "충북", "부산광역시": "부산", "경상남도": "경남" };
function roadKey(addr) {
  if (!addr) return null;
  const head = String(addr).split(",")[0].trim(), t = head.split(/\s+/);
  const sido = SIDO[t[0]] || (t[0]?.length <= 3 ? t[0] : null);
  if (!sido) return null;
  const m = [...head.matchAll(/([가-힣A-Za-z0-9]+(?:대?로|길))\s+(\d+(?:-\d+)?)/g)];
  if (!m.length) return null;
  const last = m[m.length - 1];
  return `${sido}|${sido === "세종" ? "세종" : (t[1] || "")}|${last[1]}|${last[2]}`;
}
const near = (a, b, tol = 0.0015) => a.lat != null && b.lat != null && Math.abs(a.lat - b.lat) < tol && Math.abs(a.lng - b.lng) < tol; // 약 150m

async function localSearch(query) {
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&sort=comment`;
  const r = await fetch(url, { headers: { "X-Naver-Client-Id": NID, "X-Naver-Client-Secret": NSEC } });
  if (r.status === 429) { const b = await r.text().catch(() => ""); return { items: null, quota: /quota=\d+\/\d+|Query limit|"errorCode"\s*:\s*"010"/i.test(b) }; }
  if (!r.ok) return { items: null, quota: false };
  const d = await r.json();
  return { items: (d.items ?? []).map((it) => ({
    name: strip(it.title), address: it.roadAddress || it.address || "",
    category: strip(it.category || ""),
    lat: it.mapy ? Number(it.mapy) / 1e7 : null, lng: it.mapx ? Number(it.mapx) / 1e7 : null,
  })), quota: false };
}

const rows = await sql`
  SELECT id, name, area, dong, address, lat, lng, synth_grade, synth_count, pipeline_status
  FROM cafes
  WHERE source = ${SOURCE} AND (naver_category IS NULL OR naver_category = '')
  ORDER BY (synth_grade = '검증') DESC, synth_count DESC NULLS LAST
  LIMIT ${LIMIT}`;
console.log(`대상 ${rows.length}곳 (source=${SOURCE}, 카테고리 없음) · ${APPLY ? "APPLY(저장)" : "DRY-RUN(저장 안 함)"}`);

let searched = 0, matched = 0, filled = 0, noHit = 0, ambiguous = 0, quotaHit = false;
const byGrade = {};
for (const c of rows) {
  // ⚠️ 질의에 **동 이름을 붙이면 0건**이 나온다(2026-09-08 실측: "황실로스터스 회현동" 0건 / "황실로스터스 김해" 1건).
  //    시·군·구 → 이름 단독 순으로 폴백한다. 이름 단독이어도 아래에서 주소·좌표를 확인하므로 오매칭 위험은 없다.
  let items = null, quota = false;
  for (const q of [`${c.name} ${c.area || ""}`.trim(), c.name]) {
    const r = await localSearch(q);
    searched++;
    if (r.quota) { quota = true; break; }
    if (r.items && r.items.length) { items = r.items; break; }
    if (r.items) items = r.items; // 빈 배열도 '조회는 됨'으로 유지
    await new Promise((s) => setTimeout(s, 220));
  }
  if (quota) { quotaHit = true; console.error("⛔ 네이버 일일 쿼터 소진 — 중단"); break; }
  if (!items || !items.length) { noHit++; await new Promise((s) => setTimeout(s, 220)); continue; }
  const cn = norm(c.name), ck = roadKey(c.address);
  // 이름이 맞고 + 주소키 일치 또는 좌표 150m 이내일 때만 채택(옆가게 카테고리 오염 방지)
  const hits = items.filter((it) => {
    const n = norm(it.name);
    const nameOk = n === cn || (n.length >= 3 && cn.length >= 3 && (n.includes(cn) || cn.includes(n)));
    if (!nameOk) return false;
    const addrOk = ck && roadKey(it.address) === ck;
    return addrOk || near(c, it);
  });
  if (!hits.length) { noHit++; continue; }
  const cats = [...new Set(hits.map((h) => h.category).filter(Boolean))];
  if (cats.length > 1) { ambiguous++; }           // 후보 카테고리가 갈리면 첫 번째(가장 리뷰 많은 순)를 쓴다
  const cat = cats[0];
  matched++;
  if (!cat) continue;
  byGrade[c.synth_grade || "(없음)"] = (byGrade[c.synth_grade || "(없음)"] || 0) + 1;
  if (APPLY) {
    await sql`UPDATE cafes SET naver_category = ${cat}, updated_at = now() WHERE id = ${c.id} AND (naver_category IS NULL OR naver_category = '')`;
    if (!hits[0].address || c.dong) { /* dong은 건드리지 않음 — 지역 라벨은 별도 규칙 소관 */ }
  }
  filled++;
  if (filled <= 8) console.log(`  ✓ #${c.id} ${c.name} → "${cat}" (${c.synth_grade}·증거 ${c.synth_count ?? 0})`);
  await new Promise((s) => setTimeout(s, 220)); // 발굴과 쿼터 경쟁 → 간격 확보
}
console.log(`\n조회 ${searched} · 이름+위치 일치 ${matched} · 카테고리 확보 ${filled} · 못 찾음 ${noHit} · 카테고리 다중 ${ambiguous}${quotaHit ? " · 쿼터중단" : ""}`);
console.log("등급별 확보:", JSON.stringify(byGrade));
console.log(APPLY ? "저장 완료 — 공개 여부는 게이트가 다시 판단한다(자동 공개 없음)" : "DRY-RUN이라 저장하지 않았다. --apply 로 실행할 것");
