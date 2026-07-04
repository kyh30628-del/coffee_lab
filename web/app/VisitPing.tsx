"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// 전 페이지 익명 방문핑 + 유입경로(referrer)·UTM 첫터치 캡처 + 페이지뷰 이벤트(퍼널·인기페이지용).
// PRINCIPLES §2: 개인정보 미수집(anon_id만). 자체 분석 — 네이버·구글 없이 우리 DB로.
// 라우트 변경마다 발동(SPA 내부이동 포함) → 페이지뷰/퍼널 집계. 출처는 세션 첫 핑에서만(referrer 오염 방지).
export default function VisitPing() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      let a = localStorage.getItem("dcn_anon");
      if (!a) {
        a = crypto?.randomUUID?.() ?? `a${Date.now()}${Math.floor(Math.random() * 1e6)}`;
        localStorage.setItem("dcn_anon", a);
      }
      const firstThisSession = !sessionStorage.getItem("dcn_pinged");
      sessionStorage.setItem("dcn_pinged", "1");
      const u = new URL(window.location.href);
      // 내부(대표·팀) 표시: /admin 접속 시 자동 세팅되며, 이후 이 브라우저의 모든 방문은 집계 제외
      if ((pathname || u.pathname).startsWith("/admin")) localStorage.setItem("dcn_internal", "1");
      const isInternal = localStorage.getItem("dcn_internal") === "1";
      const body: Record<string, string | boolean> = { anonId: a, path: pathname || u.pathname, internal: isInternal };
      if (firstThisSession) {
        body.ref = document.referrer || "";
        body.utm_source = u.searchParams.get("utm_source") || "";
        body.utm_medium = u.searchParams.get("utm_medium") || "";
        body.utm_campaign = u.searchParams.get("utm_campaign") || "";
      }
      fetch("/api/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }, [pathname]);
  return null;
}
