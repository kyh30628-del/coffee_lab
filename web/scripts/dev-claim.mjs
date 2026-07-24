// 개발 태스크 원자적 클레임 — stale 'building' 리셋 후, 승인·미빌드 태스크를 최대 K건 'building'으로 잠그고 id 출력.
//   병렬 디스패처가 각 id를 별도 워크트리 에이전트에 배정(중복 방지). 사용: node --import tsx dev-claim.mjs <K>
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { reconcileUnverified } from "./reconcileUnverified.mjs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const K = Math.max(1, Math.min(6, Number(process.argv[2] || 3)));

// ♻️ 반영미확인 재검증(#336): dev-deploy.mjs는 run-dev-deploy.sh의 deploy_approved CNT 가드가
//   0일 때 아예 호출 안 돼 재검증이 죽은 코드가 되는 blind spot이 있었다(#311/#327/#328 영구 미표시).
//   dev-claim.mjs는 그 가드와 무관하게 매 클레임 주기 무조건 실행되므로 여기서도 재검증한다.
try { await reconcileUnverified(sql); } catch (e) { console.error(`  ⚠️ 반영미확인 재검증 중 오류(무시): ${String(e.message || e).slice(0, 120)}`); }

// 1) stale 'building'(120분+ 미완) → 미빌드로 리셋(재시도 가능)
//    (2026-07-02: 30분→120분 — 긴 빌드가 30분을 넘기면 동일 태스크가 재클레임돼 두 워커가 같은
//     워크트리를 부수던 레이스. 진짜 크래시는 2시간 뒤 재시도로 정직하게.)
await sql`UPDATE decisions SET action_params = action_params - 'dev_status' - 'dev_claimed'
  WHERE action_type='dev_task' AND status='approved' AND action_params->>'dev_status'='building'
    AND (action_params->>'dev_claimed')::timestamptz < now() - interval '120 minutes'`.catch(() => {});
// 2) 최대 K건 원자적 클레임 — 🛡️ CEO가 직접 승인(decided_by='CEO')한 dev_task만(자가승인 착수 차단, 2026-07-02)
const rows = await sql`UPDATE decisions SET action_params = action_params || jsonb_build_object('dev_status','building','dev_claimed', now()::text)
  WHERE id IN (
    SELECT id FROM decisions WHERE action_type='dev_task' AND status='approved' AND decided_by='CEO' AND (action_params->>'dev_status') IS NULL
    ORDER BY id LIMIT ${K} FOR UPDATE SKIP LOCKED
  ) RETURNING id`.catch(() => []);
console.log(rows.map((r) => r.id).join(" "));
