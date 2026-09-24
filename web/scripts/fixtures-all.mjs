#!/usr/bin/env node
// 🛡️ 검증 엔진 회귀 관문(2026-09-24 CEO "검증 엔진은 서비스 핵심 — 엄청 견고하게").
//   왜: 픽스처 9파일이 있었지만 배포 경로 어디에도 연결돼 있지 않았다. 룰갭 에이전트는 매일 사전을 바꾸고
//   dev-agent는 reviewQuality를 고친다 → 어제 막은 오염이 오늘 조용히 다시 열려도 아무도 모른다.
//   이 파일이 하나라도 실패하면 exit 1 → `npm run ship`·dev-deploy 병합 단계가 멈춘다.
//   사용: node scripts/fixtures-all.mjs [--db]   (--db = DB 학습 사전까지 적용해서 — 아침 점검용)
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const DIR = fileURLToPath(new URL(".", import.meta.url));
const FILES = ["fixtures-ads", "fixtures-vendor", "fixtures-foreign-region", "fixtures-branch", "fixtures-selfsource", "fixtures-ighandle", "fixtures-cautions", "fixtures-coherence", "fixtures-area", "fixtures-rulesfp", "test-region-fixtures"];
const DB = process.argv.includes("--db");
const fails = []; let ok = 0;
for (const f of FILES) {
  const args = ["--import", "tsx", ...(DB ? ["--import", `${DIR}fixture-prime.mjs`] : []), `${DIR}${f}.mjs`];
  const r = spawnSync(process.execPath, args, { cwd: `${DIR}..`, encoding: "utf8", timeout: 180_000 });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const line = (out.match(/^.*(픽스처|통과|✅).*$/m) || [""])[0].trim();
  if (r.status === 0) ok++; else fails.push(`${f}: ${(out.match(/^\s*✗.*$/m) || [line || out.slice(-160)])[0].trim().slice(0, 160)}`);
}
console.log(`검증 엔진 회귀 관문${DB ? "(DB 학습사전 적용)" : ""}: ${ok}/${FILES.length} 파일 통과`);
if (fails.length) { console.log("🔴 실패:\n  " + fails.join("\n  ")); process.exit(1); }
