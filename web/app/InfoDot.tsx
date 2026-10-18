"use client";
import { useState, ReactNode } from "react";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";

// 영역별 기능 설명 — 작은 '!' 아이콘, 누르면 모달.
export default function InfoDot({ title, children, dark }: { title: string; children: ReactNode; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  useLockBodyScroll(open);
  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        className={`inline-flex items-center justify-center w-[15px] h-[15px] shrink-0 rounded-full text-[10px] font-bold leading-none align-middle ${dark ? "bg-note-paper/25 text-note-paper" : "bg-[#cbb89f] text-white"}`}
        aria-label={`${title} 설명`}>!</button>
      {open && (
        <div className="fixed inset-0 z-[5600]" style={{ fontFamily: "'DCN Hand', 'Nanum Pen Script', 'Apple SD Gothic Neo', sans-serif" }} onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:w-[340px] sm:h-fit bg-[#fdfaf4] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl" style={{ maxHeight: "82dvh" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-bold text-[15px] text-note-ink">💡 {title}</h3>
              <button onClick={() => setOpen(false)} className="text-2xl text-note-brown leading-none -mt-1 px-1">×</button>
            </div>
            <div className="text-[12.5px] text-note-ink-warm leading-relaxed">{children}</div>
            <button onClick={() => setOpen(false)} className="w-full mt-4 bg-note-ink text-note-paper rounded-lg py-2.5 text-sm">알겠어요</button>
          </div>
        </div>
      )}
    </>
  );
}
