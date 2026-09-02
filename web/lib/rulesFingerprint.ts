import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "./db";

// 🧬 규칙 지문 — "지금의 판정 규칙"을 한 줄 해시로 요약한다 (2026-09-03, CEO 지시의 1순위 항목).
//
// 왜: 재합성 크론이 4일마다 전체 19,000곳을 맹목 순환하며 큰 컬럼(raw_reviews)을 다시 읽었다.
//   "새 후기도 없고 규칙도 안 바뀐 카페는 판정이 변할 수 없다" — 그런데 '규칙이 안 바뀌었다'를
//   판별할 수단이 없어서 혹시 몰라 계속 돌았고, 그게 하루 수 GB의 헛읽기(전송비)였다.
//   이 지문이 그 수단이다: 카페마다 마지막 점검 때의 지문(cafes.rules_fp)을 남기고,
//   지문이 그대로면 건너뛴다. 규칙이 바뀌면 지문이 바뀌어 자연히 전수 재검 1회가 돈다.
//
// 지문 재료 = 판정을 바꿀 수 있는 모든 것:
//   ① 규칙 코드(reviewQuality·criteriaListsBase·discover) — 번들에 포함된 소스를 해시
//      (#847 광고규칙·#865/#866 사전 등재 같은 코드 배포가 여기서 잡힌다.
//       규칙과 무관한 배포는 지문이 안 변해 재검을 유발하지 않는다 — 커밋 SHA를 쓰면 안 되는 이유)
//   ② 기준값(criteria)·사전(criteria_lists) DB 상태 — md5 집계(소형 테이블·정확)
//   제외: learned_terms(룰갭 자가학습) — 매일 바뀌어 지문에 넣으면 매일 전수 재검이 된다.
//        룰갭은 학습 시 영향 카페를 스스로 소급 조치하고, 놓친 것은 30일 안전망 순환이 잡는다.
//
// ⚠️ 소스 파일은 outputFileTracingIncludes로 이 라우트 번들에 포함해야 런타임에 읽힌다(next.config).
//   파일을 못 읽으면 그 부분은 생략된다 — 지문이 덜 정밀해질 뿐 동작은 계속된다(30일 순환이 보완).

const RULE_FILES = ["lib/reviewQuality.ts", "lib/criteriaListsBase.ts", "lib/discover.ts"];
let cached: { at: number; fp: string } | null = null;

export async function rulesFingerprint(): Promise<string> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.fp;
  const h = createHash("sha1");
  let filesOk = 0;
  for (const f of RULE_FILES) {
    try { h.update(readFileSync(`${process.cwd()}/${f}`)); filesOk++; } catch { /* 번들 밖 — 생략 */ }
  }
  try {
    const [c] = (await sql`SELECT COALESCE(md5(string_agg(key || '=' || value::text, ',' ORDER BY key)), '') m FROM criteria`) as any[];
    const [l] = (await sql`SELECT COALESCE(md5(string_agg(key || ':' || item, ',' ORDER BY key, item)), '') m FROM criteria_lists WHERE COALESCE(status,'active') NOT IN ('removed','rejected')`) as any[];
    h.update(`${c?.m}|${l?.m}`);
  } catch { h.update("db-unavailable"); }
  h.update(`files:${filesOk}`);
  const fp = h.digest("hex").slice(0, 16);
  cached = { at: Date.now(), fp };
  return fp;
}
