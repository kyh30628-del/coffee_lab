"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// 📲 PWA 설치 유도 — 배너만(상시 pill 없음):
//  · 안드로이드/PC(Chrome·Edge·삼성): beforeinstallprompt를 조용히 잡아두고, 고의도 순간
//    (dcn:install-hint = 즐겨찾기·내 주변 찾기)에만 하단 배너 → 클릭 시 '네이티브 설치창'.
//  · 아이폰(Safari): 설치창 API 자체가 없음 → 배너 '방법 보기' → 공유→홈 화면에 추가 안내.
//  · 이미 설치(standalone)/관리자·사장님 화면/거절 14일 이내면 안 뜸. 첫 화면·종료 시 팝업 없음.
const DISMISS_KEY = "dcn_pwa_dismiss";
const DAY = 864e5;

export default function PwaInstall() {
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(true); // 판단 전엔 true(안 뜨게)
  const [expanded, setExpanded] = useState(false);    // 배너 노출
  const [iosGuide, setIosGuide] = useState(false);    // iOS 안내 오버레이
  const deferredRef = useRef<any>(null);              // BeforeInstallPromptEvent(조용히 보관)
  const iosRef = useRef(false);
  const pathname = usePathname();

  const dismissedRecently = useCallback(() => {
    try { return Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now() - 14 * DAY; } catch { return false; }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || (navigator as any).standalone === true;
    setStandalone(!!isStandalone);
    if (isStandalone) return; // 이미 앱으로 설치됨
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); // 설치 가능 조건
    const ua = navigator.userAgent || "";
    const ios = /iphone|ipad|ipod/i.test(ua); // iOS는 설치창 없음 → 안내만
    iosRef.current = ios; setIsIOS(ios);

    const onBIP = (e: Event) => { e.preventDefault(); deferredRef.current = e; }; // 조용히 보관(배너는 고의도 순간에만)
    const onInstalled = () => { setExpanded(false); deferredRef.current = null; try { localStorage.setItem(DISMISS_KEY, String(Date.now() + 3650 * DAY)); } catch {} };
    const onHint = () => { if (!dismissedRecently() && (deferredRef.current || iosRef.current)) setExpanded(true); }; // 실제 설치 가능할 때만 배너
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("dcn:install-hint", onHint as EventListener);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("dcn:install-hint", onHint as EventListener);
    };
  }, [dismissedRecently]);

  const dismiss = () => { setExpanded(false); setIosGuide(false); try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {} };

  const install = async () => {
    if (iosRef.current) { setIosGuide(true); setExpanded(false); return; } // iOS는 안내만
    const d = deferredRef.current;
    if (!d) return;
    try {
      d.prompt();
      const res = await d.userChoice;
      if (res?.outcome === "accepted") setExpanded(false);
      deferredRef.current = null;
    } catch {}
  };

  if (standalone) return null;
  // 관리자·사장님 화면(관제탑 등)에선 소비자용 설치 유도 안 함
  if (pathname && /^\/(admin|owner|business)/.test(pathname)) return null;
  if (!expanded && !iosGuide) return null;

  if (iosGuide) {
    return (
      <div className="fixed inset-0 z-[6000] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={dismiss}>
        <div className="w-full max-w-lg bg-[#fdfaf4] rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#2b2018] text-[15px]">📲 홈 화면에 추가하기</div>
            <button onClick={dismiss} className="w-8 h-8 rounded-full bg-[#f0e6d4] text-[#594839] text-lg">×</button>
          </div>
          <ol className="space-y-2.5 text-[13px] text-[#4a3a2a] leading-relaxed">
            <li>1. 하단(또는 상단)의 <b>공유 버튼 <span style={{ color: "#2f6fb0" }}>⬆︎</span></b>를 누르세요.</li>
            <li>2. 메뉴에서 <b>‘홈 화면에 추가’</b>를 선택하세요.</li>
            <li>3. 오른쪽 위 <b>‘추가’</b>를 누르면 바탕화면에 아이콘이 생겨요.</li>
          </ol>
          <div className="mt-3 text-[11px] text-[#665036]">※ 아이폰은 <b>Safari</b>에서만 홈 화면에 추가할 수 있어요.</div>
          <button onClick={dismiss} className="w-full mt-4 bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 font-medium">알겠어요</button>
        </div>
      </div>
    );
  }

  // 배너(고의도 순간) — 하단 네비 위, 닫기(✕) 14일 존중
  return (
    <div className="fixed z-[1300] left-0 right-0 px-3" style={{ bottom: "calc(3.25rem + env(safe-area-inset-bottom))" }}>
      <div className="max-w-lg mx-auto bg-[#2b2018] text-[#f4ece0] rounded-2xl shadow-xl p-3.5 flex items-center gap-3">
        <div className="text-2xl leading-none">☕</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[13px]">홈 화면에 ‘커피 노트’ 추가</div>
          <div className="text-[11px] text-[#d9c9b3] leading-snug">한 번 누르면 앱처럼 바로 열려요{isIOS ? " · 아이폰은 공유→홈 화면에 추가" : ""}</div>
        </div>
        <button onClick={install} className="bg-[#e0a32e] text-[#2b2018] font-bold text-[12px] rounded-full px-3.5 py-2 whitespace-nowrap shrink-0">{isIOS ? "방법 보기" : "설치"}</button>
        <button onClick={dismiss} aria-label="닫기" className="text-[#b7a58e] px-1 shrink-0 text-sm">✕</button>
      </div>
    </div>
  );
}
