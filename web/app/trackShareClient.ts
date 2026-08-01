// 📣 공유 클릭 기록 공용 헬퍼(클라이언트) — /api/track-share 로 전송.
//   기존엔 KakaoShare에만 있었고 shareCafe()·취향결과 공유는 누락돼 과소집계였다(#503 분석). 여기로 일원화.
//   kakaoFailed/note: 카톡 공유가 '실제로' 됐는지 검증용 — 카톡 버튼을 눌렀는데 web/clipboard로 폴백되면
//   kakaoFailed=true + note(원인 메시지)를 남겨, 폴백을 '진짜 카톡 공유'와 구분한다.
export function trackShare(opts: {
  channel: string;                 // kakao | web | clipboard
  source?: string;                 // 화면 구분(카페상세/MYPIN/동네목록/컬렉션/취향결과)
  cafeId?: number | null;          // 카페 직접 지정(홈 슬라이드 패널은 pathname이 "/"라 path 파싱이 안 됨)
  path?: string;                   // 기본: 현재 pathname
  kakaoFailed?: boolean;           // 카톡 버튼인데 폴백됨
  note?: string;                   // 폴백 원인(에러 메시지 등, 계측용)
}): void {
  try {
    const anonId = typeof window !== "undefined" ? localStorage.getItem("dcn_anon") || "" : "";
    const path = opts.path ?? (typeof window !== "undefined" ? window.location.pathname : "");
    fetch("/api/track-share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        anonId,
        path,
        channel: opts.channel,
        source: opts.source,
        cafeId: opts.cafeId ?? undefined,
        kakaoFailed: opts.kakaoFailed || undefined,
        note: opts.note ? String(opts.note).slice(0, 120) : undefined,
      }),
    }).catch(() => {});
  } catch {}
}
