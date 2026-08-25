"use client";
import { useEffect, useState } from "react";
import { isPast, type Notice } from "@/lib/notices";

// 📣 서비스 공지 모달 — 내용·날짜는 **관리자 화면(/admin)에서 DB로 관리**한다(무배포).
//   💰 공지 데이터는 **부모가 넘겨준다**(/api/discover 응답에 얹혀 온다). 전용 fetch를 두면
//   접속마다 요청이 하나 늘어난다 — 비용을 늘리지 않는 게 절대 규칙이다.
//
// ⚠️ 표시 규칙(2026-08-25 CEO 지시, 2차 개정):
//   · **브라우저 세션당 1회**만 뜬다(sessionStorage). 매 새로고침마다 뜨면 성가시다.
//   · 새 세션(탭을 새로 열거나 브라우저를 다시 켜면)에는 다시 뜬다 — 못 보고 지나친 사람을 위해.
//   · **'다시 보지 않기'를 누르면 영영 안 뜬다**(localStorage). 그냥 닫으면 다음 세션에 또 뜬다.
//   · 기간이 끝나면(until) 아무것도 안 뜬다.
//
// ⚠️ localStorage 키에 **공지 ID를 박는다**(dcn_notice_<id>). 공용 플래그 하나면 다음 공지를 띄울 때
//   예전에 끈 사람에게 영영 안 뜬다. id는 절대 재사용하지 않는다(lib/notices.ts 주석 참조).
// ⚠️ 배경 스크롤 잠금은 하지 않는다 — 정보 고지일 뿐이고, 실제 스크롤러가 html이라 body만 잠그면
//   안 먹는 함정이 있다. 탭 한 번으로 닫힌다.

export default function NoticeModal({ source }: { source?: Notice | null }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [past, setPast] = useState(false);

  useEffect(() => {
    let alive = true;
    (() => {
      const n = source ?? null;
      if (!n) return;
      try {
        if (localStorage.getItem(`dcn_notice_${n.id}`)) return;        // 영구 해제한 사람
        if (sessionStorage.getItem(`dcn_notice_seen_${n.id}`)) return; // 이번 세션에 이미 봄
      } catch { return; } // 프라이빗 모드 등 저장 불가 → 끌 방법이 없으니 아예 안 띄운다
      // 첫 화면이 그려진 뒤에 띄운다 — 즉시 띄우면 로딩 중 화면 위에 맥락 없이 떠 보인다.
      setTimeout(() => {
        if (!alive) return;
        try { sessionStorage.setItem(`dcn_notice_seen_${n.id}`, "1"); } catch {}
        setPast(isPast(n)); setNotice(n);
      }, 600);
    })();
    return () => { alive = false; };
  }, [source]);

  if (!notice) return null;
  const close = () => setNotice(null);                                  // 이번만 닫기 — 다음 '세션'에 또 뜬다
  const never = () => {                                                 // 영구 해제
    try { localStorage.setItem(`dcn_notice_${notice.id}`, String(Date.now())); } catch {}
    // 관리자 화면에서 공지 효과를 보기 위한 기록(해제만 — '노출'까지 남기면 접속마다 DB를 깨운다).
    try {
      const anonId = localStorage.getItem("dcn_anon") || "";
      fetch("/api/notice", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ id: notice.id, anonId }) }).catch(() => {});
    } catch {}
    setNotice(null);
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="dcn-notice-title" onClick={close}
      className="fixed inset-0 z-[1200] flex items-center justify-center px-6"
      style={{ background: "rgba(20,14,8,0.55)" }}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[340px] bg-[#f4ece0] rounded-2xl border border-[#d9c9ab] shadow-xl px-6 pt-6 pb-4 text-center">
        <div className="text-[34px] leading-none mb-3">{notice.emoji}</div>
        <h2 id="dcn-notice-title" className="text-[17px] font-bold text-[#2b2018] leading-snug mb-2">
          {past ? notice.titlePast : notice.title}
        </h2>
        <p className="text-[13.5px] text-[#524234] leading-relaxed mb-1">
          {notice.highlight && <b className="text-[#7a5122]">{notice.highlight}</b>}{notice.highlight ? " " : ""}
          {past ? notice.bodyPast : notice.body}
        </p>
        <p className="text-[12px] text-[#7a6a55] leading-relaxed mb-5">{past ? notice.subPast : notice.sub}</p>
        <button onClick={close}
          className="w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 text-[14px] font-bold active:scale-[0.98] transition-transform">
          {past ? notice.ctaPast : notice.cta}
        </button>
        {/* 영구 해제 — 주 동작(둘러보기)보다 약하게 두되, 찾기 어렵지 않게 바로 아래에. */}
        <button onClick={never}
          className="mt-2.5 w-full text-[12px] text-[#8a7a64] underline underline-offset-2 py-1.5 active:opacity-70">
          다시 보지 않기
        </button>
      </div>
    </div>
  );
}
