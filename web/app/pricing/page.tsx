"use client";
import { useState } from "react";
import BackLink from "../BackLink";
import OwnerSignupModal from "../OwnerSignupModal";
import OwnerFindModal from "../OwnerFindModal";

// 💳 요금 안내 — **감시 상품**으로 다시 씀(2026-08-27 CEO 승인).
//
// 왜 바꿨나: 예전 페이지는 '노출'만 팔았다("노출"이 5번). 그런데 사장님을 데려오는 약속은
//   "우리 가게 강점·약점 분석"이었다 — 미끼와 상품이 어긋나 있었다.
//   더 근본적으로 **분석은 한 번 읽으면 끝나서 월 구독이 성립하지 않는다.**
//   실측: 체험 2곳 다 첫날 한 번 보고 다시 안 왔다(브라운테일 7/14→7/14, 바운스백 7/31→7/31).
//   → 파는 것을 '노출'에서 **'감시'**로 바꾼다. 매달 새로 생기는 것만이 구독이 된다.
//
// ⚠️ 여기 적힌 혜택은 **실제로 구현된 것만** 쓴다. 감시 3종은 lib/ownerWatch.ts에 있고
//   매일 cron-billing에서 돈다. 부정 후기 감지는 판정 엔진이 없어 **약속하지 않는다**.
// ⚠️ 옛 '프리미엄(준비 중) — 후기 인텔리전스'는 지웠다. 그게 지금 이 상품이다.

const FREE = [
  "동네 순위 · 검증 후기 수 · 등급",
  "우리 가게 강점 1가지",
  "카페 정보 등록 · 검색·지도 기본 노출",
];

// 감시 = 매달 새로 생기는 가치(구독의 근거)
const WATCH = [
  { emoji: "🔔", t: "새 후기 알림", d: "검증을 통과한 새 후기가 올라오면 메일로" },
  { emoji: "📈", t: "동네 순위 변동", d: "우리 가게 순위가 오르거나 내리면" },
  { emoji: "🏪", t: "경쟁 카페 진입", d: "우리 동네에 새 카페가 등록되면" },
];
// 분석 = 한 번에 다 보는 가치
const DEEP = [
  "약점·개선 포인트 (무료에선 가려진 부분)",
  "성향 축 전체(11종) — 동네 평균 대비 점수",
  "비슷한 카페 비교 · 데이터 기반 액션 플랜",
  "검증된 후기 원문 전체 · 키워드",
  "주간 트렌드 레터",
];
const BONUS = ["🎀 쇼케이스 배너", "⭐ 우선 노출 (홈 추천 카페)", "🎬 홍보 영상 (20초)"];

export default function Pricing() {
  const [open, setOpen] = useState(false);
  const [trial, setTrial] = useState(false);
  const [find, setFind] = useState(false);

  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-md mx-auto px-5 py-10">
        <BackLink to="/" label="홈" className="text-[#7a5122] mb-4" />
        <div className="text-[#7a5122] text-xs tracking-[0.3em] uppercase mb-2">For Owners</div>
        <h1 className="text-3xl font-bold mb-2 leading-tight">손님이 뭐라고 하는지,<br />우리가 대신 지켜봅니다</h1>
        <p className="text-[14px] text-[#524234] leading-relaxed mb-6">
          네이버·구글·유튜브에 흩어진 우리 가게 후기를 매일 확인해서, <b>달라진 것만</b> 알려드려요.
          사장님이 일일이 검색할 필요 없이요.
        </p>

        {/* 먼저 보여준다 — 파는 것보다 확인이 먼저다 */}
        <button onClick={() => setFind(true)}
          className="w-full bg-white border border-[#d9c9ab] rounded-2xl px-5 py-4 mb-5 text-left active:scale-[0.99] transition">
          <div className="text-[14px] font-bold text-[#2b2018]">☕ 먼저 우리 가게부터 확인해보세요</div>
          <div className="text-[12px] text-[#7a6a55] mt-0.5">가입 없이 동네 순위·강점을 바로 볼 수 있어요 →</div>
        </button>

        {/* 무료 */}
        <div className="bg-white rounded-2xl border border-[#e6dcc8] p-5 mb-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="font-bold text-lg">무료</div>
            <div className="text-[13px] text-[#7a5122]">₩0</div>
          </div>
          <ul className="space-y-1.5 text-[13px] text-[#52402e]">{FREE.map((f) => <li key={f}>· {f}</li>)}</ul>
        </div>

        {/* 우리 가게 리포트 */}
        <div className="bg-gradient-to-br from-[#2b2018] to-[#4a3424] text-[#f4ece0] rounded-2xl p-5 mb-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-3 right-3 text-[9px] font-bold bg-[#e8b87a] text-[#2b2018] px-2 py-0.5 rounded-full">추천</div>
          <div className="font-bold text-lg mb-1">우리 가게 리포트</div>
          <div className="mb-4"><span className="text-2xl font-bold text-[#e8b87a]">₩9,900</span><span className="text-[12px] text-[#8f7a58]"> / 월</span></div>

          <div className="text-[11px] text-[#c7ab82] tracking-wider mb-2">매일 지켜보고 알려드려요</div>
          <ul className="space-y-2.5 mb-4">
            {WATCH.map((w) => (
              <li key={w.t} className="flex gap-2.5">
                <span className="text-[15px] leading-none mt-0.5">{w.emoji}</span>
                <span className="flex flex-col">
                  <span className="text-[13.5px] font-bold text-[#f4ece0]">{w.t}</span>
                  <span className="text-[11.5px]" style={{ color: "#b0997a" }}>{w.d}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="text-[11px] text-[#c7ab82] tracking-wider mb-2">깊이 보는 분석</div>
          <ul className="space-y-1.5 text-[12.5px] text-[#f0e6d4] mb-4">{DEEP.map((f) => <li key={f}>· {f}</li>)}</ul>

          <div className="text-[11px] text-[#c7ab82] tracking-wider mb-2">홍보 도구도 함께</div>
          <ul className="space-y-1.5 text-[12.5px] text-[#c7ab82] mb-4">{BONUS.map((f) => <li key={f}>{f}</li>)}</ul>

          <button onClick={() => { setTrial(true); setOpen(true); }} className="w-full bg-white text-[#2b2018] rounded-lg py-3 font-bold">✨ 7일 무료 체험</button>
          <button onClick={() => { setTrial(false); setOpen(true); }} className="w-full mt-2 bg-[#e8b87a] text-[#2b2018] rounded-lg py-3 font-bold">구독 신청하기</button>
          <p className="text-[10.5px] text-[#8f7a58] mt-2 text-center">체험은 결제 없이 7일 · 신청하면 결제·세팅을 안내해 드려요</p>
        </div>

        <p className="text-[11px] text-[#665036] text-center leading-relaxed">
          소비자에게 보여지는 후기·등급은 <b>모든 카페가 동일하게 검증</b>됩니다.
          구독은 <b>내 가게 데이터를 보는 도구</b>이며, 후기 평가를 돈으로 바꾸지 않습니다.
        </p>
        <div className="mt-4 flex justify-center gap-3 text-[11px] text-[#7a5122]">
          <a href="/business" className="underline">사업자정보·환불정책</a>
          <a href="/trust" className="underline">검증 방법</a>
        </div>
      </div>

      <OwnerFindModal open={find} onClose={() => setFind(false)}
        onNoMatch={() => { setFind(false); setTrial(true); setOpen(true); }} />
      <OwnerSignupModal open={open} onClose={() => setOpen(false)} trial={trial} source="pricing" />
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
