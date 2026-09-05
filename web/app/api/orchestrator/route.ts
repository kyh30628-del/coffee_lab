import { NextRequest, NextResponse } from "next/server";
import { recentSilentFails } from "@/lib/silentFail";
import { invalidateCafeCaches } from "@/lib/cafeCacheInvalidate"; // 🧹 2026-08-28 /c/[id] ISR(48h) 전환 — 비공개 후 캐시 미무효화 시 최대 48시간 잔존
import { sql, ensureSchema } from "@/lib/db";
import { synthAndStore, finalizePipeline, scrubPublishedPII, healVendorTemplateQuotes, healGroundingSuspects, holdZeroEvidenceSuspects, healPublishedAudit, healNonCafeCategory, healOutOfBox, healAreaLabel, healOffConceptByReview } from "@/lib/synthStore";
import { recordRun } from "@/lib/agentLog";
import { BOT_ANON_IDS_SQL, refreshBotCache } from "@/lib/behaviorBot";
import { judgeQueueCount, dailyCounts } from "@/lib/metrics";
import { consoleCreditExhaustedByProbe } from "@/lib/consoleKeyProbe";
import { loadCriteria, getCriterionSync } from "@/lib/criteria";
import { existsSync } from "node:fs";
import { join } from "node:path";
export const runtime = "nodejs";
export const maxDuration = 300; // 결재#408: 120s는 실측 102s와 여유 18s뿐이라 백로그 조금만 늘어도 Vercel 강제종료(recordRun 미호출→정지 오판). 다른 heal류 크론과 동일하게 플랜 상한(300s)으로.

// 🛰️ 자율 운영 관제탑(Control Tower)
// 각 에이전트가 '만든 실제 데이터'로 가동 여부를 추론(거짓 불가) → 건강 판정 → 적체는 자가 치유 → 멈춤은 경보.
// 토큰 0. 규칙·집계만. ?heal=1 이면 합성 적체를 직접 메움(무료).

type AgentHealth = {
  key: string; label: string; lastRun: string | null; ageH: number | null;
  cadenceH: number; status: "ok" | "behind" | "stalled" | "idle" | "warn";
  queue: number; note: string;
};

const authed = (req: NextRequest) => {
  const pw = req.headers.get("x-admin-password");
  if (pw && pw === process.env.ADMIN_PASSWORD) return true;
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  return (!!secret && auth === `Bearer ${secret}`) || !secret;
};

function ageHours(ts: string | null, now: number): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return isNaN(t) ? null : (now - t) / 3.6e6;
}
// 가동 신선도 → 상태. ok: cadence*1.5내, behind: *3내, stalled: 그 이상
function freshness(ageH: number | null, cadenceH: number): "ok" | "behind" | "stalled" | "idle" {
  if (ageH == null) return "idle";
  if (ageH <= cadenceH * 1.5) return "ok";
  if (ageH <= cadenceH * 3) return "behind";
  return "stalled";
}

export async function GET(req: NextRequest) {
  try {
    await refreshBotCache(sql); // 봇 목록 캐시 신선도 보장(30분)
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS orchestrator_state (id INT PRIMARY KEY DEFAULT 1, health JSONB, updated_at TIMESTAMPTZ DEFAULT now())`;
    const now = Date.now();
    // ⏸️ AI 판정/그라운딩은 CEO가 .ai-paused 플래그로 의도적 정지 가능(구독한도·콘솔비용 보호).
    //   이 플래그가 있으면 판정 '멈춤'은 장애가 아니라 기승인 상태 → critical 경보 금지(정보성 표시).
    //   (플래그는 git 추적·배포됨. next.config outputFileTracingIncludes로 이 함수 번들에 포함.)
    const aiPaused = (() => { try { return existsSync(join(process.cwd(), ".ai-paused")); } catch { return false; } })();
    // 읽기(현황)는 비민감 → 공개. 자가치유(heal)는 비용 발생 가능 → 인증 필수.
    const heal = req.nextUrl.searchParams.get("heal") === "1" && authed(req);
    const healed: string[] = [];

    // ── 1) 신호 수집(에이전트가 만든 데이터) ──
    const c = (await sql`SELECT
      COUNT(*)::int total,
      COUNT(*) FILTER (WHERE published)::int published,
      COUNT(*) FILTER (WHERE published AND llm_judged_at IS NOT NULL)::int pub_judged,
      COUNT(*) FILTER (WHERE raw_reviews IS NOT NULL)::int raw_cached,
      COUNT(*) FILTER (WHERE llm_judged_at IS NOT NULL)::int judged,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int embedded,
      COUNT(*) FILTER (WHERE published AND embedding IS NOT NULL)::int pub_embedded,
      MAX(raw_collected_at) last_collect,
      MAX(raw_checked_at) last_check,
      MAX(synth_updated) last_synth,
      MAX(llm_judged_at) last_judge,
      MAX(embed_updated) last_embed,
      COUNT(*) FILTER (WHERE raw_reviews IS NULL)::int collect_q,
      COUNT(*) FILTER (WHERE raw_reviews IS NOT NULL AND synth_updated IS NULL)::int synth_q,
      COUNT(*) FILTER (WHERE embedding IS NULL AND (published OR pipeline_status='pending') AND synth_identity IS NOT NULL)::int embed_q,
      COUNT(*) FILTER (WHERE published AND raw_reviews IS NOT NULL AND raw_collected_at > synth_checked_at)::int synth_backlog,
      COUNT(*) FILTER (WHERE published AND (synth_checked_at IS NULL OR synth_checked_at < now() - interval '7 days'))::int synth_stale7,
      -- 순환 천장 = '거의 모든 카페가 이 나이 안에는 훑였다'. 그물이 실제로 멈췄는지를 잰다(아래 주석).
      -- ⚠️ 2026-08-29 재교정: 원래 MAX였는데 **한 곳만 끼어도 영원히 빨강**이었다.
      --    실측 — 중앙값 6일·p99 19일·21일 초과 **단 1곳**(0.005%)인데 그 1곳이 38일이라 🔴위험이 떠 있었다.
      --    p99로 바꾼다: 그물이 진짜 멈추면 전체가 같이 늙어 p99가 치솟으므로 감도는 그대로다.
      --    개별로 낀 카페는 아래에서 '주의'로 따로 표면화한다(빨강 아님 — 소비자 화면 무손상).
      COALESCE(ROUND(percentile_cont(0.99) WITHIN GROUP (
        ORDER BY CASE WHEN published THEN EXTRACT(EPOCH FROM (now() - synth_checked_at))/86400 END))::int, 0) synth_oldest_d,
      COALESCE(MAX(CASE WHEN published THEN ROUND(EXTRACT(EPOCH FROM (now() - synth_checked_at))/86400)::int END), 0) synth_max_d,
      -- 🧬 2026-09-03: 지문 게이트 도입으로 '변화 없는 카페는 30일 안전망까지 안 읽는 게 정상'이 됐다.
      --   21일 창을 그대로 두면 정상 카페 수천 곳이 순차적으로 '누락'으로 잡힌다 → 32일(안전망+여유)로.
      COUNT(*) FILTER (WHERE published AND synth_checked_at < now() - interval '32 days')::int synth_stuck,
      COUNT(*) FILTER (WHERE published AND synth_checked_at IS NULL)::int synth_never
      FROM cafes`)[0] as any;
    // 판정 대기·오늘 지표 = lib/metrics 단일출처(judge-status와 동일 정의 — 화면별 숫자 어긋남 구조적 차단).
    const judgeQ = await judgeQueueCount();
    // 옥석(검증) 미판정 = AI판정 '의도적 스킵' 대상(규칙검증 완료·저위험). 대기가 아니라 '완료 처리'임을 화면에 명시(숨김 금지).
    const verifiedSkip = ((await sql`SELECT COUNT(*)::int n FROM cafes WHERE published AND synth_grade='검증' AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)`.catch(() => [{ n: 0 }]))[0] as any).n;
    const daily = await dailyCounts();
    const vr = (await sql`SELECT ran_at, fails, warns, status FROM verify_reports ORDER BY ran_at DESC LIMIT 1`)[0] as any;
    // open = '실제 카페 오염' 플래그만(cafe_id 있고 'audit_complete' 시스템 로그 제외 + '공개 중인 카페'만 — 비공개=이미
    //   소비자 무노출=처리완료라 검토대기 아님. gr 쿼리와 동일 원칙). last_flag=실행 시각(전체 기준, 감사 가동시각).
    const af = (await sql`SELECT COUNT(*) FILTER (WHERE NOT resolved AND cafe_id IS NOT NULL AND issue <> 'audit_complete'
      AND EXISTS (SELECT 1 FROM cafes c WHERE c.id = audit_flags.cafe_id AND c.published))::int open, MAX(flagged_at) last_flag FROM audit_flags`)[0] as any;
    await sql`CREATE TABLE IF NOT EXISTS grounding_checks (cafe_id INT PRIMARY KEY, grounded BOOLEAN, issue TEXT, checked_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
    // 판정 대기(judge_q) 내역 분해 — 화면이 스스로 설명하게: 신규 미판정 vs 그라운딩이 재검 요청한 것.
    //   (그라운딩 apply가 의심분을 판정 큐로 되먹이면 judge_q가 뛰는데, 이 분해가 그 이유를 숫자로 보여줌)
    const jb = (await sql`SELECT
      COUNT(*) FILTER (WHERE g.cafe_id IS NOT NULL AND NOT g.grounded)::int reground,
      COUNT(*) FILTER (WHERE (g.cafe_id IS NULL OR g.grounded) AND c.llm_judged_at IS NULL)::int newjudge,
      COUNT(*) FILTER (WHERE (g.cafe_id IS NULL OR g.grounded) AND c.llm_judged_at IS NOT NULL)::int recollect,
      COUNT(*) FILTER (WHERE g.cafe_id IS NULL OR g.grounded)::int fresh
      FROM cafes c LEFT JOIN grounding_checks g ON g.cafe_id = c.id
      WHERE (c.published OR c.pipeline_status='pending') AND c.raw_reviews IS NOT NULL
        AND (c.llm_judged_at IS NULL OR c.llm_judged_at < c.raw_collected_at)`.catch(() => [{ reground: 0, newjudge: 0, recollect: 0, fresh: 0 }]))[0] as any;
    // 그라운딩 '의심(재검 대기)' = 실제 미처리 = '공개 중'이면서 '현재(재합성 후) 검사 결과'가 의심인 것만 센다.
    //   stale 플래그(재합성으로 무효)·보류(이미 비공개=처리됨)는 미처리가 아니므로 제외 → 화면이 '진짜 남은 일'만 표시.
    const gr = (await sql`SELECT COUNT(*) FILTER (WHERE NOT g.grounded)::int suspect, MAX(g.checked_at) last FROM grounding_checks g JOIN cafes c ON c.id = g.cafe_id WHERE c.published AND g.checked_at >= c.synth_updated AND c.llm_judged_at IS NOT NULL AND c.llm_judged_at >= c.raw_collected_at`)[0] as any;
    // (제거 2026-07-05) 그라운딩 '백로그'(판정완료·미검 공개카페) 카운터 삭제 — 옛 구독 LLM 그라운딩(grounding_checks 적재)의
    //   잔재라 워커 정지 상태에선 절대 안 줄어드는 유령값(9,136)이었고, 화면·경보·로직 어디에도 안 쓰였음. 실제 오염검증은
    //   규칙층(coherence·namepol·offctx·selfaudit 100%)+배치 'about' 판정이 상시 커버. 실신호는 아래 suspectCount(gr).
    // 그라운딩이 문제로 판정해 '비공개 보류'한 카페(소비자 노출 차단됨) — 진짜 처리 필요분.
    const grSuspects = (await sql`SELECT c.name, c.area, g.issue FROM grounding_checks g JOIN cafes c ON c.id = g.cafe_id WHERE NOT g.grounded AND c.llm_judged_at IS NOT NULL AND c.llm_judged_at >= c.raw_collected_at ORDER BY g.checked_at DESC LIMIT 20`.catch(() => [])) as any[];
    // 발굴은 '다양성(전수 아님)' 전략 — 전 지역 3일 신선도는 불필요. 로테이션 현실(64지역·하루 12회=~5일 한바퀴)에 맞춰
    //   '진짜 굶은 지역'(7일+)만 지연으로 본다. 그 미만은 정상 로테이션이라 노이즈 아님.
    const ds = (await sql`SELECT MIN(last_run) oldest, COUNT(*) FILTER (WHERE last_run < now() - interval '7 days')::int behind, COUNT(*)::int n FROM discovery_state`)[0] as any;
    // 통합 재검증 자가감사 커버리지 — 공개 카페가 '현재 규칙'으로 며칠 안에 1회씩 재검되는지(규칙 드리프트 치유 진행률).
    const auditCov = (await sql`SELECT COUNT(*) FILTER (WHERE published AND audit_checked_at >= now() - interval '7 days')::int a7, COUNT(*) FILTER (WHERE published)::int pub, MAX(audit_checked_at) last_audit FROM cafes`.catch(() => [{ a7: 0, pub: 0, last_audit: null }]))[0] as any;
    // 로컬 배치 하트비트 — 실패(크래시 등)·정체를 관제탑이 잡아 경보. (예: dong-backfill ReferenceError)
    await sql`CREATE TABLE IF NOT EXISTS agent_runs (job TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(), ok BOOLEAN DEFAULT true, detail TEXT, processed INT DEFAULT 0)`.catch(() => {});
    const jobRuns = (await sql`SELECT job, ran_at, to_char(ran_at,'MM-DD HH24:MI') ran, ok, detail, EXTRACT(EPOCH FROM (now()-ran_at))/3600 age_h FROM agent_runs`.catch(() => [])) as any[];
    // 🔑 2026-08-29: 같은 원인의 실패를 **한 줄로 묶는다.**
    //   실측 — 오늘 03시 OAuth 세션이 만료되자 quality-redteam·rulegap·integrity·self-audit·dev 5개 잡이
    //   똑같은 이유로 죽었는데 관제탑엔 5줄이 따로 떠서 "에러 산더미"로 보였다(CEO 지적).
    //   원인이 하나면 조치도 하나다 — 쪼개서 보여주면 무엇을 해야 할지가 오히려 안 보인다.
    //   ⚠️ 묶는 건 표시뿐이다. 실패 자체를 숨기지 않고 잡 이름을 모두 적는다.
    const failed = jobRuns.filter((j) => j.ok === false);
    const isAuthFail = (d: string) => /authenticate|OAuth|session expired|claude-p 무응답|invalid api key|401|인증 만료|로그인 만료|세션 만료/i.test(d || "");
    // 🔑 2026-08-31 수리 — **이미 풀린 인증 실패가 화면을 영원히 빨갛게** 만들고 있었다.
    //   agent_runs는 `job TEXT PRIMARY KEY` = 잡당 1행이라 **마지막 실행 결과만** 남는다.
    //   그래서 인증이 끊긴 순간 실패한 잡은 **그 잡의 다음 정기 실행이 올 때까지 계속 '정지'로 보인다.**
    //   실측(08-30): 인증은 그날 밤 복구돼 dev-agent가 8회 연속 성공했는데도, 그 시각에 걸린
    //   auth-precheck·self-audit-agent 두 줄 때문에 11시간 내내 overall=critical이었다.
    //   → CEO가 보는 관제탑이 "할 일 없는 빨강"을 상시 띄우면 진짜 빨강을 못 알아본다.
    //   판정: 로컬 에이전트는 **같은 claude 로그인 하나를 공유**한다. 그러므로
    //         가장 늦은 인증실패보다 **뒤에 성공한 잡이 하나라도 있으면 인증은 이미 살아있다.**
    const rawAuthFails = failed.filter((j) => isAuthFail(j.detail || ""));
    const at = (x: any) => new Date(x).getTime() || 0;
    const newestAuthFail = rawAuthFails.length ? Math.max(...rawAuthFails.map((j) => at(j.ran_at))) : 0;
    const newestOk = Math.max(0, ...jobRuns.filter((j) => j.ok !== false).map((j) => at(j.ran_at)));
    const authRecovered = rawAuthFails.length > 0 && newestOk > newestAuthFail;
    const authFails = authRecovered ? [] : rawAuthFails;
    // 숨기지는 않는다 — 복구됐다는 **사실**을 정보로 남긴다(빨강 아님, overall에 반영 안 함).
    const authNotes = authRecovered
      ? [`ℹ️ 인증은 복구됨(이후 정상 실행 확인) — ${rawAuthFails.map((j) => j.job).join(", ")}의 기록은 만료 시점 그대로라 다음 정기 실행에서 갱신됩니다. 조치 불필요.`]
      : [];
    // 🛑→🟡 2026-09-04 — costwatch '전송 이상'은 차단기가 이미 작동해 스스로 조치된 상태라면
    //   사람이 할 일이 없다(어제 확장 배치 53.6GB가 하루 종일 critical을 눌렀다 — 원인 규명·설명 끝난 건인데도).
    //   빨강 자격 = 사람 조치 필요. 차단기 ON이면 '시스템이 대응 중' 주의로 내리고,
    //   차단기가 안 걸렸는데 이상이면(대응 실패) 그때만 빨강 유지.
    const costwatchAnomaly = failed.filter((j) => j.job === "cron-costwatch" && /데이터전송 이상/.test(j.detail || ""));
    let costHalted = false;
    try { const [g] = (await sql`SELECT halted FROM cost_guard WHERE id=1`.catch(() => [])) as any[]; costHalted = !!g?.halted; } catch {}
    const costwatchHandled = costHalted ? costwatchAnomaly : [];
    const costwatchNotes = costwatchHandled.map((j) => `🛑 전송 이상 감지 → 자동정지 작동 중(무거운 크론 휴무·정상화 시 자동 해제): ${(j.detail || "").slice(0, 90)}`);
    const otherFails = failed.filter((j) => !isAuthFail(j.detail || "") && !costwatchHandled.includes(j));
    const jobFails = [
      ...(authFails.length > 0
        ? [`🔑 자율 에이전트 로그인 만료 — ${authFails.length}개 잡 정지(${authFails.map((j) => j.job).join(", ")}). ` +
           `조치: 터미널에서 \`claude\` 로그인 1회. 마지막 실패 ${authFails[0].ran}`]
        : []),
      ...otherFails.map((j) => `${j.job} 오류(${j.ran}): ${(j.detail || "").slice(0, 70)}`),
    ];

    // 🔎 공개 데이터 무결성 실시간 자가검증 — 사장님이 잡은 버그 유형을 관제탑이 매번 스스로 검사.
    //   (동 형식·동=구명 오추출·동-구 불일치·카테고리 누락·좌표 오류) 위반 시 즉시 경보.
    // 수도권 좌표박스 기준(criteria) 캐시 프라임 — 자동비공개·복원이 synth와 같은 진실을 보게(폴백=36.8~38.3/124.5~127.9).
    await loadCriteria();
    const latMin = getCriterionSync("geo.box.lat_min"), latMax = getCriterionSync("geo.box.lat_max");
    const lngMin = getCriterionSync("geo.box.lng_min"), lngMax = getCriterionSync("geo.box.lng_max");
    const ig = (await sql`SELECT
      COUNT(*) FILTER (WHERE dong IS NOT NULL AND (area=dong||'구' OR area=dong||'시' OR area=dong||'군'))::int dong_isgu,
      COUNT(*) FILTER (WHERE dong IS NOT NULL AND dong !~ '(동|읍|면|가)$')::int dong_badfmt,
      COUNT(*) FILTER (WHERE naver_category IS NULL OR naver_category='')::int pub_nocat,
      COUNT(*) FILTER (WHERE lat IS NULL OR lat NOT BETWEEN ${latMin} AND ${latMax} OR lng NOT BETWEEN ${lngMin} AND ${lngMax})::int pub_badcoord,
      COUNT(*) FILTER (WHERE synth_identity IS NULL OR synth_identity='')::int pub_noidentity,
      -- 도(道) 교차오염: area의 도(인천%→인천, 끝이 구→서울, 끝이 시/군→경기)와 주소의 도가 다름 (예: area=강동구인데 주소=경기 남양주)
      COUNT(*) FILTER (WHERE address IS NOT NULL AND address<>''
        AND (CASE WHEN area LIKE '인천%' THEN '인천' WHEN area ~ '구$' THEN '서울' WHEN area ~ '(시|군)$' THEN '경기' END) IS NOT NULL
        AND (CASE WHEN address LIKE '서울%' THEN '서울' WHEN address LIKE '인천%' THEN '인천' WHEN address LIKE '경기%' THEN '경기' END) IS NOT NULL
        AND (CASE WHEN area LIKE '인천%' THEN '인천' WHEN area ~ '구$' THEN '서울' WHEN area ~ '(시|군)$' THEN '경기' END)
         <> (CASE WHEN address LIKE '서울%' THEN '서울' WHEN address LIKE '인천%' THEN '인천' WHEN address LIKE '경기%' THEN '경기' END))::int area_xprov
      FROM cafes WHERE published = true`)[0] as any;
    // 결정론적 '진짜 에러'는 검출 즉시 자율 교정(컨펌 불필요). 교정 실패 시에만 integrity 경보로 남김.
    // ⚠️ 자율교정은 '안전·결정론적인 것만' — 단, 비공개로 만드는 조치는 1회 상한(대량삭제 차단). pub_nocat는
    //   기존 검증카페까지 숨겨 인천 사태를 유발 → 자동 비공개에서 제외(카테고리 없음=비카페 아님). 동 교정만 무제한.
    const integrity: string[] = [];
    if (ig.dong_isgu || ig.dong_badfmt || ig.pub_badcoord || ig.pub_noidentity || ig.area_xprov) {
      const fixes: string[] = [];
      try {
        // 도 교차오염: area를 주소 기준으로 교정(공개/비공개 불문, 비공개 조치 아님 → 안전). 추출 실패 시 건드리지 않음.
        if (ig.area_xprov) {
          const r = await sql`UPDATE cafes SET area = CASE
              WHEN address LIKE '서울%' THEN substring(address from '([가-힣]+구)')
              WHEN address LIKE '인천%' THEN '인천 ' || substring(address from '인천광역시[ ]+([가-힣]+[구군])')
              WHEN address LIKE '경기%' THEN substring(address from '경기도[ ]+([가-힣]+[시군])')
            END, updated_at=now()
            WHERE address IS NOT NULL AND address<>''
              AND (CASE WHEN area LIKE '인천%' THEN '인천' WHEN area ~ '구$' THEN '서울' WHEN area ~ '(시|군)$' THEN '경기' END) IS NOT NULL
              AND (CASE WHEN address LIKE '서울%' THEN '서울' WHEN address LIKE '인천%' THEN '인천' WHEN address LIKE '경기%' THEN '경기' END) IS NOT NULL
              AND (CASE WHEN area LIKE '인천%' THEN '인천' WHEN area ~ '구$' THEN '서울' WHEN area ~ '(시|군)$' THEN '경기' END)
               <> (CASE WHEN address LIKE '서울%' THEN '서울' WHEN address LIKE '인천%' THEN '인천' WHEN address LIKE '경기%' THEN '경기' END)
              AND (CASE
                WHEN address LIKE '서울%' THEN substring(address from '([가-힣]+구)')
                WHEN address LIKE '인천%' THEN '인천 ' || substring(address from '인천광역시[ ]+([가-힣]+[구군])')
                WHEN address LIKE '경기%' THEN substring(address from '경기도[ ]+([가-힣]+[시군])')
              END) IS NOT NULL
            RETURNING 1`;
          if (r.length) fixes.push(`도 교차오염 ${r.length}곳 area 교정(주소기준)`);
        }
        if (ig.dong_isgu) { const r = await sql`UPDATE cafes SET dong=NULL WHERE dong IS NOT NULL AND (area=dong||'구' OR area=dong||'시' OR area=dong||'군') RETURNING 1`; if (r.length) fixes.push(`동=구명 ${r.length}곳 제거`); }
        if (ig.dong_badfmt) { const r = await sql`UPDATE cafes SET dong=NULL WHERE dong IS NOT NULL AND dong !~ '(동|읍|면|가)$' RETURNING 1`; if (r.length) fixes.push(`동형식오류 ${r.length}곳 제거`); }
        // 비공개 조치는 소수일 때만 자동(20건 초과면 대량 의심 → 자동조치 보류하고 경보로 surface)
        if (ig.pub_noidentity > 0 && ig.pub_noidentity <= 20) { const r = await sql`UPDATE cafes SET published=false WHERE published AND (synth_identity IS NULL OR synth_identity='') RETURNING id`; if (r.length) { fixes.push(`정체성없음 ${r.length}곳 비공개`); await invalidateCafeCaches(r.map((x: any) => x.id)).catch(() => {}); } }
        else if (ig.pub_noidentity > 20) integrity.push(`정체성없음 공개 ${ig.pub_noidentity}곳 — 대량(자동조치 보류, 점검필요)`);
        if (ig.pub_badcoord > 0 && ig.pub_badcoord <= 20) { const r = await sql`UPDATE cafes SET published=false WHERE published AND (lat IS NULL OR lat NOT BETWEEN ${latMin} AND ${latMax} OR lng NOT BETWEEN ${lngMin} AND ${lngMax}) RETURNING id`; if (r.length) { fixes.push(`좌표오류 ${r.length}곳 비공개`); await invalidateCafeCaches(r.map((x: any) => x.id)).catch(() => {}); } }
        else if (ig.pub_badcoord > 20) integrity.push(`좌표오류 공개 ${ig.pub_badcoord}곳 — 대량(자동조치 보류, 점검필요)`);
      } catch (e) { integrity.push(`무결성 자동교정 실패(즉시 확인): ${String(e).slice(0, 50)}`); }
      if (fixes.length) healed.push(`🔧 무결성 자율교정: ${fixes.join(", ")}`);
    }
    // 카테고리 미보유는 위험/경보 아님 — 검증된 카페라 지장 없음. 카테고리 에이전트에 '주의' 숫자로만 표시.
    // 🛑 지역 통째 사라짐 감지 — 카페 30곳+ 지역인데 공개 0 = 대량 비공개 버그(인천 사태). 정상 지역은 항상 일부 공개됨.
    // 🔧 2026-09-03 오탐 수리 — 충청 편입 당일 '대전 대덕구·세종시'가 이 경보에 걸렸다.
    //   신규 지역은 아직 수집·판정 전이라 공개 0이 **정상**인데, 원래 조건(등록 30+·공개 0)은
    //   그걸 인천 사태(공개 지역이 통째로 꺼짐)와 구분 못 했다.
    //   → '판정까지 끝난 카페 30+ · 공개 0 · 그중 공개등급(검증·참고)인데 비공개가 5+'일 때만 —
    //   즉 "공개돼야 할 것들이 무더기로 꺼져 있는" 상태만 잡는다. 인천형 사고는 이 조건에 그대로 걸린다.
    const regionGone = (await sql`SELECT area, COUNT(*)::int tot FROM cafes WHERE area IS NOT NULL GROUP BY area
      HAVING COUNT(*) FILTER (WHERE synth_updated IS NOT NULL) >= 30
         AND COUNT(*) FILTER (WHERE published) = 0
         -- pending 제외(2026-09-03 2차): 신규 지역은 등급을 받아도 승격(finalizer) 전까지 pending으로 대기한다.
         -- 세종이 발굴 당일 여기 걸렸다 — 절차 진행 중인 것은 '꺼진 것'이 아니다. 인천형 사고(라이브였다가
         -- 꺼짐)는 pending이 아니므로 감지력은 그대로다.
         AND COUNT(*) FILTER (WHERE NOT published AND synth_grade IN ('검증','참고') AND COALESCE(pipeline_status,'') <> 'pending') >= 5`.catch(() => [])) as any[];
    if (regionGone.length) integrity.push(`⚠️지역 통째 비공개 ${regionGone.length}곳(${regionGone.slice(0, 3).map((r) => r.area).join("·")}) — 대량삭제 의심`);

    // 🔧 치유 루프 폐쇄 — 비공개(excluded 등)된 카페의 오염 플래그는 '소비자 노출 remediated' → 자동 resolve.
    //   근본원인: 자가치유가 오염카페를 비공개시켜도 audit_flags를 안 닫아 플래그가 영구 적체 → verify evidence_contamination·
    //   오염카운트가 '이미 고쳐진(비공개) 카페'를 계속 red FAIL로 오경보하던 것. 재공개 시 selfaudit/audit 순환이 잔존
    //   오염을 다시 플래그하므로 안전. (audit_complete 시스템 마커는 제외 — 감사 로그라 유지)
    try {
      const r = await sql`UPDATE audit_flags SET resolved=true
        WHERE NOT resolved AND cafe_id IS NOT NULL AND issue <> 'audit_complete'
          AND NOT EXISTS (SELECT 1 FROM cafes c WHERE c.id = audit_flags.cafe_id AND c.published)
        RETURNING cafe_id`;
      if (r.length) healed.push(`오염 플래그 ${r.length}건 자동 정리(비공개=처리완료, 소비자 무노출)`);
    } catch { /* 감사 테이블 없음 등 → 무시(서비스 무영향) */ }

    // ⚠️ 위험/의심 선제 탐지 — 하드 위반은 아니지만 '문제 발생 소지' 있는 것을 수면 위로 올림(사장님이 보게).
    // ── 경보 2단계 분리 ──────────────────────────────────────────────
    //   위험(risks, 빨강) = '소비자에게 즉시 타격' 또는 '해자(옥석 큐레이션) 훼손' 또는 '엔진 정지'일 때만.
    //   주의(notices, 회색) = 백그라운드 대기열·자가치유 진행분. 소비자에 보이는 손상 아님 → 경보 아님.
    const PUB = c.published || 1;
    // 🔴 risks(빨강)에 넣을 자격 = **지금 소비자 화면이 실제로 망가졌는가** 뿐이다. (CEO 지시 2026-08-09)
    //   ①없어야 할 게 보인다(오염·환각·비수도권) ②있어야 할 게 없다(지도 누락·검색 붕괴) → risks.
    //   적체·대기·처리량·내부 프로세스·"품질이 나빠질 가능성"은 전부 notices. 상시 빨강은 진짜 오염을 묻는다.
    //   ※ 이 배열은 lib/issues.ts가 tower-risk 이슈(HIGH)로 그대로 미러하므로, 여기 한 줄이 곧 RM 보드의 빨강이다.
    const risks: string[] = [];
    const notices: string[] = [];
    // 🟡 2026-08-31 정정 — 이 안내를 어제 alerts에 넣었더니 **화면이 그대로 빨강으로 셌다.**
    //   /admin은 `alerts.length + risks.length`를 🔴 배지로 쓰고 "🚨 경보(즉시조치)" 빨간 박스에 그린다.
    //   "조치 불필요"라고 적힌 문장이 즉시조치 경보로 뜬 것 — 가짜 빨강을 없애려다 새 가짜 빨강을 만들었다.
    //   정보는 notices(주의·소비자 무관)가 제 자리다. alerts는 **조치가 필요할 때만** 쓴다.
    if (aiPaused) notices.push("⏸️ AI 판정·그라운딩 일시정지(CEO 지시 · 구독한도·콘솔비용 보호) — 공개카페는 규칙검증으로 정상 노출, 재개 시 자동 해소");

    // 소비자에게 '잘못된 데이터'(그라운딩 업체혼동·환각)가 공개 노출 = 해자(옥석) 직접 훼손.
    //   소수(<0.5% & <30)는 비공개 처리로 정리되는 수준 → 주의. 그 이상이면 해자 타격 → 위험.
    const suspect = gr?.suspect ?? 0;
    if (suspect > 0) {
      if (suspect >= Math.max(30, Math.round(PUB * 0.005))) risks.push(`소비자 노출 오염·환각 ${suspect}곳 — 해자(큐레이션) 훼손, 즉시 정리`);
      else notices.push(`품질 의심 ${suspect}곳(소수 — 비공개 처리 대상)`);
    }
    // 아래는 모두 '소비자에 보이는 손상 아님' = 주의(백그라운드). 진행 속도·완성도·감사 대기.
    if ((ds?.behind ?? 0) > 0) notices.push(`발굴 7일+ 미발굴 지역 ${ds.behind}곳(굶은 로테이션 — cron-grow 우선처리 중)`);
    if ((af?.open ?? 0) > 0) notices.push(`오염 플래그 ${af.open}건(검토 대기)`);
    const dgap = (await sql`SELECT COUNT(*)::int n FROM (SELECT area FROM cafes WHERE published GROUP BY area HAVING COUNT(*) >= 10 AND COUNT(*) FILTER (WHERE dong IS NOT NULL)::float / COUNT(*) < 0.9) x`.catch(() => [{ n: 0 }]))[0] as any;
    if (dgap.n > 0) notices.push(`동 채움 미흡 지역 ${dgap.n}곳(<90%)`);
    // 🧹 재합성 감시(토큰0 결정론). synth_backlog=새 리뷰 수집됐는데 규칙 미재적용(진짜 밀린 것). stale7=7일+ 미점검(순환 지연 — 실측 주기 8~9일).
    //   과거 '주4곳=61년 적체'가 초록불로 숨던 사각 — 실행이 아니라 '반영 여부'를 잰다.
    // 백로그 = 새로 모은 리뷰가 아직 규칙에 안 태워진 상태. 화면엔 **기존 검증 후기가 그대로 정상 노출**되므로
    //   소비자 손상이 아니다(늦게 반영될 뿐) → 주의. 빨강은 아래 '미착수·순환 정체'(그물이 실제로 멈춘 경우)만.
    if (c.synth_backlog > PUB * 0.10) notices.push(`재합성 백로그 ${c.synth_backlog}곳 — 새 리뷰 규칙 반영 대기(cron-resynth 처리량 점검)`);
    // ⚠️ 2026-08-09 재교정: stale7 고정창은 **순환 주기가 7일보다 길면 수학적으로 항상 빨강**이다.
    //   주기 C일의 정상 순환에서 stale7 = PUB×(C−7)/C → 20% 임계는 C<8.75일에서만 조용하다.
    //   실측 C≈8~9일이라 임계선 위에서 깜빡이며 07-05부터 35일간 HIGH로 눌러앉았다(#2526). 그물은 멀쩡했다.
    //   → 재는 대상을 바꾼다: **'가장 오래 안 훑은 카페의 나이'(순환 천장)**. 그물이 진짜 멈추면 이 값만 치솟는다.
    //   과거 '주4곳=61년 적체'도 이 지표면 즉시 빨강(천장 수천일) — 감도는 잃지 않고 상시 오경보만 제거.
    if (c.synth_never > 0) risks.push(`재합성 미착수 ${c.synth_never}곳 — 오염그물 사각(한 번도 안 훑음)`);
    // 🔧 2026-09-03 이중 수리: ①문구가 사실의 반대였다 — synth_oldest_d는 상위 1% 나이(순환 천장)인데
    //   "99%가 미점검"으로 읽혔다(실제로 CEO가 이 빨강을 보고 물었다). ②지문 게이트 설계상 천장은
    //   30일(안전망)까지 가는 게 정상 — 21일 임계면 영구 빨강이 된다. 안전망 파손(35일+)만 빨강.
    else if (c.synth_oldest_d > 35) risks.push(`재합성 순환 정체 — 가장 오래 안 본 상위 1%가 ${c.synth_oldest_d}일(30일 안전망 초과 = 그물 멈춤 의심)`);
    // 개별로 순환에서 빠진 카페 — 그물 전체는 도는데 몇 곳만 안 잡히는 상태. 소비자 화면은 멀쩡하므로 **주의**.
    //   (전체가 멈춘 것과 한 곳이 낀 것은 원인도 조치도 다르다 — 같은 빨강으로 묶으면 진짜 정체를 못 알아본다.)
    else if (c.synth_stuck > 0) notices.push(`재합성 순환 누락 ${c.synth_stuck}곳(최장 ${c.synth_max_d}일) — 그물은 정상 회전 중, 해당 카페만 재점검 필요`);
    // ⚠️ 2026-08-22 최종 제거: stale7은 **주의로 낮춰도 여전히 상시 발동**이었다.
    //   위 주석대로 정상 순환에서 stale7 = PUB×(C−7)/C이고 현재 C≈16일이라 항상 임계(20%)를 넘는다
    //   → 실측 9,316곳이 "정상 로테이션 지연"이라는 문구를 달고 매일 이슈 목록에 올라왔다.
    //   **정상인 상태를 알림으로 만들면 목록 전체의 신뢰가 깎인다.** 진짜 정체는 바로 위 순환 천장
    //   (synth_oldest_d > 21)이 이미 잡으므로 이 줄은 감도 손실 없이 삭제한다.
    // 임베딩 대기 = 의미검색만 일부 누락(카페는 정상 노출) → 주의. 단, 절반 이상이면 검색 핵심기능 타격 → 위험.
    const noemb = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published AND embedding IS NULL`.catch(() => [{ n: 0 }]))[0] as any;
    if (noemb.n > 0) { if (noemb.n > PUB * 0.5) risks.push(`의미검색 대량 누락 ${noemb.n}곳 — 검색 기능 타격`); else notices.push(`의미검색 임베딩 대기 ${noemb.n}곳`); }
    // 🔑 콘솔키 크레딧 소진 감시 — 소진 시 검색 재정렬(rerankWithClaude)·배치판정이 조용히 규칙폴백(무크래시).
    //   ⚖️ 심각도 판정(CEO 2026-07-08): 소비자 실제영향 × 폴백없음. 콘솔키 소진은 (a) 검색이 결정론(임베딩·성향축·등급)으로
    //   우아하게 폴백하고 그 LLM 재정렬은 사실상 미발동 얇은 마무리 층(7일 0회)이며, (b) 리뷰판정 moat는 구독(로컬)으로
    //   살아있어 콘솔키와 무관 → 소비자 저영향. 그래서 HIGH 아님(알람 노이즈 금지). LOW/정보성(notices)으로만 조용히 표면화.
    //   두 신호를 합쳐 트래픽과 무관하게 탐지: ① search_log.ai_err(실검색 24h) ② cron-sentinel 프로브 실측(console_key_state).
    //   신호 사라지면 자동 resolve. ※ '진짜 HIGH'(빈결과·오염 누출)는 아래 noemb·재합성·grounding 등 폴백붕괴 조건이 담당.
    const aiDeg = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE ai_err ~* 'credit|balance|http_40[012]')::int keyerrs,
        COUNT(*) FILTER (WHERE ai_err ~* 'http_429|overloaded|exception|http_5[0-9][0-9]')::int softerrs
      FROM search_log
      WHERE ts > now() - interval '24 hours' AND ai_err IS NOT NULL`.catch(() => [{ keyerrs: 0, softerrs: 0 }]))[0] as any;
    const probeCredit = await consoleCreditExhaustedByProbe(); // 순수 DB 읽기(외부호출 없음) — cron-sentinel 프로브 실측
    if ((aiDeg?.keyerrs ?? 0) > 0 || probeCredit) {
      const via = [probeCredit ? "프로브 실측" : null, (aiDeg?.keyerrs ?? 0) > 0 ? `실검색 24h ${aiDeg.keyerrs}건 폴백` : null].filter(Boolean).join("·");
      notices.push(`콘솔키 크레딧 소진 — 검색AI 재정렬·배치판정 콘솔경로 중단(${via}). 검색은 결정론 폴백 정상·moat는 구독 유지라 소비자 저영향. 충전 시 콘솔경로 복구(console.anthropic.com, 급하지 않음)`);
    }
    else if ((aiDeg?.softerrs ?? 0) >= 10) notices.push(`검색 AI 재정렬 일시오류 ${aiDeg.softerrs}건(최근 24h — 레이트리밋·과부하 추정, 지속 시 콘솔키 점검)`);
    // 그라운딩은 결정론적 규칙으로 대체됨 — '감사 대기' 백로그는 안 줄어드는 무의미 숫자라 notice에서 제외.
    // 🛡️ 리뷰-카페 불일치(규칙-사각 오염) — 표시 리뷰에 카페 맥락어가 없는 비율↑ = 딴 업종·문구이름 오염 의심.
    //   그라운딩(LLM)이 못 보던 사각지대를 결정론적으로 상시 감시. 소비자 노출이라 임계 넘으면 위험.
    // ⚠️ PROXY(맥락어 없음)라 진짜 카페(찻집·북카페·시적이름)도 오탐됨 → '위험(빨강)' 금지, 항상 '주의'(점검 권장 목록).
    //   사람이 목록 보고 진짜 오염만 비공개. 헛경보(red) 방지가 핵심.
    // offctx_ok=true = 사람이 '진짜 카페'로 확인한 화이트리스트 → 점검목록서 제외(프록시 오탐 반복표시 방지).
    const offctx = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published AND offctx_rate >= 0.55 AND NOT COALESCE(offctx_ok, false)`.catch(() => [{ n: 0 }]))[0] as any;
    const offctxSuspects = (await sql`SELECT name, area, round(offctx_rate::numeric, 2) AS rate FROM cafes WHERE published AND offctx_rate >= 0.55 AND NOT COALESCE(offctx_ok, false) ORDER BY offctx_rate DESC LIMIT 30`.catch(() => [])) as any[];
    if (offctx.n > 0) notices.push(`리뷰 맥락 의심 ${offctx.n}곳(점검 권장 — 일부 진짜 카페 포함될 수 있음)`);
    // 🔇 조용한 실패 — 삼킨 오류의 누적. 동작은 안 막았지만 '몇 건 잃었는지'는 보여야 한다(2026-08-29).
    //   임계(5건) 미만은 안 띄운다 — 한 번 튄 건 소음이고, 계속 막힌 것만 신호다.
    //   소비자 화면이 깨진 게 아니므로 **주의**(빨강 아님). 단, 유입 지표의 분모가 틀어질 수 있어 조기에 봐야 한다.
    try {
      const sf = await recentSilentFails(5);
      for (const f of sf) notices.push(`조용한 실패 ${f.scope} ${f.n}건(최근 2일) — ${String(f.last_error || "").slice(0, 60)}`);
    } catch {}

    // 🤖 규칙갭 자가학습 에이전트 — 직전 실행에서 자동학습/승인대기/롤백한 내역을 surface.
    try {
      const rg = (await sql`SELECT learned, pending, ran_at FROM rulegap_runs ORDER BY id DESC LIMIT 1`)[0] as any;
      if (rg) {
        const la = (rg.learned || []).filter((l: any) => l.action === "applied");
        const pd = (rg.pending || []);
        if (la.length > 0) healed.push(`규칙 자가학습 ${la.length}건 자동적용(${la.slice(0, 3).map((l: any) => l.term).join("·")})`);
        if (pd.length > 0) notices.push(`규칙갭 승인대기 ${pd.length}건(로직·고위험 — ${pd.slice(0, 3).map((p: any) => p.term).join("·")} 등, 검토 후 적용)`);
      }
    } catch {}

    // 📊 유입(트래픽) — 깜깜이 탈출. user_consents(익명 방문핑) 기반 활성자 + 유입경로 첫터치.
    //   봇/크롤러/내부/스크래퍼 제외 = lib/behaviorBot.ts BOT_ANON_IDS_SQL 단일출처(#503 후속,
    //   CEO "모든 기준을 그걸로" — 화면마다 다른 필터로 숫자가 갈리는 사고 재발 방지. 이전엔 이 파일 자체
    //   local BOT 상수가 'internal' 오분류 버그를 그대로 갖고 있었음).
    const traffic = (await sql.query(
      `SELECT
        COUNT(*) FILTER (WHERE last_seen > now()-interval '7 days')::int wau,
        COUNT(*) FILTER (WHERE last_seen > now()-interval '30 days')::int mau,
        COUNT(*) FILTER (WHERE last_seen > now()-interval '1 day')::int dau,
        COUNT(*) FILTER (WHERE created_at > now()-interval '7 days')::int new7
      FROM user_consents WHERE anon_id NOT IN (${BOT_ANON_IDS_SQL})`
    ).catch(() => [{ wau: 0, mau: 0, dau: 0, new7: 0 }]))[0] as any;
    const trafficSources = (await sql.query(
      `SELECT COALESCE(NULLIF(src,''),'미상') AS s, COUNT(*)::int n
       FROM user_consents
       WHERE last_seen > now()-interval '30 days' AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
       GROUP BY 1 ORDER BY n DESC LIMIT 12`
    ).catch(() => [])) as any[];
    if ((traffic?.mau ?? 0) > 0 && trafficSources.every((r) => r.s === "미상")) {
      notices.push(`유입경로 데이터 수집 시작 — 출처는 다음 방문분부터 채워집니다(현재 방문자 출처 '미상')`);
    }
    // 출처별 참여도(평균 페이지뷰) — 어디서 온 사람이 더 들러붙나.
    // 🐛 정의정정(협업#337, 08-24) — avg_visits = AVG(visit_count)는 페이지뷰 누적치, "재방문수" 아님(admin/analytics.ts와 동일 정의 사용).
    const sourceEngage = (await sql.query(
      `SELECT COALESCE(NULLIF(src,''),'미상') AS s, COUNT(*)::int n, ROUND(AVG(COALESCE(visit_count,1))::numeric,1) AS avg_visits
       FROM user_consents WHERE last_seen > now()-interval '30 days' AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
       GROUP BY 1 ORDER BY n DESC LIMIT 8`
    ).catch(() => [])) as any[];
    // 신규 vs 재방문(최근 30일 활성)
    // 🐛 재발방지(2026-07-26, admin/analytics와 동일 버그 여기도 복제돼 있었음) — visit_count는
    //   페이지뷰 누적치라 한 세션 2페이지만 봐도 '재방문'으로 잡혔다(실측 478명 vs 실제 날짜기준 28명,
    //   ~17배 과대). traffic_events의 날짜(KST) distinct count로 재계산.
    const retention = (await sql.query(
      `WITH days AS (
         SELECT anon_id, COUNT(DISTINCT date_trunc('day', ts AT TIME ZONE 'Asia/Seoul'))::int d
         FROM traffic_events WHERE ts > now() - interval '30 days' GROUP BY anon_id
       )
       SELECT COUNT(*) FILTER (WHERE d <= 1)::int newcomers,
              COUNT(*) FILTER (WHERE d > 1)::int ret
       FROM days WHERE anon_id NOT IN (${BOT_ANON_IDS_SQL})`
    ).catch(() => [{ newcomers: 0, ret: 0 }]))[0] as any;

    // 📈 페이지뷰 분석(traffic_events) — 자체 집계. 90일 보존(여기서 정리).
    //   ⚠️ 이전엔 이 4개 쿼리에 봇필터가 전혀 없었다(원시 카운트) — 관제탑이 노출봇을 그대로 보여주던 사각.
    await sql`DELETE FROM traffic_events WHERE ts < now() - interval '90 days'`.catch(() => {});
    const pageBuckets = (await sql`
      SELECT CASE
        WHEN path = '/' OR path = '' OR path IS NULL THEN '홈'
        WHEN path LIKE '/c/%' THEN '카페상세'
        WHEN path LIKE '/area%' THEN '지역'
        WHEN path LIKE '/taste%' THEN '취향'
        WHEN path LIKE '/owner%' OR path LIKE '/cafe/register%' THEN '사장님'
        ELSE '기타' END AS bucket,
        COUNT(*)::int views, COUNT(DISTINCT anon_id)::int uniques
      FROM traffic_events WHERE ts > now()-interval '30 days'
        AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
      GROUP BY 1 ORDER BY views DESC`.catch(() => [])) as any[];
    // ⚡ 2026-09-02 — 관제탑도 같은 병이었다: 조인이 `te.path = '/c/' || c.id`(계산식)라
    //   인덱스를 못 써 traffic_events × cafes 전조합을 문자열 비교했다(analytics에선 실측 72초).
    //   path에서 id를 뽑아 cafes.id(기본키)로 조인한다. 결과 동일.
    const topCafes = (await sql`
      WITH v AS (
        SELECT (substring(path from '^/c/([0-9]+)$'))::int cid, anon_id
        FROM traffic_events
        WHERE ts > now()-interval '30 days' AND path ~ '^/c/[0-9]+$'
          AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
      )
      SELECT c.name, c.area, COUNT(*)::int views, COUNT(DISTINCT v.anon_id)::int uniques
      FROM v JOIN cafes c ON c.id = v.cid
      GROUP BY c.id, c.name, c.area ORDER BY views DESC LIMIT 10`.catch(() => [])) as any[];
    // 퍼널: 방문자 중 카페상세까지 본 비율(둘러보기→몰입 전환)
    const funnel = (await sql`
      SELECT COUNT(DISTINCT anon_id)::int visitors,
             COUNT(DISTINCT anon_id) FILTER (WHERE path LIKE '/c/%')::int viewed_cafe
      FROM traffic_events WHERE ts > now()-interval '30 days'
        AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})`.catch(() => [{ visitors: 0, viewed_cafe: 0 }]))[0] as any;
    const pageviews30d = (await sql`SELECT COUNT(*)::int n FROM traffic_events WHERE ts > now()-interval '30 days'
      AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})`.catch(() => [{ n: 0 }]))[0]?.n ?? 0;

    // 파이프라인 진행 상황(신규 카페 조립라인)
    const pl = (await sql`SELECT
      COUNT(*) FILTER (WHERE pipeline_status='new')::int p_new,
      COUNT(*) FILTER (WHERE pipeline_status='pending')::int p_pending,
      COUNT(*) FILTER (WHERE pipeline_status='pending' AND llm_judged_at IS NULL)::int wait_judge,
      COUNT(*) FILTER (WHERE pipeline_status='pending' AND llm_judged_at IS NOT NULL AND embedding IS NULL)::int wait_embed,
      COUNT(*) FILTER (WHERE pipeline_status='pending' AND llm_judged_at IS NOT NULL AND embedding IS NOT NULL)::int ready,
      COUNT(*) FILTER (WHERE pipeline_status='live')::int live,
      COUNT(*) FILTER (WHERE pipeline_status='rejected')::int rejected
      FROM cafes`)[0] as any;

    // 오늘 수집·진행 현황 + 동 백필 커버리지 — 관리자 '오늘의 수집' 패널용.
    //   ⚠️ new_today·yt_today(오늘 신규·유튜브)는 위 daily(lib/metrics·KST)에서 가져온다 — 화면별 정의 어긋남 방지.
    const td = (await sql`SELECT
      COUNT(*) FILTER (WHERE synth_updated >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')::int synth_today,
      COUNT(*) FILTER (WHERE published AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')::int published_today,
      COUNT(*) FILTER (WHERE dong IS NOT NULL)::int has_dong,
      COUNT(*) FILTER (WHERE pipeline_status='noise')::int noise,
      COUNT(*) FILTER (WHERE pipeline_status='new')::int new_q,
      COUNT(*) FILTER (WHERE yt_checked_at IS NOT NULL)::int yt_total
      FROM cafes`)[0] as any;

    // ── 2) 자가 치유 ──
    // 결재#408: heal 루프(합성 적체·healPublishedAudit)가 백로그 증가로 길어지면 maxDuration에 걸려
    //   recordRun 호출 전에 플랫폼이 강제종료 → agent_runs 미갱신·무한 정지로 오판되던 근본원인.
    //   maxDuration 여유 내로 하드 데드라인을 둬 이 두 루프가 아무리 길어져도 recordRun까지는 반드시 도달하게 한다.
    const HEAL_DEADLINE = now + 260_000; // maxDuration 300s - 40s 안전마진(신호수집·건강판정·기록 구간)
    let promoted = 0;
    if (heal) {
      let unpubThisRun = 0; // 비공개 발생 시 검색캐시 자동 무효화용(소비자 검색에 비공개 카페가 남는 것 방지)
      // 🔴 2026-08-29 순서 교정 — 이 블록은 원래 heal의 **9번째**였다.
      //   앞에 synthAndStore를 도는 무거운 루프가 둘((a) 합성 적체·(e-1b) orphan) 있어서, 백로그가 크면
      //   260초 예산(HEAL_DEADLINE)을 그쪽이 다 먹고 **소비자 오염 제거가 굶었다.**
      //   실측: 오염 15곳이 08-28 22시부터 공개돼 있었는데 08-29 12:27 정기 heal이 손대지 못했다
      //   (updated_at이 6~7월 = 홀드 UPDATE가 한 번도 실행된 적 없음). 수동 호출하니 즉시 15곳 홀드됨.
      //   → 적체 메움은 '늦어도 되는 백그라운드'지만 오염 노출은 **지금 소비자가 보는 손상**이다.
      //     비용도 정반대다: 이건 UPDATE 한 방(수십 ms), 앞의 루프는 카페당 수 초. 맨 앞으로 올린다.
      // (e-1c) 이름오염(coherence<0.3) 자동 홀드 — 노출 후기가 실제 그 카페를 거의 안 말하는 공개 카페(namepol HIGH, 토큰충돌 오염).
      //   결정론이 '명확 통과'로 분류해 AI판정 대상조차 안 되는 오염은 coherence가 유일한 그물. 지금껏 이슈만 뜨고 자동조치 없어
      //   '처리중'으로 방치됐음(#1420). raw 있어도 재합성으로 coherence 안 오르면 홀드(되돌림가능·재합성 개선 시 복귀). 대량이면 규칙회귀로 보고 중단·경보.
      try {
        const namepol = (await sql`SELECT id, name FROM cafes
          WHERE published AND synth_coherence IS NOT NULL AND synth_coherence < 0.3
            AND COALESCE(offctx_ok, false) = false ORDER BY id LIMIT 16`) as any[];
        if (namepol.length > 15) {
          integrity.push(`🚨이름오염(coherence<0.3) 급증(${namepol.length}곳+) — 규칙회귀 의심, 자동홀드 중단·즉시 점검`);
        } else if (namepol.length > 0) {
          const r = (await sql`UPDATE cafes SET published=false, pipeline_status='held', updated_at=now()
            WHERE published AND synth_coherence < 0.3 AND COALESCE(offctx_ok, false) = false RETURNING id`) as any[];
          if (r.length) { unpubThisRun += r.length; await invalidateCafeCaches(r.map((x: any) => x.id)).catch(() => {}); healed.push(`이름오염(coherence<0.3) ${r.length}곳 자동 홀드(${namepol.slice(0, 3).map((x: any) => x.name).join(", ")})`); }
        }
      } catch {}
      // (a) 합성 적체(raw 있는데 미합성) 메움 → 신규 'new'가 'pending'으로 진행
      if (c.synth_q > 0) {
        const todo = await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NOT NULL AND synth_updated IS NULL LIMIT 50`;
        let done = 0;
        for (const cf of todo as any[]) {
          if (Date.now() > HEAL_DEADLINE) break;
          try { await synthAndStore(cf, { refresh: false }); done++; } catch {}
        }
        if (done) healed.push(`합성 적체 ${done}건 처리`);
      }
      // (b) 풀 게이트 통과한 pending → 자동 공개 승격(finalizer)
      const fin = await finalizePipeline();
      promoted = fin.promoted;
      if (fin.promoted > 0) healed.push(`전 에이전트 통과 ${fin.promoted}곳 자동 공개(${fin.names.slice(0, 3).join(", ")}${fin.promoted > 3 ? " 외" : ""})`);
      // (b-2) 좌표 백필 지연으로 굳은 미공개 복원 — 합성 시점엔 좌표 없거나 박스 밖이라 published=false로 굳었으나,
      //   이후 지오코딩 백필로 박스 안에 들어온 카페. pipeline_status='live'(그라운딩 보류 'held' 아님) + 검증/참고면 공개해야 정상.
      //   (광주시 통째 비공개 경보의 근본 원인 — 재합성 없이도 자동 복원)
      try {
        const r = await sql`UPDATE cafes SET published=true, updated_at=now()
          WHERE pipeline_status='live' AND NOT published
            AND synth_grade IN ('검증','참고')
            AND lat BETWEEN ${latMin} AND ${latMax} AND lng BETWEEN ${lngMin} AND ${lngMax}
          RETURNING 1`;
        if (r.length) healed.push(`좌표백필 미공개 ${r.length}곳 자동 복원(live+박스안+검증/참고)`);
      } catch {}
      // (c) 레드팀 PII 누출 자가치유 — 공개 인용문 전화·이메일·핸들 제거
      try { const pii = await scrubPublishedPII(); if (pii.scrubbed > 0) healed.push(`PII 세척 ${pii.scrubbed}곳(${pii.names.slice(0, 3).join(", ")})`); } catch {}
      // (c-1) 위탁판매 게시판 등록양식(네임택 첨부 안내) 인용문 제거 — [정합성조사 #542]
      try { const vt = await healVendorTemplateQuotes(); if (vt.scrubbed > 0) healed.push(`벤더양식 인용문 ${vt.removed}건 제거 ${vt.scrubbed}곳(${vt.names.slice(0, 3).join(", ")})`); } catch {}
      // (d) LLM 그라운딩 의심(업체혼동·환각) 자가치유 — 재합성 교정(로컬 그라운딩이 재검사해 플래그 해소)
      try { const gr = await healGroundingSuspects(); if (gr.resynthed > 0) healed.push(`그라운딩 의심 ${gr.resynthed}곳 재합성 교정`); } catch {}
      // (e) 그라운딩 '근거0건' 확정 카페 자동 보류(비공개) + 개선 시 복귀(경로는 있으나 실질 미발동 —
      //   그라운딩 표본이 공개 카페만 대상이라 held는 재검 대상 밖. 상세: lib/synthStore.ts holdZeroEvidenceSuspects 주석)
      try { const z = await holdZeroEvidenceSuspects(); if (z.held > 0) { unpubThisRun += z.held; healed.push(`근거0건 ${z.held}곳 자동 비공개(${z.names.slice(0, 3).join(", ")})`); } if (z.released > 0) healed.push(`복원 ${z.released}곳`); } catch {}
      // (e-1b) orphan_published 자가치유 — 정체성·등급은 정상인데 근거후기(synth_reviews)만 0인 공개 카페.
      //   정체성없음(pub_noidentity)·그라운딩의심·근거0확정 어느 그물에도 안 걸려 방치되던 사각(검증 fail의 정체).
      //   raw 있으면 재합성으로 근거 복구, 그래도 0이면 비공개(근거 없는 노출 차단). 대량이면 합성회귀로 보고 자동행동 중단·경보.
      try {
        // 💰 2026-09-05(CEO 승인 수리): jsonb_array_length 전수 디토스트 → 파생컬럼 synth_ev_n(트리거 유지)로 교체.
        const orphans = (await sql`SELECT id, name, area FROM cafes
          WHERE published AND raw_reviews IS NOT NULL
            AND COALESCE(synth_ev_n, 0) = 0
          ORDER BY id LIMIT 31`) as any[];
        if (orphans.length > 30) {
          integrity.push(`🚨orphan_published 급증(${orphans.length}곳+) — 합성 회귀 의심, 자동교정 중단·즉시 점검`);
        } else if (orphans.length > 0) {
          let recovered = 0, heldOrphan = 0;
          for (const cf of orphans) {
            try { await synthAndStore({ id: cf.id, name: cf.name, area: cf.area ?? "" }, { refresh: false }); } catch {}
            const [chk] = (await sql`SELECT jsonb_array_length(COALESCE(synth_reviews, '[]'::jsonb)) ev FROM cafes WHERE id = ${cf.id}`) as any[];
            if ((chk?.ev ?? 0) > 0) recovered++;
            else { await sql`UPDATE cafes SET published=false, pipeline_status='excluded', updated_at=now() WHERE id=${cf.id}`; await invalidateCafeCaches([cf.id]).catch(() => {}); heldOrphan++; unpubThisRun++; }
          }
          if (recovered > 0) healed.push(`orphan(근거0) ${recovered}곳 재합성 복구`);
          if (heldOrphan > 0) healed.push(`orphan(근거0·복구불가) ${heldOrphan}곳 자동 비공개`);
        }
      } catch {}
      // (e-2) '절대 카페 아님' 카테고리 자동 비공개 — 그랜드파더 비카페(건설·수목원·병원·미용·캠핑 등)를 카테고리로 자동 솎음(수기 불필요)
      try { const nc = await healNonCafeCategory(); if (nc.held > 0) { unpubThisRun += nc.held; healed.push(`비카페 카테고리 ${nc.held}곳 자동 비공개(${nc.names.slice(0, 3).join(", ")})`); } } catch {}
      // (e-2b) 노출리뷰 기반 오프콘셉 — 네이버가 '카페'로 분류했지만 리뷰는 애견·키즈·만화·보드게임 등 활동공간(자기이름+업종 우세)
      try { const oc = await healOffConceptByReview(); if (oc.held > 0) { unpubThisRun += oc.held; healed.push(`리뷰기반 오프콘셉 ${oc.held}곳 자동 비공개(${oc.names.slice(0, 3).join(", ")})`); } } catch {}
      try { const ob = await healOutOfBox(); if (ob.excluded > 0) { unpubThisRun += ob.excluded; healed.push(`수도권 밖(비수도권) ${ob.excluded}곳 자동 제외(${ob.names.slice(0, 3).join(", ")})`); } } catch {}
      // (e-3) area 라벨 교정 — 발굴지역으로 잘못 붙은 area를 실제 주소 도시로(검색·필터·폐업체크 오탐 차단)
      try { const al = await healAreaLabel(); if (al.fixed > 0) healed.push(`area 라벨 ${al.fixed}곳 주소기준 교정(${al.names.slice(0, 3).join(", ")})`); } catch {}
      // (f) 통합 재검증 자가치유 — 공개 카페를 커서로 순환하며 현재의 모든 게이트(비카페·프랜차이즈·광고·동명오염·등급)로
      //     재합성. 규칙 개선이 기존 공개 데이터에 며칠 안에 자동 반영됨. 대량 비공개는 규칙회귀로 보고 즉시 중단·경보.
      try {
        const au = await healPublishedAudit(600, 120, Math.max(0, HEAL_DEADLINE - Date.now()));
        if (au.unpublished > 0) { unpubThisRun += au.unpublished; healed.push(`재검증 자가치유 ${au.unpublished}곳 비공개(규칙 위반: ${au.names.slice(0, 3).join(", ")})`); }
        if (au.flagged > 0) integrity.push(`근거 오염 ${au.flagged}곳(재합성후에도 카페명 불일치) — 점검필요`);
        if (au.regression) integrity.push(`🚨재검증 대량 비공개(${au.unpublished}곳+) — 규칙 회귀 의심, 자가치유 중단됨·즉시 점검`);
      } catch {}
      // (g) 비공개 발생 시 검색캐시 무효화 — 비공개 카페가 캐시된 검색결과에 남는 것 즉시 차단.
      if (unpubThisRun > 0) { try { await sql`DELETE FROM search_cache`; healed.push(`검색캐시 정리(비공개 ${unpubThisRun}곳 반영)`); } catch {} }
    }

    // ── 3) 에이전트별 건강 판정 ──
    const agents: AgentHealth[] = [];
    const add = (key: string, label: string, last: string | null, cadenceH: number, queue: number, note = "") => {
      const ageH = ageHours(last, now);
      let status: AgentHealth["status"] = freshness(ageH, cadenceH);
      agents.push({ key, label, lastRun: last, ageH: ageH == null ? null : Math.round(ageH * 10) / 10, cadenceH, status, queue, note });
    };
    // 신선도는 '수집을 시도한 시각'(raw_checked_at)으로 판단 — 재수집이 돌아도 내용이 같으면 raw_collected_at은 안 변하므로,
    //   raw_collected_at으로 신선도를 보면 멀쩡히 도는데도 stale로 오인됨(들쭉날쭉 수정의 부작용 차단).
    const lastCheck = c.last_check ?? c.last_collect;
    add("discover", "발굴 (grow·지역수색)", lastCheck, 24, ds.behind, ds.behind ? `${ds.behind}/${ds.n} 지역 7일+ 미발굴(굶음)` : `${ds.n}개 지역 순환중`);
    add("collect", "수집 (warmup·raw)", lastCheck, 16, c.collect_q, c.collect_q ? `${c.collect_q}곳 미수집` : `raw 수집·재수집`);
    add("synth", "합성 (옥석·등급)", c.last_synth, 24, c.synth_q, c.synth_q ? "미합성 적체" : "적체 없음");
    // 카테고리·동 채움 단계도 개별 모니터(발굴~수집 세분화)
    // pubND(공개 카페 중 동 없음)는 아래 dongPct 계산에도 재사용 — 블록 밖으로 선언(스코프 버그 방지).
    const pubND = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published AND dong IS NULL`.catch(() => [{ n: 0 }]))[0] as any;
    {
      const catRun = jobRuns.find((j: any) => j.job === "dong-backfill");
      const pubNoCat = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published AND (naver_category IS NULL OR naver_category='')`.catch(() => [{ n: 0 }]))[0] as any;
      const cAge = ageHours(catRun?.ran_at ?? null, now);
      // 카테고리 미보유는 소비자 지장 없음(검증된 카페) → 평소엔 정보성. 대량(>1000)일 때만 백필 정체로 보고 warn.
      agents.push({ key: "category", label: "카테고리 검증", lastRun: catRun?.ran_at ?? null, ageH: cAge == null ? null : Math.round(cAge * 10) / 10, cadenceH: 26, status: pubNoCat.n > 1000 ? "warn" : "ok", queue: pubNoCat.n, note: pubNoCat.n ? `미보유 ${pubNoCat.n}(검증카페·지장없음)` : "전수 완료" });
      const dAge = ageHours(catRun?.ran_at ?? null, now);
      agents.push({ key: "dongfill", label: "동 채움 (백필)", lastRun: catRun?.ran_at ?? null, ageH: dAge == null ? null : Math.round(dAge * 10) / 10, cadenceH: 26, status: pubND.n > 50 ? "warn" : "ok", queue: pubND.n, note: pubND.n ? `공개 동없음 ${pubND.n}` : "공개 동 100%" });
    }
    // 미판정 내역은 0인 항목은 숨기고 실제 남은 것만 표기(사장님: 헷갈릴 내용 말고 사실만).
    const jbParts = ([["신규", jb.newjudge], ["재수집변경", jb.recollect], ["그라운딩재검", jb.reground]] as [string, number][]).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`);
    add("judge", "AI 판정 (Haiku·새벽·보조정제)", c.last_judge, 30, judgeQ, `공개카페는 규칙검증돼 노출중 · LLM 보조정제 대기 ${judgeQ}곳(새벽 Batches 자동·소비자 품질무관)${verifiedSkip ? ` · 옥석(검증) ${verifiedSkip}곳은 규칙검증 완료라 AI판정 스킵(설계·후순위)` : ""}${jbParts.length > 1 ? ` [${jbParts.join("+")}]` : ""}`);
    add("embed", "임베딩", c.last_embed, 30, c.embed_q, c.embed_q ? `미임베딩 ${c.embed_q}` : `완료(공개 ${c.published ? Math.round((c.pub_embedded / c.published) * 100) : 0}%)`);
    add("verify", "검증 레드팀", vr?.ran_at ?? null, 30, (vr?.fails ?? 0) + (vr?.warns ?? 0), vr ? `fail ${vr.fails}·warn ${vr.warns}` : "리포트 없음");
    // 품질감사: 미해결 플래그 기준(가동 시각은 flag 생성 시각으로 근사)
    {
      const open = af?.open ?? 0;
      const aAge = ageHours(af?.last_flag ?? null, now);
      agents.push({ key: "audit", label: "품질 자가감사", lastRun: af?.last_flag ?? null, ageH: aAge == null ? null : Math.round(aAge * 10) / 10, cadenceH: 30, status: open > 0 ? "warn" : "ok", queue: open, note: open ? `미해결 오염 ${open}건` : "오염 없음" });
    }
    {
      const sus = gr?.suspect ?? 0;
      const gAge = ageHours(gr?.last ?? null, now);
      // 그라운딩은 결정론적 규칙(브랜드토큰·거래글·비카페업종)으로 대체됨 — 안 줄어드는 '감사 대기' 백로그는
      //   의미 없으니 큐로 안 씀. 에이전트 지표 = '소비자 노출 의심'(공개중)만. 의심>0일 때만 warn.
      agents.push({ key: "grounding", label: "그라운딩 (노출 오염 검사)", lastRun: gr?.last ?? null, ageH: gAge == null ? null : Math.round(gAge * 10) / 10, cadenceH: 30, status: sus > 0 ? "warn" : "ok", queue: sus, note: sus > 0 ? `소비자 노출 오염 ${sus}건 — 확인 필요` : `현재 소비자 노출 오염 0건 · 규칙으로 상시 검증` });
    }
    // 통합 재검증 자가감사 — 공개 카페를 현재 규칙으로 순환 재검(규칙 개선이 기존 데이터에 자동 반영). 7일 내 미재검분이 많으면 정체.
    {
      const a7 = auditCov?.a7 ?? 0, pub = auditCov?.pub ?? 1;
      const covPct = pub ? Math.round((a7 / pub) * 100) : 0;
      const aaAge = ageHours(auditCov?.last_audit ?? null, now);
      agents.push({ key: "selfaudit", label: "재검증 자가감사", lastRun: auditCov?.last_audit ?? null, ageH: aaAge == null ? null : Math.round(aaAge * 10) / 10, cadenceH: 8, status: aaAge != null && aaAge > 12 ? "warn" : "ok", queue: Math.max(0, pub - a7), note: `7일내 재검 ${a7}/${pub}(${covPct}%) · 전 공개카페를 현재 규칙으로 순환 재검증(드리프트 자동치유)` });
    }

    // ⏸️ AI 판정이 CEO 지시로 정지된 상태면 '멈춤(stalled)'이 아니라 의도적 대기 → idle(중립)로 표시.
    //   경보·전체상태 저하 유발 안 함. 공개카페는 규칙검증으로 노출 유지(판정=보조정제).
    if (aiPaused) {
      const j = agents.find((a) => a.key === "judge");
      if (j) { j.status = "idle"; j.note = `⏸️ 일시정지(CEO 지시·비용 보호) — 재개 시 자동해소 · ${j.note}`; }
    }

    // ── 4) 종합 건강 ──
    // core = 소비자 조립라인(수집·합성)만. AI 판정은 '보조정제'(공개카페는 규칙검증이 1차 게이트,
    //   판정 정지해도 소비자 노출 품질 무관)라 단독 정지로 critical 승격 금지 — degraded/notice까지만.
    const core = agents.filter((a) => ["collect", "synth"].includes(a.key));
    // 위험(risks)·엔진정지·무결성위반·배치크래시 = critical(빨강). 에이전트 멈춤·지연·경고 = degraded(노랑).
    //   주의(notices)는 백그라운드 대기열이라 전체 상태를 떨어뜨리지 않음 — 정보로만 표시(소비자 무관).
    //   ⚠️ 2026-08-31: 인증 만료는 **소비자 화면 무손상**(내부 에이전트 문제)이고 CEO 로그인 1회면 끝이다.
    //     CEO 원칙 "빨강은 소비자 손상일 때만"에 따라 critical 승격에서 빼고 degraded(주의)로 내린다.
    //     바로 위 주석이 이미 "에이전트 멈춤·지연·경고 = degraded"라고 적어놓고 코드는 안 그랬다.
    //     다른 배치 크래시(otherFails)는 데이터 손상 가능성이 있으므로 critical 그대로 유지한다.
    const overall = (core.some((a) => a.status === "stalled") || otherFails.length || integrity.length || risks.length) ? "critical"
      : (authFails.length || agents.some((a) => a.status === "stalled" || a.status === "behind" || a.status === "warn")) ? "degraded"
      : "healthy";
    // 배치 크래시·실패 + 데이터 무결성 위반을 최상단 경보로 — '관제탑이 잡아서 알림'
    if (authNotes.length) notices.unshift(...authNotes); // 🟡 정보 — 빨강 아님(위 정정 참조)
    if (costwatchNotes.length) notices.unshift(...costwatchNotes); // 🛑 차단기가 이미 대응 중 — 주의로
    const alerts = [...jobFails, ...integrity.map((s) => `🔎 무결성: ${s}`), ...agents.filter((a) => a.status === "stalled").map((a) => `${a.label} 멈춤(${a.ageH}h 전 마지막 가동)`)];

    const pct = (n: number) => (c.total ? Math.round((n / c.total) * 100) : 0);
    // 신규 카페 조립라인(발굴→합성→AI판정→임베딩→공개). 각 단계 대기 수 = '어디서 막혔나'.
    const pipeline = {
      stages: [
        { key: "new", label: "신규수집", count: pl.p_new, note: "합성 대기(=pipeline_status:new)" },
        { key: "pending", label: "검증중", count: pl.p_pending, note: "공개 전 게이트" },
        { key: "wait_judge", label: "AI판정 대기", count: pl.wait_judge, note: "새벽 판정" },
        { key: "wait_embed", label: "임베딩 대기", count: pl.wait_embed, note: "" },
        { key: "ready", label: "승격 준비", count: pl.ready, note: "곧 공개" },
        { key: "live", label: "파이프라인 통과", count: pl.live, note: "전 게이트 통과(pipeline_status='live') — 이후 수동 비공개 처리된 곳 포함, 지금 실제 공개수는 아래 '공개 N/M' 참조" },
        { key: "verified_skip", label: "옥석·AI판정 스킵(후순위)", count: verifiedSkip, note: "검증등급 규칙검증 완료 → AI 재판정 불필요(설계·의도적 후순위·유령 백로그 아님)" },
        { key: "rejected", label: "차단", count: pl.rejected, note: "품질 미달" },
      ],
      promotedThisRun: promoted,
    };

    // 🔧 동 채움 %(2026-07-26 정정): 이전엔 전체 카페(공개+비공개) 기준이라 신규 미공개 카페가
    //   유입될 때마다 "동 채움" 타일이 100% 밑으로 계속 흔들렸는데, 정작 동 채움 담당(dongfill)
    //   에이전트 자신은 "공개 카페 동 100%"라고 공개 카페 기준으로만 주장 — 같은 화면에서 서로
    //   다른 모집단을 "동 채움"이라는 같은 이름으로 보여주던 불일치. 타일도 공개 카페 기준(pubND)
    //   으로 통일해 에이전트의 주장과 항상 일치하게 만든다.
    const dongPct = c.published ? Math.round(((c.published - pubND.n) / c.published) * 100) : 0;
    const health = {
      generatedAt: new Date(now).toISOString(),
      overall, alerts, healed, risks, notices, integrity,
      coverage: { total: c.total, published: c.published, rawCachedPct: pct(c.raw_cached), judgedPct: pct(c.judged), embeddedPct: c.published ? Math.round((c.pub_embedded / c.published) * 100) : 0, dongPct, synthBacklog: c.synth_backlog, synthStale7: c.synth_stale7, synthOldestD: c.synth_oldest_d, synthMaxD: c.synth_max_d, synthStuck: c.synth_stuck, synthNever: c.synth_never },
      today: { newCafes: daily.newCafes, synthesized: td.synth_today, published: td.published_today, hasDong: td.has_dong, dongPct, noise: td.noise, newQueue: td.new_q, ytToday: daily.yt, ytTotal: td.yt_total },
      pipeline, agents,
      grounding: { suspectCount: gr?.suspect ?? 0, suspects: grSuspects },
      offctx: { count: offctx.n, suspects: offctxSuspects },
      traffic: {
        dau: traffic?.dau ?? 0, wau: traffic?.wau ?? 0, mau: traffic?.mau ?? 0, new7: traffic?.new7 ?? 0,
        sources: trafficSources, sourceEngage,
        retention: { newcomers: retention?.newcomers ?? 0, returning: retention?.ret ?? 0 },
        pageviews30d, pageBuckets, topCafes,
        funnel: { visitors: funnel?.visitors ?? 0, viewedCafe: funnel?.viewed_cafe ?? 0 },
      },
    };

    await sql`INSERT INTO orchestrator_state (id, health, updated_at) VALUES (1, ${JSON.stringify(health)}, now())
      ON CONFLICT (id) DO UPDATE SET health = EXCLUDED.health, updated_at = now()`;

    if (heal) await recordRun("orchestrator-heal", true, `${overall} · 자동조치 ${healed.length}건`, healed.length);
    return NextResponse.json({ ok: true, ...health });
  } catch (e) {
    if (req.nextUrl.searchParams.get("heal") === "1") await recordRun("orchestrator-heal", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
