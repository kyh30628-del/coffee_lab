// 🔐 로컬 우선 구조의 **안전 경계** — 로컬이 계산해서 Neon에 밀어넣어도 되는 컬럼의 단일 출처.
//
// 배경(2026-08-28 CEO 지시): 파생 계산(합성·임베딩·마감·보강)을 로컬에서 돌리고 결과만 Neon에 쓴다.
//   이때 **사람이 만든 것**(카페 등록정보·사장님/소비자가 남긴 기록·결재 결정)을 로컬 계산 결과가
//   덮어쓰면 복구 불가능한 사고다. 그래서 "쓸 수 있는 컬럼"을 화이트리스트로 못 박고,
//   목록에 없는 컬럼은 **코드가 쓰기를 거부**한다(문서가 아니라 코드가 막는다).
//
// 분류 근거는 추측이 아니라 전수 스캔이다: `grep -rn "UPDATE cafes"` 로 이 저장소의 모든 쓰기 경로를
//   찾아 어떤 컬럼을 누가 세팅하는지 대조했다(2026-08-28, 108개 UPDATE 지점).

/**
 * ✅ 로컬이 소유(계산해서 덮어써도 안전).
 * 공통점: **입력이 raw_reviews 뿐인 순수 계산 결과**. 사람이 손으로 넣는 값이 하나도 없고,
 * 재계산하면 같은 입력에서 같은 값이 나온다(멱등). 날려도 재계산으로 복원된다.
 */
export const LOCAL_OWNED_COLUMNS = [
  // 합성 본체
  "synth_identity", "synth_basis", "synth_count", "synth_reviews", "synth_reviews_all",
  "synth_quality", "synth_coherence", "synth_menu",
  // 맛 축(합성 산출 — 사장님 입력 acidity/body/sweet 와 **다른 컬럼**이다)
  "synth_acidity", "synth_body", "synth_sweet", "char_scores",
  // 원천·판정 부산물
  "raw_reviews", "judge_decisions", "review_dates", "offctx_rate",
  "needs_llm", "needs_llm_priority", "borderline_count",
  // 방문자 구성
  "visitor_n", "visitor_trip", "visitor_local",
  // 검색 임베딩
  "embedding", "embed_updated",
  // 보강·마감 관측치
  "recent_ratio", "reputation_note", "enriched_at",
  "closure_misses", "closure_checked_at",
  // 타임스탬프(언제 계산했나)
  "synth_updated", "synth_checked_at", "raw_checked_at", "raw_collected_at",
  "llm_judged_at", "audit_checked_at", "yt_checked_at",
] as const;

/**
 * 🚫 로컬이 **절대** 쓰지 않는다 — 왜 안 되는지 이유를 컬럼마다 남긴다.
 * (문서화용. 실제 차단은 화이트리스트 대조로 이뤄진다.)
 */
export const NEVER_LOCAL: Record<string, string> = {
  // ── 결재·관리자가 통제(로컬 재계산이 CEO 결정을 되돌리면 안 됨)
  published: "결재(unpublish/restore)·관리자가 통제. 로컬 재계산이 CEO 비공개 결정을 되돌릴 수 있음",
  pipeline_status: "published와 짝. 결재 집행·감시 경로가 세팅",
  synth_grade: "결재 downgrade 상한이 걸림(#8 실증: 재계산이 강등을 조용히 원복한 적 있음)",
  offctx_ok: "관리자 판정 결과",
  // ── 카페 등록정보(발굴·제보가 INSERT/UPDATE)
  id: "PK", place_id: "등록 식별자", name: "등록 상호", address: "등록 주소",
  lat: "등록 좌표", lng: "등록 좌표", area: "등록 지역", dong: "행정동(좌표 역지오코딩)",
  source: "등록 출처", created_at: "등록 시각", naver_category: "발굴이 세팅",
  naver_place_url: "발굴이 세팅", instagram_url: "발굴이 세팅", phone: "발굴이 세팅",
  needs_category: "발굴 큐 플래그", photo_url: "등록 이미지",
  hours: "등록 영업시간", rating: "외부 평점", rating_count: "외부 평점수",
  updated_at: "여러 주체가 공유하는 갱신시각 — 로컬이 만지면 다른 경로의 변경을 가림",
  // ── 사람이 채우는 소개 필드
  roasts_own: "수기 입력", beans: "수기 입력", signature: "수기 입력", uses: "수기 입력",
  vibe: "수기 입력", note: "수기 입력", price_hint: "수기 입력",
  acidity: "cafe-enrich(수기/관리자) 입력 — 합성값 synth_acidity 와 별개",
  body: "위와 동일", sweet: "위와 동일", taste_pick: "위와 동일", tone: "위와 동일",
};

const OWNED = new Set<string>(LOCAL_OWNED_COLUMNS);

/** 화이트리스트 대조. 위반이면 **던진다** — 조용히 걸러내면 사고를 못 알아챈다. */
export function assertLocalWritable(columns: readonly string[]): void {
  const bad = columns.filter((c) => !OWNED.has(c));
  if (bad.length) {
    const why = bad.map((c) => `${c}(${NEVER_LOCAL[c] ?? "화이트리스트에 없음"})`).join(", ");
    throw new Error(`LOCAL_WRITE_FORBIDDEN: 로컬은 이 컬럼을 쓸 수 없습니다 — ${why}`);
  }
}

export function isLocalWritable(column: string): boolean {
  return OWNED.has(column);
}
