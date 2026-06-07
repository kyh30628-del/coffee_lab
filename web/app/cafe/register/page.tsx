"use client";
import { useState, useEffect } from "react";
import BackLink from "../../BackLink";
import Showcase from "../../Showcase";

const USE_OPTIONS = ["작업", "혼자", "수다", "빵", "사진", "단골"];

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: "", area: "", address: "", phone: "", hours: "",
    roasts_own: false, beans: "", signature: "", vibe: "", note: "", price_hint: "",
  });
  const [uses, setUses] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  // 쇼케이스(사장님 인증 시): 내 카페 검색 → 선택 → 편집기
  const [ownerPw, setOwnerPw] = useState<string | null>(null);
  const [scQ, setScQ] = useState("");
  const [scResults, setScResults] = useState<{ id: number; name: string; area: string }[]>([]);
  const [scCafe, setScCafe] = useState<{ id: number; name: string } | null>(null);
  useEffect(() => { try { setOwnerPw(sessionStorage.getItem("dcn_owner_pw")); } catch {} }, []);
  const scSearch = async () => {
    if (!scQ.trim() || !ownerPw) return;
    try { const r = await fetch(`/api/cafe-find?q=${encodeURIComponent(scQ.trim())}`, { headers: { "x-admin-password": ownerPw } }); const d = await r.json(); setScResults((d.rows ?? []).filter((c: any) => c.published).slice(0, 8)); } catch {}
  };

  const set = (k: string, v: string | boolean) => setForm({ ...form, [k]: v });
  const toggleUse = (u: string) => setUses((c) => (c.includes(u) ? c.filter((x) => x !== u) : [...c, u]));

  const submit = async () => {
    if (!form.name.trim()) { setErr("카페 이름을 입력해주세요."); return; }
    setStatus("sending"); setErr("");
    try {
      const r = await fetch("/api/cafe-submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, uses }),
      });
      const d = await r.json();
      if (d.ok) setStatus("done");
      else { setStatus("error"); setErr(d.error ?? "오류가 발생했습니다."); }
    } catch { setStatus("error"); setErr("네트워크 오류. 다시 시도해주세요."); }
  };

  const field = "w-full bg-white border border-[#d9c9b0] rounded-lg px-3.5 py-2.5 text-[15px] focus:border-[#9c6b3f] focus:outline-none";

  if (status === "done") {
    return (
      <main className="min-h-screen bg-[#f4ece0] text-[#2b2018] flex items-center justify-center p-6" style={{ fontFamily: "'Gowun Batang', serif" }}>
        <div className="bg-[#fdfaf4] rounded-2xl p-10 text-center max-w-md border border-[#ece0cd]">
          <div className="text-4xl mb-4">☕</div>
          <h1 className="text-2xl font-bold mb-3">등록 신청이 접수됐어요</h1>
          <p className="text-[#6b5a48] leading-relaxed">
            보내주신 정보를 확인한 뒤 가이드에 실어드릴게요.
            커피를 아는 사람들에게 사장님 가게가 제대로 소개되도록 정성껏 다듬겠습니다.
          </p>
          <a href="/cafe" className="inline-block mt-6 text-[#9c6b3f] underline text-sm">가이드 둘러보기 →</a>
        </div>
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-xl mx-auto px-6 py-12">
        <header className="mb-8">
          <BackLink to="/" label="홈" className="text-[#9c6b3f] mb-4" />
          <div className="text-[#9c6b3f] text-xs tracking-[0.4em] uppercase mb-3">For Owners</div>
          <h1 className="text-3xl font-bold leading-tight">사장님, 가게를 소개해주세요</h1>
          <p className="text-[#6b5a48] mt-3 leading-relaxed text-[15px]">
            별점·광고가 아니라, 커피를 아는 손님에게 우리 가게의 결을 전하는 안내입니다.
            아래를 채워주시면 확인 후 동네 가이드에 실어드려요. (무료)
          </p>
        </header>

        <div className="space-y-5">
          <div>
            <label className="block text-sm text-[#9c6b3f] mb-1.5">카페 이름 *</label>
            <input className={field} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="예) 커피볶는아침" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-[#9c6b3f] mb-1.5">동네</label>
              <input className={field} value={form.area} onChange={(e) => set("area", e.target.value)} placeholder="예) 강동역" />
            </div>
            <div>
              <label className="block text-sm text-[#9c6b3f] mb-1.5">전화</label>
              <input className={field} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="02-000-0000" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-[#9c6b3f] mb-1.5">주소</label>
            <input className={field} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="서울 강동구 ..." />
          </div>
          <div>
            <label className="block text-sm text-[#9c6b3f] mb-1.5">영업시간</label>
            <input className={field} value={form.hours} onChange={(e) => set("hours", e.target.value)} placeholder="평일 08:00–20:00" />
          </div>

          <div className="flex items-center gap-2 py-1">
            <input type="checkbox" id="roast" checked={form.roasts_own} onChange={(e) => set("roasts_own", e.target.checked)} className="w-4 h-4 accent-[#9c6b3f]" />
            <label htmlFor="roast" className="text-[15px]">직접 로스팅합니다</label>
          </div>

          <div>
            <label className="block text-sm text-[#9c6b3f] mb-1.5">취급 원두 / 산지</label>
            <input className={field} value={form.beans} onChange={(e) => set("beans", e.target.value)} placeholder="예) 에티오피아, 콜롬비아, 과테말라 (산지별 선택 가능)" />
          </div>
          <div>
            <label className="block text-sm text-[#9c6b3f] mb-1.5">대표·추천 메뉴</label>
            <input className={field} value={form.signature} onChange={(e) => set("signature", e.target.value)} placeholder="예) 핸드드립 (원두 선택)" />
          </div>
          <div>
            <label className="block text-sm text-[#9c6b3f] mb-1.5">가격 안내</label>
            <input className={field} value={form.price_hint} onChange={(e) => set("price_hint", e.target.value)} placeholder="예) 핸드드립 6,000원~" />
          </div>
          <div>
            <label className="block text-sm text-[#9c6b3f] mb-1.5">어떤 분위기인가요</label>
            <input className={field} value={form.vibe} onChange={(e) => set("vibe", e.target.value)} placeholder="예) 작고 조용한 골목 로스터리" />
          </div>

          <div>
            <label className="block text-sm text-[#9c6b3f] mb-2">어떤 손님에게 어울리나요</label>
            <div className="flex flex-wrap gap-2">
              {USE_OPTIONS.map((u) => (
                <button key={u} type="button" onClick={() => toggleUse(u)}
                  className={`px-3.5 py-2 rounded-full text-sm border transition-colors ${uses.includes(u) ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-transparent text-[#6b5a48] border-[#cbb89f] hover:border-[#9c6b3f]"}`}>
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-[#9c6b3f] mb-1.5">손님에게 한마디</label>
            <textarea className={`${field} h-24 resize-none`} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="우리 가게 커피를 한 문장으로 소개한다면?" />
          </div>

          {err && <p className="text-red-700 text-sm">{err}</p>}

          <button onClick={submit} disabled={status === "sending"}
            className="w-full bg-[#2b2018] text-[#f4ece0] rounded-lg py-3.5 font-medium hover:bg-[#3d2f22] transition-colors disabled:opacity-50">
            {status === "sending" ? "보내는 중..." : "등록 신청하기"}
          </button>
          <p className="text-[11px] text-[#a8927a] text-center">신청 후 확인을 거쳐 가이드에 노출됩니다.</p>
        </div>

        {/* 🎀 쇼케이스 — 사장님 인증 시 */}
        <div className="mt-10 pt-8 border-t border-[#ddd0bb]">
          <div className="text-[#9c6b3f] text-xs tracking-[0.3em] uppercase mb-2">Showcase · 홍보</div>
          <h2 className="text-2xl font-bold mb-1">🎀 우리 가게 쇼케이스</h2>
          <p className="text-[#6b5a48] text-[14px] leading-relaxed mb-4">가이드에 있는 내 카페를 골라, 글·사진으로 <b>AI 홍보물</b>을 만들어 카페 상세 맨 위에 노출하세요. <span className="text-[#9c6b3f]">(구독 미리보기 · 관리자 승인 후 노출)</span></p>
          {!ownerPw ? (
            <div className="bg-[#fdfaf4] border border-[#ece0cd] rounded-xl p-4 text-[13px] text-[#6b5a48]">사장님 인증 후 이용할 수 있어요. 홈 랜딩에서 <b>‘사장님으로 시작하기’</b>로 입장한 뒤 다시 와주세요.</div>
          ) : scCafe ? (
            <div>
              <button onClick={() => { setScCafe(null); setScResults([]); }} className="text-xs text-[#9c6b3f] underline mb-3">← 다른 카페 선택</button>
              <Showcase cafeId={scCafe.id} cafeName={scCafe.name} pw={ownerPw} />
            </div>
          ) : (
            <div>
              <div className="flex gap-2 mb-3">
                <input value={scQ} onChange={(e) => setScQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && scSearch()} placeholder="내 카페 이름 검색" className={field} />
                <button onClick={scSearch} className="bg-[#2b2018] text-[#f4ece0] rounded-lg px-6 font-medium shrink-0">검색</button>
              </div>
              <div className="space-y-2">
                {scResults.map((c) => (
                  <button key={c.id} onClick={() => setScCafe({ id: c.id, name: c.name })} className="w-full text-left bg-white rounded-lg p-3 border border-[#ece0cd] hover:border-[#9c6b3f]">
                    <span className="font-bold text-sm">{c.name}</span><span className="text-xs text-[#a8927a] ml-2">{c.area}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
