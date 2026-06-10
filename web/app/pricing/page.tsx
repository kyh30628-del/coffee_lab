"use client";
import { useState } from "react";
import BackLink from "../BackLink";

const FREE = ["카페 정보 등록·보완", "검색·지도 기본 노출", "후기 요약 열람"];
const PRO = [
  "🎀 쇼케이스 배너 (카페 상세 상단)",
  "🎬 홍보 영상 (20초)",
  "⭐ 우선 노출 (홈 ‘추천 카페’ 상단)",
  "📊 성과 분석 (노출·클릭·재생)",
  "🤖 AI 홍보 카피·템플릿 10종",
];

export default function Pricing() {
  const [open, setOpen] = useState(false);
  const [cafe, setCafe] = useState("");
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!cafe.trim() || !contact.trim() || !consent) return;
    setBusy(true);
    try {
      const r = await fetch("/api/sub-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cafeName: cafe, contact, plan: "홍보팩", consent: true }) });
      const d = await r.json();
      if (d.ok) setDone(true);
    } catch {}
    setBusy(false);
  };

  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-md mx-auto px-5 py-10">
        <BackLink to="/" label="홈" className="text-[#9c6b3f] mb-4" />
        <div className="text-[#9c6b3f] text-xs tracking-[0.3em] uppercase mb-2">For Owners</div>
        <h1 className="text-3xl font-bold mb-2 leading-tight">우리 가게,<br />동네 커피 노트에서 돋보이게</h1>
        <p className="text-[14px] text-[#6b5a48] leading-relaxed mb-8">소비자가 우리 동네 카페를 찾는 곳에서, 사장님 가게를 <b>상단에 노출</b>하고 <b>홍보 영상·쇼케이스</b>로 어필하세요. 성과는 숫자로 확인하고요.</p>

        {/* 무료 */}
        <div className="bg-white rounded-2xl border border-[#e6dcc8] p-5 mb-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="font-bold text-lg">무료</div>
            <div className="text-[13px] text-[#9c6b3f]">₩0</div>
          </div>
          <ul className="space-y-1.5 text-[13px] text-[#52402e]">{FREE.map((f) => <li key={f}>· {f}</li>)}</ul>
        </div>

        {/* 홍보팩 */}
        <div className="bg-gradient-to-br from-[#2b2018] to-[#4a3424] text-[#f4ece0] rounded-2xl p-5 mb-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-3 right-3 text-[9px] font-bold bg-[#e8b87a] text-[#2b2018] px-2 py-0.5 rounded-full">추천</div>
          <div className="flex items-baseline justify-between mb-1">
            <div className="font-bold text-lg">우리가게 홍보팩</div>
          </div>
          <div className="mb-3"><span className="text-2xl font-bold text-[#e8b87a]">₩9,900</span><span className="text-[12px] text-[#cbb89f]"> / 월</span></div>
          <ul className="space-y-1.5 text-[13px]">{PRO.map((f) => <li key={f} className="text-[#f0e6d4]">{f}</li>)}</ul>
          <div className="mt-4 bg-black/25 rounded-lg px-3 py-2 text-[11.5px] text-[#e8b87a] text-center">🔥 우리 동네 <b>추천 6자리 한정</b> · 자리 차면 대기</div>
          <button onClick={() => setOpen(true)} className="w-full mt-3 bg-[#e8b87a] text-[#2b2018] rounded-lg py-3 font-bold">구독 신청하기</button>
          <p className="text-[10.5px] text-[#cbb89f] mt-2 text-center">신청하면 결제·세팅을 안내해 드려요</p>
        </div>

        {/* 프리미엄(준비중) */}
        <div className="bg-white rounded-2xl border border-dashed border-[#cbb89f] p-5 mb-6 opacity-80">
          <div className="flex items-baseline justify-between mb-2">
            <div className="font-bold text-lg">프리미엄 <span className="text-[10px] text-[#9c6b3f]">준비 중</span></div>
          </div>
          <p className="text-[13px] text-[#6b5a48]">📈 후기 인텔리전스 — 경쟁 카페 비교·강약점·액션플랜. (검토 후 오픈 예정)</p>
        </div>

        <p className="text-[11px] text-[#8a7458] text-center leading-relaxed">소비자에게 보여지는 후기·등급은 모든 카페가 동일하게 검증됩니다. 홍보팩은 <b>노출·홍보 도구</b>이며, 후기 평가를 돈으로 바꾸지 않습니다.</p>
      </div>

      {/* 구독 신청 모달 */}
      {open && (
        <div className="fixed inset-0 z-[5000]" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:w-[360px] sm:h-fit bg-[#fdfaf4] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {done ? (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">🎉</div>
                <div className="font-bold text-[#2b2018] mb-1">신청 접수됐어요</div>
                <p className="text-[13px] text-[#6b5a48]">남겨주신 연락처로 <b>결제·세팅 안내</b>를 곧 드릴게요.</p>
                <button onClick={() => { setOpen(false); setDone(false); setCafe(""); setContact(""); }} className="w-full mt-5 bg-[#2b2018] text-[#f4ece0] rounded-lg py-2.5 text-sm">닫기</button>
              </div>
            ) : (
              <>
                <h3 className="font-bold text-[#2b2018] text-lg mb-1">홍보팩 구독 신청</h3>
                <p className="text-[12px] text-[#6b5a48] mb-4">가게명과 연락처를 남겨주시면 결제·세팅을 안내해 드려요.</p>
                <input value={cafe} onChange={(e) => setCafe(e.target.value)} placeholder="가게명" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2.5 text-[14px] mb-2 bg-white" />
                <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="연락처 (전화 또는 이메일)" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2.5 text-[14px] mb-3 bg-white" />
                <label className="flex items-start gap-2 mb-3 cursor-pointer">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 shrink-0" />
                  <span className="text-[11.5px] text-[#52402e] leading-snug"><b>(필수)</b> 구독 안내를 위한 가게명·연락처 수집·이용에 동의합니다. 연락처는 <b>암호화 저장</b>되고 목적 달성 후 파기됩니다. <a href="/privacy" target="_blank" className="text-[#9c6b3f] underline">개인정보처리방침</a></span>
                </label>
                <button disabled={busy || !cafe.trim() || !contact.trim() || !consent} onClick={submit} className="w-full bg-[#e8b87a] text-[#2b2018] rounded-lg py-3 font-bold disabled:opacity-50">{busy ? "보내는 중…" : "신청 보내기"}</button>
              </>
            )}
          </div>
        </div>
      )}
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
