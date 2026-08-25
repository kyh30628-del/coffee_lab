"use client";
import { useEffect, useState } from "react";

// 📣 접속 시 1회 안내 모달 — 강원 확장 고지(2026-08-25 CEO 지시).
//
// ⚠️ '최초 1회'의 기준: localStorage 키에 **공지 ID를 박아 둔다**(dcn_notice_<ID>).
//   그냥 "봤음" 플래그 하나로 두면 다음 공지를 띄울 때 이미 본 사람에게 영영 안 뜬다.
//   공지가 바뀌면 ID만 바꾸면 되고, 지난 공지를 본 기록은 그대로 남는다.
// ⚠️ 문구가 날짜에 따라 바뀐다(2026-08-25 CEO 지시):
//   · ~8/31  : "8월 31일까지 순차적으로 추가됩니다"(예고)
//   · 9/1~   : 같은 문장을 그대로 두면 거짓말이 되므로 **완료형**으로 전환("추가되었습니다")
//   · 9/16~  : 아예 안 띄운다(다 알린 공지를 계속 띄울 이유가 없다)
//   사람이 지우는 걸 잊어도 스스로 정리되게 코드에 날짜를 박아 둔다.
// ⚠️ 배경 스크롤 잠금은 하지 않는다 — 이 모달은 정보 고지일 뿐이고, 잠그면 실제 스크롤러가
//   html이라 body만 잠가서 안 먹는 함정이 있다(다른 프로젝트에서 반복된 버그). 탭 한 번으로 닫힌다.

const NOTICE_ID = "gangwon-2026-08";
const PAST_FROM = Date.UTC(2026, 7, 31, 15, 0, 0); // 2026-09-01 00:00 KST — 이때부터 완료형 문구
const UNTIL = Date.UTC(2026, 8, 15, 15, 0, 0);     // 2026-09-16 00:00 KST — 이 시각 이후엔 미표시

export default function NoticeModal() {
  const [open, setOpen] = useState(false);
  // 렌더 시점이 아니라 '열릴 때'의 시각으로 문구를 고정 — 자정을 넘겨도 열려 있는 모달이 바뀌지 않게.
  const [past, setPast] = useState(false);

  useEffect(() => {
    if (Date.now() >= UNTIL) return;
    try {
      if (localStorage.getItem(`dcn_notice_${NOTICE_ID}`)) return;
    } catch { return; } // 프라이빗 모드 등 localStorage 불가 → 매번 띄우느니 안 띄운다(성가심 방지)
    // 첫 화면이 그려진 뒤에 띄운다 — 즉시 띄우면 로딩 중 화면 위에 떠서 맥락 없이 보인다.
    const t = setTimeout(() => { setPast(Date.now() >= PAST_FROM); setOpen(true); }, 600);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    try { localStorage.setItem(`dcn_notice_${NOTICE_ID}`, String(Date.now())); } catch {}
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="dcn-notice-title"
      onClick={close}
      className="fixed inset-0 z-[1200] flex items-center justify-center px-6"
      style={{ background: "rgba(20,14,8,0.55)" }}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[340px] bg-[#f4ece0] rounded-2xl border border-[#d9c9ab] shadow-xl px-6 py-6 text-center">
        <div className="text-[34px] leading-none mb-3">🏔️</div>
        <h2 id="dcn-notice-title" className="text-[17px] font-bold text-[#2b2018] leading-snug mb-2">
          {past ? "강원 지역이 모두 열렸어요" : "강원 지역이 새로 열렸어요"}
        </h2>
        <p className="text-[13.5px] text-[#524234] leading-relaxed mb-1">
          {past
            ? <><b className="text-[#7a5122]">8월 31일까지</b> 강원 지역 전역이<br />순차적으로 추가되었습니다.</>
            : <><b className="text-[#7a5122]">8월 31일까지</b> 강원 지역 전역이<br />순차적으로 추가됩니다.</>}
        </p>
        <p className="text-[12px] text-[#7a6a55] leading-relaxed mb-5">
          {past
            ? "춘천·원주를 시작으로 강원 전역이 올라왔어요. 후기 검증을 마친 곳만 담았습니다."
            : "춘천·원주부터 공개 중이고, 후기 검증을 마친 곳만 차례로 올라와요."}
        </p>
        <button onClick={close}
          className="w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 text-[14px] font-bold active:scale-[0.98] transition-transform">
          {past ? "강원 카페 보러가기" : "둘러보기"}
        </button>
      </div>
    </div>
  );
}
