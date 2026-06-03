import fs from "node:fs";
import path from "node:path";
import PriceChart from "./PriceChart";

type Row = {
  origin: string; note: string; point_diff: number;
  fob_usd_lb: number; green_krw_per_kg: number; roasted_krw_per_kg: number;
};
type CostData = {
  generated_at: string;
  inputs: {
    coffee_c_usd_lb: number; coffee_c_date: string; coffee_c_source: string;
    usd_krw: number; usd_krw_date: string; usd_krw_source: string;
  };
  assumptions: Record<string, number>;
  rows: Row[];
};
type Point = { date: string; coffee_c: number; usd_krw: number };

function loadData(): CostData | null {
  try {
    const p = path.join(process.cwd(), "public", "data", "cost.json");
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function loadTimeseries(): { points: Point[] } {
  try {
    const p = path.join(process.cwd(), "public", "data", "timeseries.json");
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return { points: [] };
  }
}

const won = (n: number) => n.toLocaleString("ko-KR");

export default function CostPage() {
  const data = loadData();

  if (!data) {
    return (
      <main className="min-h-screen bg-stone-950 text-stone-200 flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-lg">데이터가 없습니다.</p>
          <p className="text-stone-500 mt-2 text-sm">
            data-engine에서 python models/export_cost.py 를 먼저 실행하세요.
          </p>
        </div>
      </main>
    );
  }

  const { inputs, assumptions, rows } = data;
  const ts = loadTimeseries();

  return (
    <main className="min-h-screen bg-stone-950 text-stone-200 font-mono">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <header className="border-b border-stone-800 pb-6 mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-amber-50">
            생두 도착원가 모니터
          </h1>
          <p className="text-stone-500 text-sm mt-1">
            ICE Coffee C · 한국은행 환율 기반 산지별 추정 원가
          </p>
        </header>

        <section className="grid grid-cols-2 gap-4 mb-10">
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-5">
            <div className="text-stone-500 text-xs uppercase tracking-wider">Coffee C</div>
            <div className="text-3xl text-amber-400 mt-1">${inputs.coffee_c_usd_lb}<span className="text-base text-stone-500">/lb</span></div>
            <div className="text-stone-600 text-xs mt-2">
              {inputs.coffee_c_date} · {inputs.coffee_c_source}
            </div>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-5">
            <div className="text-stone-500 text-xs uppercase tracking-wider">USD/KRW</div>
            <div className="text-3xl text-amber-400 mt-1">₩{won(inputs.usd_krw)}</div>
            <div className="text-stone-600 text-xs mt-2">
              {inputs.usd_krw_date} · {inputs.usd_krw_source}
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-stone-400 text-xs uppercase tracking-wider mb-3">최근 시세 추이</h2>
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-4">
            <PriceChart points={ts.points} />
          </div>
        </section>

        <section>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-stone-500 text-xs uppercase tracking-wider border-b border-stone-800">
                <th className="text-left py-3">산지</th>
                <th className="text-right">Differential</th>
                <th className="text-right">FOB $/lb</th>
                <th className="text-right">생두원가 ₩/kg</th>
                <th className="text-right">로스팅후 ₩/kg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.origin} className="border-b border-stone-900 hover:bg-stone-900/50">
                  <td className="py-3 text-stone-200">{r.origin}</td>
                  <td className="text-right text-stone-500">
                    {r.point_diff > 0 ? "+" + r.point_diff : r.point_diff}
                  </td>
                  <td className="text-right text-stone-400">{r.fob_usd_lb}</td>
                  <td className="text-right text-amber-300">{won(r.green_krw_per_kg)}</td>
                  <td className="text-right text-amber-50 font-bold">{won(r.roasted_krw_per_kg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="mt-10 pt-6 border-t border-stone-800 text-xs text-stone-600 space-y-1">
          <p>생성: {data.generated_at}</p>
          <p>
            가정값(추정): CIF {assumptions.cif_rate * 100}% · 관세 {assumptions.tariff_rate * 100}% ·
            물류 ₩{won(assumptions.logistics_krw_per_kg)}/kg · 수입사마진 {assumptions.importer_margin_rate * 100}% ·
            로스팅손실 {assumptions.roast_loss_rate * 100}%
          </p>
          <p className="text-stone-700">
            ※ 산지 differential은 ICE 계약 명세 기준 추정값. 실제 계약가와 다를 수 있음.
          </p>
        </footer>
      </div>
    </main>
  );
}
