"use client";
import { useEffect, useState } from "react";
import MyCafeRegModal from "../../MyCafeRegModal";

// 카페 상세의 '추억으로 저장' 버튼 — 기존 MY PIN 모달(위치인증 임시저장→추억기록 확정)을
// 이 카페가 선택된 채로 그대로 연다. device_id 기반, 무가입.
export default function SaveMemoryButton({ cafeId, cafeName, cafeArea }: { cafeId: number; cafeName: string; cafeArea: string }) {
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

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-[#d6336c] text-white rounded-full pl-2.5 pr-3 py-1.5 text-[12px] font-bold">
        <span className="text-[14px] leading-none">❤</span> 추억으로 저장
      </button>
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
