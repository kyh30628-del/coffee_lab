"use client";
import { useEffect } from "react";

// 전 페이지 익명 방문핑 + 유입경로(referrer)·UTM 첫터치(first-touch) 캡처.
// PRINCIPLES §2: 개인정보 미수집(anon_id만). 출처는 '어디서 왔나' 집계용 — 깜깜이 탈출.
// 출처는 세션 첫 핑에서만 보냄(SPA 내부이동 시 referrer가 자기 사이트로 오염되는 것 방지).
export default function VisitPing() {
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
      const body: Record<string, string> = { anonId: a, path: u.pathname };
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
  }, []);
  return null;
}
