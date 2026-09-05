// 🧮 synth_ev_n 파생 컬럼 도입(2026-09-05, CEO 승인 수리안)
//   왜: 관제 카운트가 jsonb_array_length(synth_reviews)로 공개 전수의 후기 본문을 매번 디토스트
//   (pg_stat 실측 9/1~9/5 상위: 9.3GB+6.5GB). 길이만 필요한데 본문을 읽는 구조를 파생 컬럼으로 대체.
//   트리거가 synth_reviews 쓰기 시점에 길이를 굳힘 — 쓰기 경로가 몇 개든 드리프트 불가, 추가 IO 0
//   (NEW 값은 이미 메모리에 있음). 백필은 id 배치로 나눠 한 번만(사전 고지된 1회성 전수).
import { readFileSync } from "node:fs";
for (const l of readFileSync("./.env.local","utf8").split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g,""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_ev_n INT`;
await sql`CREATE OR REPLACE FUNCTION set_synth_ev_n() RETURNS trigger AS $$
  BEGIN NEW.synth_ev_n := COALESCE(jsonb_array_length(NEW.synth_reviews), 0); RETURN NEW; END
$$ LANGUAGE plpgsql`;
await sql`DROP TRIGGER IF EXISTS trg_synth_ev_n ON cafes`;
await sql`CREATE TRIGGER trg_synth_ev_n BEFORE INSERT OR UPDATE OF synth_reviews ON cafes
  FOR EACH ROW EXECUTE FUNCTION set_synth_ev_n()`;
console.log("컬럼+트리거 생성 완료");

const [{ maxid }] = await sql`SELECT MAX(id)::int maxid FROM cafes`;
let updated = 0;
for (let lo = 0; lo <= maxid; lo += 2000) {
  const r = await sql`UPDATE cafes SET synth_ev_n = COALESCE(jsonb_array_length(synth_reviews), 0)
    WHERE id > ${lo} AND id <= ${lo + 2000} AND synth_ev_n IS NULL RETURNING id`;
  updated += r.length;
}
console.log(`백필 완료: ${updated}행`);
const [chk] = await sql`SELECT count(*)::int nulls FROM cafes WHERE synth_ev_n IS NULL`;
console.log(`잔여 NULL: ${chk.nulls} (0이어야 함)`);
