"use client";
import { useState, useEffect } from "react";
import BackLink from "../BackLink";
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  AreaChart, Area, CartesianGrid, Tooltip } from "recharts";

type Cafe = {
  id: number; name: string; area: string; note: string; beans: string;
  signature: string; uses: string; phone: string; source: string; published: boolean;
};
type Stats = {
  content: {
    total: number; published: number; hidden: number; owner_pending: number; embedded: number; pub_embedded: number; pub_has_dates: number; has_dates: number; raw_cached: number; llm_judged: number;
    grades: { grade: string; n: number }[];
    quality: { avg_noise_pct: number | null; raw: number; rejected: number };
    topRegions: { region: string; n: number }[];
  };
  visitors: {
    total: number; agreed: number; declined: number; located: number; returners: number; active7d: number; new7d: number; avg_visits: number | null;
    daily: { d: string; n: number }[];
    regions: { region: string; n: number }[];
  };
};

const GRADE_COLOR: Record<string, string> = { 검증: "#5f7355", 참고: "#9c6b3f", 발굴: "#a8927a", 미합성: "#cbd5e1" };
function groupByDate(rows: any[]): Record<string, any[]> {
  const g: Record<string, any[]> = {};
  for (const r of rows) { const d = new Date(r.yt_checked_at).toLocaleDateString("ko-KR"); (g[d] ??= []).push(r); }
  return g;
}
const BAR = "#9c6b3f";

export default function AdminPage() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [msg, setMsg] = useState("");
  const [showAuto, setShowAuto] = useState(false);
  const [q, setQ] = useState("");
  const [review, setReview] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [purged, setPurged] = useState(0);
  const [verify, setVerify] = useState<any>(null);
  const [grounding, setGrounding] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [yt, setYt] = useState<any>(null);
  const [jstatus, setJstatus] = useState<any>(null);
  const [auditFlags, setAuditFlags] = useState<any>(null);
  const [tower, setTower] = useState<any>(null);
  const [selAgent, setSelAgent] = useState<any>(null);
  const [towerFull, setTowerFull] = useState(false);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [showSubsModal, setShowSubsModal] = useState(false);
  const [showYtModal, setShowYtModal] = useState(false);
  const [showVisits, setShowVisits] = useState(false);
  const [visits, setVisits] = useState<any>(null);
  const loadSubscribers = (password: string) => fetch("/api/subscription?all=1", { headers: { "x-admin-password": password } }).then((x) => x.json()).then((d) => { if (d.ok) setSubscribers(d.subs ?? []); }).catch(() => {});
  const subAct = async (id: number, action: string) => { try { await fetch("/api/subscription", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) }); loadSubscribers(pw); fetch("/api/judge-status", { headers: { "x-admin-password": pw } }); } catch {} };
  // 🔄 모든 숫자 실시간 갱신 — no-store(캐시 없음)로 매번 DB 최신값. 폴링·로그인 둘 다 이 함수 사용.
  const refreshNumbers = (password: string) => {
    const h: RequestInit = { headers: { "x-admin-password": password }, cache: "no-store" };
    fetch("/api/admin/stats", h).then((x) => x.json()).then((s) => { if (s.ok) setStats(s); }).catch(() => {});
    fetch("/api/orchestrator", { cache: "no-store" }).then((x) => x.json()).then((d) => { if (d.ok) setTower(d); }).catch(() => {});
    fetch("/api/judge-status", h).then((x) => x.json()).then((d) => { if (d.ok) setJstatus(d); }).catch(() => {});
    fetch("/api/audit-flags", h).then((x) => x.json()).then((d) => { if (d.ok) setAuditFlags(d); }).catch(() => {});
    fetch("/api/sub-request", h).then((x) => x.json()).then((d) => { if (d.ok) { setSubs(d.requests ?? []); setPurged(d.purgedRecently ?? 0); } }).catch(() => {});
    fetch("/api/yt-report", h).then((x) => x.json()).then((d) => { if (d.ok) setYt(d); }).catch(() => {});
    fetch("/api/cron-verify?latest=1", h).then((x) => x.json()).then((d) => { if (d.ok) { setVerify(d.report); setGrounding(d.grounding); } }).catch(() => {});
  };
  // 🧮 전 지표 자동 갱신(15초) — 백그라운드 작업이 실시간 반영(새로고침 불필요)
  useEffect(() => {
    if (!authed || !pw) return;
    refreshNumbers(pw);
    const id = setInterval(() => refreshNumbers(pw), 15000);
    return () => clearInterval(id);
  }, [authed, pw]);

  const loadVerify = (password: string) => fetch("/api/cron-verify?latest=1", { headers: { "x-admin-password": password } }).then((x) => x.json()).then((d) => { if (d.ok) { setVerify(d.report); setGrounding(d.grounding); } }).catch(() => {});
  const runVerify = async () => {
    setVerifying(true);
    try { const r = await fetch("/api/cron-verify", { headers: { "x-admin-password": pw } }); const d = await r.json(); if (d.ok) { setVerify({ ran_at: d.ranAt, status: d.status, fails: d.fails, warns: d.warns, checks: d.checks }); setGrounding(d.grounding); } } catch {}
    setVerifying(false);
  };

  const load = async (password: string) => {
    setMsg("불러오는 중...");
    const r = await fetch("/api/admin/cafes", { headers: { "x-admin-password": password } });
    if (r.status === 401) { setMsg("비밀번호가 틀렸습니다."); return; }
    const d = await r.json();
    if (d.ok) { setCafes(d.cafes); setAuthed(true); setMsg(""); }
    else { setMsg("오류: " + d.error); return; }
    refreshNumbers(password);
    loadReview(password);
    loadSubscribers(password);
  };

  const act = async (id: number, action: string, published?: boolean) => {
    await fetch("/api/admin/cafes", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": pw }, body: JSON.stringify({ id, action, published }) });
    load(pw);
  };

  // 🎀 쇼케이스 승인
  const loadReview = (password: string) => fetch("/api/promo-queue?review=1", { headers: { "x-admin-password": password } }).then((x) => x.json()).then((d) => { if (d.ok) setReview(d.review ?? []); }).catch(() => {});
  const promoAct = async (cafeId: number, action: "approve" | "reject" | "generate" | "feature" | "unfeature") => {
    await fetch("/api/promo-queue", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": pw }, body: JSON.stringify({ cafeId, [action]: true }) });
    loadReview(pw);
  };

  if (!authed) {
    return (
      <main className="min-h-screen bg-stone-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-sm">
          <BackLink to="/" label="홈" className="text-stone-400 mb-4" />
          <h1 className="text-xl font-bold mb-1">관리자 대시보드</h1>
          <p className="text-sm text-stone-500 mb-4">비밀번호를 입력하세요.</p>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(pw)}
            placeholder="비밀번호" className="w-full border rounded-lg px-3 py-2.5 mb-3" />
          <button onClick={() => load(pw)} className="w-full bg-stone-900 text-white rounded-lg py-2.5 font-medium">들어가기</button>
          {msg && <p className="text-sm text-red-600 mt-3">{msg}</p>}
        </div>
      </main>
    );
  }

  const ownerPending = cafes.filter((c) => !c.published && c.source === "owner");
  const autoHidden = cafes.filter((c) => !c.published && c.source !== "owner");
  const live = cafes.filter((c) => c.published);
  const searched = q.trim() ? cafes.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())) : [];

  const Kpi = ({ label, value, sub, color = "text-stone-900" }: { label: string; value: any; sub?: string; color?: string }) => (
    <div className="bg-white rounded-xl border p-3.5">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] text-stone-500 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-stone-400 mt-0.5">{sub}</div>}
    </div>
  );
  const Card = ({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) => (
    <div className="bg-white rounded-xl border p-4">
      <div className="text-sm font-bold text-stone-700 mb-3">{title}</div>
      {children}
      {note && <p className="text-[10px] text-stone-400 mt-2">{note}</p>}
    </div>
  );
  const Row = ({ c }: { c: Cafe }) => (
    <div className="bg-white rounded-xl p-4 border flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold">{c.name}</span>
          <span className="text-xs text-stone-400">{c.area}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.source === "owner" ? "bg-blue-100 text-blue-700" : c.source === "seed" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500"}`}>{c.source}</span>
          {!c.published && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500">비공개</span>}
        </div>
        {c.note && <p className="text-sm text-stone-600 mt-1 line-clamp-1">{c.note}</p>}
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button onClick={() => act(c.id, "publish", !c.published)} className={`text-xs px-3 py-1.5 rounded-lg ${c.published ? "bg-stone-200 text-stone-700" : "bg-emerald-600 text-white"}`}>{c.published ? "숨기기" : "공개하기"}</button>
        <button onClick={() => { if (confirm(`${c.name} 삭제?`)) act(c.id, "delete"); }} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600">삭제</button>
      </div>
    </div>
  );

  const ct = stats?.content, vs = stats?.visitors;
  const agreeRate = vs && vs.total ? Math.round((vs.agreed / vs.total) * 100) : 0;
  const keptPct = ct?.quality?.raw ? Math.round(((ct.quality.raw - ct.quality.rejected) / ct.quality.raw) * 100) : 0;

  return (
    <main className="min-h-screen bg-stone-100 p-4 sm:p-6" style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <BackLink to="/" label="홈" className="text-stone-500" />
          <h1 className="text-2xl font-bold">관리자 대시보드</h1>
          <button onClick={() => load(pw)} className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700">새로고침</button>
        </div>

        {/* ===== 🛰️ 자율 운영 관제탑 ===== */}
        {tower && (() => {
          const dot: Record<string, string> = { ok: "bg-emerald-500", behind: "bg-amber-500", stalled: "bg-red-500", warn: "bg-amber-500", idle: "bg-stone-300" };
          const oc: Record<string, string> = { healthy: "border-emerald-300 bg-emerald-50 text-emerald-700", degraded: "border-amber-300 bg-amber-50 text-amber-700", critical: "border-red-300 bg-red-50 text-red-700" };
          const ocl: Record<string, string> = { healthy: "정상 가동", degraded: "주의", critical: "위험" };
          const sl: Record<string, string> = { ok: "정상", behind: "지연", stalled: "멈춤", warn: "주의", idle: "대기" };
          const ago = (h: number | null) => h == null ? "기록 없음" : h < 1 ? "방금" : h < 24 ? `${Math.round(h)}시간 전` : `${Math.round(h / 24)}일 전`;
          const byKey: Record<string, any> = Object.fromEntries((tower.agents || []).map((a: any) => [a.key, a]));
          // 에이전트별 상세 설명(클릭 시 표시)
          const DESC: Record<string, { icon: string; what: string; sched: string; feeds: string }> = {
            collect: { icon: "🔍", what: "네이버 지역검색으로 수도권 신규 카페를 동(洞) 단위로 발굴하고, 오래된 카페의 후기를 다시 수집합니다. 모든 데이터의 출발점입니다.", sched: "warmup 1·11·19시 / grow 발굴 매일 3시", feeds: "수집한 raw 후기를 → 합성으로 넘김" },
            synth: { icon: "⚗️", what: "수집한 후기를 분석해 6축 취향·등급·한줄 정체성을 만들고, 게이트로 노이즈·비카페·프랜차이즈를 걸러냅니다. (LLM 미사용, 규칙 기반이라 환각 0)", sched: "수집 직후 자동 + 관제탑이 4시간마다 적체 메움", feeds: "검증된 카페를 → AI 판정·임베딩으로" },
            judge: { icon: "🧠", what: "Claude가 후기 본문을 한 건씩 읽어 같은 이름의 딴 가게·엉뚱한 후기를 제거합니다. 토큰을 쓰므로 새벽에만, 기존공개→기존비공개→신규 순으로 돕니다.", sched: "새벽 0·2·4시 (Claude 구독 한도 내)", feeds: "선별된 후기를 → 재합성·그라운딩으로" },
            embed: { icon: "🔢", what: "카페 설명을 의미 벡터로 변환해 '부드러운 산미' 같은 의미검색이 되게 합니다. (Google Gemini)", sched: "4시간마다", feeds: "공개 준비 완료 신호" },
            verify: { icon: "🛡️", what: "후기수 일관성·PII 노출·좌표 범위·출처 표기 등 11종 규칙을 무오차로 점검합니다. (SQL 불변식, 토큰 0)", sched: "매일 6시", feeds: "이상 발견 시 자동 보류 처리" },
            grounding: { icon: "🔬", what: "만든 소개글이 실제 후기에 근거가 있는지(지어낸 환각 아닌지) 검사합니다. AI 판정이 끝난 카페만 검증해 순서가 꼬이지 않습니다.", sched: "판정 완료분 대상 상시", feeds: "환각 의심 시 → 판정 큐로 재투입" },
            audit: { icon: "🧹", what: "오염·중복 등 품질 플래그를 찾아 자동으로 수정합니다.", sched: "매일 3:30", feeds: "자동 교정 후 해소" },
          };
          const nodeBorder: Record<string, string> = { ok: "border-emerald-200", behind: "border-amber-300", stalled: "border-red-300", warn: "border-amber-300", idle: "border-stone-200" };
          // 신호등: 빨강·노랑·초록 3구. 상태에 맞는 램프만 켜져 깜빡(idle은 초록 약하게 점등).
          const Light = ({ status }: { status: string }) => (
            <div className="inline-flex items-center gap-[3px] rounded-full bg-stone-800 px-[5px] py-[3px] shadow-sm">
              <span className={`w-[7px] h-[7px] rounded-full ${status === "stalled" ? "bg-red-500 text-red-500 acc-lamp acc-blink" : "bg-stone-600"}`} />
              <span className={`w-[7px] h-[7px] rounded-full ${status === "warn" || status === "behind" ? "bg-amber-400 text-amber-400 acc-lamp acc-blink" : "bg-stone-600"}`} />
              <span className={`w-[7px] h-[7px] rounded-full ${status === "ok" ? "bg-emerald-400 text-emerald-400 acc-lamp acc-blink" : status === "idle" ? "bg-emerald-700" : "bg-stone-600"}`} />
            </div>
          );
          // 노드: 위에 신호등, 아이콘·이름·대기/마지막. 클릭 시 상세.
          const Node = ({ a }: { a: any }) => {
            if (!a) return null;
            const d = DESC[a.key];
            return (
              <button onClick={() => setSelAgent(a)} className={`relative shrink-0 w-[84px] rounded-2xl border-2 ${nodeBorder[a.status] || nodeBorder.idle} bg-white px-1.5 pt-2.5 pb-2 text-center transition hover:shadow-md hover:-translate-y-0.5 active:scale-95`}>
                <div className="flex justify-center -mt-[18px] mb-1"><Light status={a.status} /></div>
                <div className="text-[17px] leading-none">{d?.icon || "•"}</div>
                <div className="text-[10.5px] font-extrabold text-stone-800 mt-1 leading-tight">{a.label.split(" (")[0]}</div>
                <div className="text-[9px] mt-0.5 font-bold">{a.queue > 0 ? <span className="text-amber-600">대기 {a.queue.toLocaleString()}</span> : <span className="text-stone-400">{ago(a.ageH)}</span>}</div>
              </button>
            );
          };
          const Arrow = () => <span className="shrink-0 self-center text-stone-300 text-base select-none px-px">→</span>;
          // 전체화면용 큰 단계 카드 — 신호등+아이콘+이름+설명+대기, 안 잘리게 가로 꽉
          const BigStep = ({ a, arrow }: { a: any; arrow?: boolean }) => {
            if (!a) return null;
            const d = DESC[a.key];
            return (
              <>
                <button onClick={() => setSelAgent(a)} className={`w-full flex items-center gap-3 rounded-2xl border-2 ${nodeBorder[a.status] || nodeBorder.idle} bg-white px-3.5 py-3 text-left hover:shadow-lg transition active:scale-[0.99]`}>
                  <Light status={a.status} />
                  <span className="text-2xl leading-none shrink-0">{d?.icon || "•"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-stone-800 text-[14px] leading-tight">{a.label}</div>
                    <div className="text-[11px] text-stone-500 leading-snug mt-0.5 line-clamp-2">{d?.what || a.note}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {a.queue > 0 ? <div className="text-amber-600 font-extrabold text-[13px]">대기<br />{a.queue.toLocaleString()}</div> : <div className="text-stone-400 text-[11px]">{ago(a.ageH)}</div>}
                  </div>
                </button>
                {arrow && <div className="flex justify-center py-0.5 text-stone-400 text-xl leading-none select-none">↓</div>}
              </>
            );
          };
          const flow = ["collect", "synth", "judge", "embed"].map((k) => byKey[k]).filter(Boolean);
          const redteam = ["verify", "grounding", "audit"].map((k) => byKey[k]).filter(Boolean);
          return (
            <>
            <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">🛰️ 자율 운영 관제탑</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setTowerFull(true)} className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">⛶ 전체화면</button>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${oc[tower.overall] || oc.degraded}`}>{ocl[tower.overall] || tower.overall}</span>
                </div>
              </div>
              {tower.alerts?.length > 0 && (
                <div className="mb-2.5 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {tower.alerts.join(" · ")}</div>
              )}
              {tower.healed?.length > 0 && (
                <div className="mb-2.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">🔧 자가치유: {tower.healed.join(" · ")}</div>
              )}
              {tower.today && (
                <div className="mb-2.5">
                  <div className="text-[10px] font-bold text-stone-500 mb-1.5">📅 오늘의 수집 (KST · 자동 갱신)</div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {[
                      { l: "오늘 신규발굴", v: tower.today.newCafes, c: "text-amber-700 bg-amber-50 border-amber-200" },
                      { l: "오늘 합성", v: tower.today.synthesized, c: "text-sky-700 bg-sky-50 border-sky-200" },
                      { l: "오늘 공개", v: tower.today.published, c: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                      { l: "동 채움", v: `${tower.today.dongPct}%`, c: "text-stone-700 bg-stone-50 border-stone-200" },
                      { l: "노이즈탈락", v: tower.today.noise, c: "text-stone-500 bg-stone-50 border-stone-200" },
                      { l: "합성대기", v: tower.today.newQueue, c: "text-amber-600 bg-amber-50 border-amber-200" },
                    ].map((t) => (
                      <div key={t.l} className={`rounded-xl border px-2 py-2 text-center ${t.c}`}>
                        <div className="text-[15px] font-extrabold leading-none">{typeof t.v === "number" ? t.v.toLocaleString() : t.v}</div>
                        <div className="text-[9px] mt-1 font-bold whitespace-nowrap">{t.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* 메인은 간단히: 에이전트 상태 칩 + 전체 흐름 버튼(상세 흐름은 전체화면) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
                {tower.agents?.map((a: any) => {
                  const working = (a.queue > 0 || (a.ageH != null && a.ageH < 0.5)) && a.status !== "stalled";
                  return (
                    <button key={a.key} onClick={() => setSelAgent(a)} className="flex items-center gap-1.5 rounded-xl border border-stone-100 bg-stone-50 px-2.5 py-2 text-left hover:bg-stone-100 transition">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot[a.status] || "bg-stone-300"} ${working ? "acc-blink" : ""}`} />
                      <span className="text-[11px] font-bold text-stone-700 truncate flex-1">{a.label.split(" (")[0]}</span>
                      {a.queue > 0 && <span className="text-[9px] font-bold text-amber-600 shrink-0">{a.queue.toLocaleString()}</span>}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setTowerFull(true)} className="w-full mb-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-[12px] font-bold py-2 hover:bg-indigo-100 transition">⛶ 관제탑 전체 흐름 보기 (수집 → 공개)</button>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-stone-500">
                <span>공개 <b className="text-stone-700">{tower.coverage?.published?.toLocaleString()}</b>/{tower.coverage?.total?.toLocaleString()}</span>
                <span>raw {tower.coverage?.rawCachedPct}%</span>
                <span>판정 {tower.coverage?.judgedPct}%</span>
                <span>임베딩 {tower.coverage?.embeddedPct}%</span>
                <span className="ml-auto text-stone-400">갱신 {new Date(tower.generatedAt).toLocaleTimeString("ko-KR")}</span>
              </div>
            </div>
            {selAgent && (() => {
              const d = DESC[selAgent.key] || ({} as any);
              const stLabel = sl[selAgent.status] || selAgent.status;
              const pill = selAgent.status === "ok" ? "bg-emerald-100 text-emerald-700" : selAgent.status === "stalled" ? "bg-red-100 text-red-700" : selAgent.status === "idle" ? "bg-stone-100 text-stone-500" : "bg-amber-100 text-amber-700";
              return (
                <div onClick={() => setSelAgent(null)} className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center p-4">
                  <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
                    <div className="flex items-start gap-2.5 mb-2">
                      <span className="text-2xl leading-none">{d.icon || "•"}</span>
                      <div className="min-w-0">
                        <div className="text-base font-extrabold text-stone-800 leading-tight">{selAgent.label}</div>
                        <span className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${pill}`}>{stLabel}</span>
                      </div>
                      <button onClick={() => setSelAgent(null)} className="ml-auto text-stone-400 text-2xl leading-none px-1">×</button>
                    </div>
                    <p className="text-[13px] text-stone-700 mt-1.5 leading-relaxed">{d.what || selAgent.note}</p>
                    <div className="mt-3 space-y-1.5 text-[12px] border-t border-stone-100 pt-3">
                      <div className="flex gap-2"><span className="text-stone-400 w-16 shrink-0">⏰ 주기</span><span className="text-stone-700">{d.sched || "—"}</span></div>
                      <div className="flex gap-2"><span className="text-stone-400 w-16 shrink-0">➡️ 다음</span><span className="text-stone-700">{d.feeds || "—"}</span></div>
                      <div className="flex gap-2"><span className="text-stone-400 w-16 shrink-0">🕐 마지막</span><span className="text-stone-700">{ago(selAgent.ageH)}</span></div>
                      {selAgent.queue > 0 && <div className="flex gap-2"><span className="text-stone-400 w-16 shrink-0">📋 대기</span><span className="text-amber-600 font-bold">{selAgent.queue.toLocaleString()}건</span></div>}
                      <div className="flex gap-2"><span className="text-stone-400 w-16 shrink-0">📝 현황</span><span className="text-stone-700">{selAgent.note}</span></div>
                    </div>
                    <button onClick={() => setSelAgent(null)} className="mt-4 w-full rounded-xl bg-stone-800 text-white text-[13px] font-bold py-2.5">닫기</button>
                  </div>
                </div>
              );
            })()}
            {towerFull && (
              <div className="fixed inset-0 z-[60] bg-stone-900/95 overflow-y-auto">
                <div className="max-w-2xl mx-auto px-4 py-5 pb-16">
                  <div className="flex items-center justify-between mb-4 sticky top-0 bg-stone-900/95 -mx-4 px-4 py-2 z-10">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🛰️</span>
                      <span className="text-white font-extrabold text-sm">자율 운영 관제탑</span>
                      <Light status={tower.overall === "healthy" ? "ok" : tower.overall === "critical" ? "stalled" : "warn"} />
                    </div>
                    <button onClick={() => setTowerFull(false)} className="text-stone-300 text-[13px] font-bold rounded-full border border-stone-600 px-3 py-1 hover:bg-stone-800">✕ 닫기</button>
                  </div>
                  {tower.alerts?.length > 0 && <div className="mb-2 text-[11px] text-red-300 bg-red-950/60 border border-red-900 rounded-lg px-3 py-2">⚠ {tower.alerts.join(" · ")}</div>}
                  {tower.healed?.length > 0 && <div className="mb-2 text-[11px] text-emerald-300 bg-emerald-950/50 border border-emerald-900 rounded-lg px-3 py-2">🔧 자가치유: {tower.healed.join(" · ")}</div>}
                  <div className="text-[11px] font-extrabold text-stone-300 mb-2 mt-1">📥 데이터 생성 라인 · 수집 → 공개</div>
                  <div>
                    {flow.map((a: any) => <BigStep key={a.key} a={a} arrow />)}
                    <button onClick={() => setTowerFull(false)} className="w-full flex items-center gap-3 rounded-2xl border-2 border-emerald-400 bg-emerald-50 px-3.5 py-3 text-left">
                      <Light status="ok" />
                      <span className="text-2xl leading-none shrink-0">✅</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-extrabold text-emerald-800 text-[14px] leading-tight">공개 — 소비자 화면 노출</div>
                        <div className="text-[11px] text-emerald-600 mt-0.5">전 게이트를 통과한 카페만 지도·목록에 나타납니다.</div>
                      </div>
                      <div className="text-emerald-700 font-extrabold text-[13px] text-right shrink-0">{tower.coverage?.published?.toLocaleString()}<br />곳</div>
                    </button>
                  </div>
                  <div className="text-[11px] font-extrabold text-stone-300 mt-5 mb-2">🛡️ 검증 레드팀 · 위 전체를 상시 감시</div>
                  <div className="space-y-2">
                    {redteam.map((a: any) => <BigStep key={a.key} a={a} />)}
                  </div>
                  <div className="mt-5 rounded-2xl bg-stone-800/60 border border-stone-700 p-3">
                    <div className="text-[10px] font-bold text-stone-400 mb-2">📊 조립라인 현황 (각 단계 카페 수)</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-stone-300">
                      {tower.pipeline?.stages?.filter((s: any) => s.key !== "rejected").map((s: any) => (
                        <span key={s.key}><b className="text-white">{s.count?.toLocaleString() ?? 0}</b> {s.label}</span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-stone-400 mt-2 pt-2 border-t border-stone-700">
                      <span>공개 {tower.coverage?.published?.toLocaleString()}/{tower.coverage?.total?.toLocaleString()}</span>
                      <span>raw {tower.coverage?.rawCachedPct}%</span>
                      <span>판정 {tower.coverage?.judgedPct}%</span>
                      <span>임베딩 {tower.coverage?.embeddedPct}%</span>
                      <span>동 {tower.coverage?.dongPct}%</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-stone-500 text-center mt-4">노드를 누르면 상세 설명 · 신호등 깜빡임 = 작동 중 · 20초마다 자동 갱신</div>
                </div>
              </div>
            )}
            </>
          );
        })()}

        {/* ===== 🔄 실시간 자동화 현황 (10초 갱신) ===== */}
        {jstatus && (
          <div className="mb-6 space-y-3">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">🔄 자동화 현황 (10초 갱신)</span>

            {/* AI 판정 */}
            <div className="bg-white rounded-xl border border-stone-200 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-bold text-stone-700">🧮 AI 맥락 판정</span>
                <span className="text-[11px] text-stone-400">{jstatus.last ? `최근 ${new Date(jstatus.last).toLocaleString("ko-KR")}` : "미실행"}</span>
              </div>
              <div className="flex items-end justify-between mb-1.5">
                <span className="text-xl font-bold text-stone-800">{jstatus.pct}%</span>
                <span className="text-[11px] text-stone-500">{jstatus.done?.toLocaleString()} / {jstatus.total?.toLocaleString()}곳</span>
              </div>
              <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden mb-1.5">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all" style={{ width: `${jstatus.pct}%` }} />
              </div>
              <div className="flex gap-3 text-[11px] text-stone-500">
                <span>대기 <b className="text-amber-600">{jstatus.queue?.toLocaleString()}</b>곳</span>
                <span>· 오늘 <b className="text-emerald-600">{jstatus.today}</b>곳 판정</span>
              </div>
            </div>

            {/* 수집·공개 */}
            <div className="bg-white rounded-xl border border-stone-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-bold text-stone-700">📡 카페 수집·공개</span>
                <span className="text-[11px] text-stone-400">오늘 신규 <b className="text-blue-600">{jstatus.newToday ?? 0}</b>곳</span>
              </div>
              <div className="flex gap-4 text-[11px] text-stone-500">
                <span>전체 <b className="text-stone-700">{jstatus.cafesTotal?.toLocaleString()}</b>곳</span>
                <span>공개 <b className="text-emerald-600">{jstatus.cafesPub?.toLocaleString()}</b>곳</span>
                <span>수집대기 <b className="text-amber-600">{jstatus.collectQueue?.toLocaleString()}</b>곳</span>
              </div>
            </div>

            {/* 유튜브 */}
            <div className="bg-white rounded-xl border border-stone-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-bold text-stone-700">📺 유튜브 수집</span>
                <span className="text-[11px] text-stone-400">{jstatus.ytLast ? `최근 ${new Date(jstatus.ytLast).toLocaleString("ko-KR")}` : "미실행"}</span>
              </div>
              <div className="flex gap-4 text-[11px] text-stone-500">
                <span>수집완료 <b className="text-stone-700">{jstatus.ytTotal?.toLocaleString()}</b>곳</span>
                <span>오늘 <b className="text-emerald-600">{jstatus.ytToday ?? 0}</b>곳</span>
                <span>대기 <b className="text-amber-600">{jstatus.ytQueue?.toLocaleString()}</b>곳</span>
              </div>
            </div>
          </div>
        )}

        {/* ===== 🚨 품질 감사 플래그 ===== */}
        {auditFlags && (auditFlags.flags?.filter((f: any) => !f.resolved).length > 0) && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-red-500 uppercase tracking-wider">🚨 품질 오염 감지 ({auditFlags.flags.filter((f: any) => !f.resolved).length}건)</span>
              <span className="text-[11px] text-stone-400">{auditFlags.lastAudit}</span>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1.5">
              {auditFlags.flags.filter((f: any) => !f.resolved).slice(0, 8).map((f: any, i: number) => (
                <div key={i} className="text-[11px] text-red-700">
                  <b>{f.cafe_name}</b> — {f.detail?.slice(0, 60)}
                </div>
              ))}
            </div>
          </div>
        )}
        {auditFlags && auditFlags.flags?.filter((f: any) => !f.resolved).length === 0 && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] text-emerald-700">
            ✅ 품질 감사 이상 없음 — {auditFlags.lastAudit}
          </div>
        )}

        {/* ===== 🛡️ 검증 에이전트(레드팀) ===== */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">🛡️ 데이터 검증 (레드팀 · 매일 자동)</span>
            <button onClick={runVerify} disabled={verifying} className="text-[11px] bg-stone-800 text-white rounded-full px-3 py-1 disabled:opacity-50">{verifying ? "검사 중…" : "지금 검사"}</button>
          </div>
          {verify ? (
            <div className={`rounded-xl border p-3 ${verify.status === "pass" ? "bg-emerald-50 border-emerald-200" : verify.status === "warn" ? "bg-amber-50 border-amber-200" : "bg-rose-50 border-rose-200"}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{verify.status === "pass" ? "✅" : verify.status === "warn" ? "🟡" : "🔴"}</span>
                <span className="font-bold text-sm">{verify.status === "pass" ? "전체 정상 — 한치의 오차 없음" : verify.status === "warn" ? `주의 ${verify.warns}건` : `오류 ${verify.fails}건 — 즉시 확인 필요`}</span>
                <span className="text-[10px] text-stone-400 ml-auto">{verify.ran_at ? new Date(verify.ran_at).toLocaleString("ko-KR") : ""}</span>
              </div>
              <div className="space-y-1">
                {(verify.checks ?? []).map((c: any) => (
                  <div key={c.key} className="flex items-center gap-2 text-[12px]">
                    <span>{c.count === 0 ? "🟢" : c.severity === "fail" ? "🔴" : "🟡"}</span>
                    <span className="flex-1 text-stone-700">{c.label}</span>
                    {c.count > 0 && c.samples?.length > 0 && <span className="text-[10px] text-stone-400 truncate max-w-[40%]">{c.samples.slice(0, 2).join(", ")}</span>}
                    <span className={c.count > 0 ? (c.severity === "fail" ? "text-rose-600 font-bold" : "text-amber-600 font-bold") : "text-stone-300"}>{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-[12px] text-stone-400">검증 리포트 없음 — '지금 검사'를 눌러 실행하세요.</p>}

          {/* 🧠 LLM 그라운딩(보조) */}
          {grounding && grounding.total > 0 && (
            <div className={`mt-2 rounded-xl border p-3 ${grounding.flagged > 0 ? "bg-amber-50 border-amber-200" : "bg-stone-50 border-stone-200"}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] font-bold">🧠 LLM 그라운딩 (보조 · 환각 탐지)</span>
                <span className="text-[11px] text-stone-500 ml-auto">{grounding.total}곳 검사 · 의심 <b className={grounding.flagged > 0 ? "text-amber-600" : "text-emerald-600"}>{grounding.flagged}</b></span>
              </div>
              {grounding.flagged > 0 ? (
                <div className="space-y-0.5">
                  {grounding.samples.map((s: any, i: number) => (
                    <div key={i} className="text-[11px] text-stone-600"><b>{s.s}</b>: {s.issue || "근거 불충분"}</div>
                  ))}
                  <p className="text-[10px] text-stone-400 mt-1">⚠ LLM 추정이라 자동조치 안 함 — 사람이 확인 후 재합성/수정하세요.</p>
                </div>
              ) : <p className="text-[11px] text-emerald-600">의심 항목 없음 — 생성 정체성이 근거 후기와 일치.</p>}
            </div>
          )}
        </div>

        {/* ===== 모달 트리거 (구독 카페 현황 · 유튜브 수집 · 내 카페 기록) ===== */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={() => setShowSubsModal(true)} className="flex-1 py-2.5 text-[13px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl">💳 구독 카페 현황{subscribers.length ? ` (${subscribers.length})` : ""}</button>
          <button onClick={() => setShowYtModal(true)} className="flex-1 py-2.5 text-[13px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">📺 유튜브 수집{yt?.withYt != null ? ` (${yt.withYt})` : ""}</button>
          <button onClick={() => { setShowVisits(true); fetch("/api/admin/visits", { headers: { "x-admin-password": pw } }).then((x) => x.json()).then((d) => { if (d.ok) setVisits(d); }); }} className="flex-1 py-2.5 text-[13px] font-bold text-pink-700 bg-pink-50 border border-pink-200 rounded-xl">❤ 내 카페 기록{visits?.stat?.total != null ? ` (${visits.stat.total})` : ""}</button>
        </div>

        {/* ❤ 내 카페 방문기록 모달 */}
        {showVisits && (
          <div className="fixed inset-0 z-[6000] flex items-end justify-center bg-black/40" onClick={() => setShowVisits(false)}>
            <div className="w-full max-w-2xl bg-white rounded-t-2xl max-h-[88dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="text-sm font-bold text-stone-800">❤ 내 카페 방문기록 {visits?.stat && <span className="text-[11px] text-stone-400 font-normal">총 {visits.stat.total} · 사용자 {visits.stat.users} · 즐겨찾기 {visits.stat.favs}</span>}</span>
                <button onClick={() => setShowVisits(false)} className="text-2xl text-stone-400 leading-none">×</button>
              </div>
              <div className="overflow-y-auto flex-1 p-3 space-y-2">
                {(visits?.visits ?? []).map((v: any) => (
                  <div key={v.id} className="flex gap-3 border border-stone-200 rounded-xl p-3">
                    {v.photo_url && <img src={v.photo_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {v.favorite && <span className="text-amber-500">★</span>}
                        <b className="text-[13px] text-stone-800">{v.cafe_name}</b>
                        <span className="text-[10px] text-stone-400">{v.area}</span>
                      </div>
                      {v.memory && <div className="text-[12px] text-stone-600 mt-1 leading-relaxed whitespace-pre-wrap">{v.memory}</div>}
                      <div className="text-[10px] text-stone-400 mt-1">{new Date(v.created_at).toLocaleString("ko-KR")} · 익명 {String(v.device_id).slice(0, 6)}</div>
                    </div>
                  </div>
                ))}
                {(!visits?.visits || visits.visits.length === 0) && <p className="text-[12px] text-stone-400 text-center py-6">아직 등록된 방문 기록이 없어요.</p>}
              </div>
            </div>
          </div>
        )}

        {/* 📺 유튜브 수집 현황 모달 */}
        {showYtModal && yt && (
          <div className="fixed inset-0 z-[6000]" onClick={() => setShowYtModal(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-stone-50 rounded-t-2xl p-4 sm:inset-0 sm:m-auto sm:max-w-md sm:h-fit sm:max-h-[85vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-stone-800">📺 유튜브 수집 현황 <span className="text-[11px] text-stone-400 font-normal">보유 {yt.withYt}·오늘 {yt.checkedToday}·남은 {yt.remaining}</span></span>
              <button onClick={() => setShowYtModal(false)} className="text-2xl text-stone-400 leading-none">×</button>
            </div>
            {yt.rows?.length > 0 ? (
              <div className="space-y-3">
                {Object.entries(groupByDate(yt.rows)).map(([date, cafes]: any) => (
                  <div key={date}>
                    <div className="text-[11px] font-bold text-stone-600 mb-1">📅 {date} <span className="text-stone-400 font-normal">({cafes.length}곳 수집)</span></div>
                    <div className="space-y-1.5">
                      {cafes.map((c: any) => (
                        <div key={c.id} className="bg-white rounded-lg border border-stone-100 p-2">
                          <div className="text-[12px] font-bold text-stone-800">{c.name} <span className="text-[10px] text-stone-400 font-normal">{c.area}</span> <span className="text-[10px] text-rose-500">▶{c.videos?.length || 0}</span></div>
                          {(c.videos || []).map((v: any, i: number) => (
                            <a key={i} href={v.l} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-blue-600 truncate hover:underline">▶ {v.q}{v.s ? ` · ${v.s}` : ""}</a>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-[12px] text-stone-400">최근 30일 유튜브 수집 없음.</p>}
            <p className="text-[10px] text-stone-400 mt-2">유튜브 API 쿼터 한도로 매일 조금씩 수집(04:00 백필). 남은 {yt.remaining}곳 순차 진행.</p>
            </div>
          </div>
        )}

        {/* 💳 구독 카페 현황 모달 */}
        {showSubsModal && (
          <div className="fixed inset-0 z-[6000]" onClick={() => setShowSubsModal(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-stone-50 rounded-t-2xl p-4 sm:inset-0 sm:m-auto sm:max-w-md sm:h-fit sm:max-h-[85vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><span className="text-sm font-bold text-stone-800">💳 구독 카페 현황 ({subscribers.length})</span><button onClick={() => setShowSubsModal(false)} className="text-2xl text-stone-400 leading-none">×</button></div>
            {subscribers.length > 0 ? (
            <div className="space-y-2">
              {subscribers.map((s) => {
                const dleft = s.expires_at ? Math.max(0, Math.ceil((new Date(s.expires_at).getTime() - Date.now()) / 86400000)) : null;
                const stColor = s.status === "active" ? "text-emerald-600" : s.status === "pending" ? "text-amber-600" : "text-stone-400";
                const stLabel = s.status === "active" ? "활성" : s.status === "pending" ? "대기" : s.status === "expired" ? "만료" : s.status === "cancelled" ? "해지" : s.status;
                return (
                  <div key={s.id} className="bg-white rounded-xl border border-amber-200 p-3">
                    <div className="min-w-0">
                      <span className="font-bold text-sm">{s.cafe_name}</span>
                      <span className={`text-[11px] ml-2 font-bold ${stColor}`}>{stLabel}{s.status === "active" && dleft != null ? ` · D-${dleft}` : ""}</span>
                      <div className="text-[12px] text-stone-600 truncate">{s.owner_name} · 📞 {s.contact}{s.email ? ` · ✉️ ${s.email}` : ""} · ₩{(s.price ?? 9900).toLocaleString()}/월</div>
                      {s.status === "active" && s.pin && <div className="text-[12px] mt-1">🔑 PIN <b className="font-mono tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{s.pin}</b> <span className="text-[10px] text-stone-400">(이메일 발송 · 사장님 로그인용)</span></div>}
                    </div>
                    <div className="flex gap-2 mt-2">
                      {s.status !== "active" && <button onClick={() => subAct(s.id, "activate")} className="flex-1 py-1.5 text-[12px] font-bold text-emerald-700 bg-emerald-50 rounded-lg">✓ 활성화(30일)</button>}
                      {s.status === "active" && <button onClick={() => subAct(s.id, "extend")} className="flex-1 py-1.5 text-[12px] font-bold text-stone-700 bg-stone-100 rounded-lg">+30일 연장</button>}
                      {s.status === "active" && <button onClick={() => subAct(s.id, "cancel")} className="flex-1 py-1.5 text-[12px] text-rose-600 bg-rose-50 rounded-lg">해지</button>}
                    </div>
                  </div>
                );
              })}
            </div>
            ) : <p className="text-[13px] text-stone-400 py-3 text-center">구독 회원이 아직 없어요.</p>}
            <p className="text-[10px] text-stone-400 mt-2">활성화 시 우선노출 자동 ON·만료/해지 시 OFF. 연락처는 암호화 저장.</p>
            </div>
          </div>
        )}

        {/* ===== 💎 구독 신청 ===== */}
        {(subs.length > 0 || purged > 0) && (
          <div className="mb-6">
            <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">💎 홍보팩 구독 신청 ({subs.length})</div>
            {purged > 0 && <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-2 text-[11.5px] text-rose-700">🔔 보유기간 만료로 <b>{purged}건의 개인정보가 자동 삭제</b>됐어요. 해당 사장님께 다시 연락하려면 <b>재수집·재동의</b>가 필요합니다.</div>}
            <div className="space-y-2">
              {subs.map((s) => (
                <div key={s.id} className="bg-white rounded-xl border border-amber-200 p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-bold text-sm">{s.cafe_name}</span>
                    <span className="text-[11px] text-stone-400 ml-2">{s.plan}</span>
                    <div className="text-[12px] text-stone-600 truncate">📞 {s.contact}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-stone-400">{new Date(s.created_at).toLocaleDateString("ko-KR")}</div>
                    {s.delete_in != null && <div className="text-[9px] text-rose-400">자동삭제 D-{s.delete_in}</div>}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-stone-400 mt-1.5">연락처는 암호화 저장되며 보유기간 만료 시 자동 삭제됩니다. 결제 안내 후 아래 쇼케이스에서 ⭐우선노출을 켜주세요.</p>
          </div>
        )}

        {/* ===== 🎀 쇼케이스 승인 · AI 카피 생성 ===== */}
        {(
          <div className="mb-6">
            <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">🎀 쇼케이스 승인 · AI 카피 생성 ({review.length})</div>
            {review.length === 0 && <p className="text-[12px] text-stone-400 bg-white rounded-xl border p-4">대기 중인 사장님 쇼케이스 요청이 없어요. 사장님이 글(또는 영상)을 저장하면 여기에서 <b className="text-stone-600">🤖 AI 어필 카피 생성</b> → <b className="text-stone-600">✓ 승인</b> 할 수 있어요.</p>}
            <div className="space-y-3">
              {review.map((p) => (
                <div key={p.cafe_id} className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm">{p.name}</span>
                      <span className="text-[11px] text-stone-400">{p.area}</span>
                      {p.ai_pending && <span className="text-[10px] bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded-full ml-auto">AI 생성 대기</span>}
                    </div>
                    {p.intro && <p className="text-[12px] text-stone-500 mb-2 line-clamp-2">사장님 글: {p.intro}</p>}
                    {p.style === 0 ? (
                      p.video_url ? (
                        <div className="rounded-lg overflow-hidden bg-black">
                          <span className="text-[10px] text-amber-600 px-1">🎬 영상 (소비자 노출 예정)</span>
                          <video src={p.video_url} controls playsInline preload="metadata" className="w-full max-h-48" />
                        </div>
                      ) : <p className="text-[12px] text-stone-400">영상 업로드 대기 중</p>
                    ) : p.ai_headline ? (
                      <div className="rounded-lg overflow-hidden bg-stone-900 text-stone-50">
                        {p.photos?.[0] && <img src={p.photos[0]} alt="" className="w-full h-28 object-cover" />}
                        <div className="p-3">
                          <div className="text-[9px] text-amber-300 mb-0.5">미리보기 (소비자 노출 예정)</div>
                          <div className="text-base font-bold">{p.ai_headline}</div>
                          {p.ai_tagline && <div className="text-[12px] text-stone-300 mt-0.5">{p.ai_tagline}</div>}
                          {Array.isArray(p.ai_points) && p.ai_points.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{p.ai_points.map((pt: string, i: number) => <span key={i} className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">{pt}</span>)}</div>}
                        </div>
                      </div>
                    ) : p.ai_pending ? (
                      <p className="text-[12px] text-amber-600">🕐 AI 생성 요청됨 — 로컬 배치가 처리 후 여기에 미리보기가 떠요</p>
                    ) : (
                      <button onClick={() => promoAct(p.cafe_id, "generate")} className="w-full py-2.5 text-sm font-bold text-white bg-stone-800 rounded-lg">🤖 AI 어필 카피 생성</button>
                    )}
                    {/* 📊 성과(1차 데이터) — 공개 중일 때 */}
                    {p.approved && (
                      <div className="flex gap-2 mt-2 text-[11px] text-stone-500">
                        <span>👁 노출 <b className="text-stone-700">{p.views ?? 0}</b></span>
                        <span>· 클릭 <b className="text-stone-700">{p.clicks ?? 0}</b></span>
                        <span>· 재생 <b className="text-stone-700">{p.plays ?? 0}</b></span>
                      </div>
                    )}
                  </div>
                  <div className="flex border-t border-stone-100">
                    {!p.approved ? (
                      <button onClick={() => promoAct(p.cafe_id, "approve")} disabled={!p.ai_headline && !p.video_url} className="flex-1 py-2.5 text-sm font-bold text-emerald-700 disabled:text-stone-300">✓ 승인 (노출)</button>
                    ) : (
                      <button onClick={() => promoAct(p.cafe_id, p.featured ? "unfeature" : "feature")} className={`flex-1 py-2.5 text-sm font-bold ${p.featured ? "text-amber-700 bg-amber-50" : "text-stone-700"}`}>{p.featured ? "⭐ 우선노출 ON (해제)" : "☆ 우선노출 켜기 (유료)"}</button>
                    )}
                    <button onClick={() => promoAct(p.cafe_id, "reject")} className="flex-1 py-2.5 text-sm text-rose-600 border-l border-stone-100">✕ {p.approved ? "내리기" : "반려"}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== 콘텐츠 현황 ===== */}
        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">콘텐츠 현황</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <Kpi label="전체 카페" value={ct?.total ?? "·"} />
          <Kpi label="공개 중" value={ct?.published ?? "·"} color="text-emerald-600" />
          <Kpi label="비공개" value={ct?.hidden ?? "·"} color="text-stone-500" />
          <Kpi label="사장님 등록대기" value={ct?.owner_pending ?? "·"} color="text-blue-600" sub="사람 검수 필요" />
        </div>

        {ct && (
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <Card title="등급 분포 (공개)" note="검증 30+ · 참고 5~30 · 발굴 5미만(자동 비공개)">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={ct.grades} dataKey="n" nameKey="grade" cx="50%" cy="50%" innerRadius={42} outerRadius={70} paddingAngle={2}
                    label={(e: any) => `${e.grade} ${e.n}`} labelLine={false} fontSize={11}>
                    {ct.grades.map((g) => <Cell key={g.grade} fill={GRADE_COLOR[g.grade] ?? "#cbd5e1"} />)}
                  </Pie><Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>
            <Card title="지역별 공개 카페 (상위 12)">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={ct.topRegions} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <XAxis type="number" hide /><YAxis type="category" dataKey="region" width={70} tick={{ fontSize: 10, fill: "#57534e" }} />
                  <Tooltip /><Bar dataKey="n" fill={BAR} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {ct && (
          <div className="mb-4">
            <Card title="🛡 리뷰 검증 엔진 현황 (해자)" note="규칙으로 노이즈 제거 → Sonnet이 맥락 판정 → 양질 후기만 공개. 매일 자동 갱신.">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                <div><div className="text-xl font-bold text-stone-900">{ct.total ? Math.round((ct.raw_cached / ct.total) * 100) : 0}%</div><div className="text-[11px] text-stone-500">원본 수집(예열)</div><div className="text-[10px] text-stone-400">{ct.raw_cached}/{ct.total}</div></div>
                <div><div className="text-xl font-bold text-emerald-600">{ct.total ? Math.round((ct.llm_judged / ct.total) * 100) : 0}%</div><div className="text-[11px] text-stone-500">AI 맥락 판정</div><div className="text-[10px] text-stone-400">{ct.llm_judged}/{ct.total}</div></div>
                <div><div className="text-xl font-bold text-[#9c6b3f]">{ct.quality.avg_noise_pct ?? 0}%</div><div className="text-[11px] text-stone-500">노이즈 제거율</div><div className="text-[10px] text-stone-400">옥석만</div></div>
              </div>
              <p className="text-[10px] text-stone-400 mt-2.5">예열(00:10)으로 원본을 한 번 모아두고, Sonnet 판정(04:00)이 매일 정확도를 끌어올립니다.</p>
            </Card>
          </div>
        )}

        {ct && (
          <div className="mb-6">
            <Card title="데이터 품질" note="모든 화면 데이터는 검증된 옥석 리뷰만 사용">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div><div className="text-xl font-bold text-[#9c6b3f]">{ct.quality.avg_noise_pct ?? 0}%</div><div className="text-[11px] text-stone-500">평균 노이즈 제거</div></div>
                <div><div className="text-xl font-bold text-emerald-600">{keptPct}%</div><div className="text-[11px] text-stone-500">옥석 채택률</div></div>
                <div><div className="text-xl font-bold text-stone-900">{ct.published ? Math.round(((ct.pub_embedded ?? 0) / ct.published) * 100) : 0}%</div><div className="text-[11px] text-stone-500">임베딩 커버리지<br/>(공개 기준)</div></div>
                <div><div className="text-xl font-bold text-stone-900">{ct.published ? Math.round(((ct.pub_has_dates ?? 0) / ct.published) * 100) : 0}%</div><div className="text-[11px] text-stone-500">리뷰주기 데이터<br/>(공개 기준)</div></div>
              </div>
              <p className="text-[11px] text-stone-400 mt-2.5 text-center">총 수집 {ct.quality.raw?.toLocaleString()}건 중 노이즈 {ct.quality.rejected?.toLocaleString()}건 제거 → 옥석 {(ct.quality.raw - ct.quality.rejected).toLocaleString()}건</p>
            </Card>
          </div>
        )}

        {/* ===== 접속/방문자 (익명) ===== */}
        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">접속 · 방문자 현황</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <Kpi label="총 방문자" value={vs?.total ?? "·"} sub="익명 식별자 기준" />
          <Kpi label="위치 동의" value={vs?.agreed ?? "·"} color="text-emerald-600" sub={`동의율 ${agreeRate}%`} />
          <Kpi label="재방문자" value={vs?.returners ?? "·"} color="text-[#9c6b3f]" sub={`평균 ${vs?.avg_visits ?? 0}회`} />
          <Kpi label="최근 7일 활성" value={vs?.active7d ?? "·"} color="text-amber-600" sub={`신규 ${vs?.new7d ?? 0}`} />
        </div>

        {vs && (
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <Card title="일별 신규 방문 (최근 14일)">
              {vs.daily.length === 0 ? <p className="text-sm text-stone-400 py-8 text-center">아직 방문 데이터가 적어요.</p> : (
                <ResponsiveContainer width="100%" height={170}>
                  <AreaChart data={vs.daily} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
                    <defs><linearGradient id="vis" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5f7355" stopOpacity={0.5} /><stop offset="100%" stopColor="#5f7355" stopOpacity={0.05} /></linearGradient></defs>
                    <CartesianGrid stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="d" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={1} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: "#94a3b8" }} width={26} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any) => [`${v}명`, "신규"]} />
                    <Area type="monotone" dataKey="n" stroke="#5f7355" strokeWidth={2} fill="url(#vis)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card title="방문자 동네 분포 (위치 동의자)" note="≈500m 익명화 · 개인정보 미수집">
              {vs.regions.length === 0 ? <p className="text-sm text-stone-400 py-8 text-center">위치 동의 데이터가 아직 적어요.</p> : (
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={vs.regions} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <XAxis type="number" hide /><YAxis type="category" dataKey="region" width={80} tick={{ fontSize: 10, fill: "#57534e" }} />
                    <Tooltip /><Bar dataKey="n" fill="#5f7355" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        )}
        <p className="text-[10px] text-stone-400 mb-6">합법·익명 수집만: 브라우저 익명 식별자, (동의 시) 대략 지역(≈500m). 이름·연락처·정밀위치는 수집하지 않습니다.</p>

        {/* ===== 검수 관리 ===== */}
        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">검수 관리</div>
        <section className="mb-4">
          <h2 className="text-sm font-bold text-stone-700 mb-1">🙋 사장님 등록 검수 대기 ({ownerPending.length})</h2>
          <p className="text-[11px] text-stone-400 mb-2">사장님이 <b>/cafe/register</b>로 직접 등록한 가게. 확인 후 공개/삭제.</p>
          {ownerPending.length === 0 ? <p className="text-sm text-stone-400 bg-white rounded-xl p-4 border">아직 사장님 직접 등록 신청이 없습니다.</p> :
            <div className="space-y-2">{ownerPending.map((c) => <Row key={c.id} c={c} />)}</div>}
        </section>
        <section className="mb-6">
          <h2 className="text-sm font-bold text-stone-700 mb-1">🔍 자동수집 미공개 · 데이터 부족 ({autoHidden.length})</h2>
          <p className="text-[11px] text-stone-400 mb-2">검증 리뷰 5건 미만(발굴)으로 자동 비공개. 사람 요청 아님 · 리뷰 쌓이면 자동 공개.</p>
          {autoHidden.length === 0 ? <p className="text-sm text-stone-400">없음</p> : (
            <>
              <button onClick={() => setShowAuto((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 mb-2">{showAuto ? "접기 ▲" : `목록 펼치기 ▼ (${autoHidden.length})`}</button>
              {showAuto && <div className="space-y-2">{autoHidden.map((c) => <Row key={c.id} c={c} />)}</div>}
            </>
          )}
        </section>

        {/* ===== 카페 검색 관리 (1000+ 전체 나열 대신 검색) ===== */}
        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">카페 검색 관리</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`카페 이름 검색 (전체 ${cafes.length}곳)`} className="w-full border rounded-lg px-4 py-2.5 mb-3 bg-white" />
        {q.trim() === "" ? <p className="text-sm text-stone-400">이름을 검색해 개별 카페를 공개/숨김/삭제 관리하세요. (공개 {live.length} · 비공개 {ownerPending.length + autoHidden.length})</p>
          : searched.length === 0 ? <p className="text-sm text-stone-400">'{q}' 검색 결과 없음</p>
          : <div className="space-y-2">{searched.slice(0, 40).map((c) => <Row key={c.id} c={c} />)}{searched.length > 40 && <p className="text-xs text-stone-400 text-center">상위 40곳만 표시 · 더 좁혀 검색하세요</p>}</div>}
      </div>
    </main>
  );
}
