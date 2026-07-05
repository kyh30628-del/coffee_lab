import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { synthAndStore, finalizePipeline, scrubPublishedPII, healGroundingSuspects, holdZeroEvidenceSuspects, healPublishedAudit, healNonCafeCategory, healOutOfBox, healAreaLabel, healOffConceptByReview } from "@/lib/synthStore";
import { recordRun } from "@/lib/agentLog";
import { judgeQueueCount, dailyCounts } from "@/lib/metrics";
export const runtime = "nodejs";
export const maxDuration = 120; // 재검증 자가감사(healPublishedAudit) 배치 여유

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
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS orchestrator_state (id INT PRIMARY KEY DEFAULT 1, health JSONB, updated_at TIMESTAMPTZ DEFAULT now())`;
    const now = Date.now();
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
      COUNT(*) FILTER (WHERE raw_reviews IS NOT NULL AND synth_updated IS NULL)::int synth_q,
      COUNT(*) FILTER (WHERE embedding IS NULL AND (published OR pipeline_status='pending') AND synth_identity IS NOT NULL)::int embed_q
      FROM cafes`)[0] as any;
    // 판정 대기·오늘 지표 = lib/metrics 단일출처(judge-status와 동일 정의 — 화면별 숫자 어긋남 구조적 차단).
    const judgeQ = await judgeQueueCount();
    // 옥석(검증) 미판정 = AI판정 '의도적 스킵' 대상(규칙검증 완료·저위험). 대기가 아니라 '완료 처리'임을 화면에 명시(숨김 금지).
    const verifiedSkip = ((await sql`SELECT COUNT(*)::int n FROM cafes WHERE published AND synth_grade='검증' AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)`.catch(() => [{ n: 0 }]))[0] as any).n;
    const daily = await dailyCounts();
    const vr = (await sql`SELECT ran_at, fails, warns, status FROM verify_reports ORDER BY ran_at DESC LIMIT 1`)[0] as any;
    // open = '실제 카페 오염' 플래그만(cafe_id 있고 'audit_complete' 같은 시스템 로그 제외). last_flag=실행 시각.
    const af = (await sql`SELECT COUNT(*) FILTER (WHERE NOT resolved AND cafe_id IS NOT NULL AND issue <> 'audit_complete')::int open, MAX(flagged_at) last_flag FROM audit_flags`)[0] as any;
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
    const jobFails = jobRuns.filter((j) => j.ok === false).map((j) => `${j.job} 오류(${j.ran}): ${(j.detail || "").slice(0, 70)}`);

    // 🔎 공개 데이터 무결성 실시간 자가검증 — 사장님이 잡은 버그 유형을 관제탑이 매번 스스로 검사.
    //   (동 형식·동=구명 오추출·동-구 불일치·카테고리 누락·좌표 오류) 위반 시 즉시 경보.
    const ig = (await sql`SELECT
      COUNT(*) FILTER (WHERE dong IS NOT NULL AND (area=dong||'구' OR area=dong||'시' OR area=dong||'군'))::int dong_isgu,
      COUNT(*) FILTER (WHERE dong IS NOT NULL AND dong !~ '(동|읍|면|가)$')::int dong_badfmt,
      COUNT(*) FILTER (WHERE naver_category IS NULL OR naver_category='')::int pub_nocat,
      COUNT(*) FILTER (WHERE lat IS NULL OR lat NOT BETWEEN 36.8 AND 38.3 OR lng NOT BETWEEN 124.5 AND 127.9)::int pub_badcoord,
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
        if (ig.pub_noidentity > 0 && ig.pub_noidentity <= 20) { const r = await sql`UPDATE cafes SET published=false WHERE published AND (synth_identity IS NULL OR synth_identity='') RETURNING 1`; if (r.length) fixes.push(`정체성없음 ${r.length}곳 비공개`); }
        else if (ig.pub_noidentity > 20) integrity.push(`정체성없음 공개 ${ig.pub_noidentity}곳 — 대량(자동조치 보류, 점검필요)`);
        if (ig.pub_badcoord > 0 && ig.pub_badcoord <= 20) { const r = await sql`UPDATE cafes SET published=false WHERE published AND (lat IS NULL OR lat NOT BETWEEN 36.8 AND 38.3 OR lng NOT BETWEEN 124.5 AND 127.9) RETURNING 1`; if (r.length) fixes.push(`좌표오류 ${r.length}곳 비공개`); }
        else if (ig.pub_badcoord > 20) integrity.push(`좌표오류 공개 ${ig.pub_badcoord}곳 — 대량(자동조치 보류, 점검필요)`);
      } catch (e) { integrity.push(`무결성 자동교정 실패(즉시 확인): ${String(e).slice(0, 50)}`); }
      if (fixes.length) healed.push(`🔧 무결성 자율교정: ${fixes.join(", ")}`);
    }
    // 카테고리 미보유는 위험/경보 아님 — 검증된 카페라 지장 없음. 카테고리 에이전트에 '주의' 숫자로만 표시.
    // 🛑 지역 통째 사라짐 감지 — 카페 30곳+ 지역인데 공개 0 = 대량 비공개 버그(인천 사태). 정상 지역은 항상 일부 공개됨.
    const regionGone = (await sql`SELECT area, COUNT(*)::int tot FROM cafes WHERE area IS NOT NULL GROUP BY area HAVING COUNT(*) >= 30 AND COUNT(*) FILTER (WHERE published) = 0`.catch(() => [])) as any[];
    if (regionGone.length) integrity.push(`⚠️지역 통째 비공개 ${regionGone.length}곳(${regionGone.slice(0, 3).map((r) => r.area).join("·")}) — 대량삭제 의심`);

    // ⚠️ 위험/의심 선제 탐지 — 하드 위반은 아니지만 '문제 발생 소지' 있는 것을 수면 위로 올림(사장님이 보게).
    // ── 경보 2단계 분리 ──────────────────────────────────────────────
    //   위험(risks, 빨강) = '소비자에게 즉시 타격' 또는 '해자(옥석 큐레이션) 훼손' 또는 '엔진 정지'일 때만.
    //   주의(notices, 회색) = 백그라운드 대기열·자가치유 진행분. 소비자에 보이는 손상 아님 → 경보 아님.
    const PUB = c.published || 1;
    const risks: string[] = [];
    const notices: string[] = [];

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
    // 임베딩 대기 = 의미검색만 일부 누락(카페는 정상 노출) → 주의. 단, 절반 이상이면 검색 핵심기능 타격 → 위험.
    const noemb = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published AND embedding IS NULL`.catch(() => [{ n: 0 }]))[0] as any;
    if (noemb.n > 0) { if (noemb.n > PUB * 0.5) risks.push(`의미검색 대량 누락 ${noemb.n}곳 — 검색 기능 타격`); else notices.push(`의미검색 임베딩 대기 ${noemb.n}곳`); }
    // 그라운딩은 결정론적 규칙으로 대체됨 — '감사 대기' 백로그는 안 줄어드는 무의미 숫자라 notice에서 제외.
    // 🛡️ 리뷰-카페 불일치(규칙-사각 오염) — 표시 리뷰에 카페 맥락어가 없는 비율↑ = 딴 업종·문구이름 오염 의심.
    //   그라운딩(LLM)이 못 보던 사각지대를 결정론적으로 상시 감시. 소비자 노출이라 임계 넘으면 위험.
    // ⚠️ PROXY(맥락어 없음)라 진짜 카페(찻집·북카페·시적이름)도 오탐됨 → '위험(빨강)' 금지, 항상 '주의'(점검 권장 목록).
    //   사람이 목록 보고 진짜 오염만 비공개. 헛경보(red) 방지가 핵심.
    // offctx_ok=true = 사람이 '진짜 카페'로 확인한 화이트리스트 → 점검목록서 제외(프록시 오탐 반복표시 방지).
    const offctx = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published AND offctx_rate >= 0.55 AND NOT COALESCE(offctx_ok, false)`.catch(() => [{ n: 0 }]))[0] as any;
    const offctxSuspects = (await sql`SELECT name, area, round(offctx_rate::numeric, 2) AS rate FROM cafes WHERE published AND offctx_rate >= 0.55 AND NOT COALESCE(offctx_ok, false) ORDER BY offctx_rate DESC LIMIT 30`.catch(() => [])) as any[];
    if (offctx.n > 0) notices.push(`리뷰 맥락 의심 ${offctx.n}곳(점검 권장 — 일부 진짜 카페 포함될 수 있음)`);
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
    //   봇 UA 제외. src 컬럼은 신규(이전 방문자는 NULL→집계서 '미상') → 앞으로 유입분부터 출처 채워짐.
    const BOT = `COALESCE(user_agent,'') !~* 'bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|preview' AND COALESCE(src,'') !~* 'findelio|blinkx|semrush|ahrefs|dataprovider|dotbot|petalbot|yandex|mj12|serpstat' AND NOT COALESCE(internal, false)`;
    const traffic = (await sql.query(
      `SELECT
        COUNT(*) FILTER (WHERE last_seen > now()-interval '7 days')::int wau,
        COUNT(*) FILTER (WHERE last_seen > now()-interval '30 days')::int mau,
        COUNT(*) FILTER (WHERE last_seen > now()-interval '1 day')::int dau,
        COUNT(*) FILTER (WHERE created_at > now()-interval '7 days')::int new7
      FROM user_consents WHERE ${BOT}`
    ).catch(() => [{ wau: 0, mau: 0, dau: 0, new7: 0 }]))[0] as any;
    const trafficSources = (await sql.query(
      `SELECT COALESCE(NULLIF(src,''),'미상') AS s, COUNT(*)::int n
       FROM user_consents
       WHERE last_seen > now()-interval '30 days' AND ${BOT}
       GROUP BY 1 ORDER BY n DESC LIMIT 12`
    ).catch(() => [])) as any[];
    if ((traffic?.mau ?? 0) > 0 && trafficSources.every((r) => r.s === "미상")) {
      notices.push(`유입경로 데이터 수집 시작 — 출처는 다음 방문분부터 채워집니다(현재 방문자 출처 '미상')`);
    }
    // 출처별 참여도(평균 재방문수) — 어디서 온 사람이 더 들러붙나.
    const sourceEngage = (await sql.query(
      `SELECT COALESCE(NULLIF(src,''),'미상') AS s, COUNT(*)::int n, ROUND(AVG(COALESCE(visit_count,1))::numeric,1) AS avg_visits
       FROM user_consents WHERE last_seen > now()-interval '30 days' AND ${BOT}
       GROUP BY 1 ORDER BY n DESC LIMIT 8`
    ).catch(() => [])) as any[];
    // 신규 vs 재방문(최근 30일 활성)
    const retention = (await sql.query(
      `SELECT COUNT(*) FILTER (WHERE COALESCE(visit_count,1) <= 1)::int newcomers,
              COUNT(*) FILTER (WHERE COALESCE(visit_count,1) > 1)::int ret
       FROM user_consents WHERE last_seen > now()-interval '30 days' AND ${BOT}`
    ).catch(() => [{ newcomers: 0, ret: 0 }]))[0] as any;

    // 📈 페이지뷰 분석(traffic_events) — 자체 집계. 90일 보존(여기서 정리).
    await sql`DELETE FROM traffic_events WHERE ts < now() - interval '90 days'`.catch(() => {});
    const pageBuckets = (await sql`
      SELECT CASE
        WHEN path = '/' OR path = '' OR path IS NULL THEN '홈'
        WHEN path LIKE '/c/%' THEN '카페상세'
        WHEN path LIKE '/area%' THEN '지역'
        WHEN path LIKE '/taste%' THEN '취향'
        WHEN path LIKE '/owner%' OR path LIKE '/cafe%' THEN '사장님'
        ELSE '기타' END AS bucket,
        COUNT(*)::int views, COUNT(DISTINCT anon_id)::int uniques
      FROM traffic_events WHERE ts > now()-interval '30 days'
      GROUP BY 1 ORDER BY views DESC`.catch(() => [])) as any[];
    const topCafes = (await sql`
      SELECT c.name, c.area, COUNT(*)::int views, COUNT(DISTINCT te.anon_id)::int uniques
      FROM traffic_events te JOIN cafes c ON te.path = '/c/' || c.id
      WHERE te.ts > now()-interval '30 days'
      GROUP BY c.id, c.name, c.area ORDER BY views DESC LIMIT 10`.catch(() => [])) as any[];
    // 퍼널: 방문자 중 카페상세까지 본 비율(둘러보기→몰입 전환)
    const funnel = (await sql`
      SELECT COUNT(DISTINCT anon_id)::int visitors,
             COUNT(DISTINCT anon_id) FILTER (WHERE path LIKE '/c/%')::int viewed_cafe
      FROM traffic_events WHERE ts > now()-interval '30 days'`.catch(() => [{ visitors: 0, viewed_cafe: 0 }]))[0] as any;
    const pageviews30d = (await sql`SELECT COUNT(*)::int n FROM traffic_events WHERE ts > now()-interval '30 days'`.catch(() => [{ n: 0 }]))[0]?.n ?? 0;

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
    let promoted = 0;
    if (heal) {
      // (a) 합성 적체(raw 있는데 미합성) 메움 → 신규 'new'가 'pending'으로 진행
      if (c.synth_q > 0) {
        const todo = await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NOT NULL AND synth_updated IS NULL LIMIT 50`;
        let done = 0;
        for (const cf of todo as any[]) { try { await synthAndStore(cf, { refresh: false }); done++; } catch {} }
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
            AND lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9
          RETURNING 1`;
        if (r.length) healed.push(`좌표백필 미공개 ${r.length}곳 자동 복원(live+박스안+검증/참고)`);
      } catch {}
      // (c) 레드팀 PII 누출 자가치유 — 공개 인용문 전화·이메일·핸들 제거
      try { const pii = await scrubPublishedPII(); if (pii.scrubbed > 0) healed.push(`PII 세척 ${pii.scrubbed}곳(${pii.names.slice(0, 3).join(", ")})`); } catch {}
      let unpubThisRun = 0; // 비공개 발생 시 검색캐시 자동 무효화용(소비자 검색에 비공개 카페가 남는 것 방지)
      // (d) LLM 그라운딩 의심(업체혼동·환각) 자가치유 — 재합성 교정(로컬 그라운딩이 재검사해 플래그 해소)
      try { const gr = await healGroundingSuspects(); if (gr.resynthed > 0) healed.push(`그라운딩 의심 ${gr.resynthed}곳 재합성 교정`); } catch {}
      // (e) 그라운딩 '근거0건' 확정 카페 자동 보류(비공개) + 개선 시 복귀
      try { const z = await holdZeroEvidenceSuspects(); if (z.held > 0) { unpubThisRun += z.held; healed.push(`근거0건 ${z.held}곳 자동 비공개(${z.names.slice(0, 3).join(", ")})`); } if (z.released > 0) healed.push(`복원 ${z.released}곳`); } catch {}
      // (e-1b) orphan_published 자가치유 — 정체성·등급은 정상인데 근거후기(synth_reviews)만 0인 공개 카페.
      //   정체성없음(pub_noidentity)·그라운딩의심·근거0확정 어느 그물에도 안 걸려 방치되던 사각(검증 fail의 정체).
      //   raw 있으면 재합성으로 근거 복구, 그래도 0이면 비공개(근거 없는 노출 차단). 대량이면 합성회귀로 보고 자동행동 중단·경보.
      try {
        const orphans = (await sql`SELECT id, name, area FROM cafes
          WHERE published AND raw_reviews IS NOT NULL
            AND (synth_reviews IS NULL OR jsonb_array_length(synth_reviews) = 0)
          ORDER BY id LIMIT 31`) as any[];
        if (orphans.length > 30) {
          integrity.push(`🚨orphan_published 급증(${orphans.length}곳+) — 합성 회귀 의심, 자동교정 중단·즉시 점검`);
        } else if (orphans.length > 0) {
          let recovered = 0, heldOrphan = 0;
          for (const cf of orphans) {
            try { await synthAndStore({ id: cf.id, name: cf.name, area: cf.area ?? "" }, { refresh: false }); } catch {}
            const [chk] = (await sql`SELECT jsonb_array_length(COALESCE(synth_reviews, '[]'::jsonb)) ev FROM cafes WHERE id = ${cf.id}`) as any[];
            if ((chk?.ev ?? 0) > 0) recovered++;
            else { await sql`UPDATE cafes SET published=false, pipeline_status='excluded', updated_at=now() WHERE id=${cf.id}`; heldOrphan++; unpubThisRun++; }
          }
          if (recovered > 0) healed.push(`orphan(근거0) ${recovered}곳 재합성 복구`);
          if (heldOrphan > 0) healed.push(`orphan(근거0·복구불가) ${heldOrphan}곳 자동 비공개`);
        }
      } catch {}
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
            WHERE published AND synth_coherence < 0.3 AND COALESCE(offctx_ok, false) = false RETURNING 1`) as any[];
          if (r.length) { unpubThisRun += r.length; healed.push(`이름오염(coherence<0.3) ${r.length}곳 자동 홀드(${namepol.slice(0, 3).map((x: any) => x.name).join(", ")})`); }
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
        const au = await healPublishedAudit();
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
    add("collect", "수집 (warmup·raw)", lastCheck, 16, c.synth_q, `raw 수집·재수집`);
    add("synth", "합성 (옥석·등급)", c.last_synth, 24, c.synth_q, c.synth_q ? "미합성 적체" : "적체 없음");
    // 카테고리·동 채움 단계도 개별 모니터(발굴~수집 세분화)
    {
      const catRun = jobRuns.find((j: any) => j.job === "dong-backfill");
      const pubNoCat = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published AND (naver_category IS NULL OR naver_category='')`.catch(() => [{ n: 0 }]))[0] as any;
      const cAge = ageHours(catRun?.ran_at ?? null, now);
      // 카테고리 미보유는 소비자 지장 없음(검증된 카페) → 평소엔 정보성. 대량(>1000)일 때만 백필 정체로 보고 warn.
      agents.push({ key: "category", label: "카테고리 검증", lastRun: catRun?.ran_at ?? null, ageH: cAge == null ? null : Math.round(cAge * 10) / 10, cadenceH: 26, status: pubNoCat.n > 1000 ? "warn" : "ok", queue: pubNoCat.n, note: pubNoCat.n ? `미보유 ${pubNoCat.n}(검증카페·지장없음)` : "전수 완료" });
      const pubND = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published AND dong IS NULL`.catch(() => [{ n: 0 }]))[0] as any;
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

    // ── 4) 종합 건강 ──
    const core = agents.filter((a) => ["collect", "synth", "judge"].includes(a.key));
    // 위험(risks)·엔진정지·무결성위반·배치크래시 = critical(빨강). 에이전트 멈춤·지연·경고 = degraded(노랑).
    //   주의(notices)는 백그라운드 대기열이라 전체 상태를 떨어뜨리지 않음 — 정보로만 표시(소비자 무관).
    const overall = (core.some((a) => a.status === "stalled") || jobFails.length || integrity.length || risks.length) ? "critical"
      : agents.some((a) => a.status === "stalled" || a.status === "behind" || a.status === "warn") ? "degraded"
      : "healthy";
    // 배치 크래시·실패 + 데이터 무결성 위반을 최상단 경보로 — '관제탑이 잡아서 알림'
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
        { key: "live", label: "공개됨", count: pl.live, note: "전 게이트 통과" },
        { key: "verified_skip", label: "옥석·AI판정 스킵(후순위)", count: verifiedSkip, note: "검증등급 규칙검증 완료 → AI 재판정 불필요(설계·의도적 후순위·유령 백로그 아님)" },
        { key: "rejected", label: "차단", count: pl.rejected, note: "품질 미달" },
      ],
      promotedThisRun: promoted,
    };

    const health = {
      generatedAt: new Date(now).toISOString(),
      overall, alerts, healed, risks, notices, integrity,
      coverage: { total: c.total, published: c.published, rawCachedPct: pct(c.raw_cached), judgedPct: pct(c.judged), embeddedPct: c.published ? Math.round((c.pub_embedded / c.published) * 100) : 0, dongPct: pct(td.has_dong) },
      today: { newCafes: daily.newCafes, synthesized: td.synth_today, published: td.published_today, hasDong: td.has_dong, dongPct: pct(td.has_dong), noise: td.noise, newQueue: td.new_q, ytToday: daily.yt, ytTotal: td.yt_total },
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
