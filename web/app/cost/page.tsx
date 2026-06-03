import fs from "node:fs";
import path from "node:path";
import PriceChart from "./PriceChart";

type Row = { origin: string; note: string; point_diff: number;
  fob_usd_lb: number; green_krw_per_kg: number; roasted_krw_per_kg: number; };
type Signal = { current: number; low: number; high: number; avg: number;
  position_pct: number; label: string; tone: string; trend: string; days: number; } | null;
type CostData = {
  generated_at: string;
  inputs: { coffee_c_usd_lb: number; coffee_c_date: string; coffee_c_source: string;
    usd_krw: number; usd_krw_date: string; usd_krw_source: string; };
  signal: Signal;
  assumptions: Record<string, number>;
  rows: Row[];
};
type Point = { date: string; coffee_c: number; usd_krw: number };

function loadData(): CostData | null {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "cost.json"), "utf-8")); }
  catch { return null; }
}
function loadTimeseries(): { points: Point[] } {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "timeseries.json"), "utf-8")); }
  catch { return { points: [] }; }
}
const won = (n: number) => n.toLocaleString("ko-KR");

const TONE: Record<string, string> = {
  good: "bg-emerald-950 border-emerald-700 text-emerald-300",
  high: "bg-red-950 border-red-800 text-red-300",
  neutral: "bg-stone-900 border-stone-700 text-stone-300",
};

export default function CostPage() {
  const data = loadData();
  if (!data) {
    return (
      <main className="min-h-screen bg-stone-950 text-stone-200 flex items-center justify-center p-8">
        <p className="text-stone-500 text-sm">데이터가 없습니다. data-engine에서 export_cost.py를 실행하세요.</p>
      </main>
    );
  }
  const { inputs, assumptions, rows, signal } = data;
  const ts = loadTimeseries();

  return (
    <main className="min-h-screen bg-stone-950 text-stone-200 font-mono">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <header className="border-b border-stone-800 pb-6 mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-amber-50">생두 도착원가 모니터</h1>
          <p className="text-stone-500 text-sm mt-1">ICE Coffee C · 한국은행 환율 기반 산지별 추정 원가</p>
        </header>

        {signal && (
          <section className={`rounded-lg border p-5 mb-8 ${TONE[signal.tone] ?? TONE.neutral}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs uppercase tracking-wider opacity-70">시세 신호 (최근 {signal.days}일 기준)</div>
                <div className="text-xl font-bold mt-1">{signal.label}</div>
              </div>
              <div className="text-right text-sm">
                <div>기간 내 위치 <span className="font-bold">{signal.position_pct}%</span> · 추세 {signal.trend}</div>
                <div className="opacity-60 text-xs mt-0.5">
                  최저 ${signal.low} · 평균 ${signal.avg} · 최고 ${signal.high}
                </div>
              </div>
            </div>
            <div className="mt-3 h-2 bg-black/30 rounded-full overflow-hidden">
              <div className="h-full bg-current opacity-70" style={{ width: `${signal.position_pct}%` }} />
            </div>
            <p className="text-xs opacity-50 mt-2">※ 가격 예측이 아니라 수집 기간 내 현재가의 상대 위치입니다.</p>
          </section>
        )}

        <section className="grid grid-cols-2 gap-4 mb-10">
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-5">
            <div className="text-stone-500 text-xs uppercase tracking-wider">Coffee C</div>
            <div className="text-3xl text-amber-400 mt-1">${inputs.coffee_c_usd_lb}<span className="text-base text-stone-500">/lb</span></div>
            <div className="text-stone-600 text-xs mt-2">{inputs.coffee_c_date} · {inputs.coffee_c_source}</div>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-5">
            <div className="text-stone-500 text-xs uppercase tracking-wider">USD/KRW</div>
            <div className="text-3xl text-amber-400 mt-1">₩{won(inputs.usd_krw)}</div>
            <div className="text-stone-600 text-xs mt-2">{inputs.usd_krw_date} · {inputs.usd_krw_source}</div>
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
                <th className="text-left py-3">산지</th><th className="text-right">Differential</th>
                <th className="text-right">FOB $/lb</th><th className="text-right">생두원가 ₩/kg</th>
                <th className="text-right">로스팅후 ₩/kg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.origin} className="border-b border-stone-900 hover:bg-stone-900/50">
                  <td className="py-3 text-stone-200">{r.origin}</td>
                  <td className="text-right text-stone-500">{r.point_diff > 0 ? "+" + r.point_diff : r.point_diff}</td>
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
          <p>가정값(추정): CIF {assumptions.cif_rate * 100}% · 관세 {assumptions.tariff_rate * 100}% · 물류 ₩{won(assumptions.logistics_krw_per_kg)}/kg · 수입사마진 {assumptions.importer_margin_rate * 100}% · 로스팅손실 {assumptions.roast_loss_rate * 100}%</p>
          <p className="text-stone-700">※ 산지 differential은 ICE 계약 명세 기준 추정값. 실제 계약가와 다를 수 있음.</p>
        </footer>
      </div>
    </main>
  );
}
