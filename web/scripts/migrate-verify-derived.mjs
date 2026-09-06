// 🧮 cron-verify 나머지 7종 검사 파생컬럼화 (2026-09-07, decisions#1010)
//   왜: review_fields·pii_leak·link_format·duplicate_links·source_attribution·ad_evidence·
//   cross_cafe_quote_dup 7종이 크론 실행마다 published 전수(23,137곳)의 synth_reviews를
//   jsonb_array_elements로 풀스캔 — 09-06 하루 349.5GB(임계 25GB의 14배) 유발, cost_guard 자동정지.
//   2026-09-05 orphan_published(synth_ev_n) 선례와 동일 패턴: 쓰기 시점(트리거)에 결과를 굳혀
//   읽기 시점(크론) 비용을 상수로 낮춘다 — 의미 동일·크론 전송 ~0.
//   - synth_ev_flags(JSONB): 카페별 badfield_n·pii_n·badlink_n·nosrc_n·adflag_n·duplink_n
//     (판정식은 app/api/cron-verify/route.ts의 기존 정규식·조건과 완전히 동일 — 결과 불변)
//   - review_quotes(cafe_id, quote_hash): cross_cafe_quote_dup은 카페간 비교라 단일 파생컬럼으로
//     못 담아 — quote 해시만 담은 소형 인덱스 테이블로 별도 유지(AFTER 트리거).
//   백필은 "SET synth_reviews = synth_reviews"로 기존 trg_synth_ev_n·신규 trg_review_quotes를
//   그대로 재사용(로직 이중관리 방지, 단일출처=트리거 함수). 1회성 전수는 사전 고지된 비용.
import { readFileSync } from "node:fs";
for (const l of readFileSync("./.env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_ev_flags JSONB`;

// synth_ev_n 트리거 확장 — badfield_n/pii_n/badlink_n/nosrc_n/adflag_n/duplink_n 동시 산출.
// 판정 정규식은 route.ts의 review_fields(4)·pii_leak(5)·link_format(6)·duplicate_links(8)·
// source_attribution(9)·ad_evidence(14) 조건을 그대로 옮김.
await sql`CREATE OR REPLACE FUNCTION set_synth_ev_n() RETURNS trigger AS $$
DECLARE
  revs jsonb := COALESCE(NEW.synth_reviews, '[]'::jsonb);
BEGIN
  NEW.synth_ev_n := jsonb_array_length(revs);
  SELECT jsonb_build_object(
    'badfield_n', COALESCE(sum(CASE WHEN coalesce(r->>'quote','')='' OR coalesce(r->>'link','')='' THEN 1 ELSE 0 END), 0),
    'pii_n', COALESCE(sum(CASE WHEN r->>'quote' ~ '01[0-9][- ]?[0-9]{3,4}[- ]?[0-9]{4}' OR r->>'quote' ~ '\\m050[0-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{3,4}\\M' OR r->>'quote' ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' THEN 1 ELSE 0 END), 0),
    'badlink_n', COALESCE(sum(CASE WHEN r->>'link' IS NOT NULL AND r->>'link' NOT LIKE 'http%' THEN 1 ELSE 0 END), 0),
    'nosrc_n', COALESCE(sum(CASE WHEN coalesce(r->>'source','')='' THEN 1 ELSE 0 END), 0),
    'adflag_n', COALESCE(sum(CASE WHEN r->>'quote' ~ '(협찬|제공[[:space:]]*받|원고료|소정의|체험단|유료[[:space:]]*광고|광고입니다|대가를[[:space:]]*받)' AND r->>'quote' !~ '(협찬|광고|제공|대가|유료|체험단)[[:space:]]*([Xx✕✖]|아닌|아니|아님|없이|없는|없습니다|없음|받지[[:space:]]*않)' THEN 1 ELSE 0 END), 0),
    'duplink_n', COALESCE((SELECT count(*) FROM (SELECT lk FROM (SELECT r2->>'link' lk FROM jsonb_array_elements(revs) r2) x WHERE lk IS NOT NULL GROUP BY lk HAVING count(*) > 1) g), 0)
  ) INTO NEW.synth_ev_flags
  FROM jsonb_array_elements(revs) r;
  RETURN NEW;
END
$$ LANGUAGE plpgsql`;
// 트리거 자체(trg_synth_ev_n BEFORE INSERT OR UPDATE OF synth_reviews)는 이미 존재 — 함수만 교체돼도 즉시 적용.
await sql`DROP TRIGGER IF EXISTS trg_synth_ev_n ON cafes`;
await sql`CREATE TRIGGER trg_synth_ev_n BEFORE INSERT OR UPDATE OF synth_reviews ON cafes
  FOR EACH ROW EXECUTE FUNCTION set_synth_ev_n()`;

// cross_cafe_quote_dup(16) — 카페간 비교라 파생컬럼 1개로 못 담음. quote 해시만 담은 소형 인덱스 테이블.
await sql`CREATE TABLE IF NOT EXISTS review_quotes (cafe_id BIGINT NOT NULL, quote_hash TEXT NOT NULL, PRIMARY KEY (cafe_id, quote_hash))`;
await sql`CREATE INDEX IF NOT EXISTS review_quotes_hash_idx ON review_quotes (quote_hash)`;
await sql`CREATE OR REPLACE FUNCTION sync_review_quotes() RETURNS trigger AS $$
BEGIN
  DELETE FROM review_quotes WHERE cafe_id = NEW.id;
  INSERT INTO review_quotes (cafe_id, quote_hash)
  SELECT NEW.id, md5(r->>'quote')
  FROM jsonb_array_elements(COALESCE(NEW.synth_reviews, '[]'::jsonb)) r
  WHERE coalesce(r->>'quote','') <> ''
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$ LANGUAGE plpgsql`;
await sql`DROP TRIGGER IF EXISTS trg_review_quotes ON cafes`;
await sql`CREATE TRIGGER trg_review_quotes AFTER INSERT OR UPDATE OF synth_reviews ON cafes
  FOR EACH ROW EXECUTE FUNCTION sync_review_quotes()`;
console.log("컬럼+트리거 생성 완료");

// 백필: synth_reviews를 그대로 재대입(SET synth_reviews = synth_reviews)해 위 두 트리거를 그대로 재사용.
// 로직을 여기서 다시 쓰지 않음(이중관리 방지) — 트리거 함수가 유일한 판정 출처.
const [{ maxid }] = await sql`SELECT MAX(id)::int maxid FROM cafes`;
let updated = 0;
for (let lo = 0; lo <= maxid; lo += 2000) {
  const r = await sql`UPDATE cafes SET synth_reviews = synth_reviews
    WHERE id > ${lo} AND id <= ${lo + 2000} AND synth_ev_flags IS NULL RETURNING id`;
  updated += r.length;
  if (r.length) console.log(`  배치 ${lo}~${lo + 2000}: ${r.length}행`);
}
console.log(`백필 완료: ${updated}행`);
const [chk] = await sql`SELECT count(*)::int nulls FROM cafes WHERE synth_ev_flags IS NULL`;
console.log(`잔여 NULL: ${chk.nulls} (0이어야 함)`);
const [rq] = await sql`SELECT count(*)::int n FROM review_quotes`;
console.log(`review_quotes 적재: ${rq.n}행`);
