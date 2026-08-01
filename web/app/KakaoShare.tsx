"use client";
import { useCallback, useState } from "react";
import { trackShare } from "./trackShareClient";

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
  // 공유 대상 카페 id(link의 /c/ID) — 홈 슬라이드 패널 등 pathname이 "/"여도 정확히 귀속.
  const cafeId = (() => { const m = String(link).match(/\/c\/(\d+)/); return m ? Number(m[1]) : undefined; })();
  const onClick = useCallback(async () => {
    // 카톡 공유 시도 → 실패(SDK 미로드/미초기화/도메인 미등록 등) 시 원인(fail)을 담아 폴백. 폴백은 kakaoFailed=true로 구분.
    let fail = "";
    const Kakao = await loadKakao();
    if (Kakao?.Share) {
      try {
        Kakao.Share.sendDefault({
          objectType: "feed",
          content: { title, description, imageUrl, link: { mobileWebUrl: link, webUrl: link } },
          buttons: [{ title: "카페 보러가기", link: { mobileWebUrl: link, webUrl: link } }],
        });
        trackShare({ channel: "kakao", source, cafeId });
        return;
      } catch (e: any) { fail = "sendDefault: " + (e?.message || e); }
    } else {
      fail = Kakao ? "Kakao.Share 없음" : "SDK 미로드(키 없음?)";
    }
    // 폴백 — 카톡이 안 떠서 web/clipboard로 대체됨(kakaoFailed=true + 원인 기록).
    const nav = navigator as any;
    if (nav.share) { try { await nav.share({ title, text: description, url: link }); trackShare({ channel: "web", source, cafeId, kakaoFailed: true, note: fail }); return; } catch {} }
    try { await navigator.clipboard.writeText(link); trackShare({ channel: "clipboard", source, cafeId, kakaoFailed: true, note: fail }); setMsg("링크 복사됨"); setTimeout(() => setMsg(""), 1500); } catch {}
  }, [title, description, imageUrl, link, source, cafeId]);
  return <button onClick={onClick} className={className} type="button">{msg || children || label}</button>;
}
