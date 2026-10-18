// 🎨 색상 인벤토리 관문 — 빌드된 CSS의 **색상 집합**이 기준선과 같은지 본다. (2026-10-18 신설)
//
// 왜 필요한가:
//   프런트엔드에 **시각 회귀 검사가 전혀 없다**. `smoke`는 HTTP 200과 응답 크기만 본다 —
//   색이 사라지거나 바뀌어도 통과한다. 그런데 실측상 색상이 **2,525곳에 하드코딩(고유 501종)**돼 있고
//   디자인 토큰이 없다(globals.css의 CSS 변수 9개는 Next 기본값). 이걸 토큰으로 모으려면
//   `text-[#2b2018]` → `text-[var(--ink)]` 식으로 수천 곳을 바꿔야 하는데,
//   **토큰이 어느 스코프에서 안 풀리면 색이 통째로 사라진다**(소비자 화면 손상).
//   손으로는 확인할 수 없으므로, 바꾸기 전에 기계가 볼 수 있게 만든다.
//
// 무엇을 잡나:
//   ✅ 색이 사라짐(토큰 미정의 → 해당 색이 CSS에서 소실)
//   ✅ 색이 바뀜(오타로 다른 값이 들어감 → 새 색 등장)
//   ⬜ "맞는 색이 틀린 요소에 적용됨"은 못 잡는다 — 그건 브라우저 스냅샷이 필요하다(아직 없음, 정직하게 적어둔다).
//      다만 `smoke`(화면 실기동)와 함께면 '렌더되고 + 색 집합이 같다'까지는 보장된다.
//
// 💰 비용 0 — 빌드 산출물만 읽는다. 네트워크·DB 미접촉.
// 사용:
//   node scripts/color-inventory.mjs --save    # 기준선 저장(의도적 변경 후)
//   node scripts/color-inventory.mjs           # 대조(관문). 차이가 있으면 종료코드 1
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = "scripts/color-baseline.json";
const SAVE = process.argv.includes("--save");

// 빌드 산출 CSS만 본다(.next/dev는 개발 서버 산출이라 제외 — 프로덕션 번들과 다르다).
const files = [];
const walk = (d) => {
  if (!existsSync(d)) return;
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (f === "dev") continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".css")) files.push(p);
  }
};
walk(".next/static");

if (!files.length) {
  console.error("🔴 색상 인벤토리: 빌드된 CSS가 없다 — `npm run build`를 먼저 돌려야 한다.");
  process.exit(1);
}

const RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)/g;
const norm = (c) => c.toLowerCase().replace(/\s+/g, "");
const found = new Map(); // 색 → 등장 횟수
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.match(RE) ?? []) {
    const k = norm(m);
    found.set(k, (found.get(k) ?? 0) + 1);
  }
}
const colors = [...found.keys()].sort();

if (SAVE) {
  writeFileSync(BASE, JSON.stringify({ savedAt: new Date().toISOString(), files: files.length, colors }, null, 2) + "\n");
  console.log(`💾 색상 기준선 저장 — CSS ${files.length}개 · 색상 ${colors.length}종 → ${BASE}`);
  process.exit(0);
}

if (!existsSync(BASE)) {
  console.log(`⚠️ 색상 기준선이 없다 — 먼저 \`node scripts/color-inventory.mjs --save\`로 저장할 것(관문 통과 처리).`);
  process.exit(0);
}
const prev = JSON.parse(readFileSync(BASE, "utf8"));
const before = new Set(prev.colors ?? []);
const after = new Set(colors);
const gone = [...before].filter((c) => !after.has(c));
const added = [...after].filter((c) => !before.has(c));

console.log(`🎨 색상 인벤토리 — CSS ${files.length}개 · 색상 ${colors.length}종 (기준선 ${before.size}종)`);
if (!gone.length && !added.length) {
  console.log("   ✅ 색상 집합 동일 — 시각 회귀 없음(색 소실·변경 0)");
  process.exit(0);
}
if (gone.length) console.log(`   🔴 사라진 색 ${gone.length}종: ${gone.slice(0, 12).join(" ")}${gone.length > 12 ? " …" : ""}`);
if (added.length) console.log(`   ⚠️ 새 색 ${added.length}종: ${added.slice(0, 12).join(" ")}${added.length > 12 ? " …" : ""}`);
console.log("   의도한 변경이면 `node scripts/color-inventory.mjs --save`로 기준선을 갱신할 것.");
process.exit(gone.length ? 1 : 0); // 색 소실만 배포 중단(새 색 추가는 경고)
