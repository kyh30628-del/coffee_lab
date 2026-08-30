"use client";
import { useEffect, useState, useCallback } from "react";

// 📇 아웃리치 콘솔 — "내가 뭘 어떻게 해야 되는지"를 한 화면에서 끝낸다(2026-08-29~30 CEO 지시).
//
// 2026-08-30 재설계 — CEO: "클릭 몇 번으로 다 끝낼 수 있는 가장 자동화된 상태로."
//   ① 카드 30장을 늘어놓지 않고 **한 번에 한 곳만** 보여준다(반복 작업은 목록보다 한 장씩이 빠르다).
//   ② [복사 + DM 열기]를 **한 버튼**으로 합쳤다 — 클립보드에 넣고 동시에 대화창을 연다.
//   ③ 링크를 프로필이 아니라 **ig.me/m/{handle}**(DM 대화창 직행)로 바꿨다.
//      프로필로 열면 매번 [메시지] 버튼을 찾아 눌러야 한다 — 100건이면 그 클릭만 100번이다.
//   ④ [보냈음]을 누르면 **자동으로 다음 곳**으로 넘어간다.
//   → 한 곳당 클릭 2번(복사+열기 → 보냈음). 그 사이 인스타 탭에서 붙여넣기·전송만 하면 된다.
//
// ⚠️ 발송은 사람이 한다. 자동 발송은 인스타가 막고 계정이 정지된다. 이 화면은 문구·링크·기록만 다룬다.

type Item = {
  id: number; name: string; area: string; dong: string | null; handle: string;
  rank: number; areaN: number; count: number; strength: string | null;
  message: string; link: string; instagram: string; profile?: string;
  sentAt: string | null; visits: number;
};

// 🛑 2026-08-30 CEO 판단으로 12 → 5. 리스크 대비 보상 계산 결과 대량 발송은 수지가 안 맞는다.
//   보상: 100건 → 유료 0~1곳 = 연 11.9만원. 위험: 과태료(정보통신망법 §50)·인스타 계정 정지·
//   '스팸 업체' 각인(우리 고객이 될 사람들이다). → 10건만 보내 **반응률만 확인**하고 판단한다.
const DAILY_CAP = 5;

export default function OutreachPage() {
  const [pw, setPw] = useState("");
  const [data, setData] = useState<{ todaySent: number; total: number; sentTotal: number; list: Item[] } | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback((password: string) => {
    setErr("");
    fetch("/api/admin/outreach", { headers: { "x-admin-password": password }, cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) { setData(d); sessionStorage.setItem("dcn_admin_pw", password); } else setErr("비밀번호가 맞지 않습니다"); })
      .catch(() => setErr("불러오지 못했습니다"));
  }, []);

  useEffect(() => { const s = sessionStorage.getItem("dcn_admin_pw"); if (s) { setPw(s); load(s); } }, [load]);

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
  const arrived = sent.filter((t) => t.visits > 0).length;
  const left = Math.max(0, DAILY_CAP - data.todaySent);
  const cur = pending[Math.min(idx, Math.max(0, pending.length - 1))];

  // ① 복사 + DM 대화창 열기를 한 번에. 팝업 차단을 피하려고 클릭 핸들러 안에서 바로 연다.
  const copyAndOpen = (t: Item) => {
    try { navigator.clipboard.writeText(t.message); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* 클립보드 실패해도 창은 연다 */ }
    window.open(t.instagram, "_blank", "noopener");
  };

  // ② 보냈음 → 기록하고 자동으로 다음 곳
  const markSent = (t: Item) => {
    setBusy(true);
    fetch("/api/admin/outreach", {
      method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": pw },
      body: JSON.stringify({ cafeId: t.id, channel: "dm" }),
    }).then(() => { setIdx(0); setCopied(false); load(pw); }).finally(() => setBusy(false));
  };

  return (
    <main className="min-h-screen bg-[#f7f3ec] pb-16">
      <div className="sticky top-0 bg-[#f7f3ec] border-b border-stone-200 px-4 py-3 z-10">
        <h1 className="font-bold text-stone-800 text-[15px]">📇 아웃리치 콘솔</h1>
        <p className="text-[12px] text-stone-700 mt-1">
          오늘 <b>{data.todaySent}</b>건 · 오늘 <b className={left === 0 ? "text-rose-600" : "text-emerald-700"}>{left}건</b> 남음
          {" · "}누적 {data.sentTotal}/{data.total}
          {sent.length > 0 && <> · <b className="text-emerald-700">열어본 사장님 {arrived}명</b></>}
        </p>
        {left === 0 && <p className="text-[11px] text-rose-600 mt-1">오늘 권장량을 채웠습니다. 내일 이어서 하시는 게 안전합니다(스팸 처리 위험).</p>}
      </div>

      <div className="px-4 pt-4">
        {!cur ? (
          <p className="text-center text-stone-600 text-sm py-10">보낼 대상이 없습니다.</p>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-300 p-5 shadow-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold text-stone-900 text-[16px]">{cur.name}</span>
              <span className="text-[11px] text-stone-500">{pending.length}곳 남음</span>
            </div>
            <p className="text-[12px] text-stone-600 mt-1">
              {cur.area}{cur.dong ? ` ${cur.dong}` : ""} · {cur.areaN}곳 중 <b className="text-stone-800">{cur.rank}위</b>
              {" · "}검증 후기 {cur.count}건{cur.strength ? ` · 강점 ${cur.strength}` : ""}
            </p>
            <p className="text-[11.5px] text-stone-500 mt-0.5">
              보낼 곳 <a href={cur.profile ?? cur.instagram} target="_blank" rel="noreferrer" className="underline">@{cur.handle}</a>
            </p>

            <pre className="whitespace-pre-wrap text-[12px] text-stone-700 bg-stone-50 rounded-xl p-3.5 mt-3 leading-relaxed border border-stone-200">{cur.message}</pre>

            <button onClick={() => copyAndOpen(cur)}
              className="w-full mt-4 py-3.5 text-[14px] font-bold rounded-xl bg-stone-900 text-white active:scale-[0.99]">
              {copied ? "✓ 복사됨 — 인스타 탭에서 붙여넣기(⌘V) 후 전송" : "① 문구 복사 + DM 창 열기"}
            </button>
            <button onClick={() => markSent(cur)} disabled={busy}
              className="w-full mt-2 py-3 text-[13.5px] font-bold rounded-xl bg-[#e8b87a] text-[#2b2018] active:scale-[0.99] disabled:opacity-50">
              {busy ? "기록 중…" : "② 보냈음 → 다음 곳으로"}
            </button>
            <button onClick={() => setIdx((i) => i + 1)}
              className="w-full mt-2 py-2 text-[12px] text-stone-500 underline">
              이 곳은 건너뛰기
            </button>
          </div>
        )}
      </div>

      {sent.length > 0 && (
        <div className="px-4 mt-5">
          <p className="text-[12px] font-bold text-stone-700 mb-2">보낸 곳 {sent.length}건 · 열어본 곳 {arrived}</p>
          {sent.slice(0, 20).map((t) => (
            <div key={t.id} className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-2 mb-1.5 text-[12px]">
              <span className="text-stone-700">
                {t.visits > 0 ? "🟢" : "⚪"} {t.name}
                {t.visits > 0 && <b className="text-emerald-700"> · 열어봄 {t.visits}회</b>}
              </span>
              <button onClick={() => { setBusy(true); fetch("/api/admin/outreach", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": pw }, body: JSON.stringify({ cafeId: t.id, undo: true }) }).then(() => load(pw)).finally(() => setBusy(false)); }}
                className="text-[11px] text-stone-500 underline">되돌리기</button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
