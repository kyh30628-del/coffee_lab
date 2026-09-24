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

// 2026-09-13 해자 감사: 등급 가중·게이트(synthStore·collectOrchestrator)·광고템플릿·경쟁인용 파일이 빠져 있어
//   그 파일이 바뀌어도 재검이 안 돌았다(지문 16종 공존 실측). 판정을 바꿀 수 있는 파일은 전부 넣는다.
const RULE_FILES = ["lib/reviewQuality.ts", "lib/criteriaListsBase.ts", "lib/discover.ts",
  "lib/synthStore.ts", "lib/collectOrchestrator.ts", "lib/adTemplate.ts", "lib/competitorQuote.ts",
  "lib/data/dong-index.json"]; // 09-24: 동 사전(타지역 판정 입력)이 바뀌면 재검이 돌아야 한다 — next.config 추적 목록과 짝
/** 🧬 규칙 소스 정규화 — 판정 로직만 남긴다.
 *
 *  왜(2026-09-16 실측): 지문은 파일 **바이트**를 통째로 해시했다. 주석도 바이트다.
 *  09-15에 근거 설명 주석을 길게 단 것만으로 지문이 바뀌어 공개 27,500곳 전부가 재검 대상이 됐다.
 *  재검은 300곳×4회/일이라 한 바퀴에 23일이 걸리는데, 규칙 파일은 최근 14일 동안 **57번** 수정됐다.
 *  그래서 지문이 22종 공존하고 현재 지문 일치율이 **1%**(296/27,500) — 건너뛰기가 사실상 작동하지 않았다.
 *
 *  🔴 왜 '통째 줄'만 지우나 — 순진한 주석 제거기는 **문자열·정규식 안의 //** 에서 깨진다.
 *     "https://a.com" → "https:  으로 잘리고, /https?:\/\// 도 잘린다. 이 저장소엔 둘 다 널려 있다.
 *     그러면 서로 다른 규칙이 같은 지문을 갖게 되고 — **규칙 변경이 영영 안 퍼진다**(훨씬 위험한 실패).
 *     → 코드가 한 글자라도 있는 줄은 **절대 건드리지 않는다.** 통째로 주석인 줄만 버린다.
 *     줄 끝 주석(`const X = 1; // 설명`)은 그대로 남는다 — 놓치는 이득보다 안전이 우선이다.
 *
 *  ⚠️ 이 함수를 고치면 scripts/fixtures-rulesfp.mjs를 반드시 먼저 돌릴 것.
 */
export function normalizeRuleSource(src: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of String(src).split("\n")) {
    const t = raw.trim();
    if (inBlock) { if (t.includes("*/")) inBlock = false; continue; }   // 블록 주석 내부
    if (!t) continue;                                                   // 빈 줄
    if (t.startsWith("//")) continue;                                   // 통째 줄 주석
    if (t.startsWith("/*")) { if (!t.includes("*/")) inBlock = true; continue; } // 블록 시작
    if (t.startsWith("*")) continue;                                    // 블록 주석 본문(* 로 시작)
    out.push(t);                                                        // 코드 줄 — 원문 그대로(들여쓰기만 정규화)
  }
  return out.join("\n");
}

let cached: { at: number; fp: string } | null = null;

export async function rulesFingerprint(): Promise<string> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.fp;
  const h = createHash("sha1");
  let filesOk = 0;
  for (const f of RULE_FILES) {
    try { h.update(normalizeRuleSource(readFileSync(`${process.cwd()}/${f}`, "utf8"))); filesOk++; } catch { /* 번들 밖 — 생략 */ }
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
