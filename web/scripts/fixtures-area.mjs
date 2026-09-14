#!/usr/bin/env node
// 🗺️ 위반 픽스처 — 적재 단계 주소 시·도 검증(결재 #1080). 배포 전 필수 통과.
//   여기 있는 주소들은 전부 **실제로 오적재됐던 것**이다. 규칙을 고칠 때 이 파일을 먼저 돌린다.
//   실행: node --import tsx scripts/fixtures-area.mjs
const { parseGuArea, addressSidoScope } = await import("../lib/discover.ts");

const CASES = [
  // [주소, 기대 scope, 기대 area(null=판정하지 않음)]
  // ── 🔴 실제 오적재 사례(2026-09-14 실측 300곳) ──
  ["광주광역시 서구 운천로 213 1층 102호", "out", null],          // → 'ë€êµ¬ ìœê µ¬'로 찍혔었다
  ["광주광역시 광산구 수완로50번길 42-2", "out", null],            // → '광주시'(경기)로 찍혔었다
  ["울산광역시 남구 삼산로 287", "out", null],                    // → '부산 남구'/'대구 남구'로 흔들렸다
  ["전라남도 목포시 평화로 5", "out", null],                      // → '의정부시'로 찍혔었다
  ["제주특별자치도 제주시 구좌읍", "out", null],                    // → '군포시'로 찍혔었다
  ["전북특별자치도 익산시 무왕로", "out", null],
  // ── ⚠️ 경기도 광주시는 **범위 안**이다. '광주'를 통째로 막으면 정반대 사고가 난다 ──
  ["경기도 광주시 오포읍 계원대학로", "in", "광주시"],
  // ── 동명 구(區) 충돌: 시·도를 먼저 읽어 갈라야 한다 ──
  ["서울특별시 서구 없음", "in", null],                           // 서울엔 서구가 없다 → 단정하지 않는다
  ["대전광역시 서구 둔산로", "in", "대전 서구"],
  ["부산광역시 서구 구덕로", "in", "부산 서구"],
  ["대구광역시 서구 달구벌대로", "in", "대구 서구"],
  ["인천광역시 서해구 청라동", "in", "인천 서해구"],
  ["서울특별시 중구 퇴계로85길 41", "in", "중구"],
  ["부산광역시 중구 광복로", "in", "부산 중구"],
  // ── 권역 편입으로 소급해 틀려졌던 것(경북 편입 전 적재분) ──
  ["경상북도 경주시 원효로 77", "in", "경주시"],
  // ── 비표준 접두사(실측 108건) ──
  ["전남광주통합특별시 여수시 화양면", "out", null],
];

let pass = 0; const fail = [];
for (const [addr, wantScope, wantArea] of CASES) {
  const sc = addressSidoScope(addr).scope;
  const area = parseGuArea(addr);
  const okScope = sc === wantScope;
  const okArea = wantArea === null ? area === null : area === wantArea;
  if (okScope && okArea) pass++;
  else fail.push(`  ✗ "${addr}"\n      scope 기대 ${wantScope} · 실제 ${sc}\n      area  기대 ${wantArea} · 실제 ${area}`);
}
console.log(`주소 시·도 픽스처: ${pass}/${CASES.length} 통과`);
if (fail.length) { console.log(fail.join("\n")); process.exit(1); }
console.log("✅ 범위 밖 7종 차단 · 경기 광주시 보호 · 동명 구 6종 분리 · 소급 사례 1종 모두 통과");
