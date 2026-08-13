import { getContract } from "./jobContract";

// 🔐 쓰기 스코프 — 하네스 L3.
//
// 문제: 계약(`jobContract.writes`)에 "이 잡은 무엇을 바꾼다"를 선언해 뒀지만 **런타임 검사가 없었다.**
//   선언과 실제가 갈라져도 아무도 모른다(문서가 코드를 못 따라가는 전형).
//
// 왜 DB 프록시를 안 쓰나: 모든 SQL을 가로채려면 드라이버 래핑이 필요한데, neon 태그드 템플릿을
//   감싸면 기존 400+ 쿼리의 타입·동작 위험이 크고 이득은 작다(비용 대비 실익 낮음 — 의도적 미채택).
//   대신 **쓰기 진입점에서 선언적으로 신고**하게 하고, 신고 내용이 계약과 어긋나면 잡는다.
//   완전 봉쇄가 아니라 **드리프트 탐지**가 목적이다. 이 목적엔 이 방식으로 충분하다.

type ScopeState = { job: string; declared: Set<string>; touched: Set<string>; violations: string[] };
// ⚠️ 2026-08-13: blobBudget과 같은 병(모듈 전역이 동시 요청 간 공유돼 스코프가 남의 잡에 붙음) — 같은 수리(ALS).
import { AsyncLocalStorage } from "node:async_hooks";
const als = new AsyncLocalStorage<ScopeState>();
const cur = (): ScopeState | null => als.getStore() ?? null;

/** 잡 실행 시작 시 계약의 writes를 스코프로 연다(blobBudget.startJobRun과 짝). */
export function openScope(job: string): void {
  const c = getContract(job);
  als.enterWith({ job, declared: new Set(c.writes ?? []), touched: new Set(), violations: [] });
}

/**
 * 쓰기 신고. `table.column` 또는 `table.*` 형태.
 * 계약에 선언이 **아예 없으면**(writes 미선언) 자유 — 아직 계약을 안 쓴 잡을 막지 않는다(3단 완화).
 */
export function noteWrite(target: string): void {
  const c = cur();
  if (!c) return;
  c.touched.add(target);
  if (c.declared.size === 0) return;                   // 미선언 잡은 통과(관측 대상 아님)
  const ok = [...c.declared].some((d) => d === target
    || (d.endsWith(".*") && target.startsWith(d.slice(0, -1)))
    || (d.endsWith("_*") && target.startsWith(d.slice(0, -1))));
  if (!ok && !c.violations.includes(target)) {
    c.violations.push(target);
    console.warn(`[writeScope] ${c.job}: 계약에 없는 쓰기 — ${target} (선언: ${[...c.declared].join(", ")})`);
  }
}

/** 이번 런의 스코프 결과 — 원장 metrics·리포트로 넘긴다. */
export function scopeResult(): { touched: string[]; violations: string[] } | null {
  const c = cur();
  if (!c) return null;
  return { touched: [...c.touched], violations: [...c.violations] };
}
