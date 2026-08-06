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
    // 📱 모바일은 **시스템 공유 시트 우선**(CEO 지시 2026-08-06).
    //   카카오 웹 공유(sharer.kakao.com)는 앱키·플랫폼 설정에 걸려 폰에서 "요청 실패(4011 — 잘못된 앱키)"가 떴고,
    //   sendDefault는 예외를 안 던져 우리 기록엔 '성공'으로 남는 바람에 원인 추적이 늦었다.
    //   시스템 공유 시트는 카카오 콘솔 설정과 **무관하게** 동작하고, 시트에서 카카오톡을 고르면 카톡 앱이 바로 열린다.
    //   (공유 카드는 링크 미리보기로 우리 OG 이미지가 그대로 붙는다.)
    //   ⚠️ 반드시 클릭 핸들러 진입 즉시 호출 — 앞에 await를 두면 사용자 제스처가 만료돼 시트가 안 뜬다.
    const nav = navigator as any;
    const isMobile = typeof navigator !== "undefined"
      && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints ?? 0) > 1);
    if (isMobile && nav.share) {
      try {
        // ⚠️ **text를 같이 넘기지 않는다**(2026-08-06 CEO "카톡에 너무 밋밋하게 공유돼").
        //   안드로이드 공유 시트는 text를 카톡 메시지 본문으로 넣고 url을 뒤에 붙여 보내는데,
        //   그러면 카톡이 '긴 텍스트 메시지'로 취급해 링크 미리보기(OG 큰 카드)가 안 붙거나 초라해진다.
        //   **URL만 단독**으로 보내면 카톡이 그 링크를 스크랩해 1200x630 카드(카페명·한줄·태그)를 크게 띄운다.
        await nav.share({ title, url: link });
        trackShare({ channel: "web", source, cafeId });
        return;
      } catch (e: any) {
        // 사용자가 시트를 닫은 것(AbortError)은 실패가 아니다 — 카카오로 되돌아가면 오히려 이상하다.
        if (e?.name === "AbortError") return;
      }
    }
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
      // 원인을 정확히 남긴다 — 2026-08-02·04 실사용자 폴백 2건의 note가 "Kakao.Share 없음"뿐이라
      //   ①키 미주입 ②init 실패 ③SDK 미로드를 구분하지 못해 원인 추적에 시간이 걸렸다.
      //   (실제 원인은 ① — 카카오 SDK v2는 init 성공 후에야 Share 모듈이 붙는데, 그 배포엔
      //    NEXT_PUBLIC_KAKAO_MAP_KEY가 빌드에 안 박혀 있어 init 자체를 건너뛰었다.)
      let inited = false;
      try { inited = !!(Kakao as any)?.isInitialized?.(); } catch {}
      fail = Kakao
        ? `Kakao.Share 없음(key=${KEY ? "있음" : "없음"}, init=${inited})`
        : `SDK 미로드(key=${KEY ? "있음" : "없음"})`;
    }
    // 폴백 — 카톡이 안 떠서 web/clipboard로 대체됨(kakaoFailed=true + 원인 기록).
    if (nav.share) { try { await nav.share({ title, text: description, url: link }); trackShare({ channel: "web", source, cafeId, kakaoFailed: true, note: fail }); return; } catch {} }
    try { await navigator.clipboard.writeText(link); trackShare({ channel: "clipboard", source, cafeId, kakaoFailed: true, note: fail }); setMsg("링크 복사됨"); setTimeout(() => setMsg(""), 1500); } catch {}
  }, [title, description, imageUrl, link, source, cafeId]);
  return <button onClick={onClick} className={className} type="button">{msg || children || label}</button>;
}
