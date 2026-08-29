"use client";
import { useEffect } from "react";

// 📊 무료 리포트 계측 — 서버 컴포넌트(ISR)에서는 조회를 셀 수 없다(캐시 히트는 코드가 안 돈다).
//   그래서 얇은 클라이언트 래퍼가 마운트 때 1회만 기록한다. OwnerCtaLink(#782)와 동일 패턴.
//   ⚠️ 읽기 실패해도 화면은 그대로 — 계측이 사용자 플로우를 막지 않는다.
//   ⚠️ 세션당 1회만 보낸다. 새로고침마다 쏘면 표본이 부풀고 요청도 는다(비용).
export default function Track({ cafeId, event }: { cafeId: number; event: "free_report_view" }) {
  useEffect(() => {
    const key = `dcn_of_${event}_${cafeId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { return; } // 프라이빗 모드 등 저장 불가 → 중복 방지가 안 되니 아예 보내지 않는다
    try {
      const anonId = localStorage.getItem("dcn_anon") || "";
      // 🎯 2026-08-29 아웃리치(B안) 계측: 링크에 붙은 ?src= 를 출처로 기록한다.
      //   지금까지 전부 "free_report"로만 찍혀서, 사장님께 DM 100건을 보내도 **그 성과를 분리할 수 없었다**
      //   (DM으로 온 사장님 vs 그냥 흘러든 사람 구분 불가 = B안의 효과를 판정할 방법이 없음).
      //   ⚠️ 값은 화이트리스트로만 받는다 — URL 파라미터를 그대로 저장하면 아무 문자열이나 들어와
      //     집계가 오염되고, 링크를 조작해 통계를 부풀릴 수 있다.
      const ALLOWED = ["dm", "email", "kakao", "poster", "card"];
      const raw = new URLSearchParams(window.location.search).get("src") || "";
      const src = ALLOWED.includes(raw) ? `outreach_${raw}` : "free_report";
      fetch("/api/owner-funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ anonId, event, source: src, cafeId, path: `/owner/r/${cafeId}` }),
      }).catch(() => {});
    } catch {}
  }, [cafeId, event]);
  return null;
}
