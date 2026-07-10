// 🎛️ fleet 모델 배치 단일출처(결정론·가역) — 잡별 claude -p 모델 결정. _run.sh가 잡명으로 조회.
//   방침(CEO 2026-07-06): **품질 해자 최우선.** 판정기준 = "이 잡의 출력이 소비자가 보는 것
//   (노출 후기·검증등급·오염필터·큐레이션·검색 랭킹·카페 상세)에 조금이라도 영향을 주나?"
//   조금이라도 YES거나 애매 → sonnet. haiku는 **소비자 데이터에 전혀 안 닿는 순수 내부 배관**만.
//   ⚠️ 기본값 = sonnet(모르는/애매한 잡은 안전하게 sonnet). haiku는 아래 화이트리스트에 명시된 것만.
//   가역: model-overrides.json(자동 회귀복귀가 기록)이 있으면 그게 우선 — 즉시 sonnet 강제 가능.
import { readFileSync } from "node:fs";

const OVERRIDES = "/Users/wangwida/coffee-platform/agent-reports/model-overrides.json";

// ── 소비자 영향 판정(근거) ──────────────────────────────────────────────
// sonnet 유지(소비자 영향 있음/애매 — 절대 haiku 금지):
//  MOAT(직접): deep-judge-agent, quality-redteam-agent, integrity-agent, search-quality-agent,
//              rulegap-agent(오염규칙으로 흘러감), self-audit-agent(비공개/재합성/오염 상신), closure-agent(비공개 제안), dev-agent(코드=소비자화면)
//  JUDGMENT(간접 조종): chief-manager-agent, chief-secretary-agent(work-order로 모트팀 지휘), strategy-agent,
//              evaluation, risk-mgmt-agent, b2b-sales-agent, marketing-agent, demand-grow-agent,
//              team-ops-support-agent(협업라우팅=오염→품질팀 등 조종), support-office-director(모트 하위잡 기동),
//              team-legal-agent(PII·약관=비가역 리스크), morning-meeting-agent(우선순위 조종)
// haiku(순수 내부 배관 — 소비자 데이터 전혀 안 닿음): 아래 HAIKU만.
const HAIKU = new Set([
  "team-finance-agent", // USAGE.tsv 텔레메트리 집계·쿼터신호·자원경보만. 산출=내부 재무리포트→기조실장 권고.
                        //   노출후기·등급·필터·랭킹 어디에도 안 닿음(소비자 영향 0). 회귀게이트+자동복귀 무장.
]);

// opus(최고 성능) — CEO 방침(2026-07-10): 평상시 코드수정은 **sonnet(5)**, opus는 **중대·대규모·
//   복잡한** 코드개선/기능추가와 깊이있는 분석기반 계획에만. 즉 dev-agent는 고위험(risk=high)일 때만 opus.
//   '항상 opus'인 잡은 현재 없음(아래 집합 비움).
const OPUS = new Set([]);

export const HAIKU_JOBS = [...HAIKU];

function overrideFor(job) {
  try { const o = JSON.parse(readFileSync(OVERRIDES, "utf8")); return o && o[job]; } catch { return null; }
}

// risk: dev-agent 태스크 위험도(low|med|high). high(중대·대규모·복잡=스키마/마이그레이션/광범위리팩터/핵심로직) → opus, 그 외 sonnet.
export function modelFor(job, risk) {
  const ov = overrideFor(job);
  if (ov) return ov;              // 자동 회귀복귀(→sonnet)가 최우선
  if (job === "dev-agent") return risk === "high" ? "opus" : "sonnet"; // 코드: 평상시 sonnet5, 중대건만 opus
  if (OPUS.has(job)) return "opus";
  return HAIKU.has(job) ? "haiku" : "sonnet"; // 기본 sonnet(품질 안전)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const job = process.argv[2] || "";
  const risk = process.argv[3] || ""; // 러너가 dev_task 위험도를 함께 넘김(dev-agent 모델 결정용)
  process.stdout.write(modelFor(job, risk)); // _run.sh가 stdout으로 받음(개행 없이)
}
