"use client";
import { useCallback, useState } from "react";

// 카카오톡 공유 버튼 — Kakao JS SDK(공유는 사업자 승인 불필요). 실패 시 웹공유·링크복사로 폴백.
const KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

function loadKakao(): Promise<any> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    const w = window as any;
    const init = () => { try { if (w.Kakao && !w.Kakao.isInitialized() && KEY) w.Kakao.init(KEY); } catch {} resolve(w.Kakao ?? null); };
    if (w.Kakao) return init();
    const s = document.createElement("script");
    s.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
    s.crossOrigin = "anonymous";
    s.onload = init; s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

export default function KakaoShare({ title, description, imageUrl, link, label = "🟡 카톡 공유", className, children, source }: {
  title: string; description: string; imageUrl: string; link: string; label?: string; className?: string; children?: React.ReactNode; source?: string;
}) {
  const [msg, setMsg] = useState("");
  // 공유 클릭 기록(바이럴 신호) — 어떤 채널·어떤 화면(카페상세/MYPIN)에서 타인에게 공유했는지. anon_id로 내부 구분.
  const track = useCallback((channel: string) => {
    try {
      const a = typeof window !== "undefined" ? localStorage.getItem("dcn_anon") || "" : "";
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      fetch("/api/track-share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonId: a, path, channel, source }), keepalive: true }).catch(() => {});
    } catch {}
  }, [source]);
  const onClick = useCallback(async () => {
    const Kakao = await loadKakao();
    if (Kakao?.Share) {
      try {
        Kakao.Share.sendDefault({
          objectType: "feed",
          content: { title, description, imageUrl, link: { mobileWebUrl: link, webUrl: link } },
          buttons: [{ title: "카페 보러가기", link: { mobileWebUrl: link, webUrl: link } }],
        });
        track("kakao");
        return;
      } catch {}
    }
    // 폴백
    const nav = navigator as any;
    if (nav.share) { try { await nav.share({ title, text: description, url: link }); track("web"); return; } catch {} }
    try { await navigator.clipboard.writeText(link); track("clipboard"); setMsg("링크 복사됨"); setTimeout(() => setMsg(""), 1500); } catch {}
  }, [title, description, imageUrl, link, track]);
  return <button onClick={onClick} className={className} type="button">{msg || children || label}</button>;
}
