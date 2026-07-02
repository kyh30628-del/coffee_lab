// 🤝 협업 요청 소비기(Coordination Consumer) — 결정론 백본.
//   에이전트가 생성한 열린 협업(coordination)을 매 사이클 트리아지 → L2 자동집행 / L3 결재상신 / 룰갭 라우팅
//   → 요청부서에 resolution 회신 → 종결. "트리거는 잘 나는데 수신·회신이 없어 썩던" 갭의 구조적 해소(결재 #114).
//   설계·원칙: agent-reports/coordination-consumer-design-20260702.md
//   🛡️ 안전: ①이슈 안 만듦(동결영역 무관, coordination만 소비) ②에스컬레이션=pending 결재(사람 게이트)
//           ③파괴적 자동집행 금지(재합성 큐 등 가역 L2만) ④자기 생성분(type='consumer') 제외=자기루프 차단
//           ⑤애매하면 human(열린 채 보존, 임의 추정 집행 금지).
import { sql } from "@/lib/db";

export type CoordKlass = "L2_resynth" | "L3_dev" | "route_rulegap" | "human";
export type CoordTriage = {
  id: number; from_team: string; to_team: string; topic: string;
  klass: CoordKlass; cafeIds: number[]; action: string; resolution: string;
};

// 협업 본문에서 카페 id 안전 추출 — 'id=NNNN'과 topic의 '(NNNN)'만.
//   (#NNNN·협업/결재 참조·건수(50곳)는 제외 — 오추출 방지.)
export function extractCafeIds(text: string): number[] {
  const ids = new Set<number>();
  for (const m of text.matchAll(/id=(\d{3,7})/g)) ids.add(Number(m[1]));
  for (const m of text.matchAll(/\((\d{4,7})\)/g)) ids.add(Number(m[1]));
  return [...ids];
}

// 결정론 트리아지 — 순서 있음. 애매하면 human(임의 추정 금지).
export function classify(topic: string, detail: string, cafeIds: number[], toTeam: string): { klass: CoordKlass; action: string; resolution: string } {
  const t = `${topic} ${detail}`;
  // 1) 데이터op(재합성·review_dates·misses) + 카페id 확정 → L2 가역 집행
  if (/재합성|resynth|review_dates|재계산|misses|synth_updated/i.test(t) && cafeIds.length)
    return { klass: "L2_resynth", action: `재합성 큐 ${cafeIds.length}곳`, resolution: `재합성 큐 집행(L2) — id ${cafeIds.join(",")}. 다음 synth 사이클(~1h) 반영. 요청부서 재확인 요망.` };
  // 2) 코드 변경 신호 → L3 결재 상신(사람 게이트)
  if (/파서|파싱|추출기|코드\s?수정|버그|헤더|컬럼|route\.ts|lib\//i.test(t) || /null\s?반환|is_synthetic/i.test(t))
    return { klass: "L3_dev", action: "L3 dev 결재 상신", resolution: "코드 변경 필요 → L3 결재 상신(승인 시 자동 빌드→기조실장 회귀검증→배포)." };
  // 3) 규칙 개선 신호 → 룰갭 라우팅(단, 이미 품질/룰갭행이면 그 팀 인박스이므로 재라우팅 금지 → human)
  if ((/규칙|룰갭|앵커|우연일치|오탐\s?규칙|place_id/i.test(t)) && !/품질|룰갭/.test(toTeam))
    return { klass: "route_rulegap", action: "리뷰품질팀(룰갭) 라우팅", resolution: "규칙 개선 대상 → 리뷰품질팀(룰갭) 라우팅." };
  // 4) 그 외 → 사람 판단(열린 채 보존)
  return { klass: "human", action: "기조실장 수동 판단 필요", resolution: "" };
}

export async function consumeCoordination(opts: { dryRun: boolean; limit?: number }): Promise<{ handled: CoordTriage[]; skippedHuman: number; total: number; report: string }> {
  const limit = opts.limit ?? 20;
  const rows = (await sql`SELECT id, from_team, to_team, topic, detail FROM coordination
    WHERE status='open' AND to_team IS NOT NULL AND COALESCE(type,'') <> 'consumer'
    ORDER BY created_at LIMIT ${limit}`) as any[];
  const handled: CoordTriage[] = [];
  let skippedHuman = 0;
  for (const r of rows) {
    const cafeIds = extractCafeIds(`${r.topic || ""} ${r.detail || ""}`);
    const { klass, action, resolution } = classify(r.topic || "", r.detail || "", cafeIds, r.to_team || "");
    const item: CoordTriage = { id: r.id, from_team: r.from_team, to_team: r.to_team, topic: r.topic || "", klass, cafeIds, action, resolution };
    if (klass === "human") { skippedHuman++; continue; } // 열린 채 보존(가시성) — 추정 집행 금지
    if (!opts.dryRun) await execute(item, r.detail || "");
    handled.push(item);
  }
  const report = [`협업 소비기 ${opts.dryRun ? "[드라이런]" : "[집행]"} — 열림 ${rows.length} · 처리 ${handled.length} · 사람판단보류 ${skippedHuman}`,
    ...handled.map((h) => `  #${h.id} ${h.from_team}→${h.to_team} [${h.klass}] ${h.action}${h.cafeIds.length ? ` {${h.cafeIds.join(",")}}` : ""}`)].join("\n");
  return { handled, skippedHuman, total: rows.length, report };
}

// 실제 집행(live) — 각 유형별. 가역·사람게이트만.
async function execute(item: CoordTriage, detail: string): Promise<void> {
  if (item.klass === "L2_resynth") {
    if (item.cafeIds.length) await sql`UPDATE cafes SET synth_updated=NULL WHERE id=ANY(${item.cafeIds})`.catch(() => {});
    await sql`UPDATE coordination SET status='resolved', resolved_at=now(), stage='소비기 처리·회신', resolution=${item.resolution} WHERE id=${item.id}`;
  } else if (item.klass === "L3_dev") {
    const d = (await sql`INSERT INTO decisions (title, detail, team, severity, action_type, tier, status, recommendation)
      VALUES (${`[개발] 협업 #${item.id}: ${item.topic}`.slice(0, 120)}, ${`출처 협업 #${item.id}(${item.from_team}). ${detail}`.slice(0, 900)},
        ${item.to_team}, ${"MED"}, ${"dev_task"}, ${"L3"}, ${"pending"}, ${"협업 소비기 자동 상신 — 승인 시 자동 빌드→기조실장 회귀검증→배포."}) RETURNING id`) as any[];
    await sql`UPDATE coordination SET status='resolved', resolved_at=now(), stage='소비기 처리·회신', resolution=${`${item.resolution} 결재 #${d[0].id}.`} WHERE id=${item.id}`;
  } else if (item.klass === "route_rulegap") {
    const c = (await sql`INSERT INTO coordination (from_team, to_team, type, topic, detail, status, stage)
      VALUES (${item.to_team}, ${"리뷰품질팀"}, ${"consumer"}, ${`[소비기 라우팅] ${item.topic}`.slice(0, 150)}, ${detail.slice(0, 900)}, ${"open"}, ${"수신확인"}) RETURNING id`) as any[];
    await sql`UPDATE coordination SET status='resolved', resolved_at=now(), stage='소비기 처리·회신', resolution=${`${item.resolution} → 협업 #${c[0].id}.`} WHERE id=${item.id}`;
  }
}
