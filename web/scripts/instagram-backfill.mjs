// 인스타그램 URL 백필 — coordination#188: instagram_url 컬럼(lib/db.ts, B2B DM 타깃용)이
// 07-01 "완료"처리됐으나 채우는 파이프라인이 아예 없어 11일째 0/13259 (결재#119 인스타DM 무력화).
// 발견: 네이버 지역검색 API(local.json)의 link 필드는 스마트플레이스에 등록된 SNS를 그대로 반환하는
// 경우가 있어(예: 인스타그램을 홈페이지로 등록한 업체), 별도 크롤링 없이 공식 API만으로 상당수 확보 가능.
// 카페당 1쿼리, 좌표 근접 + 상호명 코어토큰 일치(둘 다 요구)로 정확도 확보 — 좌표만으론 상가밀집지역
// 옆가게 오염(coord#244/#484), 이름만으론 동명 오염(venue-token 사례) 위험이 각각 있어 이중 게이트.
// 우선순위: 검증등급·리뷰(synth_count) 많은 카페부터(결재#119 타깃과 동일). 네이버 공용 일일예산 준수 —
// 소진/차단 시 깨끗이 중단, 다음날 자동 재개. 확인한 카페는 ig_checked_at으로 재조회 안 함(쿼터 절약).
// 실행(tsx): node --import tsx scripts/instagram-backfill.mjs
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { sql } = await import("../lib/db.ts");
const { recordRun, guardJob } = await import("../lib/heartbeat.ts");
const { bumpNaver, markNaverExhausted, naverBlocked } = await import("../lib/naverBudget.ts");
const { coreTokensDetail } = await import("../lib/reviewQuality.ts");
guardJob("instagram-backfill"); // 잡히지 않은 크래시도 관제탑이 보게 기록

const ID = process.env.NAVER_CLIENT_ID, SECRET = process.env.NAVER_CLIENT_SECRET;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => (s || "").replace(/<[^>]+>/g, "").trim();
const IG_RE = /^https?:\/\/(www\.)?instagram\.com\//i;
const normName = (s) => (s || "").toLowerCase().replace(/\s+/g, "");
// coord#244 후속(#486): 좌표 165m 근접만으론 상가밀집지역에서 옆가게를 채택하는 근본버그였다.
// 대상 카페의 식별토큰(coreTokensDetail, lib/reviewQuality.ts — 오염검증 단일출처와 동일 로직)이 네이버
// 검색결과 상호명에 실제로 포함될 때만 채택 — 좌표+상호명 이중 게이트.
// coord#245 후속(#493, H15): #486 배포 이후에도 스타필드·터미널 등 다중테넌트 몰에서 오귀속이 재발했다
// (id3517 "포비 강남점"↔creamlabel_, id4226 "도넛킬러 남양주점"↔milky_kr). 몰은 Naver가 입점 매장 전부에
// 사실상 동일 좌표를 부여해 좌표 게이트가 무력화되고, 기존 게이트가 우리 토큰이 후보 원문에 '부분 포함'되는지만
// 봐 무관 후보의 이름 어딘가에 우리 토큰이 우연히 등장하기만 해도 통과했다. 후보명도 같은 coreTokensDetail
// 엔진으로 식별토큰을 뽑아 '겹치는 식별토큰이 실제로 있는지'까지 요구 + venueOnly(건물명뿐인 식별)나 2자 이하
// 초약체 토큰만 남은 경우엔 전체이름 일치까지 요구해 우연한 부분일치를 근본 차단한다.
function nameMatches(cafeName, areaTerms, candidateName) {
  const { tokens: toks, venueOnly } = coreTokensDetail(cafeName, areaTerms);
  const cand = normName(candidateName);
  const full = normName(cafeName);
  if (toks.length) {
    const candToks = coreTokensDetail(candidateName, areaTerms).tokens;
    const overlap = candToks.length
      ? toks.some((t) => candToks.some((ct) => normName(ct) === normName(t)))
      : toks.some((t) => cand.includes(normName(t)));
    if (!overlap) return false;
    // 몰/밀집매장 다중테넌트 식별(venueOnly)이거나 2자 이하 초약체 토큰뿐이면 겹침만으론 불충분 — 전체이름까지 요구.
    const weak = venueOnly || toks.every((t) => normName(t).length <= 2);
    if (!weak) return true;
    return full.length >= 2 && (cand.includes(full) || full.includes(cand));
  }
  // 식별토큰이 하나도 없는(전부 일반어) 이름은 토큰매칭이 불가하므로 원본 이름 전체 포함으로 대체 판정.
  return full.length >= 2 && (cand.includes(full) || full.includes(cand));
}

async function search(q) {
  const u = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=5`;
  const r = await fetch(u, { headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SECRET } });
  if (r.status === 429) {
    // 초당 버스트 429와 일일 소진 429를 구분(discover.ts와 동일 규칙) — 버스트로 온종일 잠기지 않게.
    const body = await r.text().catch(() => "");
    if (/quota=\d+\/\d+|Query limit|"errorCode"\s*:\s*"010"/i.test(body)) await markNaverExhausted();
    return { quota: true, items: [] };
  }
  if (!r.ok) return { items: [] };
  await bumpNaver(1);
  const d = await r.json();
  return { items: (d.items ?? []).map((it) => ({ name: strip(it.title), link: it.link || "", lat: it.mapy ? Number(it.mapy) / 1e7 : null, lng: it.mapx ? Number(it.mapx) / 1e7 : null })) };
}

await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS ig_checked_at TIMESTAMPTZ`.catch(() => {});
const MAX = Number(process.env.IG_MAX || 200); // 시범 배치 — 소수부터(coordination#188 요청)
let found = 0, none = 0, processed = 0, stop = "";

try {
  while (processed < MAX && !stop) {
    if (await naverBlocked()) { stop = "네이버 한도 차단 — 중단(자동 재개)"; break; }
    // ★ 우선순위 정렬(검증등급·리뷰 많은 순)이라 id 커서를 못 씀 — 처리한 카페는 ig_checked_at으로
    //   WHERE에서 즉시 빠지므로(youtube-backfill과 동일 패턴) 매회 재조회해도 안전.
    const rows = await sql`
      SELECT id, name, area, dong, lat, lng FROM cafes
      WHERE instagram_url IS NULL AND ig_checked_at IS NULL AND published = true AND lat IS NOT NULL
      ORDER BY (synth_grade='검증') DESC, (synth_grade='참고') DESC, synth_count DESC NULLS LAST, id
      LIMIT 20`;
    if (!rows.length) { stop = "인스타 백필 대상 없음 — 완료"; break; }
    for (const c of rows) {
      processed++;
      try {
        const res = await search(`${c.name} ${c.area || ""}`.trim());
        if (res.quota) { stop = "네이버 한도 도달 — 중단(다음날 재개)"; break; }
        // 좌표 근접 + link가 실제 instagram.com + 상호명 코어토큰 일치일 때만 채움 — 좌표만으론
        // 상가밀집지역에서 165m 반경 내 무관 업체(옆가게)가 그대로 채택되는 오염이 발생했다(coord#244/#484).
        const areaTerms = [c.area, c.dong].filter(Boolean);
        const m = res.items.find((it) => it.lat != null && Math.abs(it.lat - c.lat) < 0.0015 && Math.abs(it.lng - c.lng) < 0.0015 && IG_RE.test(it.link) && nameMatches(c.name, areaTerms, it.name));
        if (m) {
          await sql`UPDATE cafes SET instagram_url = ${m.link}, ig_checked_at = now() WHERE id = ${c.id}`;
          found++;
          console.log(`  ✓ ${c.name}: ${m.link}`);
        } else {
          await sql`UPDATE cafes SET ig_checked_at = now() WHERE id = ${c.id}`;
          none++;
        }
      } catch (e) { none++; }
      if (processed % 50 === 0) console.log(`  …진행 ${processed} (발견 ${found}·없음 ${none})`);
      if (processed >= MAX) break;
      await sleep(210);
    }
  }
} catch (e) { stop = "예외 — 중단: " + String(e).slice(0, 60); }

const remain = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE instagram_url IS NULL AND ig_checked_at IS NULL AND published = true`)[0].n;
console.log(stop || "상한 도달");
console.log(`인스타 백필: 발견 ${found} · 없음 ${none} · 처리 ${processed} · 남은 대상 ${remain}`);
await recordRun("instagram-backfill", !stop.startsWith("예외"), stop || `완료(발견 ${found})`, processed);
process.exit(0);
