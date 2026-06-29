import { sql } from "./db";

// 🚨 실시간 이슈 탐지·라우팅 엔진 (결정론·무료).
// 관제탑 어디서든 문제가 발견되는 즉시 issues 테이블에 적재하고, RM 분류 규칙으로 담당 본부에 자동 배정한다.
// "기획조정실장 명의로 RM팀이 분류 → 각 본부 실시간 조치"의 결정론 백본. LLM(RM 에이전트)은 배치로 정제·심화.

export type Issue = { ikey: string; source: string; severity: "HIGH" | "MED" | "LOW"; type: string; title: string; detail: string; team: string };

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
  for (const p of pend) out.push({ ikey: `approval:${p.id}`, source: "결재", severity: (p.severity === "HIGH" ? "HIGH" : "MED"), type: "CEO 결재 대기", title: `결재 대기: ${p.title}`.slice(0, 80), detail: "CEO 모바일 결재 필요(L3 치명적)", team: p.team || "기획조정실" });
  // 3-b) 승인됐으나 집행 안 된 작업(agent_task) — 기조실장·담당 본부 실행 대기
  const appr = (await sql`SELECT id, title, team FROM decisions WHERE status='approved' ORDER BY id`) as any[];
  for (const a of appr) out.push({ ikey: `exec:${a.id}`, source: "집행", severity: "MED", type: "집행 대기", title: `집행 대기: ${a.title}`.slice(0, 80), detail: "승인 완료 — 담당 본부 구현·집행 대기(전결/배분)", team: a.team || "기획조정실" });

  // 3-c) 판정 적체 (needs_llm — judgeloop 정지 시 누적)
  const needsLlm = await one(sql`SELECT count(*) c FROM cafes WHERE needs_llm=true`);
  if (needsLlm >= 300) out.push({ ikey: "ops:needsllm", source: "품질", severity: (needsLlm >= 1000 ? "HIGH" : "MED"), type: "판정 적체", title: `AI 판정 대기 ${needsLlm.toLocaleString()}건`, detail: "경계 리뷰 판정 적체(judgeloop 재개 결정 대기) — 합성 정밀도 영향", team: "품질본부" });

  // 4) 협업 지연 (2일+)
  const lateCoord = (await sql`SELECT count(*) c FROM coordination WHERE status IN ('open','in_progress') AND created_at < now() - interval '2 days'`.catch(() => [{ c: 0 }])) as any[];
  if (Number(lateCoord[0].c) > 0) out.push({ ikey: "coord:late", source: "협업", severity: "MED", type: "협업 지연", title: `미해결 협업 ${lateCoord[0].c}건 2일+`, detail: "부서 간 조율이 2일 넘게 안 풀림", team: "경영지원본부" });

  // ★ 메인 관제탑(/admin)이 띄우는 이상과 동일 소스 — 대시보드에 뜨는 모든 이상은 RM 이슈로 전달된다(CEO 지시).
  // 6) 품질 오염 감지 (audit_flags 미해결) — 자가감사 근거오염·중복 플래그
  const af = (await sql`SELECT cafe_name FROM audit_flags WHERE issue!='audit_complete' AND COALESCE(resolved,false)=false ORDER BY flagged_at DESC LIMIT 10`.catch(() => [])) as any[];
  if (af.length > 0) out.push({ ikey: "quality:auditflags", source: "품질감사", severity: "HIGH", type: "품질 오염", title: `품질 오염 감지 ${af.length}건`, detail: `근거오염·중복 등 자가감사 플래그(미해결): ${af.slice(0, 5).map((x) => x.cafe_name).join(", ")}`.slice(0, 200), team: "품질본부" });
  // 7) 그라운딩 의심 (소개글 환각 의심)
  const gr = await one(sql`SELECT count(*) c FROM grounding_checks WHERE grounded=false`.catch(() => [{ c: 0 }] as any));
  if (gr >= 20) out.push({ ikey: "quality:grounding", source: "그라운딩", severity: "MED", type: "환각 의심", title: `그라운딩 의심 ${gr}건`, detail: "소개글이 후기 근거 부족(환각 의심) — 판정 큐 재투입·재합성 대상", team: "품질본부" });
  // 8) 리뷰 맥락 watchlist (offctx — 위험 아님·주의). 임계는 메인 관제탑(orchestrator 0.55)과 일치시켜 숫자 충돌 방지.
  const offc = await one(sql`SELECT count(*) c FROM cafes WHERE published AND offctx_rate>=0.55 AND COALESCE(offctx_ok,false)=false`.catch(() => [{ c: 0 }] as any));
  if (offc >= 1) out.push({ ikey: "quality:offctx", source: "맥락점검", severity: "LOW", type: "맥락 watchlist", title: `리뷰 맥락 점검 ${offc}곳`, detail: "표시 리뷰에 카페 맥락 적음(일부 오탐 가능·위험 아님) — 품질본부 트리아지: 진짜 카페(찻집·북카페·시적이름)면 offctx_ok=true로 정리, 진짜 오염이면 비공개 권고", team: "품질본부" });

  // 5) 운영 백로그
  const closureBack = await one(sql`SELECT count(*) c FROM cafes WHERE published AND closure_misses>=3`);
  if (closureBack > 0) out.push({ ikey: "ops:closureback", source: "운영", severity: "MED", type: "폐업 검토대기", title: `폐업 검토대기 ${closureBack}곳`, detail: "3회+ 미발견 — 정밀확인·결재 필요(자동삭제 안 함)", team: "운영본부" });
  const synthBack = await one(sql`SELECT count(*) c FROM cafes WHERE synth_updated IS NULL`);
  if (synthBack > 200) out.push({ ikey: "ops:synthback", source: "운영", severity: "LOW", type: "합성 대기", title: `합성 대기 ${synthBack}건`, detail: "신규 합성 적체 — cron-synth 처리량 점검", team: "운영본부" });

  return out;
}

// 탐지 → upsert(신규 적재·기존 갱신) → 사라진 이슈 자동 해소. 반환 = 현재 열린 이슈.
export async function syncIssues() {
  await ensureIssues();
  const found = await detectIssues();
  const keys = found.map((i) => i.ikey);
  for (const i of found) {
    await sql`INSERT INTO issues (ikey, source, severity, type, title, detail, team, status, last_seen)
      VALUES (${i.ikey}, ${i.source}, ${i.severity}, ${i.type}, ${i.title}, ${i.detail}, ${i.team}, 'open', now())
      ON CONFLICT (ikey) DO UPDATE SET severity=${i.severity}, title=${i.title}, detail=${i.detail}, team=${i.team}, last_seen=now(),
        status=CASE WHEN issues.status='resolved' THEN 'open' ELSE issues.status END,
        resolved_at=CASE WHEN issues.status='resolved' THEN NULL ELSE issues.resolved_at END`;
  }
  // 이번에 안 잡힌 기존 open 이슈 = 해소됨
  if (keys.length) await sql`UPDATE issues SET status='resolved', resolved_at=now() WHERE status<>'resolved' AND ikey <> ALL(${keys})`;
  else await sql`UPDATE issues SET status='resolved', resolved_at=now() WHERE status<>'resolved'`;
  const open = (await sql`SELECT ikey, source, severity, type, title, detail, team, status, to_char(first_seen AT TIME ZONE 'Asia/Seoul','MM-DD HH24:MI') seen, EXTRACT(EPOCH FROM (now()-first_seen))/3600 hrs FROM issues WHERE status<>'resolved' ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MED' THEN 1 ELSE 2 END, first_seen ASC`) as any[];
  return open;
}
