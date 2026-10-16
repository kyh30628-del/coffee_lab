"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

// 📈 접속자 전체 현황 — 월별 누적 + 전국 230개 지역 전수(2026-10-16, CEO 지시).
//   관제탑 본체는 '지금 상태', 이 화면은 '흐름과 전국 분포'를 본다.
//   ⚠️ 숫자는 열 때마다 실시간 재집계(캐시 없음) — 관제탑 규칙: 화면이 옛 숫자를 보이면 안 된다.
type Monthly = { m: string; people: number; pv: number; naver: number; google: number; ai: number; repeat: number };
type Region = { region: string; cafes: number; people: number; pv: number };

export default function TrafficPage() {
  const [pw, setPw] = useState("");
  const [data, setData] = useState<{ monthly: Monthly[]; byRegion: Region[]; totals: any } | null>(null);
  const [err, setErr] = useState("");
  const [onlyZero, setOnlyZero] = useState(false);

  useEffect(() => { try { const p = localStorage.getItem("dcn_admin_pw"); if (p) { setPw(p); load(p); } } catch {} }, []);

  const load = (p: string) => {
    setErr("");
    fetch("/api/admin/traffic-monthly", { headers: { "x-admin-password": p }, cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) { setData(d); try { localStorage.setItem("dcn_admin_pw", p); } catch {} } else setErr("비밀번호가 맞지 않습니다"); })
      .catch(() => setErr("불러오지 못했습니다"));
  };

  const n = (v: number) => (v ?? 0).toLocaleString();
  const rows = data?.byRegion ?? [];
  const shown = onlyZero ? rows.filter((r) => r.people === 0) : rows;
  const maxPeople = Math.max(1, ...(data?.monthly ?? []).map((m) => m.people));

  return (
    <main className="min-h-screen bg-stone-50 px-3 py-4 max-w-[760px] mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Link href="/admin" className="text-[13px] text-stone-600">← 관제탑</Link>
        <h1 className="text-[17px] font-extrabold text-stone-800">📈 접속자 전체 현황</h1>
      </div>

      {!data && (
        <div className="bg-white rounded-xl border border-stone-300 p-4">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="관리자 비밀번호"
            onKeyDown={(e) => e.key === "Enter" && load(pw)}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-[14px] mb-2" />
          <button onClick={() => load(pw)} className="w-full bg-stone-800 text-white rounded-lg py-2 text-[14px] font-bold">열기</button>
          {err && <p className="text-[12px] text-red-600 mt-2">{err}</p>}
        </div>
      )}

      {data && (
        <>
          {/* 월별 누적 */}
          <section className="bg-white rounded-xl border border-stone-300 p-3 mb-3">
            <h2 className="text-[13px] font-bold text-stone-800 mb-2">월별 접속자</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-stone-600 border-b border-stone-200">
                    <th className="text-left py-1.5">월</th>
                    <th className="text-right">순방문</th>
                    <th className="text-right">재방문</th>
                    <th className="text-right">PV</th>
                    <th className="text-right">네이버</th>
                    <th className="text-right">구글</th>
                    <th className="text-right">AI</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly.map((m) => (
                    <tr key={m.m} className="border-b border-stone-100">
                      <td className="py-1.5 font-semibold text-stone-800">{m.m}</td>
                      <td className="text-right font-bold text-sky-700">{n(m.people)}</td>
                      <td className="text-right text-stone-700">{n(m.repeat)}<span className="text-stone-500"> ({m.people ? Math.round((m.repeat / m.people) * 100) : 0}%)</span></td>
                      <td className="text-right text-stone-700">{n(m.pv)}</td>
                      <td className="text-right text-stone-700">{n(m.naver)}</td>
                      <td className="text-right text-stone-700">{n(m.google)}</td>
                      <td className="text-right text-stone-700">{n(m.ai)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* 막대로 흐름 한눈에 */}
            <div className="flex items-end gap-2 h-20 mt-3">
              {data.monthly.map((m) => (
                <div key={m.m} className="flex-1 flex flex-col items-center justify-end">
                  <div className="w-full bg-sky-500 rounded-t" style={{ height: `${(m.people / maxPeople) * 100}%` }} />
                  <span className="text-[9px] text-stone-600 mt-0.5">{m.m.slice(5)}월</span>
                </div>
              ))}
            </div>
            <p className="text-[10.5px] text-stone-600 mt-2">사람 증거(검색유입·2페이지·재방문·모바일) 있는 방문만 셉니다. 이번 달은 집계 중이라 더 오릅니다.</p>
          </section>

          {/* 전국 지역 전수 */}
          <section className="bg-white rounded-xl border border-stone-300 p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[13px] font-bold text-stone-800">전국 지역별 (최근 90일)</h2>
              <button onClick={() => setOnlyZero(!onlyZero)}
                className={`text-[11px] rounded-full px-2.5 py-1 border ${onlyZero ? "bg-amber-50 border-amber-400 text-amber-800" : "bg-white border-stone-300 text-stone-700"}`}>
                유입 0 지역만 {data.totals.regionsZero}곳
              </button>
            </div>
            <p className="text-[11px] text-stone-600 mb-2">
              지역 {n(data.totals.regions)}곳 · 공개 카페 {n(data.totals.cafes)} · <b className="text-emerald-700">유입 있는 지역 {n(data.totals.regionsWithTraffic)}</b> · <b className="text-amber-700">0인 지역 {n(data.totals.regionsZero)}</b>
            </p>
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-stone-600 border-b border-stone-200">
                    <th className="text-left py-1.5">지역</th>
                    <th className="text-right">카페</th>
                    <th className="text-right">방문자</th>
                    <th className="text-right">PV</th>
                    <th className="text-right">카페당</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.region} className="border-b border-stone-100">
                      <td className="py-1.5 text-stone-800">{r.region}</td>
                      <td className="text-right text-stone-700">{n(r.cafes)}</td>
                      <td className={`text-right font-bold ${r.people === 0 ? "text-amber-700" : "text-sky-700"}`}>{n(r.people)}</td>
                      <td className="text-right text-stone-700">{n(r.pv)}</td>
                      <td className="text-right text-stone-600">{r.cafes ? (r.people / r.cafes).toFixed(2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
