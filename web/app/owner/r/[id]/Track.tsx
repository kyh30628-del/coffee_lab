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
      fetch("/api/owner-funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ anonId, event, source: "free_report", cafeId, path: `/owner/r/${cafeId}` }),
      }).catch(() => {});
    } catch {}
  }, [cafeId, event]);
  return null;
}
