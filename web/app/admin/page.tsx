"use client";
import { useState } from "react";
import BackLink from "../BackLink";

type Cafe = {
  id: number; name: string; area: string; note: string; beans: string;
  signature: string; uses: string; phone: string; source: string; published: boolean;
};
type Consent = { total: number; agreed: number; located: number; last7d: number; topRegions: { region: string; n: number }[] };

export default function AdminPage() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [msg, setMsg] = useState("");
  const [showAuto, setShowAuto] = useState(false);

  const load = async (password: string) => {
    setMsg("불러오는 중...");
    const r = await fetch("/api/admin/cafes", { headers: { "x-admin-password": password } });
    if (r.status === 401) { setMsg("비밀번호가 틀렸습니다."); return; }
    const d = await r.json();
    if (d.ok) { setCafes(d.cafes); setAuthed(true); setMsg(""); }
    else setMsg("오류: " + d.error);
    fetch("/api/consent").then((x) => x.json()).then((c) => { if (c.ok) setConsent(c); }).catch(() => {});
  };

  const act = async (id: number, action: string, published?: boolean) => {
    await fetch("/api/admin/cafes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": pw },
      body: JSON.stringify({ id, action, published }),
    });
    load(pw);
  };

  if (!authed) {
    return (
      <main className="min-h-screen bg-stone-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-sm">
          <h1 className="text-xl font-bold mb-4">관리자</h1>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(pw)}
            placeholder="비밀번호" className="w-full border rounded-lg px-3 py-2.5 mb-3" />
          <button onClick={() => load(pw)} className="w-full bg-stone-900 text-white rounded-lg py-2.5 font-medium">들어가기</button>
          {msg && <p className="text-sm text-red-600 mt-3">{msg}</p>}
        </div>
      </main>
    );
  }

  const ownerPending = cafes.filter((c) => !c.published && c.source === "owner");
  const autoHidden = cafes.filter((c) => !c.published && c.source !== "owner");
  const live = cafes.filter((c) => c.published);

  const Row = ({ c }: { c: Cafe }) => (
    <div className="bg-white rounded-xl p-4 border flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-bold">{c.name}</span>
          <span className="text-xs text-stone-400">{c.area}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.source === "owner" ? "bg-blue-100 text-blue-700" : c.source === "seed" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500"}`}>{c.source}</span>
        </div>
        {c.note && <p className="text-sm text-stone-600 mt-1">{c.note}</p>}
        <p className="text-xs text-stone-400 mt-1">{c.beans} · {c.signature} · {c.uses} · {c.phone}</p>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button onClick={() => act(c.id, "publish", !c.published)}
          className={`text-xs px-3 py-1.5 rounded-lg ${c.published ? "bg-stone-200 text-stone-700" : "bg-emerald-600 text-white"}`}>
          {c.published ? "숨기기" : "공개하기"}
        </button>
        <button onClick={() => { if (confirm(`${c.name} 삭제?`)) act(c.id, "delete"); }}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600">삭제</button>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-stone-100 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <BackLink to="/" label="홈" className="text-stone-500" />
          <h1 className="text-2xl font-bold">카페 관리</h1>
        </div>

        {consent && (
          <section className="mb-8">
            <h2 className="text-sm font-bold text-stone-500 mb-3">📍 위치 동의 현황</h2>
            <div className="bg-white rounded-xl p-4 border">
              <div className="grid grid-cols-4 gap-2 text-center mb-3">
                <div><div className="text-xl font-bold text-stone-900">{consent.total}</div><div className="text-[11px] text-stone-400">전체</div></div>
                <div><div className="text-xl font-bold text-emerald-600">{consent.agreed}</div><div className="text-[11px] text-stone-400">동의</div></div>
                <div><div className="text-xl font-bold text-stone-900">{consent.located}</div><div className="text-[11px] text-stone-400">위치확인</div></div>
                <div><div className="text-xl font-bold text-amber-600">{consent.last7d}</div><div className="text-[11px] text-stone-400">최근7일</div></div>
              </div>
              {consent.topRegions.length > 0 && (
                <div className="border-t pt-3">
                  <div className="text-[11px] text-stone-400 mb-1.5">동네별 (상위)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {consent.topRegions.map((r) => (
                      <span key={r.region} className="text-xs bg-stone-100 text-stone-600 rounded-full px-2.5 py-1">{r.region} <b className="text-stone-900">{r.n}</b></span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-stone-400 mt-2.5">익명 식별자 기준 · 좌표는 ≈500m로 익명화 저장 · 개인 식별정보 미수집</p>
            </div>
          </section>
        )}

        {/* 1) 사장님이 직접 등록 → 사람이 검수해서 공개/거절 */}
        <section className="mb-8">
          <h2 className="text-sm font-bold text-stone-700 mb-1">🙋 사장님 등록 검수 대기 ({ownerPending.length})</h2>
          <p className="text-[11px] text-stone-400 mb-3">사장님이 <b>/cafe/register</b>로 직접 등록한 가게. 확인 후 공개/삭제하세요.</p>
          {ownerPending.length === 0 ? <p className="text-sm text-stone-400 bg-white rounded-xl p-4 border">아직 사장님 직접 등록 신청이 없습니다.</p> :
            <div className="space-y-2">{ownerPending.map((c) => <Row key={c.id} c={c} />)}</div>}
        </section>

        {/* 2) 자동수집 중 데이터 부족(발굴)으로 자동 비공개 — 사람 요청 아님 */}
        <section className="mb-8">
          <h2 className="text-sm font-bold text-stone-700 mb-1">🔍 자동수집 미공개 · 데이터 부족 ({autoHidden.length})</h2>
          <p className="text-[11px] text-stone-400 mb-3">시스템이 모았지만 <b>검증 리뷰 5건 미만(발굴 등급)</b>이라 자동 비공개. 사람이 요청한 게 아니에요. 리뷰가 쌓이면 자동 공개됩니다.</p>
          {autoHidden.length === 0 ? <p className="text-sm text-stone-400">없음</p> : (
            <>
              <button onClick={() => setShowAuto((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 mb-3">{showAuto ? "접기 ▲" : `목록 펼치기 ▼ (${autoHidden.length})`}</button>
              {showAuto && <div className="space-y-2">{autoHidden.map((c) => <Row key={c.id} c={c} />)}</div>}
            </>
          )}
        </section>

        <section>
          <h2 className="text-sm font-bold text-stone-700 mb-3">✅ 공개 중 ({live.length})</h2>
          <div className="space-y-2">{live.map((c) => <Row key={c.id} c={c} />)}</div>
        </section>
      </div>
    </main>
  );
}
