// 검색 AI 맥락판정 저하(콘솔키 크레딧 소진 · anthropic-key-credit-exhaustion 계열) 추적 분류.
// CEO 결정(#207): 이 건은 관제탑 실시간 이슈 보드에서 빼고, /admin/org '실행 중'에 상시 추적 항목으로만 표기한다.
//   콘솔키 크레딧 소진으로 검색 재정렬이 조용히 저하되지만 '충전 보류' 결정이 내려진 상태 → 신규 조치가 아닌 추적 대상.
// ⚠️ 표시(분류) 로직 전용 — DB row(UPDATE/DELETE)·lib/issues.ts 자동변환은 절대 건드리지 않는다.
//   되돌리려면 이 파일을 참조하는 필터 라인만 제거하면 원복(데이터 변경 없음).

/** 검색 재정렬 AI 저하(크레딧 소진 계열)의 위험·이슈 문구인지 판별 — 관제탑 실시간 이슈 표시 필터용. */
export function isSearchDegradeTrackItem(text: string | null | undefined): boolean {
  const t = String(text || "");
  return /검색\s*AI\s*맥락판정\s*저하/.test(t) || (/검색/.test(t) && /크레딧\s*소진/.test(t));
}

/** /admin/org '실행 중'에 상시 노출할 추적 항목(코드 상수 — DB 아님). */
export const SEARCH_DEGRADE_TRACK = {
  title: "검색 AI 맥락판정 저하 (콘솔키 크레딧 소진)",
  team: "경험본부",
  note: "콘솔키 크레딧 소진으로 검색 재정렬 조용한 저하 — 충전 보류 결정(추적 항목)",
} as const;
