"use client";
import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
  PieChart, Pie, Tooltip, AreaChart, Area, CartesianGrid } from "recharts";
import BackLink from "../BackLink";
import InfoDot from "../InfoDot";
import Showcase from "../Showcase";

type RankItem = { rank: number; name: string; count: number; grade: string | null; isMe: boolean };
type CharItem = { key: string; label: string; emoji: string; me: number; avg: number; diff: number; meRaw?: number; hoodPenetration?: number };
type Action = { type: string; title: string; body: string; tone: "good" | "warn" | "info" };
type CadenceMonth = { ym: string; label: string; count: number };
type ReviewCadence = { months: CadenceMonth[]; total: number; last12: number; recentShare: number; gapMonths: number | null; lastDate: string | null; insight: string };
type Insight = {
  me: { id?: number; name: string; area: string; grade: string | null; count: number | null; identity: string | null };
  gu: string; hoodCount: number; rank: number;
  rankList: RankItem[]; charProfile: CharItem[];
  similar: { name: string; grade: string | null; count: number | null }[];
  actions: Action[]; reviewCadence?: ReviewCadence;
};
const GRADE_BG: Record<string, string> = { 검증: "#5f7355", 참고: "#9c6b3f", 발굴: "#a8927a" };
const PIE_COLORS = ["#9c6b3f", "#5f7355", "#c8893f", "#6f4e37", "#c97a6d", "#a8927a"];
const TABS = [{ k: "rank", l: "📊 순위" }, { k: "radar", l: "🕸️ 성격" }, { k: "pie", l: "🍩 구성" }];
const TONE: Record<string, { bg: string; border: string; tag: string }> = {
  good: { bg: "#eef3ea", border: "#bcd4ad", tag: "#5f7355" },
  warn: { bg: "#f7ede4", border: "#e3c9b0", tag: "#b5703c" },
  info: { bg: "#eef0f3", border: "#c3cad4", tag: "#5a6b82" },
};

// 레이더 축 라벨: 길면 두 줄로 쪼개 잘림 방지
function RadarTick({ x, y, textAnchor, payload }: any) {
  const v = String(payload?.value ?? "");
  let lines = [v];
  if (v.includes(" ")) lines = v.split(" ");
  else if (v.length > 4) { const h = Math.ceil(v.length / 2); lines = [v.slice(0, h), v.slice(h)]; }
  return (
    <text x={x} y={y} textAnchor={textAnchor} fill="#52402e" fontSize={11} fontWeight={600}>
      {lines.map((ln, i) => <tspan key={i} x={x} dy={i === 0 ? (lines.length > 1 ? -2 : 4) : 12}>{ln}</tspan>)}
    </text>
  );
}

function renderEmphasis(text: string, tagColor: string) {
  // **...** 를 볼드+색으로
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} style={{ color: tagColor, fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

export default function OwnerPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: number; name: string; area: string }[]>([]);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("rank");
  const [showShowcase, setShowShowcase] = useState(false);
  // 인증은 랜딩(사장님)에서 끝남 — 세션 비밀번호 사용. 없으면 홈(랜딩)으로.
  const [pw, setPw] = useState<string | null>(null);
  useEffect(() => {
    const p = typeof window !== "undefined" ? sessionStorage.getItem("dcn_owner_pw") : null;
    if (!p) { window.location.replace("/"); return; }
    setPw(p);
  }, []);
  const hdr = { "x-admin-password": pw ?? "" };

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true); setInsight(null);
    try { const r = await fetch(`/api/cafe-find?q=${encodeURIComponent(q.trim())}`, { headers: hdr }); const d = await r.json(); setResults((d.rows ?? []).filter((c: any) => c.published)); } catch {}
    setLoading(false);
  };
  const loadInsight = async (name: string) => {
    setLoading(true); setResults([]); setTab("rank");
    try { const r = await fetch(`/api/owner-insight?name=${encodeURIComponent(name)}`, { headers: hdr }); const d = await r.json(); if (d.ok) setInsight(d); } catch {}
    setLoading(false);
  };

  // 세션 인증 확인 중(없으면 위 effect가 홈으로 보냄)
  if (!pw) {
    return (
      <div className="min-h-screen bg-[#f4ece0] text-[#9c6b3f] flex items-center justify-center" style={{ fontFamily: "'Gowun Batang', serif" }}>
        인증 확인 중…
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
      </div>
    );
  }

  const rankData = insight ? insight.rankList.slice(0, 12).map((r) => ({ name: r.name + (r.isMe ? " ★" : ""), count: r.count, isMe: r.isMe })) : [];
  const radarData = insight ? insight.charProfile.map((c) => ({ axis: c.label, 우리카페: c.me, 동네평균: c.avg })) : [];
  const pieData = insight ? insight.charProfile.filter((c) => c.me > 0).map((c) => ({ name: c.label, value: c.me })) : [];

  return (
    <div className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <header className="bg-[#2b2018] text-[#f4ece0] px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BackLink to="/" label="홈" className="text-[#cbb89f] shrink-0" />
          <h1 className="text-[15px] font-bold truncate">사장님 분석</h1>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <a href="/pricing" className="text-[11px] bg-[#e8b87a] text-[#2b2018] rounded-full px-2.5 py-1.5 whitespace-nowrap font-bold">💎 요금제</a>
          <a href="/cafe/register" className="text-[11px] bg-[#9c6b3f] text-[#f4ece0] rounded-full px-2.5 py-1.5 whitespace-nowrap">📋 등록</a>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-5 py-6">
        {!insight && (
          <>
            <p className="text-[#6b5a48] text-sm mb-4 leading-relaxed">우리 카페를 검색하면, 같은 동네 카페들과 비교한 <strong>순위·성격·구성</strong>과 <strong>데이터 기반 액션 플랜</strong>을 보여드려요.</p>
            <div className="flex gap-2 mb-4">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="카페 이름 검색" className="flex-1 min-w-0 border border-[#cbb89f] rounded-lg px-4 py-3 text-base bg-white" />
              <button onClick={search} className="bg-[#2b2018] text-[#f4ece0] rounded-lg px-7 py-3 font-medium shrink-0">검색</button>
            </div>
            {loading && <p className="text-sm text-[#a8927a]">검색 중...</p>}
            <div className="space-y-2">
              {results.map((c) => (
                <button key={c.id} onClick={() => loadInsight(c.name)} className="w-full text-left bg-white rounded-lg p-3 border border-[#ece0cd] hover:border-[#9c6b3f]">
                  <span className="font-bold text-sm">{c.name}</span><span className="text-xs text-[#a8927a] ml-2">{c.area}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {insight && (
          <div>
            <button onClick={() => setInsight(null)} className="text-xs text-[#9c6b3f] underline mb-4">← 다른 카페 검색</button>

            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#ece0cd] mb-4">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold">{insight.me.name}</h2>
                {insight.me.grade && <span className="text-[10px] text-white px-2 py-0.5 rounded-full" style={{ background: GRADE_BG[insight.me.grade] }}>{insight.me.grade}</span>}
              </div>
              <div className="text-sm text-[#9c6b3f] mb-2">{insight.me.identity}</div>
              <div className="text-sm font-bold">{insight.gu} {insight.hoodCount}곳 중 <span className="text-[#9c6b3f]">{insight.rank}위</span></div>
            </div>

            {/* 액션 플랜 — 가장 위에, 핵심 */}
            <div className="mb-4">
              <div className="text-sm font-bold text-[#52402e] mb-2.5 flex items-center gap-1.5">💡 데이터 기반 액션 플랜<InfoDot title="액션 플랜이 뭐예요?">일반론이 아니라 <b>우리 카페의 검증된 후기 데이터에서만</b> 나오는 구체 제안이에요. 같은 동네 카페와 비교해 <b>차별점·빈 포지션(아무도 안 하는 강점)·매몰점·보완점·순위 전략</b>을 알려드려요.</InfoDot></div>
              <div className="space-y-2.5">
                {insight.actions.map((a, i) => {
                  const t = TONE[a.tone];
                  return (
                    <div key={i} className="rounded-xl p-4 border" style={{ background: t.bg, borderColor: t.border }}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: t.tag }}>{a.type}</span>
                        <span className="text-sm font-bold text-[#2b2018]">{a.title}</span>
                      </div>
                      <p className="text-[13px] text-[#52402e] leading-relaxed">{renderEmphasis(a.body, t.tag)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 탭 차트 */}
            <div className="flex gap-2 mb-4">
              {TABS.map((t) => (
                <button key={t.k} onClick={() => setTab(t.k)} className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${tab === t.k ? "bg-[#2b2018] text-[#f4ece0]" : "bg-white text-[#6b5a48] border border-[#cbb89f]"}`}>{t.l}</button>
              ))}
            </div>
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#ece0cd] mb-4">
              {tab === "rank" && (<>
                <div className="text-[11px] text-[#8a7458] uppercase tracking-wider mb-3">동네 카페 리뷰 수 순위</div>
                <ResponsiveContainer width="100%" height={Math.max(rankData.length * 34, 200)}>
                  <BarChart data={rankData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#52402e" }} />
                    <Tooltip cursor={{ fill: "#f4ece0" }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>{rankData.map((e, i) => <Cell key={i} fill={e.isMe ? "#9c6b3f" : "#d8c3a0"} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="text-[10px] text-[#a8927a] mt-1">진한 막대 = 내 카페</div>
              </>)}
              {tab === "radar" && (<>
                <div className="text-[11px] text-[#8a7458] uppercase tracking-wider mb-3">우리 카페의 결 vs 동네 평균</div>
                <ResponsiveContainer width="100%" height={250}>
                  <RadarChart data={radarData} margin={{ top: 16, right: 36, bottom: 16, left: 36 }} outerRadius="66%">
                    <PolarGrid stroke="#e3d6c2" />
                    <PolarAngleAxis dataKey="axis" tick={<RadarTick />} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={3} tick={{ fontSize: 9, fill: "#bcab92" }} axisLine={false} />
                    <Radar name="동네평균" dataKey="동네평균" stroke="#a8927a" strokeWidth={2} fill="#a8927a" fillOpacity={0.2} dot={{ r: 2.5, fill: "#a8927a" }} />
                    <Radar name="우리카페" dataKey="우리카페" stroke="#9c6b3f" strokeWidth={2} fill="#9c6b3f" fillOpacity={0.4} dot={{ r: 2.5, fill: "#9c6b3f" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
                <div className="text-[10px] text-[#a8927a] mt-1 leading-relaxed">0~100점 = 같은 동네 카페들 분포 안에서의 상대 위치(50 = 동네 중간, 높을수록 그 특징이 두드러짐). 리뷰 언급 빈도 기반이며 측정값이 아닙니다.</div>
              </>)}
              {tab === "pie" && (<>
                <div className="text-[11px] text-[#8a7458] uppercase tracking-wider mb-3">우리 카페는 어떤 특징으로 이야기되나</div>
                {pieData.length === 0 ? <p className="text-sm text-[#a8927a] py-8 text-center">아직 두드러진 특징 언급이 적어요.</p> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
                        {pieData.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div className="text-[10px] text-[#a8927a] mt-1">언급 비중이 클수록 그 특징으로 많이 이야기돼요</div>
              </>)}
            </div>

            {/* 리뷰 주기 */}
            {insight.reviewCadence && (
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#ece0cd] mb-4">
                <div className="text-[11px] text-[#8a7458] uppercase tracking-wider mb-1">🗓 리뷰 주기 (최근 12개월)</div>
                <div className="text-[13px] text-[#52402e] leading-relaxed mb-3">{renderEmphasis(insight.reviewCadence.insight, "#b5703c")}</div>
                {insight.reviewCadence.last12 > 0 ? (
                  <ResponsiveContainer width="100%" height={170}>
                    <AreaChart data={insight.reviewCadence.months} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                      <defs><linearGradient id="cad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9c6b3f" stopOpacity={0.5} /><stop offset="100%" stopColor="#9c6b3f" stopOpacity={0.05} /></linearGradient></defs>
                      <CartesianGrid stroke="#f0e6d4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8a7458" }} interval={1} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#a8927a" }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip cursor={{ stroke: "#cbb89f" }} formatter={(v: any) => [`${v}건`, "리뷰"]} />
                      <Area type="monotone" dataKey="count" stroke="#9c6b3f" strokeWidth={2} fill="url(#cad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-[#a8927a] py-6 text-center">날짜가 있는 검증 리뷰가 아직 적어요.</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#a8927a] mt-2">
                  <span>최근 12개월 <b className="text-[#52402e]">{insight.reviewCadence.last12}건</b></span>
                  {insight.reviewCadence.lastDate && <span>마지막 리뷰 <b className="text-[#52402e]">{insight.reviewCadence.lastDate}</b></span>}
                  {insight.reviewCadence.recentShare > 0 && <span>최근 3개월 비중 <b className="text-[#52402e]">{insight.reviewCadence.recentShare}%</b></span>}
                </div>
                <div className="text-[10px] text-[#a8927a] mt-1">검증된 리뷰의 게시일 기준 · 측정값이 아니라 공개 후기 작성 시점</div>
              </div>
            )}

            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#ece0cd] mb-4">
              <div className="text-[11px] text-[#8a7458] uppercase tracking-wider mb-3">성격이 비슷한 경쟁 카페</div>
              {insight.similar.map((c) => (
                <div key={c.name} className="flex items-center gap-2 py-2 border-b border-[#f0e6d4] last:border-0">
                  <span className="font-bold text-sm">{c.name}</span>
                  {c.grade && <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full" style={{ background: GRADE_BG[c.grade] }}>{c.grade}</span>}
                  <span className="text-xs text-[#a8927a] ml-auto">리뷰 {c.count}건</span>
                </div>
              ))}
            </div>

            {/* 무료/유료 경계 명확화 */}
            <div className="mt-5 mb-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] bg-[#e8b87a] text-[#2b2018] px-2 py-0.5 rounded-full font-bold">💎 구독 전용</span>
                <a href="/pricing" className="text-[11px] text-[#9c6b3f] underline">요금제 보기</a>
              </div>
              <p className="text-[11px] text-[#8a7458] mt-1.5">위 후기 분석은 <b>무료</b> · 아래는 <b>홍보팩(구독)</b>이에요</p>
            </div>
            <button onClick={() => setShowShowcase(true)} className="w-full bg-gradient-to-r from-[#9c6b3f] to-[#2b2018] text-[#f4ece0] rounded-xl py-3.5 font-medium">🎀 쇼케이스·우선노출·성과 (홍보팩)</button>
            <p className="text-[10px] text-[#a8927a] mt-3 text-center leading-relaxed">분석은 네이버 공개 후기를 교차검증한 데이터 기반입니다(무료). '결'은 측정값이 아니라 리뷰에서 자주 언급되는 정도입니다.</p>
          </div>
        )}
      </div>

      {showShowcase && insight?.me?.id && (
        <div className="fixed inset-0 z-[5000]" style={{ fontFamily: "'Gowun Batang', serif" }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowShowcase(false)} />
          <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:w-[460px] sm:h-fit bg-[#fdfaf4] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: "92dvh" }}>
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#ece0cd]">
              <div className="font-bold text-[#2b2018] truncate">🎀 {insight.me.name}</div>
              <button onClick={() => setShowShowcase(false)} className="text-2xl text-[#9c6b3f] leading-none px-1 shrink-0">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <Showcase cafeId={insight.me.id} cafeName={insight.me.name} pw={pw ?? ""} />
            </div>
          </div>
        </div>
      )}
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </div>
  );
}
