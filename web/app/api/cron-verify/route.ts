import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { recordRun } from "@/lib/agentLog";
import { startJobRun } from "@/lib/blobBudget";
import { openScope } from "@/lib/writeScope";
import { fingerprintOf } from "@/lib/runLedger";
import { loadCriteria, getCriterionSync } from "@/lib/criteria";
export const runtime = "nodejs";
export const maxDuration = 60;

// 🛡️ 검증 에이전트(레드팀) — 결정론적 불변식 검사. LLM 미사용 → 검사기 자체에 환각·오차 없음.
// 데이터·기능의 무결성을 매일 검사하고 verify_reports에 저장. 관리자 화면이 최신 리포트 표시.
const authed = (req: NextRequest) => {
  const pw = req.headers.get("x-admin-password");
  if (pw && pw === process.env.ADMIN_PASSWORD) return true;
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  return !!secret && auth === `Bearer ${secret}`;
};

type Check = { key: string; label: string; severity: "fail" | "warn"; count: number; samples: string[] };

async function n(q: Promise<any[]>): Promise<number> { return Number((await q)[0]?.n ?? 0); }
async function samp(q: Promise<any[]>): Promise<string[]> { return (await q).map((r: any) => String(r.s)).slice(0, 6); }

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  await loadCriteria(); // 수도권 좌표박스 기준 캐시 프라임 — 감시가 synth와 같은 진실을 보게(폴백=36.8~38.3/124.5~127.9)
  const latMin = getCriterionSync("geo.box.lat_min"), latMax = getCriterionSync("geo.box.lat_max");
  const lngMin = getCriterionSync("geo.box.lng_min"), lngMax = getCriterionSync("geo.box.lng_max");
  const add = (key: string, label: string, severity: "fail" | "warn", count: number, samples: string[]) =>
    checks.push({ key, label, severity, count, samples });

  // 1. 숫자 일관성: 전체 = 옥석(검증+참고) + 노이즈
  add("count_consistency", "후기 수 일관성 (전체 = 옥석 + 노이즈)", "fail",
    await n(sql`SELECT count(*)::int n FROM cafes WHERE synth_quality->>'raw' IS NOT NULL
      AND (synth_quality->>'raw')::int <> (synth_quality->>'verified')::int + (synth_quality->>'reference')::int + (synth_quality->>'rejected')::int`),
    await samp(sql`SELECT name s FROM cafes WHERE synth_quality->>'raw' IS NOT NULL
      AND (synth_quality->>'raw')::int <> (synth_quality->>'verified')::int + (synth_quality->>'reference')::int + (synth_quality->>'rejected')::int LIMIT 6`));

  // 2. 등급 유효성: 공개 카페는 검증/참고/후보 중 하나
  add("grade_validity", "등급 값 유효성 (검증/참고/후보)", "fail",
    await n(sql`SELECT count(*)::int n FROM cafes WHERE published AND (synth_grade IS NULL OR synth_grade NOT IN ('검증','참고','후보'))`),
    await samp(sql`SELECT name s FROM cafes WHERE published AND (synth_grade IS NULL OR synth_grade NOT IN ('검증','참고','후보')) LIMIT 6`));

  // 3. 고아 데이터: 공개인데 분석/후기 없음 — 대상 식별 가능하도록 샘플에 카페 id 포함(#168: '몇 건'뿐 아니라 '어느 카페'인지 카드에서 바로 확인).
  add("orphan_published", "공개 카페 분석 데이터 누락", "fail",
    await n(sql`SELECT count(*)::int n FROM cafes WHERE published AND (synth_reviews IS NULL OR jsonb_array_length(synth_reviews)=0 OR synth_grade IS NULL)`),
    await samp(sql`SELECT name || ' (#' || id || ')' s FROM cafes WHERE published AND (synth_reviews IS NULL OR jsonb_array_length(synth_reviews)=0 OR synth_grade IS NULL) ORDER BY id LIMIT 6`));

  // 4. 근거 후기 필수필드: quote/link 누락
  add("review_fields", "근거 후기 필수필드(인용·링크) 누락", "fail",
    await n(sql`SELECT count(DISTINCT c.id)::int n FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND (coalesce(r->>'quote','')='' OR coalesce(r->>'link','')='')`),
    await samp(sql`SELECT DISTINCT c.name s FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND (coalesce(r->>'quote','')='' OR coalesce(r->>'link','')='') LIMIT 6`));

  // 5. PII 누출: 표시 인용문에 전화/이메일
  add("pii_leak", "근거 후기에 개인정보(전화·이메일) 노출", "fail",
    await n(sql`SELECT count(DISTINCT c.id)::int n FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND (r->>'quote' ~ '01[0-9][- ]?[0-9]{3,4}[- ]?[0-9]{4}' OR r->>'quote' ~ '\\m050[0-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{3,4}\\M' OR r->>'quote' ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')`),
    await samp(sql`SELECT DISTINCT c.name s FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND (r->>'quote' ~ '01[0-9][- ]?[0-9]{3,4}[- ]?[0-9]{4}' OR r->>'quote' ~ '\\m050[0-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{3,4}\\M' OR r->>'quote' ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}') LIMIT 6`));

  // 6. 링크 형식: http로 시작하지 않는 출처 링크
  add("link_format", "출처 링크 형식 오류(http 아님)", "fail",
    await n(sql`SELECT count(DISTINCT c.id)::int n FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND r->>'link' IS NOT NULL AND r->>'link' NOT LIKE 'http%'`),
    await samp(sql`SELECT DISTINCT c.name s FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND r->>'link' IS NOT NULL AND r->>'link' NOT LIKE 'http%' LIMIT 6`));

  // 7. 좌표 범위: 수도권 밖
  add("coord_bounds", "지도 좌표 범위 이탈(수도권 밖)", "fail",
    await n(sql`SELECT count(*)::int n FROM cafes WHERE published AND (lat IS NULL OR lng IS NULL OR lat < ${latMin} OR lat > ${latMax} OR lng < ${lngMin} OR lng > ${lngMax})`),
    await samp(sql`SELECT name s FROM cafes WHERE published AND (lat IS NULL OR lng IS NULL OR lat < ${latMin} OR lat > ${latMax} OR lng < ${lngMin} OR lng > ${lngMax}) LIMIT 6`));

  // 8. 중복 근거 후기: 한 카페 내 같은 링크 중복
  add("duplicate_links", "근거 후기 링크 중복", "warn",
    await n(sql`SELECT count(*)::int n FROM (SELECT c.id, r->>'link' lk FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND r->>'link' IS NOT NULL GROUP BY c.id, r->>'link' HAVING count(*)>1) x`),
    await samp(sql`SELECT DISTINCT c.name s FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND r->>'link' IS NOT NULL GROUP BY c.id, c.name, r->>'link' HAVING count(*)>1 LIMIT 6`));

  // 9. 출처 표기 누락: 약관상 attribution 필수
  add("source_attribution", "출처(source) 표기 누락", "warn",
    await n(sql`SELECT count(DISTINCT c.id)::int n FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND coalesce(r->>'source','')=''`),
    await samp(sql`SELECT DISTINCT c.name s FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND coalesce(r->>'source','')='' LIMIT 6`));

  // 10. 우선노출 정합성: 만료/미승인인데 featured
  add("featured_stale", "우선노출 플래그 정합성(만료·미승인)", "warn",
    await n(sql`SELECT count(*)::int n FROM cafe_promos WHERE featured AND (NOT approved OR (featured_until IS NOT NULL AND featured_until < now()))`),
    await samp(sql`SELECT cafe_id::text s FROM cafe_promos WHERE featured AND (NOT approved OR (featured_until IS NOT NULL AND featured_until < now())) LIMIT 6`));

  // 11. 승인 홍보 내용 누락
  add("promo_empty", "승인된 홍보에 내용 없음", "warn",
    await n(sql`SELECT count(*)::int n FROM cafe_promos WHERE approved AND coalesce(ai_headline,'')='' AND coalesce(video_url,'')='' AND coalesce(intro,'')=''`),
    await samp(sql`SELECT cafe_id::text s FROM cafe_promos WHERE approved AND coalesce(ai_headline,'')='' AND coalesce(video_url,'')='' AND coalesce(intro,'')='' LIMIT 6`));

  // 12. 고아 홍보: 존재하지 않는 카페를 가리키는 홍보(삭제된 카페·테스트 잔재). 추천 슬롯 오염 방지.
  add("orphan_promo", "고아 홍보(존재하지 않는 카페)", "warn",
    await n(sql`SELECT count(*)::int n FROM cafe_promos pr WHERE NOT EXISTS (SELECT 1 FROM cafes c WHERE c.id=pr.cafe_id)`),
    await samp(sql`SELECT pr.cafe_id::text s FROM cafe_promos pr WHERE NOT EXISTS (SELECT 1 FROM cafes c WHERE c.id=pr.cafe_id) LIMIT 6`));

  // 13. 🛡️ 근거후기-카페명 불일치(동명·프랜차이즈 지점 오염) — 해자의 핵심. 자가치유가 못 잡은 잔존분.
  //   '바빈스 식당리뷰' 유형: 화면에 뜬 후기가 실제 그 카페 얘기가 아닌 것. 소비자 직접 노출 = 즉시 타격.
  //   ⚠️ '공개 중인 카페'만 fail — 비공개(excluded)면 소비자 무노출=이미 처리됨(orchestrator 자가치유가 자동 resolve).
  //   이 필터 없으면 '이미 비공개된 오염카페'를 소비자노출 fail로 영구 오경보(고쳐진 문제를 red로 표시).
  add("evidence_contamination", "근거후기가 카페명과 불일치(동명 오염)", "fail",
    await n(sql`SELECT count(*)::int n FROM audit_flags af WHERE af.issue='근거오염' AND NOT af.resolved AND EXISTS (SELECT 1 FROM cafes c WHERE c.id=af.cafe_id AND c.published)`),
    await samp(sql`SELECT af.cafe_name s FROM audit_flags af WHERE af.issue='근거오염' AND NOT af.resolved AND EXISTS (SELECT 1 FROM cafes c WHERE c.id=af.cafe_id AND c.published) ORDER BY af.flagged_at DESC LIMIT 6`));

  // 14. 광고/협찬 글이 '검증 근거'로 노출 — 해자(진짜 후기) 훼손. 재합성 시 AD 게이트가 제외하지만 구데이터 점검.
  //   면책 문구('협찬 없이'·'광고 아님'·내돈내산)는 진짜 후기이므로 제외(오탐 방지) — verifyReview의 AD_STRONG/AD_DISCLAIM과 동일 기준.
  add("ad_evidence", "근거후기에 광고·협찬 신호", "warn",
    await n(sql`SELECT count(DISTINCT c.id)::int n FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND r->>'quote' ~ '(협찬|제공[[:space:]]*받|원고료|소정의|체험단|유료[[:space:]]*광고|광고입니다|대가를[[:space:]]*받)'
        AND r->>'quote' !~ '(협찬|광고|제공|대가|유료|체험단)[[:space:]]*([Xx✕✖]|아닌|아니|아님|없이|없는|없습니다|없음|받지[[:space:]]*않)'`),
    await samp(sql`SELECT DISTINCT c.name s FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND r->>'quote' ~ '(협찬|제공[[:space:]]*받|원고료|소정의|체험단|유료[[:space:]]*광고|광고입니다|대가를[[:space:]]*받)'
        AND r->>'quote' !~ '(협찬|광고|제공|대가|유료|체험단)[[:space:]]*([Xx✕✖]|아닌|아니|아님|없이|없는|없습니다|없음|받지[[:space:]]*않)' LIMIT 6`));

  // 15. 중복 공개 카페: 같은 이름+지역이 2개 이상 공개(같은 가게 중복 적재) → 사용자 혼란·신뢰 훼손.
  add("duplicate_published", "중복 공개 카페(같은 이름+지역)", "warn",
    await n(sql`SELECT COALESCE(SUM(cnt-1),0)::int n FROM (SELECT count(*) cnt FROM cafes WHERE published GROUP BY name, area HAVING count(*) > 1) x`),
    await samp(sql`SELECT name || ' (' || area || ')' s FROM cafes WHERE published GROUP BY name, area HAVING count(*) > 1 LIMIT 6`));

  // 16. 🕵️ CROSS_CAFE_QUOTE_DUP(decisions#674) — 서로 다른 공개카페 2곳 이상에 완전동일 quote가 노출되면
  //   블로그·리뷰 글이 여러 카페에 걸쳐 잘못 매핑된 교차오염(브랜드명 동일·지점 다른 카페간 크로스오염 유형).
  //   저비용 1쿼리(GROUP BY quote HAVING count(DISTINCT id)>1) — 정합성조사팀 3/3 실측 적중(글로리·비바보사·오페라빈,
  //   coordination#306). 개별 오염건은 각각 별도 결재로 처리하므로 여기선 warn(상시 조기경보)만.
  add("cross_cafe_quote_dup", "카페간 인용문(quote) 완전동일(교차오염 의심)", "warn",
    await n(sql`WITH q AS (
        SELECT c.id cid, r->>'quote' AS quote FROM cafes c, jsonb_array_elements(c.synth_reviews) r
        WHERE c.published AND coalesce(r->>'quote','') <> ''
      )
      SELECT count(DISTINCT cid)::int n FROM q WHERE quote IN (SELECT quote FROM q GROUP BY quote HAVING count(DISTINCT cid) > 1)`),
    await samp(sql`WITH q AS (
        SELECT c.id cid, c.name cname, r->>'quote' AS quote FROM cafes c, jsonb_array_elements(c.synth_reviews) r
        WHERE c.published AND coalesce(r->>'quote','') <> ''
      )
      SELECT DISTINCT cname s FROM q WHERE quote IN (SELECT quote FROM q GROUP BY quote HAVING count(DISTINCT cid) > 1) LIMIT 6`));

  return checks;
}

export async function GET(req: NextRequest) {
  startJobRun("cron-verify"); openScope("cron-verify"); // 💰🔐 하네스 L1·L3 — 큰 컬럼 계량 + 쓰기 스코프
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS verify_reports (id SERIAL PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(), status TEXT, fails INT, warns INT, checks JSONB)`;

    // 🧠 LLM 그라운딩(보조 레이어) 요약 — 로컬 verify-grounding 배치가 적재한 결과 조회
    const grounding = await (async () => {
      try {
        // 공개(소비자 노출) / 비공개(보류 — 소비자 안 보임)를 분리 → 화면이 '소비자 영향'을 사실대로 표시.
        // ⚠️ 신선도 필터 필수(gc.checked_at >= c.synth_updated AND c.llm_judged_at IS NOT NULL):
        //   재합성(synth_updated) 이후 재검 안 된 flag는 '지금 없는 옛 소개글'을 가리키는 stale.
        //   이걸 빼면 RM보드·관제탑(둘 다 이 조건)과 숫자가 어긋나 유령 '오염 N건'이 영구 잔존. 조건은 각 위치에 정적 인라인.
        const g = (await sql`SELECT count(*)::int total,
          count(*) FILTER (WHERE NOT gc.grounded AND gc.checked_at >= c.synth_updated AND c.llm_judged_at IS NOT NULL)::int flagged,
          count(*) FILTER (WHERE NOT gc.grounded AND c.published AND gc.checked_at >= c.synth_updated AND c.llm_judged_at IS NOT NULL)::int public_flagged,
          count(*) FILTER (WHERE NOT gc.grounded AND NOT c.published AND gc.checked_at >= c.synth_updated AND c.llm_judged_at IS NOT NULL)::int held,
          max(gc.checked_at) last FROM grounding_checks gc JOIN cafes c ON c.id = gc.cafe_id`)[0] as any;
        // 샘플은 '공개중 의심'(=실제 소비자 영향)만. 비공개 보류는 이미 차단돼 노출 0. (동일 신선도 필터)
        const samples = await sql`SELECT c.name s, gc.issue FROM grounding_checks gc JOIN cafes c ON c.id = gc.cafe_id WHERE NOT gc.grounded AND c.published AND gc.checked_at >= c.synth_updated AND c.llm_judged_at IS NOT NULL ORDER BY gc.checked_at DESC LIMIT 6` as unknown as any[];
        return { total: g.total ?? 0, flagged: g.flagged ?? 0, publicFlagged: g.public_flagged ?? 0, held: g.held ?? 0, last: g.last, samples };
      } catch { return null; }
    })();

    // 관리자 화면 조회(latest=1) — 캐시된 verify_reports 스냅샷이 아니라 매번 실시간 재산출.
    //   (직전 버그: 하루 2회 크론 사이 데이터가 정상화돼도 화면은 옛 스냅샷의 '오류 N건'을 몇 시간째 표시 — 실측과 어긋남)
    //   DB에 새 행을 쓰지는 않음(폴링마다 insert하면 이력 테이블만 불어남) — 저장은 크론 실행(비-latest)만.
    if (req.nextUrl.searchParams.get("latest")) {
      const checks = await runChecks();
      const fails = checks.filter((c) => c.severity === "fail" && c.count > 0).length;
      const warns = checks.filter((c) => c.severity === "warn" && c.count > 0).length;
      const status = fails > 0 ? "fail" : warns > 0 ? "warn" : "pass";
      // 📈 검사 이력 추이 — 저장된 verify_reports(크론 실행분, 최근 60건 보관)를 그대로 조회만(저비용 단일 SELECT).
      //   화면에 '지금 이 순간' 뿐 아니라 최근 N회 동안 오류·주의가 얼마나 반복됐는지(추이) 보여줌.
      const history = (await sql`SELECT ran_at, fails, warns, status FROM verify_reports ORDER BY ran_at DESC LIMIT 20`.catch(() => [])) as any[];
      return NextResponse.json({ ok: true, report: { ran_at: new Date().toISOString(), status, fails, warns, checks }, grounding, history: history.reverse() });
    }

    const checks = await runChecks();
    const fails = checks.filter((c) => c.severity === "fail" && c.count > 0).length;
    const warns = checks.filter((c) => c.severity === "warn" && c.count > 0).length;
    const status = fails > 0 ? "fail" : warns > 0 ? "warn" : "pass";

    await sql`INSERT INTO verify_reports (status, fails, warns, checks) VALUES (${status}, ${fails}, ${warns}, ${JSON.stringify(checks)})`;
    await sql`DELETE FROM verify_reports WHERE id NOT IN (SELECT id FROM verify_reports ORDER BY ran_at DESC LIMIT 60)`; // 최근 60건만 보관

    // 📒 하네스 L5 — 지문은 **남은 일(백로그)** 기준. 할 일이 없으면(0) 지문을 안 남긴다 —
    //   "일이 없어 조용한 것"과 "일이 있는데 못 끝내는 것"을 구분해야 정체 탐지가 소음이 안 된다.
    await recordRun("cron-verify", true, `fail ${fails} warn ${warns}`, fails + warns, { fingerprint: ((fails + warns)) > 0 ? fingerprintOf({ fails, warns }) : undefined, metrics: { fails, warns } });
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), status, fails, warns, checks, grounding });
  } catch (e) {
    await recordRun("cron-verify", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
