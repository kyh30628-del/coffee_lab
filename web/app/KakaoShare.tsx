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

export default function KakaoShare({ title, description, imageUrl, link, label = "🟡 카톡 공유", className }: {
  title: string; description: string; imageUrl: string; link: string; label?: string; className?: string;
}) {
  const [msg, setMsg] = useState("");
  const onClick = useCallback(async () => {
    const Kakao = await loadKakao();
    if (Kakao?.Share) {
      try {
        Kakao.Share.sendDefault({
          objectType: "feed",
          content: { title, description, imageUrl, link: { mobileWebUrl: link, webUrl: link } },
          buttons: [{ title: "카페 보러가기", link: { mobileWebUrl: link, webUrl: link } }],
        });
        return;
      } catch {}
    }
    // 폴백
    const nav = navigator as any;
    if (nav.share) { try { await nav.share({ title, text: description, url: link }); return; } catch {} }
    try { await navigator.clipboard.writeText(link); setMsg("링크 복사됨"); setTimeout(() => setMsg(""), 1500); } catch {}
  }, [title, description, imageUrl, link]);
  return <button onClick={onClick} className={className} type="button">{msg || label}</button>;
}
