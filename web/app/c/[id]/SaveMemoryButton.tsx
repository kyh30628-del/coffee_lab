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

  // 🔎 2026-08-24: 예전엔 '기록했는지'만 봤다. 그런데 위치인증(GPS 30m)을 못 한 기록은
  //   `verified=false`라 **남에게 보이는 화면에서 차단**되는데(is_public·finalized·verified 모두 참이어야 노출),
  //   작성자에게는 그 사실을 알릴 데가 없었다 — 사진 5장을 올리고도 왜 안 보이는지 모른 실사례가 있었다.
  //   저장 직후 안내는 있지만 그 화면을 닫으면 다시 볼 수 없다. 여기서 **상시** 상태를 보여준다.
  const mine = visits.find((v) => v.id === cafeId);
  const recorded = !!mine;
  const unverified = recorded && mine.verified === false;

  return (
    <>
      {variant === "banner" ? (
        <button type="button" onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between gap-2 rounded-xl px-4 py-3 border border-[#f0b8cc] text-left"
          style={{ background: "linear-gradient(90deg,#fdeaf1,#f4ece0)" }}>
          <span className="flex flex-col">
            <span className="text-[12.5px] font-bold flex items-center gap-1" style={{ color: unverified ? "#8a6a3a" : "#b23a5f" }}>
              <span className="text-[14px] leading-none">{unverified ? "📍" : "❤"}</span>
              {unverified ? "미인증 상태로 저장돼 있어요" : recorded ? "이미 추억을 기록했어요" : "이 카페, 다녀가셨나요?"}
              {unverified && <span className="text-[9px] font-bold text-[#665036] bg-[#f3ede1] rounded-full px-1.5 py-0.5">나만 보임</span>}
            </span>
            <span className="text-[10.5px] text-[#6f6047] leading-relaxed">
              {unverified
                ? "이 카페에서 GPS 30m 이내로 '지금 인증하기'를 누르면 지도에 공개돼요"
                : recorded ? "사진·기억을 더하거나 고쳐보세요" : "위치인증하고 나만의 추억으로 저장 — 무가입·30초"}
            </span>
          </span>
          <span className="font-bold whitespace-nowrap" style={{ color: unverified ? "#8a6a3a" : "#d6336c" }}>{recorded ? "수정 →" : "→"}</span>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-full pl-2.5 pr-3 py-1.5 text-[12px] font-bold text-white"
          style={{ background: unverified ? "#8a6a3a" : "#d6336c" }}>
          <span className="text-[14px] leading-none">{unverified ? "📍" : "❤"}</span> {unverified ? "미인증 · 나만 보임" : "추억으로 저장"}
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
