"use client";
import { useCallback, useEffect, useState } from "react";

// 📲 PWA 설치 유도 — 추천안:
//  · 안드로이드/PC(Chrome·Edge·삼성): beforeinstallprompt를 잡아 버튼 클릭 시 '네이티브 설치창'.
//  · 아이폰(Safari): 설치창 API 자체가 없음 → '공유 → 홈 화면에 추가' 안내 오버레이.
//  · 이미 설치(standalone)면 아무것도 안 뜸. 거절하면 14일간 다시 안 조름.
//  · 첫 화면 즉시 팝업/종료 시 팝업 없음 — 고의도 순간(dcn:install-hint 이벤트)에 배너, 그 외엔 작은 버튼만.
const DISMISS_KEY = "dcn_pwa_dismiss";
const DAY = 864e5;

export default function PwaInstall() {
  const [deferred, setDeferred] = useState<any>(null); // BeforeInstallPromptEvent
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(true); // 판단 전엔 true(안 뜨게)
  const [show, setShow] = useState(false);            // 어피던스 노출 여부
  const [expanded, setExpanded] = useState(false);    // 배너(고의도) vs 작은 버튼
  const [iosGuide, setIosGuide] = useState(false);    // iOS 안내 오버레이

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
    setIsIOS(ios);
    if (dismissedRecently()) return;

    const onBIP = (e: Event) => { e.preventDefault(); setDeferred(e); setShow(true); }; // 안드로이드/PC
    const onInstalled = () => { setShow(false); setExpanded(false); setDeferred(null); try { localStorage.setItem(DISMISS_KEY, String(Date.now() + 3650 * DAY)); } catch {} };
    const onHint = () => { if (!dismissedRecently()) { setShow(true); setExpanded(true); } }; // 고의도 순간 → 배너
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("dcn:install-hint", onHint as EventListener);
    // 아이폰은 beforeinstallprompt가 없어 이벤트로 못 뜸 → 첫 화면 즉시 nag 방지 위해 12초 뒤 작은 버튼만.
    let t: ReturnType<typeof setTimeout> | undefined;
    if (ios) t = setTimeout(() => { if (!dismissedRecently()) setShow(true); }, 12000);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("dcn:install-hint", onHint as EventListener);
      if (t) clearTimeout(t);
    };
  }, [dismissedRecently]);

  const dismiss = () => { setShow(false); setExpanded(false); setIosGuide(false); try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {} };

  const install = async () => {
    if (isIOS) { setIosGuide(true); setExpanded(false); return; } // iOS는 안내만
    if (!deferred) return;
    try {
      deferred.prompt();
      const res = await deferred.userChoice;
      if (res?.outcome === "accepted") { setShow(false); setExpanded(false); }
      setDeferred(null);
    } catch {}
  };

  if (standalone) return null;
  if (!show && !iosGuide) return null;

  if (iosGuide) {
    return (
      <div className="fixed inset-0 z-[6000] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={dismiss}>
        <div className="w-full max-w-lg bg-[#fdfaf4] rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#2b2018] text-[15px]">📲 홈 화면에 추가하기</div>
            <button onClick={dismiss} className="w-8 h-8 rounded-full bg-[#f0e6d4] text-[#7a6452] text-lg">×</button>
          </div>
          <ol className="space-y-2.5 text-[13px] text-[#4a3a2a] leading-relaxed">
            <li>1. 하단(또는 상단)의 <b>공유 버튼 <span style={{ color: "#2f6fb0" }}>⬆︎</span></b>를 누르세요.</li>
            <li>2. 메뉴에서 <b>‘홈 화면에 추가’</b>를 선택하세요.</li>
            <li>3. 오른쪽 위 <b>‘추가’</b>를 누르면 바탕화면에 아이콘이 생겨요.</li>
          </ol>
          <div className="mt-3 text-[11px] text-[#a8927a]">※ 아이폰은 <b>Safari</b>에서만 홈 화면에 추가할 수 있어요.</div>
          <button onClick={dismiss} className="w-full mt-4 bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 font-medium">알겠어요</button>
        </div>
      </div>
    );
  }

  if (expanded) {
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

  // 상시 작은 버튼(고의도 아닐 때) — 우하단, 하단 네비 위
  return (
    <button onClick={install} aria-label="앱 설치"
      className="fixed z-[1000] right-3 inline-flex items-center gap-1 bg-[#2b2018] text-[#f4ece0] rounded-full shadow-lg px-3.5 py-2 text-[12px] font-bold"
      style={{ bottom: "calc(3.75rem + env(safe-area-inset-bottom))" }}>
      <span className="text-[14px] leading-none">📲</span>
      <span>{isIOS ? "홈 화면에 추가" : "앱 설치"}</span>
    </button>
  );
}
