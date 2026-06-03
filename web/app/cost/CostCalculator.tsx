"use client";
import { useState } from "react";

type Origin = { origin: string; point_diff: number; tariff: number; note: string };
type Assumptions = {
  cif_rate: number; logistics_krw_per_kg: number;
  importer_margin_rate: number; roast_loss_rate: number;
};
const won = (n: number) => Math.round(n).toLocaleString("ko-KR");

function computeRow(cc: number, fx: number, lbToKg: number, pdiff: number, tariff: number, a: Assumptions) {
  const fobUsdLb = cc + pdiff / 10000;
  const fobKrwKg = fobUsdLb * lbToKg * fx;
  const cif = fobKrwKg * (1 + a.cif_rate);
  const afterTariff = cif * (1 + tariff);
  const afterLogi = afterTariff + a.logistics_krw_per_kg;
  const green = afterLogi * (1 + a.importer_margin_rate);
  const roasted = green / (1 - a.roast_loss_rate);
  return { fobUsdLb, green, roasted };
}

const FIELDS: { key: keyof Assumptions; label: string; min: number; max: number; step: number; pct?: boolean }[] = [
  { key: "cif_rate", label: "운임·보험(CIF)", min: 0, max: 0.3, step: 0.01, pct: true },
  { key: "logistics_krw_per_kg", label: "통관·물류 ₩/kg", min: 0, max: 2000, step: 50 },
  { key: "importer_margin_rate", label: "수입사 마진", min: 0, max: 0.4, step: 0.01, pct: true },
  { key: "roast_loss_rate", label: "로스팅 손실", min: 0.1, max: 0.25, step: 0.01, pct: true },
];

export default function CostCalculator({
  cc, fx, lbToKg, origins, defaults,
}: { cc: number; fx: number; lbToKg: number; origins: Origin[]; defaults: Assumptions }) {
  const [a, setA] = useState<Assumptions>(defaults);
  const set = (k: keyof Assumptions, v: number) => setA({ ...a, [k]: v });
  const rows = origins
    .map((o) => ({ ...o, ...computeRow(cc, fx, lbToKg, o.point_diff, o.tariff, a) }))
    .sort((x, y) => y.green - x.green);

  return (
    <div>
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-stone-300 text-sm font-bold">내 조건으로 계산</h3>
          <button onClick={() => setA(defaults)} className="text-xs text-stone-500 hover:text-amber-400 underline">기본값으로</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-stone-400">{f.label}</span>
                <span className="text-amber-400 font-bold">
                  {f.pct ? `${Math.round((a[f.key] as number) * 100)}%` : `₩${won(a[f.key] as number)}`}
                </span>
              </div>
              <input type="range" min={f.min} max={f.max} step={f.step}
                value={a[f.key]} onChange={(e) => set(f.key, parseFloat(e.target.value))}
                className="w-full accent-amber-500" />
            </div>
          ))}
        </div>
        <p className="text-xs text-stone-600 mt-3">※ 관세는 산지별 FTA 적용(원산지증명 구비 시, 추정). 부가세는 생두 면제.</p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-stone-500 text-xs uppercase tracking-wider border-b border-stone-800">
            <th className="text-left py-3">산지</th><th className="text-right">Diff</th>
            <th className="text-right">관세</th><th className="text-right">생두 ₩/kg</th>
            <th className="text-right">로스팅후 ₩/kg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.origin} className="border-b border-stone-900 hover:bg-stone-900/50">
              <td className="py-3 text-stone-200">{r.origin}</td>
              <td className="text-right text-stone-500">{r.point_diff > 0 ? "+" + r.point_diff : r.point_diff}</td>
              <td className="text-right text-stone-500">{Math.round(r.tariff * 100)}%</td>
              <td className="text-right text-amber-300">{won(r.green)}</td>
              <td className="text-right text-amber-50 font-bold">{won(r.roasted)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
