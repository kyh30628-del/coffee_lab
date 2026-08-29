"use client";
import { useState } from "react";
import { TRIAL_DAYS } from "@/lib/ownerPlan";
import BackLink from "../../BackLink";
import OwnerSignupModal from "../../OwnerSignupModal";

const USE_OPTIONS = ["작업", "혼자", "수다", "빵", "사진", "단골"];

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: "", area: "", address: "", phone: "", hours: "",
    roasts_own: false, beans: "", signature: "", vibe: "", note: "", price_hint: "",
  });
  const [uses, setUses] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  // 카페명 자동완성 — 기존 카페 보완 or 신규 작성
  const [nameSug, setNameSug] = useState<{ id: number; name: string; area: string }[]>([]);
  const [supplementId, setSupplementId] = useState<number | null>(null);
  const [wantTrial, setWantTrial] = useState(false);                         // 등록과 함께 무료 체험 신청
  const [newCafe, setNewCafe] = useState<{ id: number; name: string } | null>(null);
  const [showTrial, setShowTrial] = useState(false);
  const nameLookup = async (v: string) => {
    if (v.trim().length < 1) { setNameSug([]); return; }
    try { const d = await (await fetch(`/api/cafe-names?q=${encodeURIComponent(v.trim())}`)).json(); setNameSug(d.cafes ?? []); } catch {}
  };

  const set = (k: string, v: string | boolean) => setForm({ ...form, [k]: v });
  const toggleUse = (u: string) => setUses((c) => (c.includes(u) ? c.filter((x) => x !== u) : [...c, u]));

  const submit = async () => {
    if (!form.name.trim()) { setErr("카페 이름을 입력해주세요."); return; }
    setStatus("sending"); setErr("");
    try {
      const r = await fetch("/api/cafe-submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, uses, supplementId }),
      });
      const d = await r.json();
      if (d.ok) {
        const cafe = supplementId ? { id: supplementId, name: form.name } : (d.cafeId ? { id: d.cafeId, name: d.cafeName ?? form.name } : null);
        setNewCafe(cafe);
        setStatus("done");
        if (wantTrial && cafe) setShowTrial(true);   // 등록과 동시에 체험 신청 모달 열기
      }
      else { setStatus("error"); setErr(d.error ?? "오류가 발생했습니다."); }
    } catch { setStatus("error"); setErr("네트워크 오류. 다시 시도해주세요."); }
  };

  const field = "w-full bg-white border border-[#d9c9b0] rounded-lg px-3.5 py-2.5 text-[15px] focus:border-[#9c6b3f] focus:outline-none";

  if (status === "done") {
    return (
      <main className="min-h-screen bg-[#f4ece0] text-[#2b2018] flex items-center justify-center p-6" style={{ fontFamily: "'Gowun Batang', serif" }}>
        <div className="bg-[#fdfaf4] rounded-2xl p-10 text-center max-w-md border border-[#ece0cd]">
          <div className="text-4xl mb-4">☕</div>
          {/* 감사수리: 기존 카페 보완 제보는 신규 등록과 구분해 안내 */}
          <h1 className="text-2xl font-bold mb-3">{supplementId ? "보완 제보가 접수됐어요" : "등록 신청이 접수됐어요"}</h1>
          <p className="text-[#524234] leading-relaxed">
            보내주신 정보를 확인한 뒤 가이드에 실어드릴게요.
            커피를 아는 사람들에게 사장님 가게가 제대로 소개되도록 정성껏 다듬겠습니다.
          </p>
          <p className="text-[13px] text-[#665036] leading-relaxed mt-3 bg-[#f4ece0] rounded-xl px-4 py-3">
            가게가 <b>검증·공개</b>되면, 사장님 화면에서 <b>내 카페 분석</b>과 <b>{TRIAL_DAYS}일 무료 체험</b>을 이용하실 수 있어요. 준비되면 안내드릴게요.
          </p>
          {newCafe && (
            <button onClick={() => setShowTrial(true)} className="w-full mt-4 bg-[#e8b87a] text-[#2b2018] rounded-lg py-3 font-bold">🎁 이어서 {TRIAL_DAYS}일 무료 체험 신청하기</button>
          )}
          <a href="/cafe" className="inline-block mt-5 text-[#7a5122] underline text-sm">가이드 둘러보기 →</a>
        </div>
        <OwnerSignupModal open={showTrial} onClose={() => setShowTrial(false)} trial prefillCafe={newCafe} source="cafe_register" />
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-xl mx-auto px-6 py-12">
        <header className="mb-8">
          <BackLink to="/" label="홈" className="text-[#7a5122] mb-4" />
          <div className="text-[#7a5122] text-xs tracking-[0.4em] uppercase mb-3">For Owners</div>
          <h1 className="text-3xl font-bold leading-tight">사장님, 가게를 소개해주세요</h1>
          <p className="text-[#524234] mt-3 leading-relaxed text-[15px]">
            별점·광고가 아니라, 커피를 아는 손님에게 우리 가게의 결을 전하는 안내입니다.
            아래를 채워주시면 확인 후 동네 가이드에 실어드려요. (무료)
          </p>
        </header>

        <div className="space-y-5">
          <div className="relative">
            <label className="block text-sm text-[#7a5122] mb-1.5">카페 이름 * {supplementId && <span className="text-[11px] text-[#5f7355]">· 기존 카페 보완 모드</span>}</label>
            <input className={field} value={form.name} onChange={(e) => { set("name", e.target.value); setSupplementId(null); nameLookup(e.target.value); }} placeholder="기존 카페를 찾거나 새 이름을 입력" />
            {nameSug.length > 0 && form.name.trim() && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#d9c9b0] rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                {nameSug.map((c) => (
                  <button key={c.id} type="button" onClick={() => { setForm((f) => ({ ...f, name: c.name, area: c.area })); setSupplementId(c.id); setNameSug([]); }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-[#f4ece0] border-b border-[#f0e6d4] last:border-0">
                    <span className="font-bold text-sm">{c.name}</span><span className="text-xs text-[#665036] ml-2">{c.area} · 내용 보완</span>
                  </button>
                ))}
                <div className="px-3.5 py-2 text-[11px] text-[#665036]">목록에 없으면 그대로 두고 새로 등록하세요</div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-[#7a5122] mb-1.5">동네</label>
              <input className={field} value={form.area} onChange={(e) => set("area", e.target.value)} placeholder="예) 강동역" />
            </div>
            <div>
              <label className="block text-sm text-[#7a5122] mb-1.5">전화</label>
              <input className={field} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="02-000-0000" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-[#7a5122] mb-1.5">주소</label>
            <input className={field} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="서울 강동구 ..." />
          </div>
          <div>
            <label className="block text-sm text-[#7a5122] mb-1.5">영업시간</label>
            <input className={field} value={form.hours} onChange={(e) => set("hours", e.target.value)} placeholder="평일 08:00–20:00" />
          </div>

          <div className="flex items-center gap-2 py-1">
            <input type="checkbox" id="roast" checked={form.roasts_own} onChange={(e) => set("roasts_own", e.target.checked)} className="w-4 h-4 accent-[#9c6b3f]" />
            <label htmlFor="roast" className="text-[15px]">직접 로스팅합니다</label>
          </div>

          <div>
            <label className="block text-sm text-[#7a5122] mb-1.5">취급 원두 / 산지</label>
            <input className={field} value={form.beans} onChange={(e) => set("beans", e.target.value)} placeholder="예) 에티오피아, 콜롬비아, 과테말라 (산지별 선택 가능)" />
          </div>
          <div>
            <label className="block text-sm text-[#7a5122] mb-1.5">대표·추천 메뉴</label>
            <input className={field} value={form.signature} onChange={(e) => set("signature", e.target.value)} placeholder="예) 핸드드립 (원두 선택)" />
          </div>
          <div>
            <label className="block text-sm text-[#7a5122] mb-1.5">가격 안내</label>
            <input className={field} value={form.price_hint} onChange={(e) => set("price_hint", e.target.value)} placeholder="예) 핸드드립 6,000원~" />
          </div>
          <div>
            <label className="block text-sm text-[#7a5122] mb-1.5">어떤 분위기인가요</label>
            <input className={field} value={form.vibe} onChange={(e) => set("vibe", e.target.value)} placeholder="예) 작고 조용한 골목 로스터리" />
          </div>

          <div>
            <label className="block text-sm text-[#7a5122] mb-2">어떤 손님에게 어울리나요</label>
            <div className="flex flex-wrap gap-2">
              {USE_OPTIONS.map((u) => (
                <button key={u} type="button" onClick={() => toggleUse(u)}
                  className={`px-3.5 py-2 rounded-full text-sm border transition-colors ${uses.includes(u) ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-transparent text-[#524234] border-[#cbb89f] hover:border-[#9c6b3f]"}`}>
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-[#7a5122] mb-1.5">손님에게 한마디</label>
            <textarea className={`${field} h-24 resize-none`} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="우리 가게 커피를 한 문장으로 소개한다면?" />
          </div>

          {/* 🎁 등록과 함께 무료 체험 신청 */}
          <label className="flex items-start gap-2.5 rounded-xl border border-[#e8b87a] bg-[#fbf3e6] px-3.5 py-3 cursor-pointer">
            <input type="checkbox" checked={wantTrial} onChange={(e) => setWantTrial(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#9c6b3f] shrink-0" />
            <span className="text-[13px] text-[#52402e] leading-snug"><b>🎁 등록과 함께 {TRIAL_DAYS}일 무료 체험도 신청할게요</b><br /><span className="text-[11.5px] text-[#665036]">등록 직후 사장님 정보·사업자등록증을 받고, 가게가 검증·공개되면 승인해 이메일로 키를 보내드려요.</span></span>
          </label>

          {err && <p className="text-red-700 text-sm">{err}</p>}

          <button onClick={submit} disabled={status === "sending"}
            className="w-full bg-[#2b2018] text-[#f4ece0] rounded-lg py-3.5 font-medium hover:bg-[#3d2f22] transition-colors disabled:opacity-50">
            {status === "sending" ? "보내는 중..." : wantTrial ? "등록하고 체험 신청하기" : "등록 신청하기"}
          </button>
          <p className="text-[11px] text-[#665036] text-center">신청 후 확인을 거쳐 가이드에 노출됩니다.</p>
        </div>

      </div>
      <OwnerSignupModal open={showTrial} onClose={() => setShowTrial(false)} trial prefillCafe={newCafe} source="cafe_register" />
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
