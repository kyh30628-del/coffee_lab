// 🚪 외부 이탈 클릭 기록 헬퍼(클라이언트) — /api/track-outbound 로 전송.
//   공유 계측(trackShareClient)과 같은 형태로 맞춰, 계측 방식이 화면마다 갈라지지 않게 한다.
//
// ⚠️ keepalive가 핵심: 이 클릭은 곧바로 새 탭/외부 사이트로 넘어가는 순간이라
//   일반 fetch는 페이지 전환에 잘려 유실된다(과소집계). 공유 계측이 겪은 것과 같은 함정.
export function trackOutbound(opts: {
  target: "naver_place" | "kakao_map" | "wish" | "map_cta" | "nearby" | "record"
    | "fav_open" | "mypin_open" | "fav_toggle" | "favs_link"
    | "review_src"; // 무엇을 했나  (review_src = 후기 원문 글로 이동, 2026-10-19)
  //   naver_place·kakao_map = 외부로 나감(가기로 결정) / wish = 찜 / map_cta = 지도 진입
  //   nearby = 다음 카페로 / record = 내 카페 기록 시작. 전부 같은 테이블에 담아 **같은 잣대로** 비교한다.
  cafeId?: number | null;              // 지도앱은 pathname이 "/"라 path 파싱이 안 되므로 명시 필요
  source?: string;                     // 화면 구분(카페상세/지도앱/동네목록)
  path?: string;
}): void {
  try {
    const anonId = typeof window !== "undefined" ? localStorage.getItem("dcn_anon") || "" : "";
    // 내부(대표·팀) 클릭은 성과 지표를 흔들므로 아예 보내지 않는다 — 방문 계측과 같은 기준.
    if (typeof window !== "undefined" && localStorage.getItem("dcn_internal") === "1") return;
    const path = opts.path ?? (typeof window !== "undefined" ? window.location.pathname : "");
    // 💬 2026-10-19 — 외부로 나가는 클릭(지도·플레이스)이면 피드백 바를 '도움이 됐나요?'로 펼친다.
    //   그 순간이 **"이 정보가 쓸모 있었나"를 묻기 가장 자연스러운 시점**이다(CEO와 합의: 뒤로가기는 가로채지 않는다).
    //   계측 전송과 독립이라 실패해도 서로 영향이 없다.
    if (typeof window !== "undefined" && (opts.target === "naver_place" || opts.target === "kakao_map" || opts.target === "review_src")) {
      try { window.dispatchEvent(new Event("dcn:outlink")); } catch { /* 구형 브라우저 무시 */ }
    }
    fetch("/api/track-outbound", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ anonId, path, target: opts.target, cafeId: opts.cafeId ?? undefined, source: opts.source }),
    }).catch(() => {});
  } catch {}
}
