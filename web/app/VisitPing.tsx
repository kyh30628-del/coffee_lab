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
      const body: Record<string, string | boolean> = { anonId: a, path: pathname || u.pathname, internal: isInternal, newSession: firstThisSession };
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

  // ⏱️ 체류시간 계측 — 이 페이지 진입~이탈 경과(ms)를 이탈 시점(탭 숨김·페이지 이동·언로드)에 비콘 전송.
  //   진입 시 /api/visit이 만든 페이지뷰 행에 duration_ms를 채운다. sendBeacon 우선, 실패 시 fetch keepalive.
  //   내부(대표·팀)·식별자 없음은 제외(page-view 집계와 동일 기준).
  useEffect(() => {
    const path = pathname || window.location.pathname;
    const enter = Date.now();
    let sent = false;
    const send = () => {
      if (sent) return;
      const dur = Date.now() - enter;
      // 스치듯 지나간(0.5초 미만)·비정상(6시간 초과) 체류는 노이즈로 버림
      if (dur < 500 || dur > 6 * 60 * 60 * 1000) return;
      let a: string | null = null;
      try {
        a = localStorage.getItem("dcn_anon");
        if (!a || localStorage.getItem("dcn_internal") === "1") return;
      } catch { return; }
      sent = true;
      const payload = JSON.stringify({ anonId: a, path, durationMs: dur });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/visit/duration", new Blob([payload], { type: "application/json" }));
        } else {
          fetch("/api/visit/duration", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
        }
      } catch {}
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") send(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", send);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", send);
      send(); // SPA 내부 라우트 변경 = 이 페이지 이탈
    };
  }, [pathname]);

  return null;
}
