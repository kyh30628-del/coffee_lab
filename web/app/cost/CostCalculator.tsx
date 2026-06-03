"use client";
import { useEffect, useState } from "react";

type Origin = { origin: string; point_diff: number; tariff: number; note: string };
type Assumptions = {
  cif_rate: number; logistics_krw_per_kg: number;
  importer_margin_rate: number; roast_loss_rate: number;
};
const won = (n: number) => Math.round(n).toLocaleString("ko-KR");
const STAR_KEY = "beanmark_starred_origins";

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

const FIELDS: { key: keyof Assumptions; label: string; min: number; max: number; step: number; pct?: boolean; hint: string }[] = [
  { key: "cif_rate", label: "운임·보험(CIF)", min: 0, max: 0.3, step: 0.01, pct: true, hint: "일반 5~12%" },
  { key: "logistics_krw_per_kg", label: "통관·물류 ₩/kg", min: 0, max: 2000, step: 50, hint: "물량 따라 편차" },
  { key: "importer_margin_rate", label: "수입사 마진", min: 0, max: 0.4, step: 0.01, pct: true, hint: "유통 10~20%" },
  { key: "roast_loss_rate", label: "로스팅 손실", min: 0.1, max: 0.25, step: 0.01, pct: true, hint: "라이트12~다크20%" },
];

export default function CostCalculator({
  cc, fx, lbToKg, origins, defaults,
}: { cc: number; fx: number; lbToKg: number; origins: Origin[]; defaults: Assumptions }) {
  const [a, setA] = useState<Assumptions>(defaults);
  const [stars, setStars] = useState<string[]>([]);
  const [onlyStars, setOnlyStars] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STAR_KEY);
      if (raw) setStars(JSON.parse(raw));
    } catch {}
  }, []);

  const toggleStar = (origin: string) => {
    setStars((cur) => {
      const next = cur.includes(origin) ? cur.filter((o) => o !== origin) : [...cur, origin];
      try { localStorage.setItem(STAR_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const set = (k: keyof Assumptions, v: number) => setA({ ...a, [k]: v });

  let rows = origins
    .map((o) => ({ ...o, ...computeRow(cc, fx, lbToKg, o.point_diff, o.tariff, a), starred: stars.includes(o.origin) }))
    .sort((x, y) => y.green - x.green);
  if (onlyStars) rows = rows.filter((r) => r.starred);
  // 별표는 위로
  rows = [...rows].sort((x, y) => Number(y.starred) - Number(x.starred));

  return (
    <div>
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
        <p className="text-[11px] text-stone-600 mt-3">※ 기본값은 업계 일반범위 추정. 관세 산지별 FTA(원산지증명 시), 부가세 생두 면제.</p>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-stone-600">★ 별표로 관심 산지를 위에 모아 비교하세요</span>
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
            <th className="w-8"></th>
            <th className="text-left py-3">산지</th><th className="text-right">Diff</th>
            <th className="text-right">관세</th><th className="text-right">생두 ₩/kg</th>
            <th className="text-right">로스팅후 ₩/kg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.origin} className={`border-b border-stone-900 hover:bg-stone-900/50 ${r.starred ? "bg-amber-950/20" : ""}`}>
              <td className="text-center">
                <button onClick={() => toggleStar(r.origin)}
                  className={`text-base leading-none ${r.starred ? "text-amber-400" : "text-stone-700 hover:text-stone-400"}`}
                  aria-label="즐겨찾기">{r.starred ? "★" : "☆"}</button>
              </td>
              <td className="py-3 text-stone-200">{r.origin}</td>
              <td className="text-right text-stone-500">{r.point_diff > 0 ? "+" + r.point_diff : r.point_diff}</td>
              <td className="text-right text-stone-500">{Math.round(r.tariff*100)}%</td>
              <td className="text-right text-amber-300">{won(r.green)}</td>
              <td className="text-right text-amber-50 font-bold">{won(r.roasted)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="text-center text-stone-600 py-6 text-xs">별표한 산지가 없습니다. ☆를 눌러 추가하세요.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
