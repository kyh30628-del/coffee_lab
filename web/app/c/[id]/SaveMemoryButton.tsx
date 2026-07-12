"use client";
import { useEffect, useState } from "react";
import MyCafeRegModal from "../../MyCafeRegModal";

// 카페 상세의 '추억으로 저장' 버튼/배너 — 기존 MY PIN 모달(위치인증 임시저장→추억기록 확정)을
// 이 카페가 선택된 채로 그대로 연다. device_id 기반, 무가입. 2단계 저장 플로우·무가입 원칙은 무변, 노출(UI)만 강화.
export default function SaveMemoryButton({ cafeId, cafeName, cafeArea, variant = "pill" }: { cafeId: number; cafeName: string; cafeArea: string; variant?: "pill" | "banner" }) {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState("");
  const [pin, setPin] = useState("");
  const [visits, setVisits] = useState<any[]>([]);

  const reload = (dev: string, p: string) => fetch(`/api/my-cafe?device=${dev}${p ? `&pin=${encodeURIComponent(p)}` : ""}`)
    .then((r) => r.json()).then((d) => { if (d.ok) setVisits(d.cafes ?? []); }).catch(() => {});

  useEffect(() => {
    let dev = "";
    try {
      dev = localStorage.getItem("dcn_device") || "";
      if (!dev) { dev = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()); localStorage.setItem("dcn_device", dev); }
    } catch {}
    let p = ""; try { p = sessionStorage.getItem("dcn_pin") || ""; } catch {}
    setDevice(dev); setPin(p);
    if (dev) reload(dev, p);
  }, []);

  const recorded = visits.some((v) => v.id === cafeId);

  return (
    <>
      {variant === "banner" ? (
        <button type="button" onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between gap-2 rounded-xl px-4 py-3 border border-[#f0b8cc] text-left"
          style={{ background: "linear-gradient(90deg,#fdeaf1,#f4ece0)" }}>
          <span className="flex flex-col">
            <span className="text-[12.5px] font-bold text-[#b23a5f] flex items-center gap-1">
              <span className="text-[14px] leading-none">❤</span> {recorded ? "이미 추억을 기록했어요" : "이 카페, 다녀가셨나요?"}
            </span>
            <span className="text-[10.5px] text-[#9c8a6c]">{recorded ? "사진·기억을 더하거나 고쳐보세요" : "위치인증하고 나만의 추억으로 저장 — 무가입·30초"}</span>
          </span>
          <span className="text-[#d6336c] font-bold whitespace-nowrap">{recorded ? "수정 →" : "→"}</span>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-[#d6336c] text-white rounded-full pl-2.5 pr-3 py-1.5 text-[12px] font-bold">
          <span className="text-[14px] leading-none">❤</span> 추억으로 저장
        </button>
      )}
      {open && (
        <MyCafeRegModal
          cafes={[{ id: cafeId, name: cafeName, area: cafeArea }]}
          device={device}
          visits={visits}
          pin={pin}
          initialCafeId={cafeId}
          onClose={() => setOpen(false)}
          onDone={() => reload(device, pin)}
        />
      )}
    </>
  );
}
