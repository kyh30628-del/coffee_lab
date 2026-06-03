"use client";
import { useEffect, useState } from "react";

type Origin = {
  origin: string; point_diff: number; tariff: number; note: string;
  fob_usd_lb: number; green_krw_per_kg: number; roasted_krw_per_kg: number;
  change_1d: number | null; change_7d: number | null;
};
type Assumptions = { cif_rate: number; logistics_krw_per_kg: number; importer_margin_rate: number; roast_loss_rate: number; };
const won = (n: number) => Math.round(n).toLocaleString("ko-KR");
const STAR_KEY = "beanmark_starred_origins";

function recompute(cc: number, fx: number, lbToKg: number, pdiff: number, tariff: number, a: Assumptions) {
  const fobUsdLb = cc + pdiff / 10000;
  const fobKrwKg = fobUsdLb * lbToKg * fx;
  const cif = fobKrwKg * (1 + a.cif_rate);
  const afterTariff = cif * (1 + tariff);
  const afterLogi = afterTariff + a.logistics_krw_per_kg;
  const green = afterLogi * (1 + a.importer_margin_rate);
  return { fobUsdLb, green, roasted: green / (1 - a.roast_loss_rate) };
}

const FIELDS: { key: keyof Assumptions; label: string; min: number; max: number; step: number; pct?: boolean; hint: string }[] = [
  { key: "cif_rate", label: "운임·보험(CIF)", min: 0, max: 0.3, step: 0.01, pct: true, hint: "일반 5~12%" },
  { key: "logistics_krw_per_kg", label: "통관·물류 ₩/kg", min: 0, max: 2000, step: 50, hint: "물량 따라 편차" },
  { key: "importer_margin_rate", label: "수입사 마진", min: 0, max: 0.4, step: 0.01, pct: true, hint: "유통 10~20%" },
  { key: "roast_loss_rate", label: "로스팅 손실", min: 0.1, max: 0.25, step: 0.01, pct: true, hint: "라이트12~다크20%" },
];

function ChangeBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="text-stone-700">—</span>;
  if (v > 0) return <span className="text-red-400">▲ {v}%</span>;
  if (v < 0) return <span className="text-emerald-400">▼ {Math.abs(v)}%</span>;
  return <span className="text-stone-500">0%</span>;
}

export default function CostCalculator({
  cc, fx, lbToKg, origins, defaults,
}: { cc: number; fx: number; lbToKg: number; origins: Origin[]; defaults: Assumptions }) {
  const [a, setA] = useState<Assumptions>(defaults);
  const [stars, setStars] = useState<string[]>([]);
  const [onlyStars, setOnlyStars] = useState(false);

  useEffect(() => {
    try { const raw = localStorage.getItem(STAR_KEY); if (raw) setStars(JSON.parse(raw)); } catch {}
  }, []);
  const toggleStar = (o: string) => setStars((cur) => {
    const next = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o];
    try { localStorage.setItem(STAR_KEY, JSON.stringify(next)); } catch {}
    return next;
  });
  const set = (k: keyof Assumptions, v: number) => setA({ ...a, [k]: v });

  // 가정값 바뀌면 원가만 재계산. 변동률(change_*)은 서버 계산값 유지(시세 기반).
  let rows = origins.map((o) => {
    const c = recompute(cc, fx, lbToKg, o.point_diff, o.tariff, a);
    return { ...o, green_krw_per_kg: Math.round(c.green), roasted_krw_per_kg: Math.round(c.roasted), starred: stars.includes(o.origin) };
  }).sort((x, y) => y.green_krw_per_kg - x.green_krw_per_kg);
  if (onlyStars) rows = rows.filter((r) => r.starred);
  rows = [...rows].sort((x, y) => Number(y.starred) - Number(x.starred));

  const starred = origins.filter((o) => stars.includes(o.origin));

  return (
    <div>
      {/* 즐겨찾기 변동 요약 */}
      {starred.length > 0 && (
        <div className="bg-stone-900/70 border border-amber-900/40 rounded-xl p-5 mb-5">
          <div className="text-[11px] uppercase tracking-wider text-amber-500/80 mb-3">★ 관심 산지 변동 (시세 기준)</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {starred.map((s) => (
              <div key={s.origin} className="flex items-center justify-between bg-black/20 rounded-lg px-3 py-2">
                <span className="text-stone-200 text-sm">{s.origin}</span>
                <span className="text-xs flex gap-3">
                  <span className="text-stone-500">어제 <ChangeBadge v={s.change_1d} /></span>
                  <span className="text-stone-500">주간 <ChangeBadge v={s.change_7d} /></span>
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-stone-600 mt-2">※ 변동은 Coffee C 시세·환율 기준 원가 변화. 가정값과 무관.</p>
        </div>
      )}

      {/* 가정값 슬라이더 */}
      <div className="bg-stone-900/70 border border-stone-800 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-stone-300 text-sm font-bold">내 조건으로 계산</h3>
          <button onClick={() => setA(defaults)} className="text-xs text-stone-500 hover:text-amber-400 underline">기본값으로</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-stone-400">{f.label}</span>
                <span className="text-amber-400 font-bold">{f.pct ? `${Math.round((a[f.key] as number)*100)}%` : `₩${won(a[f.key] as number)}`}</span>
              </div>
              <input type="range" min={f.min} max={f.max} step={f.step} value={a[f.key]}
                onChange={(e) => set(f.key, parseFloat(e.target.value))} className="w-full accent-amber-500" />
              <div className="text-[10px] text-stone-600 mt-0.5">{f.hint}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-stone-600">★ 별표로 관심 산지를 추적하세요</span>
        {stars.length > 0 && (
          <button onClick={() => setOnlyStars((v) => !v)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${onlyStars ? "bg-amber-500 text-stone-900 border-amber-500" : "border-stone-700 text-stone-400 hover:border-amber-500"}`}>
            {onlyStars ? "전체 보기" : `즐겨찾기만 (${stars.length})`}
          </button>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-stone-500 text-xs uppercase tracking-wider border-b border-stone-800">
            <th className="w-8"></th><th className="text-left py-3">산지</th>
            <th className="text-right">관세</th><th className="text-right">어제</th>
            <th className="text-right">생두 ₩/kg</th><th className="text-right">로스팅후 ₩/kg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.origin} className={`border-b border-stone-900 hover:bg-stone-900/50 ${r.starred ? "bg-amber-950/20" : ""}`}>
              <td className="text-center">
                <button onClick={() => toggleStar(r.origin)}
                  className={`text-base leading-none ${r.starred ? "text-amber-400" : "text-stone-700 hover:text-stone-400"}`}>{r.starred ? "★" : "☆"}</button>
              </td>
              <td className="py-3 text-stone-200">{r.origin}</td>
              <td className="text-right text-stone-500">{Math.round(r.tariff*100)}%</td>
              <td className="text-right text-xs"><ChangeBadge v={r.change_1d} /></td>
              <td className="text-right text-amber-300">{won(r.green_krw_per_kg)}</td>
              <td className="text-right text-amber-50 font-bold">{won(r.roasted_krw_per_kg)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="text-center text-stone-600 py-6 text-xs">별표한 산지가 없습니다.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
