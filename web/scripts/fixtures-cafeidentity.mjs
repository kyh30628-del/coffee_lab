#!/usr/bin/env node
// ☕ '커피 정체성 0' 관문 어휘 픽스처(09-24) — 어휘가 빠지면 멀쩡한 디저트 가게가 noise(영구 비공개)로 떨어진다.
//   실사고: '요거트·그릭'이 없어 메종드그릭(검증 64건)·레이지요거트·요거트빌리지 등 12곳이 noise.
//   synthStore.ts는 DB를 끌고 오므로 import하지 않고 소스에서 정규식만 꺼내 검사한다.
//   사용: node scripts/fixtures-cafeidentity.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../lib/synthStore.ts", import.meta.url), "utf8");
const m = src.match(/export const CAFE_BELONGS = \/(.+)\/;/);
if (!m) { console.log("✗ CAFE_BELONGS 정의를 못 찾음"); process.exit(1); }
const RE = new RegExp(m[1]);
// [인용, 기대(카페 정체성 있음)]
const CASES = [
  ["요거트가족 광명점, 광명사거리역 그릭요거트 맛집 추천 근처의 요거트가족 광명점을 찾아갔어요.", true],
  ["레이지요거트 강남점 토핑 가득 올려서 먹었는데 너무 맛있었어요", true],
  ["요구르트 아이스크림 달달하고 상큼해요", true],
  ["아메리카노 한 잔 하고 왔어요", true],
  ["강릉 가챠샵 '이로이로스모모' 방문 후기 첨보는 캐릭터 가챠샵을 발견했다.", false],
  ["킥복싱 체험 수업 받고 왔습니다 관장님 친절", false],
];
let fail = 0;
for (const [q, want] of CASES) { const got = RE.test(q); if (got !== want) { fail++; console.log(`  ✗ ${q.slice(0, 40)} 기대 ${want} 실제 ${got}`); } }
console.log(`커피 정체성 어휘 픽스처: ${CASES.length - fail}/${CASES.length} 통과`);
if (fail) process.exit(1);
