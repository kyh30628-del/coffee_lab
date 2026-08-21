"use client";
import { useEffect, useState } from "react";

// ❤ 찜(가보고 싶은 곳) — 카페 상세용 무마찰 저장.
//
// 왜 만들었나(2026-08-21, 실측 기반):
//   기존 저장은 '내 카페 추억' 하나뿐이었고 **GPS 30m 위치인증 + 2단계 확정**을 요구했다.
//   그런데 우리 접속 피크는 10~15시 = "어디 갈까 고르는 시간"이지 카페에 앉아 있는 시간이 아니다.
//   실측: 카페상세 도달 64%(1,870명/30일)인데 저장은 누적 6건, **발급된 PIN 0개**
//         = 아무도 그 플로우를 끝까지 통과한 적이 없다.
//   반면 같은 화면에서 네이버·길찾기 클릭은 15.7%(159명 중 25명) — 행동 의지는 충분하다.
//   → 문제는 무관심이 아니라 **불가능한 요구**였다. 고르는 사람에게 맞는 저장(찜)을 준다.
//
// 설계
//   - 기존 /api/bookmark 그대로 재사용 — 새 API·새 테이블 0. 위치·PIN·가입 전부 불필요(탭 1번).
//   - device_id는 지도앱과 동일한 localStorage 'dcn_device' — 지도앱 즐겨찾기와 자동으로 같은 목록이 된다.
//   - 낙관적 UI: 탭 즉시 반영하고 실패 시 되돌린다(네트워크 대기 체감 0).
//   - 💰 최초 1회만 조회(GET). 폴링·주기 갱신 없음 — DB를 깨울 일이 없다.
export default function WishButton({ cafeId, variant = "pill" }: { cafeId: number; variant?: "pill" | "banner" }) {
  const [on, setOn] = useState(false);
  const [device, setDevice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dev = "";
    try {
      dev = localStorage.getItem("dcn_device") || "";
      if (!dev) { dev = crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now(); localStorage.setItem("dcn_device", dev); }
    } catch {}
    setDevice(dev);
    if (!dev) return;
    // 이 카페가 이미 찜인지만 확인(카페당 1회). 목록 전체를 받아 매번 훑지 않는다.
    fetch(`/api/bookmark?device=${dev}`).then((r) => r.json())
      .then((d) => { if (d?.ok) setOn((d.ids ?? []).includes(cafeId)); }).catch(() => {});
  }, [cafeId]);

  const toggle = async () => {
    if (!device || busy) return;
    const next = !on;
    setOn(next); setBusy(true);              // 낙관적 반영
    try {
      const r = await fetch("/api/bookmark", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device, cafeId, action: next ? "add" : "remove" }),
      }).then((x) => x.json());
      if (!r?.ok) setOn(!next);              // 실패 시 되돌림
      // 📊 계측: 찜을 '했을 때만' 기록한다. 기존 outbound_clicks 테이블 재사용 —
      //   새 테이블·새 API 0이고, 같은 화면의 외부클릭(15.7%)과 **같은 잣대로 비교**하려면 같은 곳에 담아야 한다.
      //   이게 없으면 3일 뒤에도 "마찰이 원인이었나"를 답할 수 없다.
      else if (next) {
        try {
          const anonId = localStorage.getItem("dcn_anon") || "";
          if (localStorage.getItem("dcn_internal") !== "1") {
            fetch("/api/track-outbound", {
              method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
              body: JSON.stringify({ anonId, cafeId, target: "wish", source: "카페상세", path: window.location.pathname }),
            }).catch(() => {});
          }
        } catch {}
      }
    } catch { setOn(!next); }
    finally { setBusy(false); }
  };

  if (variant === "banner") {
    return (
      <>
      <button type="button" onClick={toggle} aria-pressed={on}
        className={`w-full flex items-center justify-between gap-2 rounded-xl px-4 py-3 border text-left transition ${on ? "border-[#d6336c] bg-[#fdeaf1]" : "border-[#d8c8ad] bg-white"}`}>
        <span className="flex flex-col">
          <span className={`text-[13px] font-bold flex items-center gap-1.5 ${on ? "text-[#b23a5f]" : "text-[#3d2f22]"}`}>
            <span className="text-[15px] leading-none">{on ? "❤" : "🤍"}</span>
            {on ? "찜한 곳에 담았어요" : "가보고 싶은 곳에 담아두기"}
          </span>
          <span className="text-[10.5px] text-[#6f6047] mt-0.5">
            {on ? "지도에서 찜한 곳만 모아볼 수 있어요" : "탭 한 번 · 가입도 위치확인도 없어요"}
          </span>
        </span>
        <span className={`font-bold whitespace-nowrap text-[13px] ${on ? "text-[#d6336c]" : "text-[#7a5122]"}`}>{on ? "✓" : "＋"}</span>
      </button>
      {/* 저장은 **다시 꺼내볼 수 있어야** 저장이다 — 찜한 직후에만 회수 동선을 연다(평소엔 화면을 어지럽히지 않게). */}
      {on && (
        <a href="/?favs=1" className="mt-1.5 block text-center text-[11.5px] font-semibold text-[#b23a5f] underline underline-offset-2">
          찜한 곳 모아보기 →
        </a>
      )}
      </>
    );
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={on} aria-label={on ? "찜 해제" : "찜하기"}
      className={`flex items-center gap-1.5 rounded-full pl-2.5 pr-3 py-1.5 text-[12px] font-bold border transition ${on ? "bg-[#d6336c] text-white border-[#d6336c]" : "bg-white text-[#b23a5f] border-[#f0b8cc]"}`}>
      <span className="text-[14px] leading-none">{on ? "❤" : "🤍"}</span>{on ? "찜함" : "찜하기"}
    </button>
  );
}
