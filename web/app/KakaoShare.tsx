"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackShare } from "./trackShareClient";

// 카카오톡 공유 버튼 — Kakao JS SDK(공유는 사업자 승인 불필요). 실패 시 웹공유·링크복사로 폴백.
const KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

// 🔴 2026-08-06 근본수정 — "카톡 공유가 안 된다"의 진짜 원인은 **팝업 차단**이었다.
//   `Kakao.Share.sendDefault()`는 내부적으로 `window.open('https://sharer.kakao.com/picker/link')`을 부른다.
//   브라우저는 window.open을 **사용자 제스처(클릭) 안에서 호출될 때만** 허용하는데, 예전 코드는 클릭 직후
//   `await loadKakao()`로 **네트워크에서 SDK 스크립트를 받아오길 기다린 뒤**에 sendDefault를 불렀다.
//   그 사이 제스처 자격이 만료돼 안드로이드 크롬이 팝업을 조용히 차단 → 화면엔 아무 일도 안 일어나는데
//   sendDefault는 예외를 안 던져서 **기록에는 '카톡 공유 성공'으로 남았다**(2026-08-06 CEO 시도 2건이 정확히 이 모습).
//   수정 3종:
//     ① SDK를 클릭 전에 미리 로드(마운트 후 유휴시간) → 클릭 시점엔 이미 준비 완료
//     ② 준비돼 있으면 클릭 핸들러에서 **await 없이 동기 호출** → 제스처 유지 → 팝업 허용
//     ③ 호출 동안 window.open을 감싸 **차단 여부를 실제로 확인** → 차단이면 조용한 실패 대신 웹공유·링크복사로 폴백
function initKakao(): any {
  if (typeof window === "undefined") return null;
  const w = window as any;
  try { if (w.Kakao && !w.Kakao.isInitialized() && KEY) w.Kakao.init(KEY); } catch {}
  // ⚠️ 카카오 SDK v2는 init이 성공한 뒤에야 Share·API 모듈이 붙는다(그전엔 init/isInitialized만 존재).
  return w.Kakao ?? null;
}

let sdkLoading: Promise<any> | null = null;
function loadKakao(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const w = window as any;
  if (w.Kakao) return Promise.resolve(initKakao());
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
    s.crossOrigin = "anonymous";
    s.onload = () => resolve(initKakao());
    s.onerror = () => { sdkLoading = null; resolve(null); };
    document.head.appendChild(s);
  });
  return sdkLoading;
}

// sendDefault를 부르는 동안 window.open을 감싸 '팝업이 실제로 열렸는지'를 확인한다.
//   window.open이 null을 돌려주면 브라우저가 막은 것 — 예전엔 이걸 성공으로 집계했다.
function sendWithPopupCheck(Kakao: any, payload: any): { ok: boolean; reason: string } {
  const w = window as any;
  const realOpen = w.open;
  let opened: any = undefined;
  w.open = function (...args: any[]) { const win = realOpen.apply(w, args); if (opened === undefined) opened = win; return win; };
  try {
    Kakao.Share.sendDefault(payload);
  } catch (e: any) {
    w.open = realOpen;
    return { ok: false, reason: "sendDefault: " + (e?.message || e) };
  }
  w.open = realOpen;
  // opened === undefined → 카카오가 창을 안 열었음(모바일 앱 스킴 등 정상 경로일 수 있어 성공 처리)
  if (opened === null) return { ok: false, reason: "팝업차단(window.open null)" };
  return { ok: true, reason: "" };
}

export default function KakaoShare({ title, description, imageUrl, link, label = "🟡 카톡 공유", className, children, source }: {
  title: string; description: string; imageUrl: string; link: string; label?: string; className?: string; children?: React.ReactNode; source?: string;
}) {
  const [msg, setMsg] = useState("");
  const ready = useRef(false);
  // 공유 대상 카페 id(link의 /c/ID) — 홈 슬라이드 패널 등 pathname이 "/"여도 정확히 귀속.
  const cafeId = (() => { const m = String(link).match(/\/c\/(\d+)/); return m ? Number(m[1]) : undefined; })();

  // ① 미리 로드 — 첫 페인트를 방해하지 않게 유휴시간에(/api/cafes와 같은 패턴). 브라우저 캐시라 페이지 이동해도 재사용.
  useEffect(() => {
    const warm = () => { loadKakao().then((k) => { ready.current = !!k?.Share; }); };
    const ric = (window as any).requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => number) | undefined;
    if (ric) { const id = ric(warm, { timeout: 3000 }); return () => (window as any).cancelIdleCallback?.(id); }
    const t = setTimeout(warm, 800);
    return () => clearTimeout(t);
  }, []);

  const fallback = useCallback(async (fail: string) => {
    const nav = navigator as any;
    // 모바일은 여기서 시스템 공유 시트가 뜨고 그 안에 카카오톡이 있다 — 팝업이 막혀도 사용자는 카톡으로 보낼 수 있다.
    if (nav.share) { try { await nav.share({ title, text: description, url: link }); trackShare({ channel: "web", source, cafeId, kakaoFailed: true, note: fail }); return; } catch {} }
    // ⚠️ 클립보드까지 실패해도 **기록은 반드시 남긴다** — 예전엔 여기서 예외가 나면 아무 기록 없이 사라져
    //   "버튼을 눌렀는데 아무 일도 안 일어남"이 데이터에서 통째로 보이지 않았다(조용한 실패).
    let copied = false;
    try { await navigator.clipboard.writeText(link); copied = true; } catch {}
    trackShare({ channel: copied ? "clipboard" : "failed", source, cafeId, kakaoFailed: true, note: fail });
    setMsg(copied ? "링크 복사됨" : "공유 실패");
    setTimeout(() => setMsg(""), 1500);
  }, [title, description, link, source, cafeId]);

  const onClick = useCallback((): void => {
    const payload = {
      objectType: "feed",
      content: { title, description, imageUrl, link: { mobileWebUrl: link, webUrl: link } },
      buttons: [{ title: "카페 보러가기", link: { mobileWebUrl: link, webUrl: link } }],
    };
    const w = window as any;
    const Kakao = w.Kakao?.Share ? w.Kakao : initKakao();
    // ② 준비돼 있으면 **동기 호출**(await 금지) — 제스처를 유지해야 팝업이 허용된다.
    if (Kakao?.Share) {
      const r = sendWithPopupCheck(Kakao, payload);
      if (r.ok) { trackShare({ channel: "kakao", source, cafeId }); return; }
      void fallback(r.reason);
      return;
    }
    // 아직 SDK가 준비 전이면 기다리지 않는다 — 기다리면 제스처가 만료돼 어차피 팝업이 막힌다.
    //   대신 즉시 시스템 공유 시트(안드로이드·iOS엔 카카오톡이 그 안에 있다)로 넘긴다.
    let inited = false;
    try { inited = !!w.Kakao?.isInitialized?.(); } catch {}
    void fallback(`SDK 준비전(key=${KEY ? "있음" : "없음"}, kakao=${w.Kakao ? "있음" : "없음"}, init=${inited})`);
    void loadKakao(); // 다음 클릭을 위해 계속 준비
  }, [title, description, imageUrl, link, source, cafeId, fallback]);

  return <button onClick={onClick} className={className} type="button">{msg || children || label}</button>;
}
