"use client";
import { useEffect, useState } from "react";

// 💳 사장님 결제 관리 위젯 — 카드 등록/해지/상태. owner 화면(PIN 로그인)에서 mount.
//   카드 입력은 토스 SDK 리다이렉트 흐름(requestBillingAuth) — 우리 화면엔 카드번호가 오지 않는다.
type Sub = {
  status?: string; duration_days?: number | null; expires_at?: string | null;
  autopay?: boolean; billing_status?: string | null; card_last4?: string | null;
  card_company?: string | null; next_billing_at?: string | null;
};

const fmt = (d?: string | null) => {
  if (!d) return "";
  try { const t = new Date(d); return `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")}`; } catch { return ""; }
};
const daysLeft = (d?: string | null) => {
  if (!d) return null;
  try { return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000); } catch { return null; }
};

function loadToss(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.TossPayments) return resolve(w.TossPayments);
    const s = document.createElement("script");
    s.src = "https://js.tosspayments.com/v1/payment";
    s.onload = () => resolve((window as any).TossPayments);
    s.onerror = () => reject(new Error("toss sdk load failed"));
    document.head.appendChild(s);
  });
}

export default function BillingManage({ cafeId, pin }: { cafeId: number; pin: string }) {
  const [sub, setSub] = useState<Sub | null>(null);
  const [live, setLive] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const hdr = { "x-owner-pin": pin, "Content-Type": "application/json" };

  const reload = async () => {
    try {
      const r = await fetch(`/api/subscription?cafeId=${cafeId}`, { headers: { "x-owner-pin": pin } });
      const d = await r.json();
      if (d.ok) { setSub(d.sub ?? null); setLive(!!d.paymentsLive); }
    } catch {}
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [cafeId]);
  useEffect(() => {
    try {
      const b = new URLSearchParams(window.location.search).get("billing");
      if (b === "ok") setMsg("✅ 카드가 등록됐어요. 정기결제가 준비됐습니다.");
      else if (b === "fail") setMsg("카드 등록이 취소되었거나 실패했어요. 다시 시도해 주세요.");
    } catch {}
  }, []);

  const startBilling = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/billing/prepare", { method: "POST", headers: hdr, body: JSON.stringify({ cafeId }) });
      const d = await r.json();
      if (!d.ok) { setMsg(d.error || "결제 준비 실패"); setBusy(false); return; }
      const TossPayments = await loadToss();
      const toss = TossPayments(d.clientKey);
      const base = window.location.origin;
      await toss.requestBillingAuth("카드", {
        customerKey: d.customerKey,
        successUrl: `${base}/api/billing/authorize`,
        failUrl: `${base}/owner?billing=fail`,
      });
    } catch (e) { setMsg("결제창을 여는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요."); setBusy(false); }
  };

  const cancel = async () => {
    if (!confirm("정기결제를 해지할까요? 남은 이용기간까지는 그대로 이용하실 수 있어요.")) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/billing/cancel", { method: "POST", headers: hdr, body: JSON.stringify({ cafeId }) });
      const d = await r.json();
      setMsg(d.ok ? "정기결제가 해지됐어요. 남은 기간까지 이용하실 수 있어요." : (d.error || "해지 실패"));
      await reload();
    } catch { setMsg("해지 처리 중 문제가 생겼어요."); }
    setBusy(false);
  };

  if (!sub) return null;
  const hasCard = !!sub.card_last4 && (sub.billing_status === "registered" || sub.billing_status === "active");
  const isTrial = (sub.duration_days ?? 30) <= 7;
  const dLeft = daysLeft(sub.expires_at);
  const trialEndingSoon = isTrial && sub.status === "active" && !hasCard && dLeft != null && dLeft <= 3;

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#ece0cd] mb-4">
      <div className="text-sm font-bold text-[#52402e] mb-1 flex items-center gap-1.5">💳 결제 관리</div>
      {msg && <p className="text-[12px] text-[#7a5122] bg-[#fff8ee] border border-[#e7d3b3] rounded-lg px-3 py-2 my-2">{msg}</p>}

      {/* 체험 만료 임박 배너 */}
      {trialEndingSoon && (
        <div className="bg-[#fff4e6] border border-[#e8c99a] rounded-xl px-3 py-2.5 my-2">
          <div className="text-[13px] font-bold text-[#9c5b1f]">체험이 {dLeft != null && dLeft <= 0 ? "오늘" : `${dLeft}일 뒤`} 끝나요</div>
          <div className="text-[11.5px] text-[#7a5122] mt-0.5">카드를 등록해두면 체험이 끝나는 날 자동으로 홍보팩 구독(₩9,900/월)이 이어져요. 지금은 과금되지 않아요.</div>
        </div>
      )}

      {hasCard ? (
        <div className="mt-1">
          <div className="flex items-center gap-2 text-[13px] text-[#52402e]">
            <span className="font-bold">{sub.card_company || "카드"} •••• {sub.card_last4}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${sub.autopay ? "bg-[#e6f0e2] text-[#4a7a4a]" : "bg-[#f0e6d4] text-[#8a7458]"}`}>{sub.autopay ? "정기결제 켜짐" : "정기결제 꺼짐"}</span>
          </div>
          {sub.autopay && sub.next_billing_at && <div className="text-[11.5px] text-[#8a7458] mt-1">다음 결제 예정일 <b className="text-[#52402e]">{fmt(sub.next_billing_at)}</b> · 월 ₩9,900</div>}
          {sub.autopay
            ? <button onClick={cancel} disabled={busy} className="mt-3 text-[12px] text-[#9c6b3f] underline disabled:opacity-40">정기결제 해지</button>
            : <button onClick={startBilling} disabled={busy || !live} className="mt-3 w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-2.5 text-[13px] font-bold disabled:opacity-40">카드 다시 등록하고 정기결제 켜기</button>}
        </div>
      ) : live ? (
        <div className="mt-1">
          <button onClick={startBilling} disabled={busy} className="w-full bg-gradient-to-r from-[#9c6b3f] to-[#2b2018] text-[#f4ece0] rounded-xl py-3 text-[13.5px] font-bold disabled:opacity-50">
            {busy ? "여는 중…" : "카드 등록하고 정기결제 시작 (₩9,900/월)"}
          </button>
          <p className="text-[10.5px] text-[#8a7458] mt-2 text-center leading-relaxed">카드 정보는 토스페이먼츠가 안전하게 보관하며, 본 서비스는 저장하지 않아요. 언제든 해지할 수 있어요.</p>
        </div>
      ) : (
        <p className="text-[12px] text-[#8a7458] mt-1 leading-relaxed">정기결제(카드 자동결제)는 <b>곧 오픈</b>돼요. 그 전까지는 계좌이체로 안내드립니다. 문의: dongnecoffeenote@gmail.com</p>
      )}
    </div>
  );
}
