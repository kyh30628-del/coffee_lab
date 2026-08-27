"use client";
import { useState } from "react";

// 📧 무료 리포트 → 이메일 리드(2026-08-27). 결제 전 단계의 연락처 자산 + 재방문 고리.
//   약속은 실제 구현된 것만: **월 1회** 요약(순위·검증 후기 수) — ownerWatch.runOwnerLeadDigest가 매월 1일 발송.
//   유료(매일 감시·즉시 알림·약점 처방)와 급이 다름을 문구로 분명히 한다.
export default function LeadForm({ cafeId }: { cafeId: number }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");
  const [msg, setMsg] = useState("");

  const submit = async () => {
    const e = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { setState("err"); setMsg("이메일 형식을 확인해 주세요"); return; }
    setState("busy");
    try {
      const anonId = localStorage.getItem("dcn_anon") || "";
      const r = await fetch("/api/owner-lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cafeId, email: e, anonId }),
      });
      const d = await r.json();
      if (d.ok) {
        setState("done");
        // 계측 — 리드 제출은 퍼널의 새 단계(관제 '사장님 퍼널'에서 집계).
        fetch("/api/owner-funnel", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
          body: JSON.stringify({ anonId, event: "lead_submit", source: "free_report", cafeId, path: `/owner/r/${cafeId}` }) }).catch(() => {});
      } else { setState("err"); setMsg(d.error || "잠시 후 다시 시도해 주세요"); }
    } catch { setState("err"); setMsg("잠시 후 다시 시도해 주세요"); }
  };

  if (state === "done") {
    return (
      <div className="bg-[#eef4ee] border border-[#cfe0cf] rounded-2xl px-5 py-4 mb-4 text-center">
        <div className="text-[13.5px] font-bold text-[#3f5a37]">등록됐어요 ✅</div>
        <p className="text-[12px] text-[#5a6e55] mt-1">매월 1일, 우리 가게 요약을 보내드릴게요.</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-[#e6dcc8] px-5 py-4 mb-4">
      <div className="text-[13.5px] font-bold text-[#2b2018] mb-0.5">📮 월 1회, 우리 가게 요약 받기 (무료)</div>
      <p className="text-[11.5px] text-[#7a6a55] mb-3">매월 1일에 동네 순위·검증 후기 수 변화를 한 통으로 보내드려요.</p>
      <div className="flex gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && state !== "busy" && submit()}
          placeholder="이메일 주소" autoComplete="email"
          className="flex-1 min-w-0 border border-[#cbb89f] rounded-xl px-3.5 py-2.5 text-[13.5px] bg-white" />
        <button onClick={submit} disabled={state === "busy"}
          className="bg-[#2b2018] text-[#f4ece0] rounded-xl px-4 py-2.5 text-[13px] font-bold shrink-0 disabled:opacity-50">
          {state === "busy" ? "…" : "받기"}
        </button>
      </div>
      {state === "err" && <p className="text-[11.5px] text-rose-600 mt-1.5">{msg}</p>}
      <p className="text-[10.5px] text-[#8a7458] mt-2">월 1회 요약 외에는 보내지 않아요 · 메일 하단에서 한 번에 해지할 수 있어요</p>
    </div>
  );
}
