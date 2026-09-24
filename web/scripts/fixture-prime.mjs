// 🧪 픽스처 DB 프라임(선택) — `node --import tsx --import ./scripts/fixture-prime.mjs scripts/fixtures-x.mjs`
//   기본 픽스처는 코드 사전만으로 돈다(결정적). 아침 점검은 이걸 얹어 **DB 학습 사전(learnedTerms·criteriaLists)까지 적용한 상태**로
//   돌린다 — 룰갭 에이전트가 매일 사전을 바꾸므로, 사전 변경이 기존 규칙을 깨는지를 여기서 잡는다(2026-09-24).
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { loadLearnedTerms } = await import("../lib/learnedTerms.ts");
const { loadCriteriaLists } = await import("../lib/criteriaLists.ts");
await loadLearnedTerms(true).catch(() => {}); await loadCriteriaLists().catch(() => {});
