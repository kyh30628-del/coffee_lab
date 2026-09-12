// 🧹 스크래치 조사 스크립트 자동청소 — cron-costwatch 반복 재경보(#1036 구현불가 오판·#1041 스코프이탈
//   반려 후 #1058로 재상신)의 물리적 원인 수리.
//   cron-costwatch(app/api/cron-costwatch/route.ts)는 Vercel 함수라 DB 전송량·가동시간만 보고,
//   로컬 워크트리의 미추적 스크래치 파일(tmp_*.js·_dg_*.cjs 등)엔 애초에 접근할 수 없다 —
//   09-08·09-09·09-10·09-12 네 차례 경보의 실제 원인은 그 파일들이 web/ 루트에 누적된 것.
//   이 스크립트는 그 파일들을 결정론으로 청소하는 별도의 로컬 잡이다(로컬 launchd/agents 러너에
//   등록해 주기 실행 — 이 워크트리엔 agents/ 러너가 없어 여기서는 등록하지 않음, 등록은 후속 작업).
//
//   사용법: node scripts/janitor-scratch.mjs [--dry-run]
//     --dry-run: 삭제하지 않고 삭제 대상만 로그로 출력(검증용).
import { execFileSync } from "node:child_process";
import { statSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";

// 대상 패턴 — decisions#1058 명시 범위. 이 외 파일은 절대 건드리지 않는다.
const SCRATCH_RE = /^(tmp_[^/]*\.(js|cjs)|_dg_[^/]*\.cjs|_rt_[^/]*|_rg_[^/]*|_redteam_[^/]*|_rulegap_[^/]*)$/;
const MIN_AGE_MS = 12 * 60 * 60 * 1000; // 12시간 — 방금 만든 조사 스크립트 오삭제 방지
const EXCLUDE_PREFIX = "scripts/tmp/"; // 이미 gitignore·컨벤션 정착 영역(web/AGENTS.md) — 대상 제외

function assertWebRoot() {
  // web/ 루트가 아니면(잘못된 cwd에서 실행) 아무것도 하지 않는다 — 다른 디렉토리의 미추적 파일 오삭제 방지.
  if (!existsSync(path.join(process.cwd(), "package.json")) || !existsSync(path.join(process.cwd(), "app"))) {
    console.error("janitor-scratch: web/ 루트에서 실행해야 함 (package.json·app/ 미확인) — 중단");
    process.exit(1);
  }
}

function listUntracked() {
  const out = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
}

function main() {
  assertWebRoot();
  const dryRun = process.argv.includes("--dry-run");
  const now = Date.now();
  const files = listUntracked();

  let deleted = 0;
  let skippedYoung = 0;
  for (const rel of files) {
    if (rel.startsWith(EXCLUDE_PREFIX)) continue;
    const base = path.basename(rel);
    if (!SCRATCH_RE.test(base)) continue;

    let st;
    try {
      st = statSync(rel);
    } catch {
      continue; // 이미 없어짐
    }
    const ageH = (now - st.mtimeMs) / 3600000;
    if (ageH < MIN_AGE_MS / 3600000) {
      skippedYoung++;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] 삭제대상: ${rel} (age ${ageH.toFixed(1)}h)`);
    } else {
      try {
        unlinkSync(rel);
        console.log(`삭제됨: ${rel} (age ${ageH.toFixed(1)}h)`);
      } catch (e) {
        console.log(`건너뜀(오류): ${rel} — ${e}`);
        continue;
      }
    }
    deleted++;
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}janitor-scratch: ${deleted}개 ${dryRun ? "삭제대상" : "삭제"}, ${skippedYoung}개 12h 미만 보류`
  );
}

main();
