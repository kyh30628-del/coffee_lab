"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// 📈 접속자 전체 현황 — 월별 누적 · 패턴 · 전국 지역 전수(2026-10-16, CEO 지시).
//   설계 기준: "보기 좋은 숫자"가 아니라 **대표님이 결정을 내릴 수 있는 숫자**만 올린다.
//     · 발굴 쿼터를 어디에 쓸까 → 지역별 '카페당 사람' (ROI). 카페는 많은데 사람이 없으면 더 넣어도 소용없다.
//     · SEO가 값을 만드나 → 사람/봇 분리. 봇만 긁고 사람이 안 오면 페이지만 늘린 것이다.
//     · 어디가 살아나나 → 최근 30일 vs 직전 30일 증감.
//   ⚠️ 모든 수치 실시간 재집계(캐시 없음) — 관제탑 규칙: 화면이 옛 숫자를 보이면 안 된다.
type Monthly = { m: string; people: number; pv: number; naver: number; google: number; ai: number; repeat: number; bots: number; botPv: number };
type Region = { region: string; cafes: number; people: number; pv: number; bots: number; botPv: number; perCafe: number; cur: number; prev: number; delta: number };
type Dow = { dow: number; people: number; pv: number };
type Hour = { h: number; people: number; pv: number };
type Depth = { people: number; one_page: number; three_plus: number; avg_pv: number };
type SortKey = keyof Pick<Region, "region" | "cafes" | "people" | "pv" | "bots" | "perCafe" | "delta">;

export default function TrafficPage() {
  const [pw, setPw] = useState("");
  const [data, setData] = useState<{ monthly: Monthly[]; byRegion: Region[]; totals: any; byDow: Dow[]; byHour: Hour[]; depth: Depth | null } | null>(null);
  const [err, setErr] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("people");
  const [asc, setAsc] = useState(false);
  const [q, setQ] = useState("");
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
  const rows = useMemo(() => {
    let r = data?.byRegion ?? [];
    if (onlyZero) r = r.filter((x) => x.people === 0);
    if (q.trim()) r = r.filter((x) => x.region.includes(q.trim()));
    const dir = asc ? 1 : -1;
    return [...r].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [data, sortKey, asc, q, onlyZero]);

  const click = (k: SortKey) => { if (k === sortKey) setAsc(!asc); else { setSortKey(k); setAsc(false); } };
  const Th = ({ k, label, hint }: { k: SortKey; label: string; hint?: string }) => (
    <th onClick={() => click(k)} title={hint}
        className="py-1.5 px-1 cursor-pointer select-none hover:text-stone-900 whitespace-nowrap">
      {label}{sortKey === k ? (asc ? " ▲" : " ▼") : <span className="text-stone-400"> ⇅</span>}
    </th>
  );

  const maxPeople = Math.max(1, ...(data?.monthly ?? []).map((m) => m.people));

  return (
    <main className="min-h-screen bg-stone-50 px-3 py-4 max-w-[860px] mx-auto">
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
          {/* 월별 — 사람/봇 분리 */}
          <section className="bg-white rounded-xl border border-stone-300 p-3 mb-3">
            <h2 className="text-[13px] font-bold text-stone-800 mb-1">월별 — 사람 vs 봇</h2>
            <p className="text-[10.5px] text-stone-600 mb-2">봇만 늘고 사람이 안 늘면 페이지만 늘린 것입니다. 두 줄을 같이 보십시오.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-stone-600 border-b border-stone-200">
                    <th className="text-left py-1.5">월</th>
                    <th className="text-right">사람</th>
                    <th className="text-right">재방문</th>
                    <th className="text-right">사람PV</th>
                    <th className="text-right">봇</th>
                    <th className="text-right">봇PV</th>
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
                      <td className="text-right text-stone-500">{n(m.bots)}</td>
                      <td className="text-right text-stone-500">{n(m.botPv)}</td>
                      <td className="text-right text-stone-700">{n(m.naver)}</td>
                      <td className="text-right text-stone-700">{n(m.google)}</td>
                      <td className="text-right text-stone-700">{n(m.ai)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-end gap-2 h-20 mt-3">
              {data.monthly.map((m) => (
                <div key={m.m} className="flex-1 flex flex-col items-center justify-end">
                  <div className="w-full bg-sky-500 rounded-t" style={{ height: `${(m.people / maxPeople) * 100}%` }} />
                  <span className="text-[9px] text-stone-600 mt-0.5">{m.m.slice(5)}월</span>
                </div>
              ))}
            </div>
          </section>

          {/* 패턴 */}
          <section className="bg-white rounded-xl border border-stone-300 p-3 mb-3">
            <h2 className="text-[13px] font-bold text-stone-800 mb-2">접속 패턴 (최근 90일 · 사람만)</h2>
            <p className="text-[11px] font-semibold text-stone-700 mb-1">요일별</p>
            <div className="flex items-end gap-1.5 h-16 mb-3">
              {(() => { const mx = Math.max(1, ...(data.byDow ?? []).map((d) => d.people));
                return ["일", "월", "화", "수", "목", "금", "토"].map((lbl, i) => {
                  const v = (data.byDow ?? []).find((x) => x.dow === i)?.people ?? 0;
                  return (
                    <div key={lbl} className="flex-1 flex flex-col items-center justify-end">
                      <span className="text-[9px] text-stone-600">{v}</span>
                      <div className={`w-full rounded-t ${i === 0 || i === 6 ? "bg-amber-500" : "bg-sky-500"}`} style={{ height: `${(v / mx) * 100}%` }} />
                      <span className="text-[9px] text-stone-600 mt-0.5">{lbl}</span>
                    </div>); }); })()}
            </div>
            <p className="text-[11px] font-semibold text-stone-700 mb-1">시간대별 (KST)</p>
            <div className="flex items-end gap-[2px] h-16 mb-3">
              {(() => { const mx = Math.max(1, ...(data.byHour ?? []).map((d) => d.people));
                return Array.from({ length: 24 }, (_, h) => {
                  const v = (data.byHour ?? []).find((x) => x.h === h)?.people ?? 0;
                  return (
                    <div key={h} className="flex-1 flex flex-col items-center justify-end" title={`${h}시 ${v}명`}>
                      <div className="w-full bg-stone-700 rounded-t" style={{ height: `${(v / mx) * 100}%` }} />
                      {h % 6 === 0 && <span className="text-[8px] text-stone-600 mt-0.5">{h}</span>}
                    </div>); }); })()}
            </div>
            {data.depth && (
              <div className="rounded-lg bg-stone-50 border border-stone-200 p-2.5">
                <p className="text-[11px] font-semibold text-stone-700 mb-1">체류 깊이 — 재방문을 못 만드는 지점</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-stone-700">
                  <span>방문자 <b>{n(data.depth.people)}</b></span>
                  <span>한 페이지만 보고 이탈 <b className="text-amber-700">{n(data.depth.one_page)}</b> ({data.depth.people ? Math.round((data.depth.one_page / data.depth.people) * 100) : 0}%)</span>
                  <span>3페이지 이상 <b className="text-emerald-700">{n(data.depth.three_plus)}</b> ({data.depth.people ? Math.round((data.depth.three_plus / data.depth.people) * 100) : 0}%)</span>
                  <span>평균 PV <b>{data.depth.avg_pv}</b></span>
                </div>
              </div>
            )}
          </section>

          {/* 전국 지역 — 정렬 가능 */}
          <section className="bg-white rounded-xl border border-stone-300 p-3">
            <h2 className="text-[13px] font-bold text-stone-800 mb-1">전국 지역별 (최근 30일 · 열 제목을 눌러 정렬)</h2>
            <p className="text-[10.5px] text-stone-600 mb-2">
              <b>카페당</b> = 카페 1곳이 데려온 사람 수(발굴 ROI). 낮으면 더 캐도 사람이 안 옵니다.
              <b className="ml-2">증감</b> = 최근 30일 − 직전 30일.
            </p>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="지역 검색"
                className="border border-stone-300 rounded-lg px-2.5 py-1.5 text-[12px] flex-1 min-w-[120px]" />
              <button onClick={() => setOnlyZero(!onlyZero)}
                className={`text-[11px] rounded-full px-2.5 py-1 border ${onlyZero ? "bg-amber-50 border-amber-400 text-amber-800" : "bg-white border-stone-300 text-stone-700"}`}>
                사람 0 지역만 {data.totals.regionsZero}곳
              </button>
              <span className="text-[11px] text-stone-600">{rows.length}개 표시</span>
            </div>
            <p className="text-[11px] text-stone-600 mb-2">
              지역 {n(data.totals.regions)} · 공개 카페 {n(data.totals.cafes)} · <b className="text-emerald-700">사람 유입 있는 지역 {n(data.totals.regionsWithTraffic)}</b> · <b className="text-amber-700">0인 지역 {n(data.totals.regionsZero)}</b>
            </p>
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-white shadow-[0_1px_0_#e7e5e4]">
                  <tr className="text-stone-600">
                    <Th k="region" label="지역" />
                    <Th k="cafes" label="카페" hint="공개 카페 수" />
                    <Th k="people" label="사람" hint="순방문자(봇 제외)" />
                    <Th k="pv" label="사람PV" />
                    <Th k="bots" label="봇" hint="봇 방문자" />
                    <Th k="perCafe" label="카페당" hint="카페 1곳이 데려온 사람 — 발굴 ROI" />
                    <Th k="delta" label="증감" hint="최근 30일 − 직전 30일" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.region} className="border-b border-stone-100">
                      <td className="py-1.5 px-1 text-stone-800 whitespace-nowrap">{r.region}</td>
                      <td className="text-right px-1 text-stone-700">{n(r.cafes)}</td>
                      <td className={`text-right px-1 font-bold ${r.people === 0 ? "text-amber-700" : "text-sky-700"}`}>{n(r.people)}</td>
                      <td className="text-right px-1 text-stone-700">{n(r.pv)}</td>
                      <td className="text-right px-1 text-stone-500">{n(r.bots)}</td>
                      <td className="text-right px-1 text-stone-700">{r.perCafe.toFixed(2)}</td>
                      <td className={`text-right px-1 font-semibold ${r.delta > 0 ? "text-emerald-700" : r.delta < 0 ? "text-red-600" : "text-stone-500"}`}>
                        {r.delta > 0 ? "+" : ""}{n(r.delta)}
                      </td>
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
