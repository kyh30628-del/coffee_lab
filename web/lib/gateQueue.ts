import { sql } from "./db";

// 🚦 인간 게이트 큐 — 하네스 L6.
//
// 왜 필요한가(2026-08-08 실증): 배포대기 4건이 최장 27시간 정체했다. 원인은 심각한 게 아니라
//   **"수동 배포/폐기 필요"라는 경고는 접힌 화면에 보이는데 🚀배포 버튼은 펼쳐야 나왔던 것**이다.
//   즉 조치하라고 띄우면서 누를 곳을 안 준 화면이었고, 큐가 아니라 **화면이 진실의 원천**이었다.
//
// 원칙 (절대 어기지 않는다)
//   ① **L3는 자동승인하지 않는다.** 이 모듈은 *눈에 띄게* 만들 뿐, 승인을 대신하지 않는다.
//   ② 이슈↔결재 자동변환 경로를 새로 만들지 않는다(lib/issues.ts 동결 영역 — CLAUDE.md §2.4).
//      여기서는 decisions를 **읽기만** 한다.
//   ③ 경고를 띄우는 자리에는 반드시 조치 수단이 함께 있어야 한다(위 사고의 교훈).

export type GateItem = {
  id: number; title: string; tier: string; status: string;
  dev_status: string | null; ageH: number; sla: "정상" | "주의" | "지연" | "심각";
};

// SLA 단계(시간) — 결재 대기가 이 시간을 넘으면 보고서 상단으로 승격된다.
export const GATE_SLA = { warn: 6, late: 24, severe: 72 } as const;

function slaOf(ageH: number): GateItem["sla"] {
  if (ageH >= GATE_SLA.severe) return "심각";
  if (ageH >= GATE_SLA.late) return "지연";
  if (ageH >= GATE_SLA.warn) return "주의";
  return "정상";
}

/**
 * 사람 손을 기다리는 항목 — ①CEO 결재 대기(pending) ②승인됐지만 배포 버튼 대기(배포대기).
 * ⚠️ 조회 1회, 작은 컬럼만. 결재 본문(detail)은 안 읽는다.
 */
export async function pendingGates(): Promise<GateItem[]> {
  try {
    const rows = (await sql`
      SELECT id, LEFT(title, 80) title, COALESCE(tier,'L3') tier, status,
             action_params->>'dev_status' dev_status,
             EXTRACT(EPOCH FROM (now() - COALESCE(decided_at, created_at)))/3600 AS age_h
      FROM decisions
      WHERE (status = 'pending' AND COALESCE(tier,'L3') = 'L3')
         OR (status = 'approved' AND action_type = 'dev_task' AND action_params->>'dev_status' = '배포대기')
      ORDER BY age_h DESC LIMIT 50`) as any[];
    return rows.map((r) => {
      const ageH = Math.max(0, Number(r.age_h) || 0);
      return { id: Number(r.id), title: String(r.title ?? ""), tier: String(r.tier), status: String(r.status), dev_status: r.dev_status ?? null, ageH: Math.round(ageH * 10) / 10, sla: slaOf(ageH) };
    });
  } catch { return []; }
}

/** 보고서 한 줄 요약 — 정체가 있으면 무조건 상단에 뜨게 만드는 문자열. */
export function gateSummary(items: GateItem[]): string {
  if (!items.length) return "";
  const severe = items.filter((i) => i.sla === "심각").length;
  const late = items.filter((i) => i.sla === "지연").length;
  const oldest = items[0];
  if (!severe && !late) return `🚦 사람 대기 ${items.length}건(최장 ${oldest.ageH}h)`;
  return `🚦 사람 대기 ${items.length}건 — ${severe ? `심각(72h+) ${severe}건 · ` : ""}${late ? `지연(24h+) ${late}건 · ` : ""}최장 #${oldest.id} ${oldest.ageH}h`;
}
