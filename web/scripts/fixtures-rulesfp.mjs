#!/usr/bin/env node
// 🧬 규칙 지문 정규화 위반 픽스처 — 배포 전 필수 통과.
//   지문은 "판정 로직이 바뀌었나"를 답해야 한다. 주석을 고쳤다고 전수 재검(27,500곳)이 돌면 안 되고,
//   로직을 고쳤는데 지문이 그대로면 **규칙 변경이 영영 안 퍼진다**(이쪽이 훨씬 위험).
//   실행: node --import tsx scripts/fixtures-rulesfp.mjs
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const { normalizeRuleSource } = await import("../lib/rulesFingerprint.ts");
const H = (s) => createHash("sha1").update(normalizeRuleSource(s)).digest("hex").slice(0, 16);

const CASES = [];
const eq = (label, a, b, want) => CASES.push({ label, same: H(a) === H(b), want });

// ── 1) 주석만 바뀌면 지문은 그대로여야 한다(이번 변경의 목적) ──
eq("전체줄 주석 추가", `const AD = /협찬/i;`, `// 왜 이렇게 했는지 설명\nconst AD = /협찬/i;`, true);
eq("주석 내용 수정", `// 옛 설명\nconst X = 1;`, `// 새 설명 — 길게 근거를 적었다\nconst X = 1;`, true);
eq("블록 주석 추가", `const X = 1;`, `/*\n * 여러 줄\n * 설명\n */\nconst X = 1;`, true);
eq("빈 줄·들여쓰기 변화", `const X = 1;\n\n\nconst Y = 2;`, `const X = 1;\nconst Y = 2;`, true);

// ── 2) 🔴 로직이 바뀌면 지문은 반드시 달라져야 한다(놓치면 규칙이 안 퍼진다) ──
eq("정규식 어휘 추가", `const AD = /협찬/i;`, `const AD = /협찬|리뷰이벤트/i;`, false);
eq("임계값 변경", `const N = 200;`, `const N = 350;`, false);
eq("조건 반전", `if (a && b) x();`, `if (a || b) x();`, false);
eq("한 글자 차이", `const G = "검증";`, `const G = "참고";`, false);

// ── 3) 문자열·정규식 안의 // 는 절대 손대면 안 된다(순진한 제거기가 여기서 깨진다) ──
eq("URL 문자열 보존", `const U = "https://a.com/x";`, `const U = "https://a.com/y";`, false);
eq("정규식 내 슬래시", String.raw`const R = /https?:\/\//;`, String.raw`const R = /ftp:\/\//;`, false);
eq("줄 끝 주석은 코드줄이라 유지", `const X = 1; // 설명`, `const X = 2; // 설명`, false);
eq("템플릿 리터럴 내용", "const q = `SELECT a\n FROM t`;", "const q = `SELECT b\n FROM t`;", false);

let pass = 0; const fail = [];
for (const c of CASES) {
  if (c.same === c.want) pass++;
  else fail.push(`  ✗ ${c.label}: 지문이 ${c.same ? "같음" : "다름"} · 기대 ${c.want ? "같음" : "다름"}`);
}

// ── 4) 실제 규칙 파일에서 '지워지는 줄'이 정말 주석뿐인지 확인 ──
const FILES = ["lib/reviewQuality.ts", "lib/synthStore.ts", "lib/discover.ts", "lib/criteriaListsBase.ts",
  "lib/collectOrchestrator.ts", "lib/adTemplate.ts", "lib/competitorQuote.ts"];
const CODEY = /\b(const|let|var|function|return|if|else|await|export|import|sql`|=>)\b|[;{}()]\s*$/;
let suspicious = [];
for (const f of FILES) {
  const src = readFileSync(f, "utf8");
  const kept = new Set(normalizeRuleSource(src).split("\n"));
  for (const line of src.split("\n")) {
    const t = line.trim();
    if (!t || kept.has(t)) continue;
    if (!/^(\/\/|\/\*|\*)/.test(t) && CODEY.test(t)) suspicious.push(`${f}: ${t.slice(0, 70)}`);
  }
}
console.log(`규칙 지문 픽스처: ${pass}/${CASES.length} 통과`);
if (fail.length) console.log(fail.join("\n"));
console.log(`실제 규칙 파일 7개에서 '주석이 아닌데 지워진 줄': ${suspicious.length}건`);
for (const s of suspicious.slice(0, 5)) console.log(`   ⚠️ ${s}`);
if (fail.length || suspicious.length) process.exit(1);
console.log("✅ 주석변경=불변 4종 · 로직변경=변동 4종 · 문자열/정규식 보존 4종 · 실파일 오삭제 0건");
