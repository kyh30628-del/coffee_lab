"use client";
import { useEffect, useState } from "react";
import WishButton from "../../WishButton";

// ❤🔁 재방문 훅(2026-11-02, 마케팅본부 제안 #1 승인) — 이미 있는 찜(WishButton)을
//   "더 하기" 접힘 맨 아래가 아니라, **이미 둘러보던 사람에게만** 본문 위쪽에서 보여준다.
//
// 왜 여기만 조건부인가: marketing-agent 실측(2026-11-02) — 네이버 유입 재방문율 6.3%로
//   유입보다 재방문이 병목. 첫 방문자에게 찜을 들이밀면 마찰·낚시로 보일 수 있어
//   RecentCafes(2026-08-16)와 같은 원칙을 쓴다 — **목록이 비면(=첫 카페) 아무것도 안 그린다.**
//   이미 다른 카페를 1곳 이상 본 사람(비교 중)에게만 "지금 보던 거 찜해두기"를 제안한다.
// 💰 비용 0: localStorage만 읽음(RecentCafes와 동일 키) — 서버 조회·새 API 없음.
const KEY = "dcn_recent_cafes";

export default function RevisitHookBanner({ cafeId }: { cafeId: number }) {
  const [seenCount, setSeenCount] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setSeenCount(Array.isArray(arr) ? arr.length : 0);
    } catch { /* 조용히 무시 — 없어도 서비스는 정상 */ }
  }, []);

  if (seenCount === 0) return null; // 첫 카페 — 마찰 추가 안 함(RecentCafes와 같은 정직성 원칙)

  return (
    <div className="nt-margin-gutter" style={{ paddingTop: 10, paddingBottom: 4 }}>
      <p className="text-[11.5px] text-[#8a7256] mb-1.5">벌써 {seenCount + 1}곳째 둘러보고 계시네요 — 맘에 드는 곳은 바로 담아두세요</p>
      <div className="nt-scrap flat pink"><WishButton cafeId={cafeId} variant="banner" /></div>
    </div>
  );
}
