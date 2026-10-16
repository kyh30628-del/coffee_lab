// 🧲 광고·협찬 상시감지 정규식 동기화 (2026-10-16, CEO "근거 오염·광고·협찬을 항상 제대로 감지해서 조치해")
//
// 왜: 상시감지는 이미 올바른 구조였다 — 쓰기 시점 트리거(trg_synth_ev_n)가 synth_ev_flags.adflag_n을
//   굳혀 두어 크론은 **작은 컬럼만** 읽는다(2026-09-07 decisions#1010: 전수 jsonb 풀스캔 349.5GB/일 → ~0).
//   그런데 그 트리거의 정규식이 **앱 규칙(lib/reviewQuality.ts AD_STRONG)과 따로 놀고 있었다.**
//   실측(10-16): 오늘 실제로 제거한 오염 7유형 중 5유형을 트리거가 못 잡았다 —
//     ❌ 포토/네이버 후기 이벤트 · ❌ 영수증 리뷰 · ❌ 초대받아 작성 · ❌ SNS기자단 작성 · ❌ 서포터즈
//     ✅ [협찬] 머리말 · ✅ 제공받아
//   그래서 adflag_n은 공개 48,639곳 전부 0이었고(=감지 0), 오염은 사람이 수동 스캔해야만 나왔다.
//
// 고치는 것: 트리거 정규식을 AD_STRONG 어휘로 맞춘다. 비용 0 —
//   ①DDL(CREATE OR REPLACE FUNCTION)은 행을 쓰지 않는다 ②플래그는 cron-resynth가 어차피 매 행을
//   다시 쓸 때(24일 1주기) 자동으로 새 식으로 채워진다 → **별도 백필을 하지 않는다**(같은 쓰기를 두 번 하면 그게 낭비).
//
// ⚠️ 이 플래그는 '재판정 우선순위'만 정한다. 실제 제거 판단은 재합성 때 verifyReview(원문 전체)가 한다.
//   즉 넓게 잡혀도 잘못 지워지지 않는다(오늘 실측: 잘린 요약문 때문에 광고로 보이던 #4029는 원문에
//   "협찬, 광고 아님"이 있어 재판정에서 정상 유지됐다). 반대로 좁으면 오염이 영영 안 잡힌다 — 넓게 잡는 쪽이 맞다.
import { readFileSync } from "node:fs";
for (const l of readFileSync("./.env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

// lib/reviewQuality.ts의 AD_STRONG·AD_AFFIRM·AD_DISCLAIM과 같은 뜻(POSIX ERE에 lookbehind가 없어 표기만 다름).
//   AD_DISCLAIM의 '지원'은 뺀다 — 앱에선 (?<!주차)로 막은 자리다. SQL에선 애초에 안 넣어 "주차지원x"가
//   협찬 부인으로 둔갑하지 않는다(10-10 실측 사고: 협찬글 7곳이 이 오독으로 검증 등급에 올라 있었다).
const STRONG = "(협찬|체험단|원고료|소정의|대가성|대가를[[:space:]]*받|제공[[:space:]]*받|무료로?[[:space:]]*제공|유료[[:space:]]*광고|광고입니다|지원[[:space:]]*받아|무상(으로)?[[:space:]]*(제공|지원)|초청[[:space:]]*받|초대[[:space:]]*받아[[:space:]]*작성|(리뷰|후기)[[:space:]]*이벤트|영수증[[:space:]]*리뷰|서포터즈|서포터스|기자단|홍보단)";
const AFFIRM = "(\\[[[:space:]]*(협찬|광고|체험단|원고료|제공)[[:space:]]*\\]|(협찬|체험단|제공|대가성|원고료)[[:space:]]*[oO0ㅇ○◯])";
const DISCLAIM = "((협찬|광고|제공|대가|유료|체험단|서포터즈|기자단|(리뷰|후기)[[:space:]]*이벤트|영수증[[:space:]]*리뷰)[[:space:]]*([Xx✕✖]|아닌|아니|아님|없이|없는|없습니다|없음|받지[[:space:]]*않)|비협찬)";

const FN = `CREATE OR REPLACE FUNCTION set_synth_ev_n() RETURNS trigger AS $$
DECLARE
  revs jsonb := COALESCE(NEW.synth_reviews, '[]'::jsonb);
  txt text;
BEGIN
  NEW.synth_ev_n := jsonb_array_length(revs);
  SELECT jsonb_build_object(
    'badfield_n', COALESCE(sum(CASE WHEN coalesce(r->>'quote','')='' OR coalesce(r->>'link','')='' THEN 1 ELSE 0 END), 0),
    'pii_n', COALESCE(sum(CASE WHEN r->>'quote' ~ '01[0-9][- ]?[0-9]{3,4}[- ]?[0-9]{4}' OR r->>'quote' ~ '\\m050[0-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{3,4}\\M' OR r->>'quote' ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' THEN 1 ELSE 0 END), 0),
    'badlink_n', COALESCE(sum(CASE WHEN r->>'link' IS NOT NULL AND r->>'link' NOT LIKE 'http%' THEN 1 ELSE 0 END), 0),
    'nosrc_n', COALESCE(sum(CASE WHEN coalesce(r->>'source','')='' THEN 1 ELSE 0 END), 0),
    'adflag_n', COALESCE(sum(CASE WHEN (coalesce(r->>'title','') || ' ' || coalesce(r->>'quote','')) ~ '${STRONG}'
                                  AND ((coalesce(r->>'title','') || ' ' || coalesce(r->>'quote','')) !~ '${DISCLAIM}'
                                       OR (coalesce(r->>'title','') || ' ' || coalesce(r->>'quote','')) ~ '${AFFIRM}')
                                 THEN 1 ELSE 0 END), 0),
    'duplink_n', COALESCE((SELECT count(*) FROM (SELECT lk FROM (SELECT r2->>'link' lk FROM jsonb_array_elements(revs) r2) x WHERE lk IS NOT NULL GROUP BY lk HAVING count(*) > 1) g), 0)
  ) INTO NEW.synth_ev_flags
  FROM jsonb_array_elements(revs) r;
  RETURN NEW;
END
$$ LANGUAGE plpgsql`;
await sql.query(FN);

// 재판정 우선순위 조회용 — 작은 부분 인덱스(공개 + 플래그 있음). 전수 스캔 방지.
await sql.query(`CREATE INDEX IF NOT EXISTS idx_cafes_adflag ON cafes (((synth_ev_flags->>'adflag_n')::int)) WHERE published`);

console.log("✅ 트리거 정규식 동기화 + 우선순위 인덱스 완료 (행 쓰기 0 · 백필 없음 — cron-resynth 순환이 채운다)");
