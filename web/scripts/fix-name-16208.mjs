// 협업 #190(레드팀) / decisions #354: id16208 표시명 정정.
//   "김포공항플레이보6 트윗젤"은 파싱 손상이 아니라 네이버 지역검색 원문 그대로(라이브 재확인 완료) —
//   김포공항역(방화동886) 플레이보6 구역에 입점한 트윗젤 지점의 실제 POI 상호명.
//   국내선청사 3층의 "트윗젤 김포공항점"(별개 주소·별개 지점)과는 다른 업체이므로 병합 금지.
//   표시명만 가독성 정정("김포공항플레이보6" → "김포공항 플레이보6" 띄어쓰기 삽입) — 식별 토큰·리뷰 매칭엔 무영향.
// 사용: node --import tsx scripts/fix-name-16208.mjs        (dry-run, 기본)
//      APPLY=1 node --import tsx scripts/fix-name-16208.mjs (실제 UPDATE)
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const APPLY = process.env.APPLY === "1";

const ID = 16208;
const OLD_NAME = "김포공항플레이보6 트윗젤";
const NEW_NAME = "김포공항 플레이보6 트윗젤";
const EXPECT_ADDRESS = "서울특별시 강서구 하늘길 77 김포공항역";

async function naverConfirm() {
  const nid = process.env.NAVER_CLIENT_ID, sec = process.env.NAVER_CLIENT_SECRET;
  if (!nid || !sec) { console.log("⚠️ 네이버 키 미설정 — 라이브 재확인 생략, 저장된 근거로만 진행"); return true; }
  const r = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent("김포공항 트윗젤")}&display=5`, {
    headers: { "X-Naver-Client-Id": nid, "X-Naver-Client-Secret": sec },
  });
  if (!r.ok) { console.log("⚠️ 네이버 API 오류", r.status, "— 라이브 재확인 생략, 저장된 근거로만 진행"); return true; }
  const items = (await r.json()).items || [];
  const strip = (s) => (s || "").replace(/<[^>]+>/g, "");
  const hit = items.find((it) => strip(it.title) === OLD_NAME && strip(it.roadAddress) === EXPECT_ADDRESS);
  if (!hit) { console.log("✗ 네이버 원문과 불일치 — 정정 보류(안전을 위해 중단)"); return false; }
  console.log("✓ 네이버 라이브 재확인: 원문 일치(", strip(hit.title), strip(hit.roadAddress), ")");
  return true;
}

const [row] = await sql`SELECT id, name, address FROM cafes WHERE id = ${ID}`;
if (!row) { console.log(`✗ id=${ID} 카페 없음 — 종료`); process.exit(1); }
if (row.name !== OLD_NAME) { console.log(`ⓘ 이미 정정됐거나 이름이 다름(현재: "${row.name}") — 변경 없음`); process.exit(0); }
if (row.address !== EXPECT_ADDRESS) { console.log(`✗ 주소 불일치(현재: "${row.address}") — 안전을 위해 중단`); process.exit(1); }

const ok = await naverConfirm();
if (!ok) process.exit(1);

console.log(`${APPLY ? "[적용]" : "[dry-run]"} id=${ID}: "${row.name}" → "${NEW_NAME}"`);
if (APPLY) {
  await sql`UPDATE cafes SET name = ${NEW_NAME} WHERE id = ${ID} AND name = ${OLD_NAME}`;
  console.log("→ 완료(표시명만 변경, 발굴 place_id·좌표·리뷰 근거는 무변).");
} else {
  console.log("→ dry-run. APPLY=1로 실제 적용.");
}
