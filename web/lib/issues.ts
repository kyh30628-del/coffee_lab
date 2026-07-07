import { sql } from "./db";
import { nameCoherence, cleanCafeName } from "./reviewQuality";
import { healNonCafeCategory, healOffConceptByReview, healRestaurantByReview, healNonCafeByReview, healOutOfBox, healAreaLabel } from "./synthStore";
import { pushTrigger } from "./auditTrigger";
import { teamOf, RETIRED_JOBS } from "./jobTeams";
import { invalidateCafeCaches } from "./cafeCacheInvalidate";

const parseRv = (o: any): string[] => {
  let a = o; if (typeof a === "string") { try { a = JSON.parse(a); } catch { return []; } }
  const arr = Array.isArray(a) ? a : (a?.reviews ?? []);
  return arr.map((x: any) => x?.quote || x?.title || x?.text || "").filter(Boolean);
};

// 🔧 자동 교정 — 탐지된 오염을 결정론으로 *스스로 처리*한다(매 30분 cron-issues). 사람·배치 안 기다림.
//   audit_flags·offctx 각 카페를 cleanCafeName 일치율로 판정: 진짜 카페(오탐)=자동 정리, 진짜 오염=비공개 결재 자동 상신.
//   → 대시보드 오염이 무인으로 *줄어들고*, CEO 손이 필요한 것만 결재로 올라온다.
export async function autoCorrect(): Promise<{ resolved: number; escalated: number; log: string[] }> {
  const log: string[] = []; let resolved = 0, escalated = 0;
  // 🔄 상시 결정론 해결 — 배치(2h heal·daily rulegap)를 안 기다리고, 탐지 패스(cron-issues 30분 + 대시보드 로드)마다
  //   즉시 종결한다. 대표님: "개별 이슈는 즉시 실행. 왜 배치주기를 기다리냐." → 결정론 해결을 탐지 시점에 합침.
  //   배치 크론은 전체 리프레시 백스톱으로 유지(이중 안전망). 결정론·무료·멱등이라 자주 돌려도 안전.
  try { const nc = await healNonCafeCategory(); if (nc.held) { resolved += nc.held; if (log.length < 8) log.push(`비카페 카테고리 ${nc.held}곳 즉시 비공개`); } } catch { /* graceful */ }
  try { const oc = await healOffConceptByReview(); if (oc.held) { resolved += oc.held; if (log.length < 8) log.push(`오프콘셉(활동공간) ${oc.held}곳 즉시 비공개`); } } catch { /* graceful */ }
  try { const rs = await healRestaurantByReview(); if (rs.held) { resolved += rs.held; if (log.length < 8) log.push(`식당 ${rs.held}곳 즉시 비공개`); } } catch { /* graceful */ }
  try { const nx = await healNonCafeByReview(); if (nx.held) { resolved += nx.held; if (log.length < 8) log.push(`비카페(커피정체성0) ${nx.held}곳 즉시 비공개: ${nx.names.slice(0, 3).join(", ")}`); } } catch { /* graceful */ }
  // 정합성도 같은 실시간 경로로 — 박스밖(비수도권)·area라벨 오류를 2시간 배치 대신 여기서 즉시 교정.
  try { const ob = await healOutOfBox(); if (ob.excluded) { resolved += ob.excluded; if (log.length < 8) log.push(`수도권밖 ${ob.excluded}곳 즉시 제외`); } } catch { /* graceful */ }
  try { const al = await healAreaLabel(); if (al.fixed) { resolved += al.fixed; if (log.length < 8) log.push(`area라벨 ${al.fixed}곳 즉시 교정`); } } catch { /* graceful */ }
  // 🟢 L2 전결(기획조정실장 권한) — 결정론 액션은 다음 사이클(≤10분)에 자동 승인. CEO 트리거 불필요(오탐·오염 수정=L2 전결).
  //   L3(CEO 전용)는 절대 자동승인 안 함(아래 환원 가드가 지킴). 실무형(agent_task·investigate)도 제외 — 진짜 작업 필요.
  try {
    const l2 = (await sql`UPDATE decisions SET status='approved', decided_at=now(), decided_by='기조실장(전결)', result='L2 전결 자동승인'
      WHERE status='pending' AND tier='L2' AND action_type='unpublish' RETURNING id`.catch(() => [])) as any[];
    if (l2.length) { if (log.length < 8) log.push(`L2 전결 자동승인 ${l2.length}건(#${l2.map((r) => r.id).join(",")})`); }
  } catch { /* graceful */ }
  // 🔧 승인된 '결정론 집행' 결정을 그 자리에서 실집행+done — 집행 루프 닫기(더는 '처리중'으로 안 쌓임).
  //   action_type='unpublish'(ids 명시)만 자동집행. agent_task·investigate(구현·판단 필요)는 자동집행 안 하고 OUTSTANDING으로 정직 표시.
  //   🛡️ 집행 자격 검증(2026-07-02 감사): L2(기조실장 전결) 또는 decided_by='CEO'인 승인만 집행.
  //   과거엔 approved+unpublish면 tier·승인자 무검증 집행 → 에이전트 자가승인 L3도 실집행되던 구멍.
  try {
    const dec = (await sql`SELECT id, action_params FROM decisions WHERE status='approved' AND action_type='unpublish'
      AND (COALESCE(tier,'L3')='L2' OR decided_by='CEO')`.catch(() => [])) as any[];
    for (const d of dec) {
      const ids = Array.isArray(d.action_params?.ids) ? d.action_params.ids : [];
      if (ids.length) {
        await sql`UPDATE cafes SET published=false, pipeline_status='excluded' WHERE id = ANY(${ids})`.catch(() => {});
        await invalidateCafeCaches(ids.map(Number)).catch(() => {}); // DB+CDN+ISR 전 레이어 즉시 반영
      }
      await sql`UPDATE decisions SET status='done', result='auto-executed', decided_at=now() WHERE id=${d.id}`.catch(() => {});
      resolved++; if (log.length < 8) log.push(`승인결정 즉시집행 #${d.id}(${ids.length}곳 비공개)`);
    }
  } catch { /* graceful */ }
  // 🛑 L3 자가승인 환원(2026-06-30, 재발방지 / 2026-07-02 전 action_type 확대): L3는 *오직 CEO*(모바일=decided_by 'CEO')만 승인.
  //   에이전트가 L3를 'approved'로 자가승인하면 pending으로 되돌려 CEO 결재로(정직). CEO 승인분은 보존.
  //   (과거 agent_task/investigate만 커버 → unpublish/dev_task 자가승인이 안 걸리던 구멍. DB 실측: L3 unpublish done 19건 중 14건 decided_by≠CEO.)
  try {
    const rev = (await sql`UPDATE decisions SET status='pending'
      WHERE status='approved' AND COALESCE(tier,'L3')='L3'
        AND COALESCE(decided_by,'') <> 'CEO' RETURNING id`.catch(() => [])) as any[];
    if (rev.length) { if (log.length < 8) log.push(`L3 자가승인 ${rev.length}건 → CEO 결재로 환원(#${rev.map((r) => r.id).join(",")})`); }
  } catch { /* graceful */ }
  // 대상: 미해결 audit_flags(근거오염) + offctx 높은 공개 카페
  const targets = (await sql`
    SELECT DISTINCT c.id, c.name, c.area, c.synth_reviews
    FROM cafes c
    WHERE c.published AND (
      EXISTS (SELECT 1 FROM audit_flags a WHERE a.cafe_id=c.id AND a.issue!='audit_complete' AND NOT COALESCE(a.resolved,false))
      OR (c.offctx_rate >= 0.55 AND NOT COALESCE(c.offctx_ok,false))
    ) LIMIT 40`.catch(() => [])) as any[];
  for (const c of targets) {
    const q = parseRv(c.synth_reviews); if (q.length < 3) continue;
    const coh = nameCoherence(cleanCafeName(c.name), q, [c.area]);
    if (coh >= 0.5) {
      // 진짜 카페(오탐) → 자동 정리: 플래그 해소 + offctx 화이트리스트
      await sql`UPDATE audit_flags SET resolved=true WHERE cafe_id=${c.id} AND NOT COALESCE(resolved,false)`.catch(() => {});
      await sql`UPDATE cafes SET offctx_ok=true WHERE id=${c.id}`.catch(() => {});
      resolved++; if (log.length < 8) log.push(`오탐정리 ${c.name}(${Math.round(coh * 100)}%)`);
    } else if (coh < 0.35) {
      // 진짜 오염 → 비공개 결재 자동 상신(중복방지). CEO 한 번 승인하면 비공개.
      const ik = `autopollute:${c.id}`;
      // 🛑 중복방지에 rejected·done·deferred 포함(2026-07-02): 과거 pending/approved만 검사해
      //   CEO가 **반려**해도 다음 사이클 재상신→L2 자동승인→자동집행으로 반려가 1분 만에 뒤집힘(#49→#50 실사고).
      //   CEO가 한 번 결정한 카페는 재상신하지 않는다(cron-rulegap 레일과 동일 기준).
      const dup = (await sql`SELECT 1 FROM decisions WHERE action_params->>'ikey'=${ik} AND status IN('pending','approved','done','rejected','deferred') LIMIT 1`.catch(() => [])) as any[];
      if (!dup.length) {
        await sql`INSERT INTO decisions (title,detail,team,severity,tier,action_type,action_params,recommendation)
          VALUES (${`[자동] 오염 카페 비공개 — ${c.name}`.slice(0, 110)}, ${`근거오염 자동탐지: 노출후기가 실제 그 카페를 거의 안 말함(cleanName 일치율 ${Math.round(coh * 100)}%).`}, '품질본부', 'HIGH', 'L2', 'unpublish', ${JSON.stringify({ ids: [c.id], ikey: ik })}::jsonb, ${`명백 오염(일치율 ${Math.round(coh * 100)}%) — 기조실장 전결로 다음 사이클 자동 비공개. 노출후기가 다른 카페를 가리켜 실손실 없음.`})`.catch(() => {});
        escalated++; if (log.length < 8) log.push(`오염→결재상신 ${c.name}(${Math.round(coh * 100)}%)`);
      }
    }
    // 0.35~0.5 = 애매 → 레드팀 판단(그대로)
  }
  // 🤝 협업 생애주기도 매 사이클 굴린다(요청→조율→기한→지연 재상신). 결정론 백본.
  try { const cl = await coordinationLifecycle(); resolved += cl.routed; escalated += cl.overdue; for (const m of cl.log) if (log.length < 10) log.push(m); } catch { /* graceful */ }
  return { resolved, escalated, log };
}

// 🤝 협업 생애주기(결정론 백본) — 요청(open) → 조율(기조실장 배정·기한) → [받은 팀 에이전트가 수신확인·조치·완료] → 지연 시 재상신.
//   에이전트가 '넘기고 끝'이던 걸(open 방치) 매끄러운 흐름으로: 기한 부여 + 과기한 자동 재상신(담당 에이전트 이벤트 기동).
//   stage: 요청 → 조율 → 수신확인 → 완료 / 지연. 실제 조치는 담당 팀 에이전트(수신확인·resolved), 여긴 흐름·기한·재촉만.
export async function coordinationLifecycle(): Promise<{ routed: number; overdue: number; log: string[] }> {
  const log: string[] = []; let routed = 0, overdue = 0;
  await sql`ALTER TABLE coordination ADD COLUMN IF NOT EXISTS stage TEXT`.catch(() => {});
  await sql`ALTER TABLE coordination ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ`.catch(() => {});
  await sql`ALTER TABLE coordination ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ`.catch(() => {});
  await sql`ALTER TABLE coordination ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ`.catch(() => {});
  // 1) 요청 → 조율: 신규/미배정 open에 기한 부여(기조실장 결정론 라우팅). help=6h·cowork=12h·handoff/기타=24h.
  const r = (await sql`UPDATE coordination
    SET stage='조율',
        due_at = created_at + (CASE type WHEN 'help' THEN interval '6 hours' WHEN 'cowork' THEN interval '12 hours' ELSE interval '24 hours' END)
    WHERE status IN ('open','in_progress') AND due_at IS NULL RETURNING id`.catch(() => [])) as any[];
  routed = r.length; if (routed && log.length < 6) log.push(`협업 ${routed}건 조율·기한배정`);
  // 2) 과기한 미해결 → '지연'으로 재상신 + 담당 에이전트 이벤트 기동(재촉). 이미 지연표시된 건 debounce(pushTrigger 동일 kind+ref 스킵).
  //   ⚠️ CEO 게이트 계류(CEO결재·CEO정체판단)는 '지연'이 아니다(2026-07-02) — 결재 대기가 정상 상태인데
  //   지연으로 강등하면 재촉 트리거+이슈 이중분류로 3분면이 오염된다.
  const od = (await sql`UPDATE coordination SET stage='지연', escalated_at=now()
    WHERE status IN ('open','in_progress') AND due_at < now() AND escalated_at IS NULL
      AND COALESCE(stage,'') NOT IN ('CEO결재','CEO정체판단')
    RETURNING id, to_team, topic`.catch(() => [])) as any[];
  for (const c of od) await pushTrigger("coord_overdue", String(c.id), `협업 지연 #${c.id} → ${c.to_team || "미배정"}: ${String(c.topic || "").slice(0, 60)}`, "MED").catch(() => {});
  overdue = od.length; if (overdue && log.length < 6) log.push(`협업 지연 ${overdue}건 재상신(담당 재촉)`);
  // 3a) 순수 데이터 조작(재합성·큐·grounding 등, 코드 아님) → 운영본부 자율 처리로 재배정(CEO 게이트 없음).
  //     '데이터엔지니어링팀' handoff 중 개발이 아닌 것을 운영본부 인박스로 넘겨 에이전트·크론이 자동 처리(L2/결정론).
  const dataOps = (await sql`UPDATE coordination
    SET to_team='운영본부', stage='조율',
        detail = COALESCE(detail,'') || ' [기조실장 라우팅: 데이터 조작 → 운영본부 자동처리(재합성/큐/정합성), CEO 게이트 불필요]'
    WHERE status IN ('open','in_progress') AND to_team ~ '데이터|엔지니어' AND to_team !~ '개발'
    RETURNING id`.catch(() => [])) as any[];
  if (dataOps.length && log.length < 6) log.push(`데이터 조작 ${dataOps.length}건 → 운영본부 자율처리(CEO 제외)`);

  // 3b) 코드 개발(개발팀 handoff)만 → 무조건 CEO 결재(L3 dev_task). CEO 승인 시 개발 실행.
  //     (데이터 조작=운영본부 자동 vs 코드변경=L3 CEO. 파급·되돌림이 커서 코드만 CEO 게이트.) coord당 1건(idempotent).
  const dev = (await sql`SELECT id, from_team, to_team, topic, detail FROM coordination c
    WHERE c.status IN ('open','in_progress') AND (c.to_team ~ '개발|dev')
      AND NOT EXISTS (SELECT 1 FROM decisions d WHERE d.action_params->>'coord' = c.id::text)`.catch(() => [])) as any[];
  let devEsc = 0;
  for (const c of dev) {
    // 책임 귀속 = 요청 본부(from_team). '개발팀'은 팀이 아니라 공유 개발 실행 유닛(기조실 직할)이 실행. 소유는 요청 본부.
    const owner = c.from_team || "기획조정실";
    await sql`INSERT INTO decisions (title, detail, team, severity, tier, action_type, action_params, recommendation)
      VALUES (${`[개발] ${c.topic}`.slice(0, 110)},
              ${`요청: ${owner} · 실행: 개발 실행 유닛(협업 #${c.id}). ${String(c.detail || c.topic || "").slice(0, 170)}`},
              ${owner}, 'MED', 'L3', 'dev_task', ${JSON.stringify({ coord: String(c.id), owner })}::jsonb,
              ${`${owner}가 요청한 코드 변경 건입니다(어느 본부도 코드를 안 짜므로 공유 개발 실행 유닛이 담당). 승인하시면 개발 착수(코드→검증→배포), 반려 시 보류.`})`.catch(() => {});
    await sql`UPDATE coordination SET stage='CEO결재' WHERE id=${c.id}`.catch(() => {});
    devEsc++;
  }
  if (devEsc && log.length < 6) log.push(`개발 협업 ${devEsc}건 → CEO 결재 상신`);

  // 4) 🚫 좀비 차단(터미널 에스컬레이션): '지연'이 30분 내 미해결 + 연결 결재 없음 →
  //    무한 재촉(nag) 대신 CEO 조치경로 판단 결재를 1건 상신(coord당 idempotent) + stage 전환으로 지연 루프서 제거.
  //    타이트 관리(CEO 지시): 지연되면 30분만 유예하고 바로 CEO에게 올린다. cron-issues가 매 10분 도므로 지연 후 30~40분 내 상신.
  //    (자율 유예는 due_at=6~24h 단계에서 이미 부여됨 — 담당 에이전트/크론이 자기 주기에 처리할 창.)
  //    근거: 담당 크론/팀이 못 푸는 handoff(코드필요·자동수정불가)는 조치처가 없어 영구 좀비였음. '모든 항목은 조치처를 가진다' 강제.
  //    개발 handoff은 3b가 이미 dev_task 상신하므로 제외. 결재는 coordination을 생성하지 않음 → 미러/루프 구조적 불가.
  const stuck = (await sql`SELECT id, from_team, to_team, topic, detail FROM coordination c
    WHERE c.status IN ('open','in_progress') AND c.stage='지연'
      AND c.escalated_at < now() - interval '30 minutes'
      AND c.to_team !~ '개발|dev'
      AND NOT EXISTS (SELECT 1 FROM decisions d WHERE d.action_params->>'coord' = c.id::text)`.catch(() => [])) as any[];
  let termEsc = 0;
  for (const c of stuck) {
    const owner = c.from_team || "기획조정실";
    await sql`INSERT INTO decisions (title, detail, team, severity, tier, action_type, action_params, recommendation)
      VALUES (${`[정체] ${c.topic}`.slice(0, 110)},
              ${`협업 #${c.id}(${owner}→${c.to_team || "미배정"})가 재촉 후에도 미해결. 담당 크론/팀이 자체 처리 못함. ${String(c.detail || "").slice(0, 180)}`},
              ${owner}, 'MED', 'L3', 'route_coord', ${JSON.stringify({ coord: String(c.id) })}::jsonb,
              ${"조치경로 판단: 승인 시 기조실장이 실제 조치항목(코드=dev_task·비공개·검색제한)으로 재배정, 반려 시 폐기."})`.catch(() => {});
    await sql`UPDATE coordination SET stage='CEO정체판단' WHERE id=${c.id}`.catch(() => {});
    termEsc++;
  }
  if (termEsc && log.length < 6) log.push(`정체 협업 ${termEsc}건 → CEO 조치판단 상신(좀비 차단)`);

  // 5) ✅ 끝난 결재 자동 종결(껍데기 안 남긴다): 연결된 협업이 이미 해소된 결재(route_coord·agent_task)는 자동 done.
  //    linkage: decisions.action_params.coord → 그 coordination이 resolved면 실무도 끝난 것 → 'approved'에 안 쌓이게 닫음.
  const closedDec = (await sql`UPDATE decisions d SET status='done', decided_at=now(),
      result = COALESCE(d.result,'') || ' [연결 협업 종결로 자동 완료]'
    WHERE d.status IN ('approved','pending') AND d.action_type IN ('route_coord','agent_task')
      AND d.action_params->>'coord' IS NOT NULL
      AND EXISTS (SELECT 1 FROM coordination c WHERE c.id::text = d.action_params->>'coord' AND c.status IN ('resolved','closed','done'))
    RETURNING id`.catch(() => [])) as any[];
  if (closedDec.length && log.length < 6) log.push(`끝난 결재 ${closedDec.length}건 자동 종결(#${closedDec.map((r) => r.id).join(",")})`);

  // 6) ✅ 조사(investigate) 결재 자동 종결: 자가진단이 '크론 실패/정지'로 올린 investigate는 조사대상 크론이
  //    다시 정상(최신 run ok)이면 조사할 게 사라진 것 → 자동 done. (안 그러면 크론이 잠깐 삐끗할 때마다 안 닫히는 좀비 누적.)
  //    check 예: "크론 실패 cron-closure" → job 'cron-closure' 추출 후 agent_runs 최신 run ok면 종결. 파싱 불가/미정상이면 그대로 둠(안전).
  const closedInv = (await sql`UPDATE decisions d SET status='done', decided_at=now(),
      result = COALESCE(d.result,'') || ' [조사대상 크론 정상화 → 자동 종결]'
    WHERE d.status IN ('approved','pending') AND d.action_type='investigate'
      AND d.action_params->>'check' ~ '크론 (실패|정지)'
      AND EXISTS (
        SELECT 1 FROM agent_runs a
        WHERE a.job = split_part(regexp_replace(d.action_params->>'check', '^.*크론 (정지의심|정지|실패) ', ''), ' ', 1)
          AND a.ran_at = (SELECT MAX(ran_at) FROM agent_runs a2 WHERE a2.job = a.job)
          AND a.ok = true)
    RETURNING id`.catch(() => [])) as any[];
  if (closedInv.length && log.length < 6) log.push(`조사 결재 ${closedInv.length}건 자동 종결(크론 정상화)`);

  // 6b) ✅ 은퇴 크론 조사(investigate) 결재 정리(2026-07-03, 협업#82): 위 6번은 '크론이 다시 정상화'만 감지하는데,
  //    의도적으로 은퇴(plist .disabled)한 잡은 다시는 ok=true 하트비트가 안 온다 → 6번 조건이 영원히 안 맞아
  //    조사 결재가 좀비로 남는다(decision #30: dong-backfill 정지의심). 그런 '진짜 은퇴' 잡을 조사한 결재만 종결한다.
  //    ⚠️ 근본수리(2026-07-07 #200): 과거엔 은퇴를 "EXPECT_MAX_H 미등록"으로 *추론*했는데, 그 조건엔 staleness를
  //    chief-manager가 대표 감시하는 **활성** 리프 에이전트 ~20개가 전부 걸려, 그들의 investigate 결재가 CEO가
  //    보기도 전에 '은퇴 확인'으로 오종결돼 L3 에스컬레이션이 무력화됐다. → 이제 jobTeams.ts RETIRED_JOBS(명시적
  //    은퇴 목록·단일 출처)만 은퇴로 본다. 활성 잡의 조사 결재는 절대 자동종결하지 않는다.
  const retiredJobs = [...RETIRED_JOBS];
  const closedRetired = retiredJobs.length
    ? ((await sql`UPDATE decisions d SET status='done', decided_at=now(),
        result = COALESCE(d.result,'') || ' [대상 크론 의도적 은퇴 확인(jobTeams.ts RETIRED_JOBS) → 자동 종결]'
      WHERE d.status IN ('approved','pending','resolved') AND d.action_type='investigate'
        AND d.action_params->>'check' ~ '크론 (실패|정지)'
        AND split_part(regexp_replace(d.action_params->>'check', '^.*크론 (정지의심|정지|실패) ', ''), ' ', 1) = ANY(${retiredJobs})
      RETURNING id`.catch(() => [])) as any[])
    : [];
  if (closedRetired.length && log.length < 6) log.push(`은퇴크론 조사 결재 ${closedRetired.length}건 자동 종결(#${closedRetired.map((r) => r.id).join(",")})`);
  return { routed, overdue, log };
}

// 🚨 실시간 이슈 탐지·라우팅 엔진 (결정론·무료).
// 관제탑 어디서든 문제가 발견되는 즉시 issues 테이블에 적재하고, RM 분류 규칙으로 담당 본부에 자동 배정한다.
// "기획조정실장 명의로 RM팀이 분류 → 각 본부 실시간 조치"의 결정론 백본. LLM(RM 에이전트)은 배치로 정제·심화.

export type Issue = { ikey: string; source: string; severity: "HIGH" | "MED" | "LOW"; type: string; title: string; detail: string; team: string; state?: "처리중" | "결재대기" | "OUTSTANDING"; note?: string };

// 크론 → 소속 본부: lib/jobTeams.ts 단일 출처 사용(2026-07-02 — 3벌 drift로 cron-issues가 팀을 덮어쓰던 사고 수리)

export async function ensureIssues() {
  await sql`CREATE TABLE IF NOT EXISTS issues (
    id SERIAL PRIMARY KEY, ikey TEXT UNIQUE,
    source TEXT, severity TEXT, type TEXT, title TEXT, detail TEXT, team TEXT,
    status TEXT DEFAULT 'open',
    first_seen TIMESTAMPTZ DEFAULT now(), last_seen TIMESTAMPTZ DEFAULT now(), resolved_at TIMESTAMPTZ
  )`.catch(() => {});
  await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS state TEXT`.catch(() => {});
  await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS note TEXT`.catch(() => {});
}

const one = async (q: any): Promise<number> => Number((await q)[0].c);

// 현재 시점의 모든 문제를 결정론으로 스캔 (관제탑 전 영역)
export async function detectIssues(): Promise<Issue[]> {
  const out: Issue[] = [];
  // 1) 크론·에이전트 실패 (job별 최신이 실패)
  const crons = (await sql`SELECT DISTINCT ON (job) job, ok, detail FROM agent_runs ORDER BY job, ran_at DESC`) as any[];
  for (const c of crons) if (!c.ok) out.push({ ikey: `cronfail:${c.job}`, source: "크론", severity: "HIGH", type: "크론 실패", title: `${c.job} 실패`, detail: String(c.detail || "").slice(0, 200), team: teamOf(c.job) });

  // 2) 데이터 정합성 위반 (sentinel 축)
  const outBox = await one(sql`SELECT count(*) c FROM cafes WHERE published AND (lat<36.8 OR lat>38.3 OR lng<124.5 OR lng>127.9)`);
  if (outBox > 0) out.push({ ikey: "integ:outbox", source: "정합성", severity: "HIGH", type: "정합성", title: `수도권 박스 밖 공개 ${outBox}곳`, detail: "좌표가 수도권(36.8~38.3/124.5~127.9) 밖인데 공개 중", team: "품질본부" });
  const nonCap = await one(sql`SELECT count(*) c FROM cafes WHERE published AND (address LIKE '충청%' OR address LIKE '강원%' OR address LIKE '전라%' OR address LIKE '경상%' OR address LIKE '대전%' OR address LIKE '부산%' OR address LIKE '대구%' OR address LIKE '울산%' OR address LIKE '광주광역시%' OR address LIKE '세종%' OR address LIKE '제주%')`);
  if (nonCap > 0) out.push({ ikey: "integ:noncap", source: "정합성", severity: "HIGH", type: "정합성", title: `비수도권 주소 공개 ${nonCap}곳`, detail: "주소 시·도가 비수도권인데 공개 중", team: "품질본부" });
  const namePol = await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_coherence IS NOT NULL AND synth_coherence < 0.3 AND COALESCE(offctx_ok,false)=false`);
  if (namePol > 0) out.push({ ikey: "integ:namepol", source: "정합성", severity: "HIGH", type: "오염", title: `이름 오염 의심 공개 ${namePol}곳`, detail: "노출 후기가 실제 그 카페를 거의 안 말함(coherence<0.3) — 구구커피류", team: "품질본부" });
  const areaMis = await one(sql`SELECT count(*) c FROM cafes WHERE published AND area LIKE '%구' AND area NOT LIKE '인천%' AND address LIKE '서울%' AND position(area in address)=0`);
  if (areaMis > 0) out.push({ ikey: "integ:areamis", source: "정합성", severity: "MED", type: "정합성", title: `area-주소 불일치 ${areaMis}곳`, detail: "area 라벨이 실제 주소 구와 어긋남", team: "품질본부" });
  const missCoord = await one(sql`SELECT count(*) c FROM cafes WHERE published AND (lat IS NULL OR lng IS NULL OR lat=0 OR lng=0)`);
  if (missCoord > 0) out.push({ ikey: "integ:misscoord", source: "정합성", severity: "MED", type: "필드누락", title: `좌표 없는 공개 ${missCoord}곳`, detail: "지도·박스검증 불가", team: "품질본부" });

  // 3) ⛔ 결재(decisions) 미러링 제거 — 구조적 분리(2026-06-30, CEO "몇 번을 말하냐").
  //   결재·승인·집행은 *결재 워크플로우*이고, 이미 전용 '🔔 CEO 결재 대기' 섹션(승인버튼·기조실장 의견 포함)에서 본다.
  //   그걸 실시간 이슈 보드에도 거울처럼 비추니, 결재의 모든 상태변화(자가승인·집행대기 등)가 보드 좀비/거짓처리중/루프가 됐다.
  //   → 이슈 보드는 *결정론 실시간 문제*만. 결재는 결재 섹션만. 두 워크플로우를 섞지 않는다. (반복 버그 클래스의 근본 차단)

  // 3-c) 판정 적체 (needs_llm) — 단, judgeloop 재개를 CEO가 이미 결정(반려/현상유지)했으면 '수용된 상태'라 이슈로 안 띄움.
  //   (CEO: 이미 결정한 걸 계속 현황으로 띄우지 마라.)
  const jdDecided = await one(sql`SELECT count(*) c FROM decisions WHERE (title ILIKE '%judgeloop%' OR title ILIKE '%판정%재개%') AND status IN ('rejected','done')`.catch(() => [{ c: 0 }] as any));
  if (jdDecided === 0) {
    const needsLlm = await one(sql`SELECT count(*) c FROM cafes WHERE needs_llm=true`);
    if (needsLlm >= 300) out.push({ ikey: "ops:needsllm", source: "품질", severity: (needsLlm >= 1000 ? "HIGH" : "MED"), type: "판정 적체", title: `AI 판정 대기 ${needsLlm.toLocaleString()}건`, detail: "경계 리뷰 판정 적체 — judgeloop 재개 결정 필요(CEO)", team: "품질본부" });
  }

  // 4) 협업 지연 — 생애주기에서 '지연'(과기한)으로 재상신된 건. 담당 팀 에이전트가 조치해야 해소(자동교정 대상 아님).
  const lateCoord = (await sql`SELECT count(*) c FROM coordination WHERE status IN ('open','in_progress') AND stage='지연'`.catch(() => [{ c: 0 }])) as any[];
  if (Number(lateCoord[0].c) > 0) out.push({ ikey: "coord:late", source: "협업", severity: "MED", type: "협업 지연", title: `협업 지연 ${lateCoord[0].c}건(기한초과·재촉됨)`, detail: "받은 팀이 기한 내 확인·조치 안 함 — 담당 에이전트 이벤트 기동으로 재촉 중", team: "경영지원본부", state: "OUTSTANDING", note: "담당 팀 에이전트가 수신확인·조치해야 해소(coord_overdue 트리거로 재촉)" });

  // ★ 빠르게 바뀌는 오염 신호는 DB '직접 실시간' 조회(관제탑 캐시는 stale될 수 있음 → 사장님이 본 3건을 RM이 1건만 보던 버그).
  //   품질 오염(audit_flags)·그라운딩 의심·리뷰 맥락(offctx)을 *항상 최신*으로 잡는다.
  // ⚠️ '공개 중'인 카페만 센다 — 이미 비공개(held/excluded)된 카페의 미해결 플래그는 소비자 노출 0이라 '남은 오염'이 아님(stale 알람 방지).
  const afn = (await sql`SELECT a.cafe_name FROM audit_flags a JOIN cafes c ON c.id=a.cafe_id WHERE a.issue!='audit_complete' AND NOT COALESCE(a.resolved,false) AND c.published ORDER BY a.flagged_at DESC LIMIT 10`.catch(() => [])) as any[];
  if (afn.length > 0) out.push({ ikey: "quality:auditflags", source: "품질감사", severity: "HIGH", type: "품질 오염", title: `품질 오염 감지 ${afn.length}건`, detail: `근거오염·중복 자가감사 플래그: ${afn.slice(0, 5).map((x) => x.cafe_name).join(", ")}`.slice(0, 200), team: "품질본부", state: "처리중", note: "품질레드팀이 매 사이클 트리아지(오탐→정리·오염→비공개)" });
  const grn = await one(sql`SELECT count(*) c FROM grounding_checks g JOIN cafes c ON c.id=g.cafe_id WHERE c.published AND NOT g.grounded AND g.checked_at >= c.synth_updated AND c.llm_judged_at IS NOT NULL`.catch(() => [{ c: 0 }] as any));
  if (grn >= 1) out.push({ ikey: "quality:grounding", source: "그라운딩", severity: "MED", type: "환각 의심", title: `그라운딩 의심 ${grn}곳`, detail: "소개글이 후기 근거 부족(환각 의심)", team: "품질본부", state: "처리중", note: "다음 배치(08·17시) 품질본부 재검·재합성" });
  const offcn = await one(sql`SELECT count(*) c FROM cafes WHERE published AND offctx_rate>=0.55 AND NOT COALESCE(offctx_ok,false)`.catch(() => [{ c: 0 }] as any));
  if (offcn >= 1) out.push({ ikey: "quality:offctx", source: "맥락점검", severity: "LOW", type: "맥락 watchlist", title: `리뷰 맥락 점검 ${offcn}곳`, detail: "표시 리뷰에 카페 맥락 적음(일부 오탐) — 트리아지 대상", team: "품질본부", state: "처리중", note: "품질레드팀이 매 사이클 정리(진짜카페→offctx_ok·오염→비공개)" });

  // ★★ 메인 관제탑(/admin) 전체 미러 — orchestrator가 계산해 둔 risks(위험)·notices(주의)·integrity(정합성)를
  //   '통째로' RM 이슈로 변환한다. 대시보드에 뜨는 *모든* 주의·오염·위험이 자동 전달되고, 앞으로 새 신호가
  //   관제탑에 추가돼도 코드 수정 없이 자동으로 흐른다(CEO 지시: 하나씩 땜질 금지·전수 자동). orchestrator_state는
  //   2시간마다 크론 + 대시보드 볼 때마다 갱신되므로 최신.
  try {
    const row = (await sql`SELECT health FROM orchestrator_state WHERE id=1`)[0] as any;
    const h = row?.health || {};
    const route = (t: string) => /규칙갭|룰갭/.test(t) ? "품질본부/룰갭팀" : /폐업|closure/.test(t) ? "운영본부" : /검색|추천|momentum/.test(t) ? "경험본부" : /임베딩|합성|동\b|backfill/.test(t) ? "운영본부" : /발굴|grow/.test(t) ? "성장본부" : "품질본부";
    const slug = (p: string, t: string) => p + ":" + t.replace(/[0-9,]/g, "").replace(/\s+/g, "").slice(0, 48); // 숫자 제거 → 카운트 바뀌어도 같은 ikey
    // state는 사실대로(2026-07-02): 자동 결재상신은 06-30에 제거됐으므로 '결재대기' 표기는 화면≠사실이었음.
    for (const t of (h.risks || []) as string[]) out.push({ ikey: slug("tower-risk", t), source: "관제탑·위험", severity: "HIGH", type: "위험", title: String(t).slice(0, 95), detail: "메인 관제탑 위험(빨강) — 소비자 타격/해자 훼손, 즉시 조치", team: route(String(t)), state: "OUTSTANDING", note: "담당 본부 즉시 조치 대상 — CEO 판단 필요 시 에이전트가 직접 결재 상신" });
    for (const t of (h.integrity || []) as string[]) out.push({ ikey: slug("tower-integ", t), source: "관제탑·정합성", severity: "MED", type: "정합성", title: String(t).slice(0, 95), detail: "메인 관제탑 정합성 경보", team: "품질본부", state: "처리중", note: "orchestrator-heal이 2시간마다 자동치유" });
    for (const t of (h.notices || []) as string[]) {
      // 오염 플래그·그라운딩·리뷰 맥락은 위에서 'DB 직접 실시간'으로 잡으므로 미러에선 건너뜀(중복·stale 방지).
      if (/오염 플래그|그라운딩|리뷰 맥락|품질 의심/.test(t)) continue;
      // 콘솔키 크레딧 소진은 CEO가 충전 보류로 '수용'한 상태(검색은 결정론 폴백 정상·moat는 구독 독립) — '처리할 위험'이 아니라 정보성이다.
      //   관제탑 노티스로만 표출하고 RM 열린 이슈는 만들지 않는다(미러하면 매 크론 재생성=resolved 도돌이표 노이즈). CEO 지시 2026-07-08.
      //   진짜 HIGH(결정론 폴백까지 붕괴)만 별도 risks 신호로 이슈화. 크레딧 회복 시 노티스 자동 소멸.
      if (/콘솔키 크레딧 소진/.test(t)) continue;
      // 규칙갭 승인대기는 이제 cron-rulegap이 unpublish '결재'로 상신(actionable). RM보드 '처리중' 미러는 좀비라 제거 — 결재 섹션에서 처리(CEO 지적 2026-07-01).
      if (/규칙갭 승인대기|룰갭 승인대기/.test(t)) continue;
      // 발굴 지연은 cron-grow가 우선처리로 소진 중. 그 외 주의는 다음 배치 사이클(08·17시)에 담당 본부 트리아지.
      const isGrow = /발굴.*(지연|미발굴)/.test(t);
      const isRule = /규칙갭|룰갭/.test(t);
      const when = isGrow ? "cron-grow가 2시간마다 굶은 지역 우선 발굴 (자동 소진)" : isRule ? "다음 룰갭 사이클(매일 01:30) + 기조실장 검토" : "다음 배치 사이클(08·17시) 담당 본부 처리";
      out.push({ ikey: slug("tower-notice", t), source: "관제탑·주의", severity: "LOW", type: "주의", title: String(t).slice(0, 95), detail: "메인 관제탑 주의(점검 권장)", team: route(String(t)), state: "처리중", note: when });
    }
  } catch { /* orchestrator_state 없으면 아래 직접 체크가 안전망 */ }

  // 5) 폐업 검토대기 — 3회+ 미발견은 비공개 결재가 필요한 '진짜 처리 대상'(자동삭제 안 함). 유지.
  const closureBack = await one(sql`SELECT count(*) c FROM cafes WHERE published AND closure_misses>=3`);
  if (closureBack > 0) out.push({ ikey: "ops:closureback", source: "운영", severity: "MED", type: "폐업 검토대기", title: `폐업 검토대기 ${closureBack}곳`, detail: "3회+ 미발견 — 정밀확인 후 결재(자동삭제 안 함)", state: "처리중", note: "cron-closure 6시간마다 재확인 + 운영본부 정밀확인 후 결재", team: "운영본부" });
  // ⚠️ 합성 대기·임베딩 대기 등 '정상 파이프라인 백로그'는 이슈로 안 띄운다 — cron이 자동 처리하는 평상 상태일 뿐
  //   문제가 아니다(CEO: 정상 운영상태를 이슈로 띄워 보드가 항상 차보이게 하지 마라). cron-synth가 *고장*나면
  //   '크론 실패'(위 1번)로 잡힌다 → 그게 진짜 문제.

  return out;
}

// 탐지 → upsert(신규 적재·기존 갱신) → 사라진 이슈 자동 해소. 반환 = 현재 열린 이슈.
export async function syncIssues() {
  await ensureIssues();
  const found = await detectIssues();
  const keys = found.map((i) => i.ikey);
  for (const i of found) {
    const st = i.state ?? "처리중"; // 기본: 담당 본부가 매 사이클 처리 중
    await sql`INSERT INTO issues (ikey, source, severity, type, title, detail, team, status, state, note, last_seen)
      VALUES (${i.ikey}, ${i.source}, ${i.severity}, ${i.type}, ${i.title}, ${i.detail}, ${i.team}, 'open', ${st}, ${i.note ?? null}, now())
      ON CONFLICT (ikey) DO UPDATE SET severity=${i.severity}, title=${i.title}, detail=${i.detail}, team=${i.team}, state=${st}, note=${i.note ?? null}, last_seen=now(),
        status=CASE WHEN issues.status='resolved' THEN 'open' ELSE issues.status END,
        resolved_at=CASE WHEN issues.status='resolved' THEN NULL ELSE issues.resolved_at END`;
  }
  // 이번에 안 잡힌 기존 open 이슈 = 해소됨
  if (keys.length) await sql`UPDATE issues SET status='resolved', resolved_at=now() WHERE status<>'resolved' AND ikey <> ALL(${keys})`;
  else await sql`UPDATE issues SET status='resolved', resolved_at=now() WHERE status<>'resolved'`;

  // ⛔ HIGH 이슈 → 자동 결재상신 *제거*(2026-06-30, 구조분리). 이슈가 결재를 만들고 결재가 이슈가 되는 *순환 자체*를 끊는다.
  //   이슈는 보드에 그대로 보이고(가시성), autoCorrect가 결정론으로 자동조치한다. 진짜 CEO 판단이 필요한 건 *에이전트가
  //   직접 pending 결재로 상신*(전용 결재 섹션). 실제 오염 비공개 결재는 autoCorrect의 오염 상신(위 56행)이 담당.
  //   → 이슈 워크플로우와 결재 워크플로우가 더는 서로를 만들지 않는다. 좀비·루프·거짓처리중 클래스 원천 소멸.

  const open = (await sql`SELECT ikey, source, severity, type, title, detail, team, status, state, note, to_char(first_seen AT TIME ZONE 'Asia/Seoul','MM-DD HH24:MI') seen, EXTRACT(EPOCH FROM (now()-first_seen))/3600 hrs FROM issues WHERE status<>'resolved' ORDER BY CASE state WHEN '결재대기' THEN 0 WHEN 'OUTSTANDING' THEN 1 ELSE 2 END, CASE severity WHEN 'HIGH' THEN 0 WHEN 'MED' THEN 1 ELSE 2 END, first_seen ASC`) as any[];
  return open;
}
