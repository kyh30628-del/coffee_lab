import fs from "node:fs";
import path from "node:path";
import PriceChart from "./PriceChart";
import CostCalculator from "./CostCalculator";

type Row = { origin: string; note: string; point_diff: number; tariff: number;
  fob_usd_lb: number; green_krw_per_kg: number; roasted_krw_per_kg: number; };
type Signal = { current: number; low: number; high: number; avg: number;
  position_pct: number; label: string; tone: string; trend: string; days: number; } | null;
type Summary = { headline: string; detail: string; tone: string } | null;
type CostData = {
  generated_at: string;
  inputs: { coffee_c_usd_lb: number; coffee_c_date: string; coffee_c_source: string;
    usd_krw: number; usd_krw_date: string; usd_krw_source: string; };
  lb_to_kg: number;
  origins: { origin: string; point_diff: number; tariff: number; note: string }[];
  default_assumptions: { cif_rate: number; logistics_krw_per_kg: number; importer_margin_rate: number; roast_loss_rate: number };
  signal: Signal; summary: Summary; rows: Row[];
};
type Point = { date: string; coffee_c: number; usd_krw: number };

function loadData(): CostData | null {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "cost.json"), "utf-8")); } catch { return null; }
}
function loadTimeseries(): { points: Point[] } {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "timeseries.json"), "utf-8")); } catch { return { points: [] }; }
}
const won = (n: number) => n.toLocaleString("ko-KR");
const TONE: Record<string, { box: string; dot: string }> = {
  good: { box: "bg-emerald-950/60 border-emerald-700/60", dot: "bg-emerald-400" },
  high: { box: "bg-red-950/50 border-red-800/60", dot: "bg-red-400" },
  neutral: { box: "bg-stone-900 border-stone-700", dot: "bg-stone-400" },
};

export default function CostPage() {
  const data = loadData();
  if (!data) {
    return (
      <main className="min-h-screen bg-[#0c0a09] text-stone-200 flex items-center justify-center p-8">
        <p className="text-stone-500 text-sm">데이터가 없습니다. data-engine에서 export_cost.py를 실행하세요.</p>
      </main>
    );
  }
  const { inputs, signal, summary, origins, default_assumptions, lb_to_kg } = data;
  const ts = loadTimeseries();
  const tone = TONE[summary?.tone ?? "neutral"] ?? TONE.neutral;
  const asOf = new Date(data.generated_at).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });

  return (
    <main className="min-h-screen bg-[#0c0a09] text-stone-200" style={{ fontFamily: "'DM Mono', ui-monospace, monospace" }}>
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* 헤더 */}
        <header className="flex items-end justify-between border-b border-stone-800 pb-5 mb-8 flex-wrap gap-3">
          <div>
            <div className="text-amber-500/80 text-[11px] tracking-[0.35em] uppercase">Green Coffee Intelligence</div>
            <h1 className="text-2xl font-bold tracking-tight text-amber-50 mt-1">생두 원가 · 구매 판단</h1>
          </div>
          <div className="text-right text-xs text-stone-500">
            <div>기준 {asOf}</div>
            <div className="text-stone-600">자동 갱신 · 출처 ICE · 한국은행</div>
          </div>
        </header>

        {/* 오늘의 판단 (사장 언어) */}
        {summary && (
          <section className={`rounded-xl border ${tone.box} p-6 mb-8`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${tone.dot} animate-pulse`} />
              <span className="text-[11px] uppercase tracking-wider text-stone-400">오늘의 판단</span>
            </div>
            <p className="text-xl font-bold text-stone-50 leading-snug">{summary.headline}</p>
            <p className="text-sm text-stone-400 mt-2">{summary.detail}</p>
          </section>
        )}

        {/* 핵심 지표 3카드 */}
        <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-stone-900/70 border border-stone-800 rounded-xl p-5">
            <div className="text-stone-500 text-[11px] uppercase tracking-wider">Coffee C</div>
            <div className="text-3xl text-amber-400 mt-1 font-bold">${inputs.coffee_c_usd_lb}</div>
            <div className="text-stone-600 text-[11px] mt-1">USD/lb · {inputs.coffee_c_date}</div>
          </div>
          <div className="bg-stone-900/70 border border-stone-800 rounded-xl p-5">
            <div className="text-stone-500 text-[11px] uppercase tracking-wider">환율</div>
            <div className="text-3xl text-amber-400 mt-1 font-bold">₩{won(inputs.usd_krw)}</div>
            <div className="text-stone-600 text-[11px] mt-1">원/달러 · {inputs.usd_krw_date}</div>
          </div>
          {signal && (
            <div className="bg-stone-900/70 border border-stone-800 rounded-xl p-5 col-span-2 md:col-span-1">
              <div className="text-stone-500 text-[11px] uppercase tracking-wider">시세 위치 ({signal.days}일)</div>
              <div className="text-3xl text-amber-400 mt-1 font-bold">{signal.position_pct}%</div>
              <div className="mt-2 h-1.5 bg-black/40 rounded-full overflow-hidden">
                <div className={`h-full ${tone.dot}`} style={{ width: `${signal.position_pct}%` }} />
              </div>
              <div className="text-stone-600 text-[11px] mt-1">최저 ${signal.low} · 최고 ${signal.high}</div>
            </div>
          )}
        </section>

        {/* 추이 차트 */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-stone-400 text-xs uppercase tracking-wider">시세 추이</h2>
            <span className="text-[11px] text-stone-600">Coffee C $/lb · 환율 원/$</span>
          </div>
          <div className="bg-stone-900/70 border border-stone-800 rounded-xl p-4">
            <PriceChart points={ts.points} />
          </div>
        </section>

        {/* 산지별 원가 계산기 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-stone-400 text-xs uppercase tracking-wider">산지별 추정 원가</h2>
            <span className="text-[11px] text-stone-600">관세 산지별 FTA · 부가세 면제</span>
          </div>
          <CostCalculator cc={inputs.coffee_c_usd_lb} fx={inputs.usd_krw}
            lbToKg={lb_to_kg} origins={origins} defaults={default_assumptions} />
        </section>

        <footer className="mt-10 pt-6 border-t border-stone-800 text-[11px] text-stone-600 space-y-1">
          <p>시세 ICE Coffee C · 환율 한국은행 ECOS · 관세 ICE 계약명세 기준 FTA 추정. 원가는 가정값 포함 추정치이며 실제 계약가와 다를 수 있습니다.</p>
          <p className="text-stone-700">생성 {asOf}</p>
        </footer>
      </div>

      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
    </main>
  );
}
