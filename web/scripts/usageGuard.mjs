// 🛡️ 구독 주간한도 가드(결정론·무LLM) — USAGE.tsv의 최근 7일 토큰합을 WEEKLY_TOKEN_SOFT_CAP과 비교.
//   목적: 한도 근접 시 **비핵심 자율개발(dev 파이프라인·챗 자동배포)을 스로틀/보류**해
//   핵심 판정(self-audit 등)·그라운딩(챗 질의응답)을 굶기지 않게 한다.
//   컷 기준은 CEO가 .env.local의 WEEKLY_TOKEN_SOFT_CAP으로 조정(미설정=0=가드 비활성=행동변화 없음).
//   CLI: `node usageGuard.mjs` → stdout에 레벨, exit(pause=2·throttle=1·ok=0). import: computeGuard().
import { readFileSync } from "node:fs";

const USAGE = "/Users/wangwida/coffee-platform/agent-reports/USAGE.tsv";
const ENV = "/Users/wangwida/coffee-platform/web/.env.local";

export function computeGuard() {
  let cap = 0;
  try { const m = readFileSync(ENV, "utf8").match(/WEEKLY_TOKEN_SOFT_CAP="?([0-9_]+)/); if (m) cap = Number(m[1].replace(/_/g, "")); } catch {}
  let used = 0, n = 0;
  const now = Date.now(), WEEK = 7 * 864e5;
  try {
    for (const l of readFileSync(USAGE, "utf8").trim().split("\n")) {
      const p = l.split("\t"); const t = Date.parse(p[0]);
      if (!t || now - t > WEEK) continue;
      used += (Number(p[2]) || 0) + (Number(p[3]) || 0); n++;
    }
  } catch {}
  if (!cap || cap <= 0) return { level: "ok", used, cap: 0, pct: 0, n, active: false };
  const pct = used / cap;
  const level = pct >= 1.0 ? "pause" : pct >= 0.8 ? "throttle" : "ok";
  return { level, used, cap, pct: +(pct * 100).toFixed(1), n, active: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const g = computeGuard();
  console.log(`${g.level} (7d ${(g.used / 1e6).toFixed(1)}M tok${g.active ? ` / cap ${(g.cap / 1e6).toFixed(0)}M = ${g.pct}%` : ", cap 미설정=비활성"})`);
  process.exit(g.level === "pause" ? 2 : g.level === "throttle" ? 1 : 0);
}
