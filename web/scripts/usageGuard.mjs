// 🛡️ 구독(로컬 claude -p) 주간 사용가드(결정론·무LLM) — USAGE.tsv 최근 7일 **원가가중** 토큰합을 WEEKLY_TOKEN_SOFT_CAP과 비교.
//   ⚠️ 산정근거: USAGE.tsv는 로컬 자율에이전트·관제챗의 **구독 claude -p 실측**이다(프로덕션 콘솔키 ANTHROPIC_API_KEY 아님).
//   원가가중식(프록시): 정입력(input)+캐시생성(cache_creation)+출력(output)은 **온전 계상**, 캐시읽기(cache_read)만 실단가≈0.1x 가중.
//     └ 과거엔 cache_read를 온전 합산해 최근7일이 과대계상됐다(예: 411M/500M=82%). 캐시읽기 제외/저가중으로 교정.
//   목적: 한도 근접 시 **비핵심 자율개발(dev 파이프라인·챗 자동배포)을 스로틀/보류**해
//   핵심 판정(self-audit 등)·그라운딩(챗 질의응답)을 굶기지 않게 한다.
//   컷 기준은 CEO가 .env.local의 WEEKLY_TOKEN_SOFT_CAP으로 조정(미설정=0=가드 비활성=행동변화 없음).
//   CLI: `node usageGuard.mjs` → stdout에 레벨, exit(pause=2·throttle=1·ok=0). import: computeGuard().
import { readFileSync } from "node:fs";

const USAGE = "/Users/wangwida/coffee-platform/agent-reports/USAGE.tsv";
const ENV = "/Users/wangwida/coffee-platform/web/.env.local";

// 캐시읽기(cache_read_input_tokens) 원가가중치 — 정상 입력 대비 실단가 ≈1/10. 기록부(chat-watch)와 공용 단일기준(이중기준 방지).
export const CACHE_READ_WEIGHT = 0.1;

// USAGE.tsv 한 행의 원가가중 토큰수(프록시). 컬럼: [0]ts [1]job [2]입력(정입력+캐시생성) [3]출력 [4]$ [5]turns [6]캐시읽기.
//   정입력·캐시생성·출력은 온전, 캐시읽기([6])만 0.1x. ⚠️구(舊)형식 행은 [2]에 캐시읽기가 섞이고 [6]이 없어 1.0x로 남음(7일 내 자연소멸).
export function rowCostTokens(cols) {
  const fullIn = Number(cols[2]) || 0;     // 정입력 + 캐시생성 (온전 계상)
  const out = Number(cols[3]) || 0;        // 출력 (온전 계상)
  const cacheRead = Number(cols[6]) || 0;  // 캐시읽기 (실단가 0.1x)
  return fullIn + out + CACHE_READ_WEIGHT * cacheRead;
}

export function computeGuard() {
  let cap = 0;
  try { const m = readFileSync(ENV, "utf8").match(/WEEKLY_TOKEN_SOFT_CAP="?([0-9_]+)/); if (m) cap = Number(m[1].replace(/_/g, "")); } catch {}
  let used = 0, n = 0;
  const now = Date.now(), WEEK = 7 * 864e5;
  try {
    for (const l of readFileSync(USAGE, "utf8").trim().split("\n")) {
      const p = l.split("\t"); const t = Date.parse(p[0]);
      if (!t || now - t > WEEK) continue;
      used += rowCostTokens(p); n++;
    }
  } catch {}
  if (!cap || cap <= 0) return { level: "ok", used, cap: 0, pct: 0, n, active: false };
  const pct = used / cap;
  const level = pct >= 1.0 ? "pause" : pct >= 0.8 ? "throttle" : "ok";
  return { level, used, cap, pct: +(pct * 100).toFixed(1), n, active: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const g = computeGuard();
  console.log(`${g.level} (구독 claude -p 7일 ${(g.used / 1e6).toFixed(1)}M tok${g.active ? ` / soft-cap ${(g.cap / 1e6).toFixed(0)}M = ${g.pct}%` : ", cap 미설정=비활성"}, 캐시읽기 ${CACHE_READ_WEIGHT}x 가중)`);
  process.exit(g.level === "pause" ? 2 : g.level === "throttle" ? 1 : 0);
}
