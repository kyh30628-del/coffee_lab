"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";

type R = { memory: string; photos: string[]; favorite: boolean; date?: string };
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }) : "");
const SERIF = "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif";

// 방문자 후기 — 버튼 → 목록(최신순) → 항목 클릭 시 상세 모달. 인앱 CafePanel·공유링크 /c/[id] 공용.
export default function VisitorReviews({ reviews }: { reviews: R[] }) {
  const [openList, setOpenList] = useState(false);
  const [detail, setDetail] = useState<R | null>(null);
  const anyOpen = openList || !!detail;
  // 배경(카페상세) 스크롤 잠금 — 인앱 CafePanel의 aside는 transform 컨테이닝 블록이라
  // 그 안의 fixed 모달이 aside 스크롤량만큼 함께 밀리는 문제가 있었음(같은 클래스 버그를
  // 겪은 "전체 리뷰 모달"과 동일 원인). 모달은 아래에서 body로 portal해 분리하고,
  // 여기서는 배경 스크롤 자체를 잠가 모달이 떠 있는 동안 레이아웃이 안 움직이게 한다.
  useLockBodyScroll(anyOpen);
  if (!reviews?.length) return null;
  return (
    <>
      <button onClick={() => setOpenList(true)} className="w-full flex items-center justify-between gap-2 bg-[#fdeef2] border border-[#f3c9d8] rounded-xl px-4 py-3 text-left hover:bg-[#fbe3ea] transition shadow-sm">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-[15px]">🧡</span>
          <span className="text-[13.5px] font-bold text-[#b03a5b]">방문자 후기</span>
          <span className="text-[11px] text-[#c47a90] shrink-0">위치 인증 방문 {reviews.length}건</span>
        </span>
        <span className="text-[#d6336c] text-[15px] font-bold shrink-0">›</span>
      </button>

      {/* 목록 모달(최신순) — body로 portal해 배경(카페상세)의 transform/overflow 조상과
          완전히 분리된 별도 스택킹 컨텍스트로 띄운다. 배경 스크롤·리사이즈에 영향받지 않음. */}
      {openList && createPortal(
        <div className="fixed inset-0 z-[5500] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)", fontFamily: SERIF }} onClick={() => setOpenList(false)}>
          <div className="w-full max-w-lg bg-[#fdfaf4] rounded-t-2xl max-h-[88dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#f0e6d4]">
              <div className="font-bold text-[#2b2018] text-[15px]">🧡 방문자 후기 <span className="text-[11px] font-normal text-[#9c6b3f]">{reviews.length}건 · 최신순</span></div>
              <button onClick={() => setOpenList(false)} className="w-8 h-8 rounded-full bg-[#f0e6d4] text-[#7a6452] text-lg">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]">
              {reviews.map((r, i) => (
                <button key={i} onClick={() => setDetail(r)} className="w-full text-left bg-white rounded-xl border border-[#ece0cd] p-3 flex gap-3 hover:border-[#d6b9c4] transition">
                  {r.photos[0] ? <img src={r.photos[0]} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" /> : <div className="w-14 h-14 rounded-lg bg-[#f3ede1] flex items-center justify-center text-[18px] shrink-0">{r.favorite ? "★" : "☕"}</div>}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-[#2b2018] leading-snug line-clamp-2">{r.memory || "사진 후기"}</p>
                    <div className="text-[10px] text-[#a8927a] mt-1">{r.favorite ? "★ " : ""}방문자 · {fmt(r.date)}{r.photos.length > 1 ? ` · 📷${r.photos.length}` : ""}</div>
                  </div>
                  <span className="text-[#bcae9b] text-[12px] self-center">›</span>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 상세 모달 — 동일하게 body로 portal */}
      {detail && createPortal(
        <div className="fixed inset-0 z-[6000] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.55)", fontFamily: SERIF }} onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg bg-[#fdfaf4] rounded-t-2xl max-h-[90dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#f0e6d4]">
              <div className="font-bold text-[#2b2018] text-[14px]">{detail.favorite ? "★ " : ""}방문자 후기 <span className="text-[11px] font-normal text-[#a8927a]">(익명)</span></div>
              <button onClick={() => setDetail(null)} className="w-8 h-8 rounded-full bg-[#f0e6d4] text-[#7a6452] text-lg">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
              {detail.photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto -mx-0.5 px-0.5 pb-1">
                  {detail.photos.map((p, j) => <img key={j} src={p} alt="" className="h-52 rounded-lg border border-[#e6dcc8] object-cover shrink-0" />)}
                </div>
              )}
              {detail.memory && <p className="text-[14px] text-[#2b2018] leading-relaxed whitespace-pre-wrap">{detail.memory}</p>}
              <div className="text-[11px] text-[#a8927a]">위치 인증 방문 · {fmt(detail.date)}</div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
