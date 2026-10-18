// 🔬 조사용 쿼리 런너 — 기획조정실장의 측정 오류를 기계로 막는다. (2026-10-18 신설)
//
// 왜: 10-17~18 측정 오류 15건 중 6건이 아래 두 원인이었다.
//   ① 이름을 확인 없이 지어 씀 — 없는 컬럼(`owner_funnel_events.kind`), 없는 함수(`stuckJobs`), 없는 경로(`/search`)
//   ② 실패를 삼킴 — `.catch(() => [])`가 깨진 쿼리를 0건으로 보고하게 만들었다(그래서 "0명"이라 보고함)
//
// 어떻게: 모든 조사 쿼리를 **먼저 EXPLAIN에 걸어** 테이블·컬럼명을 검증한 뒤 실행한다.
//   EXPLAIN은 계획만 세우므로 행을 읽지 않는다(비용 ≈0). 실패하면 **던진다** — 조용한 0을 금지한다.
// 사용:
//   import { connect } from "../lib/probe.mjs";
//   const { q, sql } = await connect();
//   const rows = await q`SELECT ... FROM cafes WHERE published`;   // 검증 후 실행
import { readFileSync } from "node:fs";

export async function connect(envPath = "./.env.local") {
  const env = readFileSync(envPath, "utf8");
  for (const l of env.split("\n")) {
    const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);

  // 태그드 템플릿 — 파라미터는 그대로 넘기고, 검증용으로만 NULL 치환본을 EXPLAIN에 건다.
  const q = async (strings, ...vals) => {
    const probe = strings.join("NULL");
    if (/\b(SELECT|WITH)\b/i.test(probe)) {
      try {
        await sql.query(`EXPLAIN ${probe}`);
      } catch (e) {
        const msg = String(e?.message || e);
        // 없는 테이블·컬럼·함수 = 내가 이름을 지어낸 것. 즉시 멈춘다.
        if (/does not exist/i.test(msg) && /(column|relation|function)/i.test(msg)) {
          throw new Error(`🔴 스키마 오류 — 조회 대상이 실재하지 않습니다: ${msg.split("\n")[0]}\n   쿼리: ${probe.replace(/\s+/g, " ").slice(0, 200)}`);
        }
        // 타입·구문 오류는 NULL 치환 부작용일 수 있으므로 통과시키고 실제 실행에서 판단한다.
      }
    }
    return sql(strings, ...vals);  // 실패하면 그대로 던진다 — .catch(()=>[]) 금지
  };
  return { q, sql };
}
