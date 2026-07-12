// ♻️ 반영미확인 재검증 공용모듈(#335에서 도입, #336에서 분리) — dev_status='반영미확인'로 남은
//   dev_task를 현재 라이브 HEAD(/api/version) 기준 git ancestor 재확인으로 구제한다.
//   #336: 이 로직이 dev-deploy.mjs 안에서만 있으면, run-dev-deploy.sh의 deploy_approved CNT
//   가드가 CNT<1일 때 dev-deploy.mjs 자체를 아예 호출 안 해 재검증이 죽은 코드가 된다(#311/#327/#328
//   영구 미표시 사고). dev-claim.mjs는 그 CNT 가드와 무관하게 매 클레임 주기 무조건 호출되므로,
//   거기서도 이 함수를 호출해 deploy_approved 대기건이 0이어도 재검증이 계속 돌게 한다.
import { execSync } from "node:child_process";

const ROOT = "/Users/wangwida/coffee-platform";
const git = (c) => execSync(`git -C ${ROOT} ${c}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, LC_ALL: "C", LANG: "C" } }).trim();

export async function reconcileUnverified(sql) {
  const pending = await sql`SELECT id, action_params FROM decisions WHERE action_type='dev_task' AND (action_params->>'dev_status')='반영미확인' AND (action_params->>'sha') IS NOT NULL`;
  if (!pending.length) return;
  let liveSha = null;
  try {
    const r = await fetch("https://dongnecoffeenote.com/api/version", { cache: "no-store" });
    const j = await r.json();
    if (typeof j?.v === "string") liveSha = j.v;
  } catch {}
  if (!liveSha) { console.log("  ⏸ 반영미확인 재검증: /api/version 조회 실패 — 다음 주기 재시도"); return; }
  try { git("fetch origin main -q"); } catch {}
  for (const d of pending) {
    const sha = d.action_params?.sha;
    if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) continue; // 형식 이상 sha는 셸 인자로 넘기지 않음
    const isAncestor = sha === liveSha || (() => { try { git(`merge-base --is-ancestor ${sha} ${liveSha}`); return true; } catch { return false; } })();
    if (!isAncestor) { console.log(`  ⏸ #${d.id} 반영미확인 재검증: 아직 라이브(${liveSha.slice(0, 8)}) 조상 아님 — 유지`); continue; }
    const coord = d.action_params?.coord;
    await sql`UPDATE decisions SET status='done', decided_at=now(), decided_by='CEO',
      result=${`배포완료·반영 재확인(라이브 HEAD=${liveSha.slice(0, 8)})`},
      action_params = action_params || ${JSON.stringify({ dev_status: "deployed" })}::jsonb WHERE id=${d.id}`;
    if (coord) await sql`UPDATE coordination SET status='resolved', resolved_at=now(), stage='완료', resolution=${`개발·배포 완료(#${d.id}, 반영 재확인)`} WHERE id=${Number(coord)}`.catch(() => {});
    console.log(`  ✅ #${d.id} 반영미확인 → 재확인 완료(sha=${sha.slice(0, 8)}가 라이브 ${liveSha.slice(0, 8)}의 조상)`);
  }
}
