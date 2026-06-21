"use client";
import { useState } from "react";

// 사장님 카페 정보 입력 모달(공용) — /pricing(구독)·랜딩(7일 체험) 둘 다 사용.
//   카페 검색·선택 → 성함·연락처·이메일·동의 → /api/subscription(pending). 승인 시 이메일로 PIN.
export default function OwnerSignupModal({ open, onClose, trial = false }: { open: boolean; onClose: () => void; trial?: boolean }) {
  const [cafeQ, setCafeQ] = useState("");
  const [sug, setSug] = useState<{ id: number; name: string; area: string }[]>([]);
  const [picked, setPicked] = useState<{ id: number; name: string } | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) return null;
  const reset = () => { setDone(false); setPicked(null); setCafeQ(""); setOwnerName(""); setContact(""); setEmail(""); setConsent(false); setSug([]); };
  const close = () => { reset(); onClose(); };

  const onCafeQ = async (v: string) => {
    setCafeQ(v); setPicked(null);
    if (v.trim().length < 1) { setSug([]); return; }
    try { const d = await (await fetch(`/api/cafe-names?q=${encodeURIComponent(v.trim())}`)).json(); setSug(d.cafes ?? []); } catch {}
  };
  const submit = async () => {
    if (!picked || !ownerName.trim() || !contact.trim() || !email.trim() || !consent) return;
    setBusy(true);
    try {
      const r = await fetch("/api/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cafeId: picked.id, cafeName: picked.name, ownerName, contact, email, consent: true, trial }) });
      const d = await r.json();
      if (d.ok) setDone(true);
    } catch {}
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[7000]" onClick={close}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:w-[360px] sm:h-fit bg-[#fdfaf4] text-[#2b2018] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-6">
            <div className="text-3xl mb-2">🎉</div>
            <div className="font-bold mb-1">{trial ? "7일 체험 신청 완료" : "구독 신청 완료"}</div>
            <p className="text-[13px] text-[#6b5a48] leading-relaxed">관리자 승인 후 <b>등록하신 이메일로 키(PIN)</b>가 발송돼요. 그 키로 사장님 화면에 로그인하시면 <b>내 카페 분석으로 바로</b> 들어갑니다.{trial ? " 체험은 승인일로부터 7일간이에요." : ""}</p>
            <button onClick={close} className="w-full mt-5 bg-[#2b2018] text-[#f4ece0] rounded-lg py-2.5 text-sm font-bold">닫기</button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-bold text-lg">{trial ? "✨ 7일 무료 체험 신청" : "홍보팩 구독 신청"}</h3>
              <button onClick={close} className="text-2xl text-[#bcae98] leading-none -mt-1">×</button>
            </div>
            <p className="text-[12px] text-[#6b5a48] mb-3">내 카페를 선택하고 정보를 남겨주세요. 승인되면 <b>이메일로 키(PIN)</b>를 보내드려요.{trial ? " 결제 없이 7일간 모든 사장님 기능을 써보실 수 있어요." : ""}</p>
            <div className="relative mb-2">
              <input value={picked ? picked.name : cafeQ} onChange={(e) => onCafeQ(e.target.value)} placeholder="내 카페 이름 검색" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2.5 text-[14px] bg-white" />
              {picked && <span className="absolute right-3 top-2.5 text-[12px] text-emerald-600 font-bold">✓ 선택됨</span>}
              {!picked && sug.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-[#d9c9b0] rounded-lg shadow-lg max-h-44 overflow-y-auto">
                  {sug.map((c) => (
                    <button key={c.id} onClick={() => { setPicked({ id: c.id, name: c.name }); setSug([]); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#f4ece0] border-b border-[#f0e6d4] last:border-0"><b>{c.name}</b> <span className="text-[11px] text-[#a8927a]">{c.area}</span></button>
                  ))}
                </div>
              )}
            </div>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="사장님 성함" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2.5 text-[14px] mb-2 bg-white" />
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="연락처 (전화)" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2.5 text-[14px] mb-2 bg-white" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="이메일 (키 받을 주소)" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2.5 text-[14px] mb-3 bg-white" />
            <label className="flex items-start gap-2 mb-3 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 shrink-0" />
              <span className="text-[11.5px] text-[#52402e] leading-snug"><b>(필수)</b> 승인·키(PIN) 발송을 위한 개인정보 수집·이용 동의. 연락처·이메일은 <b>암호화 저장</b>됩니다. <a href="/privacy" target="_blank" className="text-[#9c6b3f] underline">방침</a></span>
            </label>
            <button disabled={busy || !picked || !ownerName.trim() || !contact.trim() || !email.trim() || !consent} onClick={submit} className="w-full bg-[#e8b87a] text-[#2b2018] rounded-lg py-3 font-bold disabled:opacity-50">{busy ? "신청 중…" : trial ? "7일 체험 신청" : "구독 신청"}</button>
          </>
        )}
      </div>
    </div>
  );
}
