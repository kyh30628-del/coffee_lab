"use client";
import { useEffect, useState } from "react";

// 사장님 구독 회원가입/관리 — 카페별. 가입 신청 → 관리자 승인(active) → 만료 D-N 표시.
export default function Subscribe({ cafeId, cafeName, pw }: { cafeId: number; cafeName: string; pw: string }) {
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ownerName: "", contact: "", email: "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const hdr = { "x-admin-password": pw };

  const load = () => fetch(`/api/subscription?cafeId=${cafeId}`, { headers: hdr }).then((r) => r.json()).then((d) => { setSub(d.sub ?? null); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { setLoading(true); setMsg(""); load(); }, [cafeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const signup = async () => {
    if (!form.ownerName.trim() || !form.contact.trim() || !consent) return;
    setBusy(true);
    try { const r = await fetch("/api/subscription", { method: "POST", headers: { ...hdr, "Content-Type": "application/json" }, body: JSON.stringify({ cafeId, cafeName, ...form, consent: true }) }); const d = await r.json(); if (d.ok) { setMsg("✅ 구독 신청 완료 — 관리자 승인 후 활성화돼요"); load(); } else setMsg(d.error ?? "오류"); } catch {}
    setBusy(false);
  };

  if (loading) return <div className="text-[12px] text-[#cbb89f] py-2">구독 상태 불러오는 중…</div>;

  if (sub?.status === "active") {
    const dleft = sub.expires_at ? Math.max(0, Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86400000)) : null;
    return (
      <div className="bg-gradient-to-br from-[#2b2018] to-[#4a3424] text-[#f4ece0] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold bg-[#e8b87a] text-[#2b2018] px-2 py-0.5 rounded-full">✅ 구독 중</span>
          <span className="text-[12.5px]">{sub.plan} ₩{(sub.price ?? 9900).toLocaleString()}/월</span>
        </div>
        <div className="text-[12px] text-[#cbb89f]">만료 <b className="text-[#e8b87a]">D-{dleft}</b> · {sub.expires_at ? new Date(sub.expires_at).toLocaleDateString("ko-KR") : ""}까지</div>
        <p className="text-[11px] text-[#cbb89f] mt-1.5">아래 쇼케이스·우선노출·성과·쿠폰을 모두 쓰실 수 있어요.</p>
      </div>
    );
  }
  if (sub?.status === "pending") {
    return <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[12.5px] text-amber-700">🕐 구독 신청 접수됨 — <b>관리자 승인 대기 중</b>이에요. 곧 활성화됩니다.</div>;
  }
  // 미가입 / 만료 / 해지 → 가입 폼
  return (
    <div className="bg-[#fdfaf4] border border-[#e6dcc8] rounded-xl p-4">
      <div className="font-bold text-[#2b2018] mb-0.5">💳 홍보팩 구독 회원가입 <span className="text-[#9c6b3f] text-[13px]">₩9,900/월</span></div>
      <p className="text-[12px] text-[#6b5a48] mb-2.5">쇼케이스·우선노출·성과분석·쿠폰을 쓰려면 가입하세요. (관리자 승인 후 활성화)</p>
      {sub?.status === "expired" && <div className="text-[11px] text-rose-500 mb-1.5">구독이 만료됐어요 — 재가입하면 다시 활성화됩니다.</div>}
      {sub?.status === "cancelled" && <div className="text-[11px] text-stone-500 mb-1.5">해지된 구독이에요 — 재가입 가능합니다.</div>}
      <input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder="사장님 성함" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2 text-[14px] mb-1.5 bg-white" />
      <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="연락처 (전화)" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2 text-[14px] mb-1.5 bg-white" />
      <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="이메일 (선택)" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2 text-[14px] mb-2 bg-white" />
      <label className="flex items-start gap-2 mb-2.5 cursor-pointer"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 shrink-0" /><span className="text-[11px] text-[#52402e] leading-snug">(필수) 구독 관리를 위한 개인정보 수집·이용 동의. 연락처는 <b>암호화 저장</b>됩니다.</span></label>
      <button disabled={busy || !form.ownerName.trim() || !form.contact.trim() || !consent} onClick={signup} className="w-full bg-[#e8b87a] text-[#2b2018] rounded-lg py-2.5 font-bold disabled:opacity-50">{busy ? "신청 중…" : "구독 회원가입"}</button>
      {msg && <p className="text-[12px] text-center mt-2 text-[#5f7355]">{msg}</p>}
    </div>
  );
}
