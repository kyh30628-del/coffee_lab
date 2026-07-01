// 🛡️ 개발 스코프 가드 — 에이전트가 태스크 목적과 무관한 '보호 파일'(빌드·의존성·설정·인프라)을 건드렸는지 검사.
//   #64 사고(.ai-paused 작업이 next.config.ts eslint 삭제) 재발 방지. 보호파일 변경은 태스크가 명시적으로 그걸 요구할 때만 허용.
//   사용: node --import tsx dev-scopecheck.mjs <taskId> <file1> <file2> ...  → 출력 "OK" 또는 "VIOLATION: <file> (<이유>)"
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);

// 보호 파일 → 이 변경이 허용되려면 태스크 제목/내용에 있어야 할 키워드(하나라도 있으면 허용)
const PROTECTED = [
  { re: /next\.config/i, kw: ["next.config", "eslint", "ignorebuild", "빌드 설정", "빌드설정", "next 설정"] },
  { re: /package(-lock)?\.json/i, kw: ["package.json", "package-lock", "의존성", "dependency", "패키지", "npm install", "라이브러리 추가"] },
  { re: /tsconfig/i, kw: ["tsconfig", "타입스크립트 설정", "ts 설정", "컴파일 설정"] },
  { re: /(^|\/)\.gitignore/i, kw: ["gitignore", "git 무시", "무시 파일"] },
  { re: /vercel\.(json|ts)/i, kw: ["vercel", "배포 설정", "배포설정"] },
  { re: /(^|\/)\.env/i, kw: ["env", "환경변수", "환경 변수"] },
  { re: /middleware\.ts/i, kw: ["middleware", "미들웨어"] },
  { re: /(^|\/)AGENTS\.md|CLAUDE\.md/i, kw: ["agents.md", "claude.md", "규약", "지침 문서"] },
];

const id = process.argv[2];
const files = process.argv.slice(3).filter(Boolean);
const t = (await sql`SELECT title, detail FROM decisions WHERE id=${id}`)[0] || {};
const ctx = `${t.title || ""} ${t.detail || ""}`.toLowerCase();

for (const f of files) {
  for (const p of PROTECTED) {
    if (p.re.test(f) && !p.kw.some((k) => ctx.includes(k.toLowerCase()))) {
      console.log(`VIOLATION: ${f} (태스크가 이 보호파일 변경을 요구하지 않음 — 스코프 이탈)`);
      process.exit(0);
    }
  }
}
console.log("OK");
