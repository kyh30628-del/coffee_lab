// 🚀 개발 배포 워커(결정론·무LLM) — CEO가 '배포' 확정한 dev_task(dev_status='deploy_approved')를
//   브랜치를 main에 merge + push(=Vercel 배포) + /api/version 반영 확인 → decision done · coordination resolved.
//   서버(Vercel)는 배포 못 하므로 로컬에서만. 실패 시 정직히 기록(deploy_failed), main 오염 안 되게 안전 처리.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";
const ROOT = "/Users/wangwida/coffee-platform";
const env = readFileSync(`${ROOT}/web/.env.local`, "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const git = (c) => execSync(`git -C ${ROOT} ${c}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

const rows = await sql`SELECT id, title, action_params FROM decisions WHERE action_type='dev_task' AND (action_params->>'dev_status')='deploy_approved' ORDER BY id`;
if (!rows.length) { console.log("배포 대상 없음"); process.exit(0); }

for (const d of rows) {
  const br = d.action_params?.branch;
  const coord = d.action_params?.coord;
  console.log(`\n[배포] #${d.id} ${d.title} (${br})`);
  try {
    if (!br) throw new Error("branch 없음");
    git("checkout main");
    git("pull --rebase origin main");
    git(`merge --no-ff ${br} -m "deploy: #${d.id} ${String(d.title).slice(0, 60)}\n\nCEO 배포 확정. Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`);
    const sha = git("rev-parse HEAD");
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
    await sql`UPDATE decisions SET status='done', decided_at=now(), decided_by='CEO',
      result=${`배포완료${live ? "·반영확인" : "(반영 확인중)"} ${br}`},
      action_params = action_params || ${JSON.stringify({ dev_status: "deployed", sha })}::jsonb WHERE id=${d.id}`;
    if (coord) await sql`UPDATE coordination SET status='resolved', resolved_at=now(), stage='완료', resolution=${`개발·배포 완료(#${d.id})`} WHERE id=${Number(coord)}`.catch(() => {});
    try { git(`branch -d ${br}`); } catch { /* 브랜치 삭제 실패 무시 */ }
    console.log(`  ✅ 배포완료${live ? "·반영확인" : ""} ${sha.slice(0, 8)}`);
  } catch (e) {
    try { git("merge --abort"); } catch {}
    try { git("checkout main"); } catch {}
    await sql`UPDATE decisions SET result=${`배포 실패: ${String(e.message || e).slice(0, 120)}`}, action_params = action_params || '{"dev_status":"deploy_failed"}'::jsonb WHERE id=${d.id}`.catch(() => {});
    console.log(`  ❌ 배포 실패: ${String(e.message || e).slice(0, 100)}`);
  }
}
process.exit(0);
