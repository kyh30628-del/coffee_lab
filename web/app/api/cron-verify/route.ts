import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
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

  // 3. 고아 데이터: 공개인데 분석/후기 없음
  add("orphan_published", "공개 카페 분석 데이터 누락", "fail",
    await n(sql`SELECT count(*)::int n FROM cafes WHERE published AND (synth_reviews IS NULL OR jsonb_array_length(synth_reviews)=0 OR synth_grade IS NULL)`),
    await samp(sql`SELECT name s FROM cafes WHERE published AND (synth_reviews IS NULL OR jsonb_array_length(synth_reviews)=0 OR synth_grade IS NULL) LIMIT 6`));

  // 4. 근거 후기 필수필드: quote/link 누락
  add("review_fields", "근거 후기 필수필드(인용·링크) 누락", "fail",
    await n(sql`SELECT count(DISTINCT c.id)::int n FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND (coalesce(r->>'quote','')='' OR coalesce(r->>'link','')='')`),
    await samp(sql`SELECT DISTINCT c.name s FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND (coalesce(r->>'quote','')='' OR coalesce(r->>'link','')='') LIMIT 6`));

  // 5. PII 누출: 표시 인용문에 전화/이메일
  add("pii_leak", "근거 후기에 개인정보(전화·이메일) 노출", "fail",
    await n(sql`SELECT count(DISTINCT c.id)::int n FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND (r->>'quote' ~ '01[0-9][- ]?[0-9]{3,4}[- ]?[0-9]{4}' OR r->>'quote' ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')`),
    await samp(sql`SELECT DISTINCT c.name s FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND (r->>'quote' ~ '01[0-9][- ]?[0-9]{3,4}[- ]?[0-9]{4}' OR r->>'quote' ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}') LIMIT 6`));

  // 6. 링크 형식: http로 시작하지 않는 출처 링크
  add("link_format", "출처 링크 형식 오류(http 아님)", "fail",
    await n(sql`SELECT count(DISTINCT c.id)::int n FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND r->>'link' IS NOT NULL AND r->>'link' NOT LIKE 'http%'`),
    await samp(sql`SELECT DISTINCT c.name s FROM cafes c, jsonb_array_elements(c.synth_reviews) r
      WHERE c.published AND r->>'link' IS NOT NULL AND r->>'link' NOT LIKE 'http%' LIMIT 6`));

  // 7. 좌표 범위: 수도권 밖
  add("coord_bounds", "지도 좌표 범위 이탈(수도권 밖)", "fail",
    await n(sql`SELECT count(*)::int n FROM cafes WHERE published AND (lat IS NULL OR lng IS NULL OR lat < 36.8 OR lat > 38.3 OR lng < 124.5 OR lng > 127.9)`),
    await samp(sql`SELECT name s FROM cafes WHERE published AND (lat IS NULL OR lng IS NULL OR lat < 36.8 OR lat > 38.3 OR lng < 124.5 OR lng > 127.9) LIMIT 6`));

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
  add("evidence_contamination", "근거후기가 카페명과 불일치(동명 오염)", "fail",
    await n(sql`SELECT count(*)::int n FROM audit_flags WHERE issue='근거오염' AND NOT resolved`),
    await samp(sql`SELECT cafe_name s FROM audit_flags WHERE issue='근거오염' AND NOT resolved ORDER BY flagged_at DESC LIMIT 6`));

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

  return checks;
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS verify_reports (id SERIAL PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(), status TEXT, fails INT, warns INT, checks JSONB)`;

    // 🧠 LLM 그라운딩(보조 레이어) 요약 — 로컬 verify-grounding 배치가 적재한 결과 조회
    const grounding = await (async () => {
      try {
        // 공개(소비자 노출) / 비공개(보류 — 소비자 안 보임)를 분리 → 화면이 '소비자 영향'을 사실대로 표시.
        const g = (await sql`SELECT count(*)::int total,
          count(*) FILTER (WHERE NOT gc.grounded)::int flagged,
          count(*) FILTER (WHERE NOT gc.grounded AND c.published)::int public_flagged,
          count(*) FILTER (WHERE NOT gc.grounded AND NOT c.published)::int held,
          max(gc.checked_at) last FROM grounding_checks gc JOIN cafes c ON c.id = gc.cafe_id`)[0] as any;
        // 샘플은 '공개중 의심'(=실제 소비자 영향)만. 비공개 보류는 이미 차단돼 노출 0.
        const samples = await sql`SELECT c.name s, gc.issue FROM grounding_checks gc JOIN cafes c ON c.id = gc.cafe_id WHERE NOT gc.grounded AND c.published ORDER BY gc.checked_at DESC LIMIT 6` as unknown as any[];
        return { total: g.total ?? 0, flagged: g.flagged ?? 0, publicFlagged: g.public_flagged ?? 0, held: g.held ?? 0, last: g.last, samples };
      } catch { return null; }
    })();

    // 최신 리포트만 조회(관리자 화면용 — 재실행 안 함)
    if (req.nextUrl.searchParams.get("latest")) {
      const r = (await sql`SELECT ran_at, status, fails, warns, checks FROM verify_reports ORDER BY ran_at DESC LIMIT 1`)[0] as any;
      return NextResponse.json({ ok: true, report: r ?? null, grounding });
    }

    const checks = await runChecks();
    const fails = checks.filter((c) => c.severity === "fail" && c.count > 0).length;
    const warns = checks.filter((c) => c.severity === "warn" && c.count > 0).length;
    const status = fails > 0 ? "fail" : warns > 0 ? "warn" : "pass";

    await sql`INSERT INTO verify_reports (status, fails, warns, checks) VALUES (${status}, ${fails}, ${warns}, ${JSON.stringify(checks)})`;
    await sql`DELETE FROM verify_reports WHERE id NOT IN (SELECT id FROM verify_reports ORDER BY ran_at DESC LIMIT 60)`; // 최근 60건만 보관

    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), status, fails, warns, checks, grounding });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
