"use client";
import { useEffect, useState } from "react";

// 📇 아웃리치 콘솔 — "내가 뭘 어떻게 해야 되는지" 한 화면에서 끝내는 곳(2026-08-29 CEO 지시).
//   기존: 100줄짜리 마크다운을 열어 → 핸들 찾고 → 문구 복사하고 → 인스타 열고 → 붙여넣고 → 어디까지 보냈는지 기억.
//   지금: 카드 한 장에 [문구 복사] [인스타 열기] [보냈음] 세 버튼. 진행률과 도착 여부가 같이 보인다.
//
// ⚠️ 발송은 사람이 한다. 이 화면은 **문구·링크·진행 기록**만 다룬다(자동 발송 없음).

type Item = {
  id: number; name: string; area: string; dong: string | null; handle: string;
  rank: number; areaN: number; count: number; strength: string | null;
  message: string; link: string; instagram: string; sentAt: string | null; visits: number;
};

const DAILY_CAP = 12; // 하루 권장 상한 — 같은 링크 대량 DM은 인스타 스팸 처리 위험

export default function OutreachPage() {
  const [pw, setPw] = useState("");
  const [data, setData] = useState<{ todaySent: number; total: number; sentTotal: number; list: Item[] } | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [showSent, setShowSent] = useState(false);

  useEffect(() => { const s = sessionStorage.getItem("dcn_admin_pw"); if (s) { setPw(s); load(s); } }, []);

  const load = (password: string) => {
    setErr("");
    fetch("/api/admin/outreach", { headers: { "x-admin-password": password }, cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) { setData(d); sessionStorage.setItem("dcn_admin_pw", password); } else setErr("비밀번호가 맞지 않습니다"); })
      .catch(() => setErr("불러오지 못했습니다"));
  };

  const mark = (id: number, undo = false) => {
    fetch("/api/admin/outreach", {
      method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": pw },
      body: JSON.stringify({ cafeId: id, channel: "dm", undo }),
    }).then(() => load(pw)).catch(() => {});
  };

  const copy = (t: Item) => {
    navigator.clipboard.writeText(t.message).then(() => { setCopied(t.id); setTimeout(() => setCopied(null), 1500); }).catch(() => {});
  };

  if (!data) {
    return (
      <main className="min-h-screen bg-[#f7f3ec] p-6 flex flex-col items-center justify-center gap-3">
        <h1 className="font-bold text-stone-800">📇 아웃리치 콘솔</h1>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(pw)} placeholder="관리자 비밀번호"
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm w-64" />
        <button onClick={() => load(pw)} className="bg-stone-800 text-white rounded-lg px-4 py-2 text-sm font-bold">들어가기</button>
        {err && <p className="text-rose-600 text-sm">{err}</p>}
      </main>
    );
  }

  const pending = data.list.filter((t) => !t.sentAt);
  const sent = data.list.filter((t) => t.sentAt);
  const left = Math.max(0, DAILY_CAP - data.todaySent);
  const arrived = sent.filter((t) => t.visits > 0).length;

  return (
    <main className="min-h-screen bg-[#f7f3ec] pb-16">
      <div className="sticky top-0 bg-[#f7f3ec] border-b border-stone-200 px-4 py-3 z-10">
        <h1 className="font-bold text-stone-800 text-[15px]">📇 아웃리치 콘솔</h1>
        <p className="text-[12px] text-stone-700 mt-1">
          오늘 <b>{data.todaySent}</b>건 보냄 · 오늘 <b className={left === 0 ? "text-rose-600" : "text-emerald-700"}>{left}건</b> 남음(권장 {DAILY_CAP})
          {" · "}누적 {data.sentTotal}/{data.total}
          {sent.length > 0 && <> · 열어본 사장님 <b>{arrived}</b>명</>}
        </p>
        {left === 0 && <p className="text-[11px] text-rose-600 mt-1">오늘 권장량을 채웠습니다. 내일 이어서 하시는 게 안전합니다(스팸 처리 위험).</p>}
      </div>

      <div className="px-4 pt-3">
        {pending.slice(0, 30).map((t) => (
          <div key={t.id} className="bg-white rounded-xl border border-stone-200 p-4 mb-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold text-stone-800 text-[14px]">{t.name}</span>
              <span className="text-[11px] text-stone-500">@{t.handle}</span>
            </div>
            <p className="text-[11.5px] text-stone-600 mt-0.5">
              {t.area}{t.dong ? ` ${t.dong}` : ""} · {t.area} {t.areaN}곳 중 <b>{t.rank}위</b> · 검증 후기 {t.count}건
              {t.strength ? ` · 강점 ${t.strength}` : ""}
            </p>
            <pre className="whitespace-pre-wrap text-[11.5px] text-stone-700 bg-stone-50 rounded-lg p-3 mt-2 leading-relaxed">{t.message}</pre>
            <div className="flex gap-2 mt-3">
              <button onClick={() => copy(t)} className="flex-1 py-2 text-[12.5px] font-bold rounded-lg bg-stone-800 text-white active:scale-95">
                {copied === t.id ? "✓ 복사됨" : "① 문구 복사"}
              </button>
              <a href={t.instagram} target="_blank" rel="noreferrer"
                className="flex-1 py-2 text-[12.5px] font-bold rounded-lg bg-[#e8b87a] text-[#2b2018] text-center active:scale-95">
                ② 인스타 열기
              </a>
              <button onClick={() => mark(t.id)} className="flex-1 py-2 text-[12.5px] font-bold rounded-lg border border-stone-300 text-stone-700 active:scale-95">
                ③ 보냈음
              </button>
            </div>
          </div>
        ))}
        {pending.length === 0 && <p className="text-center text-stone-600 text-sm py-8">보낼 대상이 없습니다.</p>}
      </div>

      {sent.length > 0 && (
        <div className="px-4 mt-4">
          <button onClick={() => setShowSent(!showSent)} className="w-full text-left text-[12.5px] font-bold text-stone-700 py-2">
            {showSent ? "▾" : "▸"} 보낸 것 {sent.length}건 (열어본 곳 {arrived})
          </button>
          {showSent && sent.map((t) => (
            <div key={t.id} className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-2 mb-1.5 text-[12px]">
              <span className="text-stone-700">
                {t.visits > 0 ? "🟢" : "⚪"} {t.name} <span className="text-stone-500">@{t.handle}</span>
                {t.visits > 0 && <b className="text-emerald-700"> · 열어봄 {t.visits}회</b>}
              </span>
              <button onClick={() => mark(t.id, true)} className="text-[11px] text-stone-500 underline">되돌리기</button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
