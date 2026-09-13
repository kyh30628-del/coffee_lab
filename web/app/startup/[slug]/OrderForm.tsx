"use client";
import { useState } from "react";

export default function OrderForm({ slug, price }: { slug: string; price: number }) {
  const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState<string>("");
  const submit = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/startup-report/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, email, name }) });
      const d = await r.json();
      setDone(d.ok ? `접수됐어요(주문번호 ${d.orderId}). 입금 안내를 이메일로 보내드리고, 입금 확인 즉시 열람 코드를 같은 이메일로 보내드려요.` : (d.error || "접수 실패"));
    } catch { setDone("네트워크 오류"); }
    setBusy(false);
  };
  if (done) return <p className="text-[13.5px] text-[#33684b] leading-relaxed">✓ {done}</p>;
  return (
    <div className="flex flex-col gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름(선택)" className="border border-[#d9c7ad] rounded-lg px-3 py-2 text-[14px] bg-white" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일(열람 코드를 받을 주소)" type="email" className="border border-[#d9c7ad] rounded-lg px-3 py-2 text-[14px] bg-white" />
      <button type="button" onClick={submit} disabled={busy || !email} className="nt-btn-ink py-3 text-[15px] disabled:opacity-50">{busy ? "접수 중…" : `전문 열람 신청 · ₩${price.toLocaleString()} (1회)`}</button>
      <p className="text-[11.5px] text-[#63523f]">결제는 계좌이체로 안내드려요(카드 결제 준비 중). 리포트는 열람 코드로 웹에서 보며, 인쇄·PDF 저장이 됩니다.</p>
    </div>
  );
}
