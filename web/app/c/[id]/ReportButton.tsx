"use client";
import { useState } from "react";

// 📣 한 탭 신고(2026-09-13) — 소비자를 검증자로. 두 가지만 묻고, 접수 즉시 조용히 닫힌다.
//   기기키는 다른 익명 기능(dcn_device)과 같은 키를 재사용해 새 식별자 생성 0.
function anonKey(): string {
  try {
    let k = localStorage.getItem("dcn_device");
    if (!k) { k = `d_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`; localStorage.setItem("dcn_device", k); }
    return k;
  } catch { return `s_${Math.random().toString(36).slice(2, 14)}`; }
}

export default function ReportButton({ cafeId }: { cafeId: number }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string>("");
  const send = async (kind: "closed" | "wrong") => {
    try {
      const r = await fetch("/api/cafe-report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cafeId, kind, anon: anonKey() }) });
      const d = await r.json().catch(() => ({}));
      setDone(d?.ok ? "고마워요. 다시 확인해 볼게요." : "지금은 접수가 안 돼요.");
    } catch { setDone("지금은 접수가 안 돼요."); }
    setOpen(false);
  };
  if (done) return <span className="text-[12px] text-[#33684b]">✓ {done}</span>;
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-[12px] text-[#7a6750] underline underline-offset-2">뭔가 달라요? 알려주세요</button>
      ) : (
        <>
          <button type="button" onClick={() => send("closed")} className="nt-chip">🚪 문 닫았어요</button>
          <button type="button" onClick={() => send("wrong")} className="nt-chip">↔ 다른 가게 얘기예요</button>
          <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-[#7a6750]">취소</button>
        </>
      )}
    </span>
  );
}
