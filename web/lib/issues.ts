import { sql } from "./db";
import { nameCoherence, cleanCafeName } from "./reviewQuality";
import { healNonCafeCategory, healOffConceptByReview, healRestaurantByReview } from "./synthStore";

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
      const dup = (await sql`SELECT 1 FROM decisions WHERE action_params->>'ikey'=${ik} AND status IN('pending','approved') LIMIT 1`.catch(() => [])) as any[];
      if (!dup.length) {
        await sql`INSERT INTO decisions (title,detail,team,severity,tier,action_type,action_params)
          VALUES (${`[자동] 오염 카페 비공개 — ${c.name}`.slice(0, 110)}, ${`근거오염 자동탐지: 노출후기가 실제 그 카페를 거의 안 말함(cleanName 일치율 ${Math.round(coh * 100)}%). 비공개 권고.`}, '품질본부', 'HIGH', 'L3', 'unpublish', ${JSON.stringify({ ids: [c.id], ikey: ik })}::jsonb)`.catch(() => {});
        escalated++; if (log.length < 8) log.push(`오염→결재상신 ${c.name}(${Math.round(coh * 100)}%)`);
      }
    }
    // 0.35~0.5 = 애매 → 레드팀 판단(그대로)
  }
  return { resolved, escalated, log };
}

// 🚨 실시간 이슈 탐지·라우팅 엔진 (결정론·무료).
// 관제탑 어디서든 문제가 발견되는 즉시 issues 테이블에 적재하고, RM 분류 규칙으로 담당 본부에 자동 배정한다.
// "기획조정실장 명의로 RM팀이 분류 → 각 본부 실시간 조치"의 결정론 백본. LLM(RM 에이전트)은 배치로 정제·심화.

export type Issue = { ikey: string; source: string; severity: "HIGH" | "MED" | "LOW"; type: string; title: string; detail: string; team: string; state?: "처리중" | "결재대기" | "OUTSTANDING"; note?: string };

// 크론 → 소속 본부 (이슈 라우팅)
const CRON_TEAM: Record<string, string> = {
  "cron-synth": "운영본부", "cron-resynth": "운영본부", "cron-embed": "운영본부", "cron-snapshot": "운영본부",
  "orchestrator-heal": "품질본부", "cron-sentinel": "품질본부", "cron-verify": "품질본부", "cron-rulegap": "품질본부",
  "cron-grow": "성장본부", "cron-demand": "성장본부", "cron-newsletter": "성장본부",
  "cron-closure": "운영본부", "cron-enrich": "운영본부",
};

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
  for (const c of crons) if (!c.ok) out.push({ ikey: `cronfail:${c.job}`, source: "크론", severity: "HIGH", type: "크론 실패", title: `${c.job} 실패`, detail: String(c.detail || "").slice(0, 200), team: CRON_TEAM[c.job] || "경영지원본부" });

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

  // 3) 결재 대기 (L3) — 각 건을 담당 본부로 라우팅(즉시, 나이 무관)
  const pend = (await sql`SELECT id, title, team, severity FROM decisions WHERE status='pending' AND COALESCE(tier,'L3')='L3' ORDER BY id`) as any[];
  for (const p of pend) out.push({ ikey: `approval:${p.id}`, source: "결재", severity: (p.severity === "HIGH" ? "HIGH" : "MED"), type: "CEO 결재 대기", title: `결재 대기: ${p.title}`.slice(0, 80), detail: "CEO 모바일 결재 필요(L3 치명적)", team: p.team || "기획조정실", state: "결재대기", note: "CEO 승인 시 즉시 집행" });
  // 3-b) 승인됐으나 집행 안 된 작업(agent_task) — 기조실장·담당 본부 실행 대기
  const appr = (await sql`SELECT id, title, team FROM decisions WHERE status='approved' ORDER BY id`) as any[];
  for (const a of appr) out.push({ ikey: `exec:${a.id}`, source: "집행", severity: "MED", type: "집행 대기", title: `집행 대기: ${a.title}`.slice(0, 80), detail: "승인 완료 — 담당 본부 구현·집행 대기(전결/배분)", team: a.team || "기획조정실", state: "처리중", note: "기조실장·담당 본부가 집행 중 (다음 사이클 완료 목표)" });

  // 3-c) 판정 적체 (needs_llm) — 단, judgeloop 재개를 CEO가 이미 결정(반려/현상유지)했으면 '수용된 상태'라 이슈로 안 띄움.
  //   (CEO: 이미 결정한 걸 계속 현황으로 띄우지 마라.)
  const jdDecided = await one(sql`SELECT count(*) c FROM decisions WHERE (title ILIKE '%judgeloop%' OR title ILIKE '%판정%재개%') AND status IN ('rejected','done')`.catch(() => [{ c: 0 }] as any));
  if (jdDecided === 0) {
    const needsLlm = await one(sql`SELECT count(*) c FROM cafes WHERE needs_llm=true`);
    if (needsLlm >= 300) out.push({ ikey: "ops:needsllm", source: "품질", severity: (needsLlm >= 1000 ? "HIGH" : "MED"), type: "판정 적체", title: `AI 판정 대기 ${needsLlm.toLocaleString()}건`, detail: "경계 리뷰 판정 적체 — judgeloop 재개 결정 필요(CEO)", team: "품질본부" });
  }

  // 4) 협업 지연 (2일+)
  const lateCoord = (await sql`SELECT count(*) c FROM coordination WHERE status IN ('open','in_progress') AND created_at < now() - interval '2 days'`.catch(() => [{ c: 0 }])) as any[];
  if (Number(lateCoord[0].c) > 0) out.push({ ikey: "coord:late", source: "협업", severity: "MED", type: "협업 지연", title: `미해결 협업 ${lateCoord[0].c}건 2일+`, detail: "부서 간 조율이 2일 넘게 안 풀림", team: "경영지원본부" });

  // ★ 빠르게 바뀌는 오염 신호는 DB '직접 실시간' 조회(관제탑 캐시는 stale될 수 있음 → 사장님이 본 3건을 RM이 1건만 보던 버그).
  //   품질 오염(audit_flags)·그라운딩 의심·리뷰 맥락(offctx)을 *항상 최신*으로 잡는다.
  const afn = (await sql`SELECT cafe_name FROM audit_flags WHERE issue!='audit_complete' AND NOT COALESCE(resolved,false) ORDER BY flagged_at DESC LIMIT 10`.catch(() => [])) as any[];
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
    for (const t of (h.risks || []) as string[]) out.push({ ikey: slug("tower-risk", t), source: "관제탑·위험", severity: "HIGH", type: "위험", title: String(t).slice(0, 95), detail: "메인 관제탑 위험(빨강) — 소비자 타격/해자 훼손, 즉시 조치", team: route(String(t)), state: "결재대기", note: "CEO 승인 시 즉시 — 자동 결재 상신됨" });
    for (const t of (h.integrity || []) as string[]) out.push({ ikey: slug("tower-integ", t), source: "관제탑·정합성", severity: "MED", type: "정합성", title: String(t).slice(0, 95), detail: "메인 관제탑 정합성 경보", team: "품질본부", state: "처리중", note: "orchestrator-heal이 2시간마다 자동치유" });
    for (const t of (h.notices || []) as string[]) {
      // 오염 플래그·그라운딩·리뷰 맥락은 위에서 'DB 직접 실시간'으로 잡으므로 미러에선 건너뜀(중복·stale 방지).
      if (/오염 플래그|그라운딩|리뷰 맥락|품질 의심/.test(t)) continue;
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

  // ★ 액션 루프: HIGH 이슈는 자동으로 CEO 결재(L3)로 상신한다 — "위험 높으면 결재 올려라"(CEO).
  //   중복 방지: 같은 ikey로 이미 미결(pending/approved) 결재가 있으면 skip. 이슈 해소되면 결재는 별도 처리(CEO/기조실장).
  for (const i of found.filter((x) => x.severity === "HIGH")) {
    try {
      const dup = (await sql`SELECT 1 FROM decisions WHERE action_params->>'ikey'=${i.ikey} AND status IN ('pending','approved') LIMIT 1`) as any[];
      if (!dup.length) {
        await sql`INSERT INTO decisions (title, detail, team, severity, tier, action_type, action_params)
          VALUES (${("[RM] " + i.title).slice(0, 120)}, ${(i.detail + " — RM 자동 상신(위험). 담당 본부가 조사·조치, 비가역이면 CEO 승인.").slice(0, 400)}, ${i.team}, 'HIGH', 'L3', 'agent_task', ${JSON.stringify({ ikey: i.ikey })}::jsonb)`;
      }
    } catch { /* decisions 미존재 등 — 무시 */ }
  }

  const open = (await sql`SELECT ikey, source, severity, type, title, detail, team, status, state, note, to_char(first_seen AT TIME ZONE 'Asia/Seoul','MM-DD HH24:MI') seen, EXTRACT(EPOCH FROM (now()-first_seen))/3600 hrs FROM issues WHERE status<>'resolved' ORDER BY CASE state WHEN '결재대기' THEN 0 WHEN 'OUTSTANDING' THEN 1 ELSE 2 END, CASE severity WHEN 'HIGH' THEN 0 WHEN 'MED' THEN 1 ELSE 2 END, first_seen ASC`) as any[];
  return open;
}
