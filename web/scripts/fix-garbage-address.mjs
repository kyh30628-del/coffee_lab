// 🩹 address=name 가비지값 타겟 복구 (decisions#1078, 출처 협업#408 §3-A/C — id40319 벨베꼼메·id38333 구하숲).
//
// 근본원인 확인(실측, dev-task-1078): 네이버 지역검색 API 응답 자체가 이 두 곳은 roadAddress 필드에
// 도로명주소 대신 **상호명을 반환**한다(예: {"address":"대구광역시 달성군 다사읍 세천리 159-1 벨베꼼메",
// "roadAddress":"벨베꼼메"}). lib/discover.ts의 `it.roadAddress || it.address` 우선순위가 이 가비지를
// 그대로 채택해 DB에 심었다. 지번(address) 필드는 정상이므로(끝에 상호명이 덧붙은 것만 제거하면 됨),
// 이 스크립트는 roadAddress가 상호명과 같을 때 지번주소로 폴백해 실제 주소를 복구한다.
//   ⚠️ lib/discover.ts의 공용 필드매핑 자체를 고치는 근본조치는 별건(decisions#1080, 적재단계 검증) —
//   여기서는 기존 2개 오염행만 타겟 복구한다(전수 스캔 아님, 최소 스코프).
//
// 판정: localSearch 원시 응답에서 이름 포함매칭 + 좌표 0.01도 이내 근접인 결과를 채택, roadAddress가
//   상호명과 같으면 지번주소(끝의 상호명 접미 제거)로 폴백. 매칭 실패 시 address는 그대로 두고
//   "복구 실패"로만 보고한다 — 비공개 전환은 이 스크립트가 하지 않는다(unpublish는 항상 L3 결재,
//   [[feedback-unpublish-tier-l2-precedent]]).
//   ⚠️ id38333은 복구된 실주소가 "전북특별자치도 장수군"으로 확인됐다 — 서비스 범위 밖 시·도
//   (lib/serviceScope.ts OUT_OF_SCOPE_PREFIXES에 "전북" 포함). 이 스크립트는 주소만 정확히 채우고,
//   범위 밖 공개 처리(비공개 등)는 별도 L3 결재로 상신할 사안이라 손대지 않는다.
//
// 사용: node --import tsx scripts/fix-garbage-address.mjs [--apply]
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const { parseGuArea } = await import("../lib/discover.ts");
const { naverHeaders, markKeyExhausted, NAVER_KEY_COUNT } = await import("../lib/naverKeys.ts");
const { bumpNaver } = await import("../lib/naverBudget.ts");
const { OUT_OF_SCOPE_PREFIXES } = await import("../lib/serviceScope.ts");
const APPLY = process.argv.includes("--apply");

const stripTags = (s) => (s || "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").trim();

// localSearch(lib/discover.ts)와 달리 roadAddress/address를 원본 그대로 둔다 — 가비지 판별에 둘 다 필요.
async function rawLocalSearch(query) {
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&sort=comment`;
  let res = null;
  for (let attempt = 0; attempt < Math.max(1, NAVER_KEY_COUNT); attempt++) {
    const k = naverHeaders();
    if (!k) return null;
    res = await fetch(url, { headers: k.headers });
    if (res.status !== 429) break;
    if (!markKeyExhausted(k.label)) return null;
  }
  if (!res || !res.ok) return null;
  await bumpNaver(1).catch(() => {});
  const data = await res.json();
  return (data.items ?? []).map((it) => ({
    name: stripTags(it.title), address: it.address || "", roadAddress: it.roadAddress || "",
    lat: it.mapy ? Number(it.mapy) / 1e7 : null, lng: it.mapx ? Number(it.mapx) / 1e7 : null,
  }));
}

// 협업#408에서 확정된 대상 2건 — 전수 스캔 아님(garbage_address 센티넬이 이미 전수 커버, 현재 이 2건만 검출).
const TARGET_IDS = [40319, 38333];
const norm = (s) => (s || "").replace(/\s/g, "").toLowerCase();

const rows = await sql`SELECT id, name, area, dong, address, lat, lng, published, synth_grade FROM cafes WHERE id = ANY(${TARGET_IDS})`;
console.log(`${APPLY ? "🟢 실행" : "🔎 드라이런"} — address 가비지값 타겟 복구 ${rows.length}곳`);

const recovered = [], failed = [];
for (const c of rows) {
  const isGarbage = !c.address || c.address === c.name;
  if (!isGarbage) { console.log(`  #${c.id} ${c.name} — 이미 정상 address("${c.address}"), 스킵`); continue; }
  const queries = [`${c.area ?? ""} ${c.name}`.trim(), c.dong ? `${c.dong} ${c.name}`.trim() : "", c.name].filter((q, i, a) => q && a.indexOf(q) === i);
  let picked = null;
  for (const q of queries) {
    const items = await rawLocalSearch(q);
    if (!items) continue; // 쿼터/오류 — 다음 쿼리로
    const nN = norm(c.name);
    const hit = items.find((it) => {
      const nameMatch = norm(it.name).length >= 2 && (norm(it.name).includes(nN) || nN.includes(norm(it.name)));
      const near = c.lat != null && it.lat != null && Math.abs(it.lat - c.lat) < 0.01 && Math.abs(it.lng - c.lng) < 0.01;
      return nameMatch && near;
    });
    if (!hit) continue;
    // roadAddress가 상호명과 같으면(이 사고의 근본원인) 지번주소로 폴백, 끝의 상호명 접미는 제거.
    const roadOk = hit.roadAddress && norm(hit.roadAddress) !== norm(hit.name) && hit.roadAddress.length > 3;
    let addr = roadOk ? hit.roadAddress : hit.address.replace(new RegExp(`\\s*${hit.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "").trim();
    if (addr && addr !== hit.name) picked = addr;
    if (picked) break;
  }
  if (picked) {
    const newArea = parseGuArea(picked) ?? c.area;
    const outOfScope = OUT_OF_SCOPE_PREFIXES.some((p) => picked.startsWith(p));
    recovered.push({ c, address: picked, area: newArea, outOfScope });
    console.log(`  ✅ #${c.id} ${c.name} [${c.published ? "공개" : "비공개"}·${c.synth_grade}] address 복구: "${picked}"${newArea !== c.area ? ` (area도 ${c.area}→${newArea})` : ""}${outOfScope ? "  ⚠️ 서비스 범위 밖 시·도 — 비공개 필요 여부 별도 L3 상신 대상" : ""}`);
  } else {
    failed.push(c);
    console.log(`  ❌ #${c.id} ${c.name} [${c.published ? "공개" : "비공개"}·${c.synth_grade}] — 네이버 재조회로 유효 주소 복구 실패(폐업/개명 의심). address 그대로 둠. 비공개 필요 시 별도 L3 결재 상신 대상.`);
  }
}

if (APPLY && recovered.length) {
  const publishedIds = [];
  for (const { c, address, area } of recovered) {
    await sql`UPDATE cafes SET address=${address}, area=${area}, updated_at=now() WHERE id=${c.id}`;
    if (c.published) publishedIds.push(c.id);
  }
  console.log(`\n✅ ${recovered.length}곳 address 복구 완료`);
  if (publishedIds.length) {
    const { invalidateCafeCaches } = await import("../lib/cafeCacheInvalidate.ts");
    await invalidateCafeCaches(publishedIds).catch(() => {});
    console.log(`   공개 ${publishedIds.length}곳 캐시 무효화 요청 완료`);
  }
}
if (failed.length) console.log(`\n⚠️ 복구 실패 ${failed.length}곳 — 상신 필요(비공개 등 후속 조치는 L3 결재)`);
if (recovered.some((r) => r.outOfScope)) console.log(`⚠️ 복구되었으나 서비스 범위 밖 시·도로 확인된 건 있음 — 비공개 여부는 별도 L3 결재 상신 필요(이 스크립트는 판단하지 않음)`);
