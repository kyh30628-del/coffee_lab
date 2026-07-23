// 🚀 개발 배포 워커(결정론·무LLM) — CEO가 '배포' 확정한 dev_task(dev_status='deploy_approved')를
//   브랜치를 main에 merge + push(=Vercel 배포) + /api/version 반영 확인 → decision done · coordination resolved.
//   서버(Vercel)는 배포 못 하므로 로컬에서만. 실패 시 정직히 기록(deploy_failed), main 오염 안 되게 안전 처리.
import { readFileSync, mkdirSync, rmdirSync, existsSync, writeFileSync, appendFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";
import { reconcileUnverified } from "./reconcileUnverified.mjs";
const ROOT = "/Users/wangwida/coffee-platform";
// 메인 레포 git 조작 전역 락(빌드 워커와 레이스 방지). mkdir 원자성.
const GLOCK = "/tmp/coffee-gitrepo.lock";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 🛡️ 스테일 락 자동회수(2026-07-22, 반복 정체 근본차단): 배포 프로세스가 락을 쥔 채 크래시하면 락 디렉토리가
//   누수돼 이후 모든 배포가 영구 "git락 타임아웃"으로 실패한다(실측: 11h+ 스테일락이 #421·#422·#424 정체 유발).
//   실제 배포는 수분 내 끝나므로, 15분+ 오래된 락은 스테일로 간주하고 1회 회수 후 재시도한다(mkdir 원자성이라
//   오탐 회수 후 재경합해도 안전 — 둘 중 하나만 성공).
async function glock() {
  for (let i = 0; i < 200; i++) {
    try { mkdirSync(GLOCK); return true; }
    catch {
      try { if (Date.now() - statSync(GLOCK).mtimeMs > 15 * 60 * 1000) { rmdirSync(GLOCK); continue; } } catch {}
      await sleep(400);
    }
  }
  return false;
}
const gunlock = () => { try { rmdirSync(GLOCK); } catch {} };
const env = readFileSync(`${ROOT}/web/.env.local`, "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
// LC_ALL=C: git 출력을 영어로 고정(로케일 무관 파싱). 결정론적 충돌 감지는 아래 ls-files -u로.
const git = (c) => execSync(`git -C ${ROOT} ${c}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, LC_ALL: "C", LANG: "C" } }).trim();

// 📜 배포 아카이브 — 배포 확정된 dev_task를 커밋 로그 파일에 한 줄씩 미러(조회 전용, UI 없음).
//   dev_task 레코드가 소스오브트루스 → 여기선 그걸 그대로 파일로 append. 배포 커밋 안에 함께 실려 푸시됨.
const ARCHIVE = `${ROOT}/docs/DEV_ARCHIVE.md`;
const ARCHIVE_HEADER = `# 개발 배포 아카이브 (자동 누적)\n\n> dev-deploy 파이프라인이 배포 확정(main merge·push) 시 한 줄씩 자동 append한다. **수동 편집 금지** — dev_task 레코드(decisions)가 소스오브트루스이고 이 파일은 그 미러다.\n> 조회 전용 로그. 컬럼: 배포일시(UTC) · 이슈# · 제목 · 커밋 · risk · 요청요약\n\n| 배포일시(UTC) | 이슈 | 제목 | 커밋 | risk | 요청요약 |\n|---|---|---|---|---|---|\n`;
// 배포건 한 줄 append + 아카이브 커밋 → 새 HEAD 반환(그 HEAD가 실제 배포 sha가 되어 버전확인과 일치).
function archiveDeploy(d, mergeSha) {
  const clean = (s) => String(s ?? "").replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim();
  const ap = d.action_params || {};
  const risk = clean(ap.chat_risk || ap.risk) || "-";
  const req = clean(ap.summary || d.detail || d.title).slice(0, 100);
  const when = new Date().toISOString().replace("T", " ").slice(0, 16);
  const line = `| ${when} | #${d.id} | ${clean(d.title).slice(0, 60)} | ${mergeSha.slice(0, 8)} | ${risk} | ${req} |\n`;
  if (!existsSync(ARCHIVE)) writeFileSync(ARCHIVE, ARCHIVE_HEADER);
  appendFileSync(ARCHIVE, line);
  git("add -- docs/DEV_ARCHIVE.md");
  git(`commit -m "chore(dev-archive): #${d.id} 배포기록"`);
  return git("rev-parse HEAD");
}

// ♻️ 반영미확인 재검증(#335, 공용모듈화는 #336 scripts/reconcileUnverified.mjs 참조) — L74-96
//   반영확인 폴링(최대 3.5분) 타임아웃 시 dev_status='반영미확인'로 찍히면, 아래 메인 쿼리는
//   dev_status='deploy_approved'만 골라 그 행은 영원히 다시 안 걸린다(데드엔드). 실제로는 push가
//   성공해 나중에 라이브 반영됐을 수 있으므로, 현재 라이브 HEAD(/api/version) 기준 git ancestor
//   재확인으로 구제한다. 아직 조상이 아니면(정말 미반영) 성급히 done 처리하지 않고 유지.
try { await reconcileUnverified(sql); } catch (e) { console.log(`  ⚠️ 반영미확인 재검증 중 오류(무시): ${String(e.message || e).slice(0, 120)}`); }

const rows = await sql`SELECT id, title, detail, action_params FROM decisions WHERE action_type='dev_task' AND (action_params->>'dev_status')='deploy_approved' ORDER BY id`;
if (!rows.length) { console.log("배포 대상 없음"); process.exit(0); }

let anyUnverified = false;
for (const d of rows) {
  const br = d.action_params?.branch;
  const coord = d.action_params?.coord;
  console.log(`\n[배포] #${d.id} ${d.title} (${br})`);
  const locked = await glock();
  // merge를 실제로 시작했는지 추적. 병합 이전(사람작업보호 dirty가드·branch없음·git락·fetch 등)에서
  // 던진 에러는 워킹트리를 건드리지 않는다 — 아래 checkout -f/reset --hard는 merge 시작 후에만 도달.
  let mergeStarted = false;
  try {
    if (!locked) throw new Error("git락 타임아웃");
    if (!br) throw new Error("branch 없음");
    // 🛡️ 사람 작업 보호(2026-07-02): 메인 레포에 커밋 안 된 tracked 변경이 있으면 배포 중단.
    //   (아래 checkout -f + reset --hard가 CEO의 로컬 수정을 무경고 삭제하던 구멍. untracked는 reset이 안 지움.)
    const dirty = git("status --porcelain").split("\n").filter((l) => l && !l.startsWith("??"));
    if (dirty.length) {
      const e = new Error(`메인 레포에 커밋 안 된 변경 ${dirty.length}건 — 사람 작업 보호로 배포 중단: ${dirty.slice(0, 3).join(" | ").slice(0, 120)}`);
      e.humanWork = true; // 아래 catch가 이 표식을 보고 워킹트리 파괴(checkout -f/reset --hard) 없이 보류 처리
      throw e;
    }
    git("fetch origin main -q");
    git("checkout -f main");         // -f: 잔여 미스테이지 변경 폐기(위 dirty 가드 통과 후에만 도달)
    git("reset --hard origin/main"); // 원격 main에 정확히 정렬(rebase 실패 회피)
    mergeStarted = true; // 이 지점부터의 실패만 아래 catch의 병합/워킹트리 정리(merge --abort·reset) 대상
    // 🛡️ 커밋 메시지는 execSync 셸문자열이라 제목의 큰따옴표·백틱·$·\ 가 -m "..." 을 깨 배포 전면실패시킴
    //   (2026-07-23 #456 근본원인: 제목 '…"플래그십(스토어)"…' 의 따옴표로 git merge Command failed). 셸 위험문자 제거.
    const safeTitle = String(d.title).slice(0, 60).replace(/["`$\\]/g, "");
    git(`merge --no-ff ${br} -m "deploy: #${d.id} ${safeTitle}\n\nCEO 배포 확정. Co-Authored-By: Claude <noreply@anthropic.com>"`);
    let sha = git("rev-parse HEAD");
    // 📜 배포 아카이브 자동 append(커밋 로그 미러). 아카이브 커밋을 얹은 뒤 그 HEAD를 배포 sha로 확정.
    //   실패해도 배포는 계속 — 워킹트리 오염만 정리(다음 배포 dirty가드 보호).
    try { sha = archiveDeploy(d, sha) || sha; } catch (ae) {
      try { git("checkout -- docs/DEV_ARCHIVE.md"); } catch {}
      console.log(`  ⚠️ 아카이브 append 실패(배포 계속): ${String(ae?.message || ae).slice(0, 90)}`);
    }
    git("push origin main");
    // 배포 반영 확인(최대 ~3.5분)
    let live = false;
    for (let i = 0; i < 14; i++) {
      try {
        const r = await fetch("https://dongnecoffeenote.com/api/version", { cache: "no-store" });
        const j = await r.json(); if (j.v === sha) { live = true; break; }
      } catch {}
      await new Promise((x) => setTimeout(x, 15000));
    }
    // 🛡️ 정직한 종결(2026-07-02): 반영 확인 전엔 done으로 닫지 않는다 — 과거 live=false(예: Vercel 프로덕션
    //   빌드 실패)여도 'deployed·done' 확정 → 프로덕션 미반영인데 추적 주체가 사라지던 구멍.
    if (live) {
      await sql`UPDATE decisions SET status='done', decided_at=now(), decided_by='CEO',
        result=${`배포완료·반영확인 ${br}`},
        action_params = action_params || ${JSON.stringify({ dev_status: "deployed", sha })}::jsonb WHERE id=${d.id}`;
      if (coord) await sql`UPDATE coordination SET status='resolved', resolved_at=now(), stage='완료', resolution=${`개발·배포 완료(#${d.id})`} WHERE id=${Number(coord)}`.catch(() => {});
      try { git(`branch -d ${br}`); } catch { /* 브랜치 삭제 실패 무시 */ }
      console.log(`  ✅ 배포완료·반영확인 ${sha.slice(0, 8)}`);
    } else {
      anyUnverified = true;
      await sql`UPDATE decisions SET result=${`push 완료·프로덕션 반영 미확인(${sha.slice(0, 8)}) — Vercel 빌드 점검 필요`},
        action_params = action_params || ${JSON.stringify({ dev_status: "반영미확인", sha })}::jsonb WHERE id=${d.id}`;
      console.log(`  ⚠️ #${d.id} push됐으나 반영 미확인 — 결재 미종결(추적 유지)`);
    }
  } catch (e) {
    const msg = String(e.message || e);
    // 🛡️ 자기파괴 금지(#221 소실 사고): 병합 이전 단계에서 던진 에러(사람작업보호 dirty가드·branch없음·git락·fetch 등)는
    //   워킹트리를 절대 건드리지 않는다. 과거엔 이 공용 catch가 무조건 checkout -f/reset --hard를 실행 → dirty가드가
    //   "보호" 명목으로 던진 에러를 바로 그 catch가 받아 미커밋 변경을 강제 폐기하는 자기모순으로 실제 작업분이 소실됐다.
    if (!mergeStarted) {
      if (e?.humanWork) {
        // 미커밋 변경으로 보류 — deploy_approved 유지(트리 정리되면 다음 주기에 자동 재배포·자가치유). 워킹트리 무손상.
        await sql`UPDATE decisions SET result=${`배포 보류 — 메인 레포 미커밋 변경 보호(트리 정리 후 자동 재배포): ${msg.slice(0, 90)}`} WHERE id=${d.id}`.catch(() => {});
        console.log(`  ⏸ #${d.id} 사람 작업 보호로 배포 보류(워킹트리 무손상)`);
      } else {
        // 사전조건 실패(branch없음·git락·fetch 등) — 재시도 필요로 정직히 기록. 병합 전이라 정리할 워킹트리 변경 없음.
        await sql`UPDATE decisions SET result=${`배포 전 오류(재시도 필요, 워킹트리 무손상): ${msg.slice(0, 100)}`}, action_params = action_params || '{"dev_status":"배포오류"}'::jsonb WHERE id=${d.id}`.catch(() => {});
        console.log(`  ⚠️ #${d.id} 배포 전 오류(무손상): ${msg.slice(0, 100)}`);
      }
      continue; // finally에서 락 해제 후 다음 태스크로 — 아래 병합/워킹트리 정리 로직으로 흘러가지 않음
    }
    // 🔎 결정론적 충돌 감지: 병합 미해결(unmerged) 파일 존재로 판정 — 로케일·출력스트림 무관.
    //   (git 충돌 문구는 stdout·현지어라 e.message 문자열 매칭으론 못 잡음. 반드시 merge --abort 전에 검사.)
    let conflict = false;
    try { conflict = git("ls-files -u").length > 0; } catch {}
    if (!conflict) conflict = /conflict|충돌|merge failed|병합.*실패|not something we can merge|Automatic merge|자동 병합/i.test(msg);
    try { git("merge --abort"); } catch {}
    try { git("checkout -f main"); git("reset --hard origin/main"); } catch {}
    // ♻️ 병합 충돌 = 오래된 브랜치가 그새 배포된 다른 변경과 겹침 → 실패가 아니라 '최신 기반 자동 재빌드'로 자가치유.
    //   (병렬 브랜치가 같은 파일을 건드릴 때 필연. 재빌드하면 이미 배포된 코드 위에서 다시 구현 → 충돌 소멸.)
    if (conflict && br) {
      try { git(`branch -D ${br}`); } catch {}
      await sql`UPDATE decisions SET result='병합 충돌 → 최신 main 기반 자동 재빌드(잦은 실패 아님, 자가치유)', action_params = action_params - 'dev_status' - 'dev_claimed' - 'branch' WHERE id=${d.id}`.catch(() => {});
      console.log(`  ♻️ #${d.id} 병합충돌 → 재빌드 예약(자가치유)`);
    } else {
      await sql`UPDATE decisions SET result=${`배포 오류(재시도 필요): ${msg.slice(0, 110)}`}, action_params = action_params || '{"dev_status":"배포오류"}'::jsonb WHERE id=${d.id}`.catch(() => {});
      console.log(`  ⚠️ 배포 오류: ${msg.slice(0, 100)}`);
    }
  } finally {
    // 🛡️ 락 소유권(2026-07-02): 내가 획득한 락만 해제 — 과거 glock 타임아웃(=남이 보유 중) 후에도
    //   finally가 무조건 rmdir → 남의 락을 파괴해 빌드/배포 상호배제가 소멸하던 P0(git 레이스 재발 경로).
    if (locked) gunlock();
  }
}
// 반영 미확인 건이 있으면 비정상 종료 → 래퍼 하트비트(ok=false)로 즉시 이슈화·본부 배정.
process.exit(anyUnverified ? 1 : 0);
