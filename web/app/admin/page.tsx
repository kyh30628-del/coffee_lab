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

const GRADE_COLOR: Record<string, string> = { 검증: "#5f7355", 참고: "#9c6b3f", 후보: "#a8927a", 미합성: "#cbd5e1" };
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
  const [todayDetail, setTodayDetail] = useState<any>(null); // 오늘의 수집 카드 클릭 → 상세 목록 모달
  const [towerFull, setTowerFull] = useState(false);
  // 📐 CEO 확정 규율: 모든 섹션 기본 접힘 + 클릭 토글 + 접힌 헤더에 건수·HIGH 요약 (org 페이지와 동일 패턴, 세션 내 useState)
  // 본체 대시보드: 핵심 운영 섹션(관제탑·자동화 현황)은 기본 펼침, 나머지는 접힘(CEO 확정 2026-07-02).
  //   '전부 접힘'은 org(조직 관제) 전용 규율 — 본체는 운영상태를 한눈에 봐야 해 핵심만 펼친다.
  const [openSecs, setOpenSecs] = useState<Record<string, boolean>>({ tower: true, auto: true });
  const toggleSec = (k: string) => setOpenSecs((s) => ({ ...s, [k]: !s[k] }));
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  // silent=true면 로딩 표시 없이 조용히 갱신(자동 폴링용 — 화면 깜빡임 방지)
  const loadAnalytics = (password: string, silent = false) => { if (!silent) setAnalytics(null); fetch("/api/admin/analytics", { headers: { "x-admin-password": password }, cache: "no-store" }).then((x) => x.json()).then((d) => { if (d.ok) setAnalytics(d); }).catch(() => {}); };
  const openAnalytics = () => { setShowAnalytics(true); loadAnalytics(pw); };
  const [showBorderline, setShowBorderline] = useState(false);
  const [blData, setBlData] = useState<any>(null);
  const loadBorderline = (password: string) => fetch("/api/admin/borderline", { headers: { "x-admin-password": password }, cache: "no-store" }).then((x) => x.json()).then((d) => { if (d.ok) setBlData(d); }).catch(() => {});
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [showSubsModal, setShowSubsModal] = useState(false);
  const [emailReady, setEmailReady] = useState<boolean | null>(null); // 이 환경에 이메일 발송키 있는지
  const [liveExposure, setLiveExposure] = useState<boolean | null>(null); // 소비자에게 우선노출이 실제 보이는지(SUBSCRIPTION_LIVE)
  const [subMsg, setSubMsg] = useState(""); // 승인 결과(키 발송 성공/실패) 안내
  const [showOnboard, setShowOnboard] = useState(false); // 온보딩 메일 미리보기 모달
  const [onboard, setOnboard] = useState<any>(null);     // {trial:{subject,html}, paid:{subject,html}}
  const [onboardTab, setOnboardTab] = useState<"trial" | "paid">("trial");
  const openOnboard = () => { setShowOnboard(true); if (!onboard) fetch("/api/onboarding-preview", { headers: { "x-admin-password": pw } }).then((x) => x.json()).then((d) => { if (d.ok) setOnboard(d); }).catch(() => {}); };
  const [showRotation, setShowRotation] = useState(false); // 노출 로테이션 현황 모달
  const [rotation, setRotation] = useState<any>(null);
  const loadRotation = () => fetch("/api/admin/rotation", { headers: { "x-admin-password": pw }, cache: "no-store" }).then((x) => x.json()).then((d) => { if (d.ok) setRotation(d); }).catch(() => {});
  const openRotation = () => { setShowRotation(true); loadRotation(); };
  // 📰 뉴스레터
  const [showNL, setShowNL] = useState(false);
  const [nlList, setNlList] = useState<any[]>([]);
  const [nlRecipients, setNlRecipients] = useState(0);
  const [nlSel, setNlSel] = useState<any>(null);     // 선택한 뉴스레터 전문
  const [nlBusy, setNlBusy] = useState("");
  const [nlMsg, setNlMsg] = useState("");
  const [showYtModal, setShowYtModal] = useState(false);
  const [showVisits, setShowVisits] = useState(false);
  const [visits, setVisits] = useState<any>(null);
  const loadSubscribers = (password: string) => fetch("/api/subscription?all=1", { headers: { "x-admin-password": password } }).then((x) => x.json()).then((d) => { if (d.ok) { setSubscribers(d.subs ?? []); setEmailReady(!!d.emailReady); setLiveExposure(!!d.liveExposure); } }).catch(() => {});
  const subAct = async (id: number, action: string, days?: number, reason?: string) => {
    try {
      const d = await (await fetch("/api/subscription", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" }, body: JSON.stringify({ id, action, ...(days ? { days } : {}), ...(reason ? { reason } : {}) }) })).json().catch(() => ({}));
      if (action === "activate") {
        if (!d.ok) setSubMsg("❌ 승인 실패: " + (d.error || "알 수 없는 오류"));
        else if (d.emailed) setSubMsg(`✅ 승인 완료 · 키(PIN ${d.pin})가 ${d.email || "등록 이메일"}로 자동 발송됐어요.`);
        else setSubMsg(`⚠️ 승인은 됐지만 이메일 자동발송 실패 — PIN ${d.pin}을 사장님께 직접 전달하세요 (이메일 미설정/주소 오류).`);
      }
      loadSubscribers(pw); fetch("/api/judge-status", { headers: { "x-admin-password": pw } });
    } catch { setSubMsg("❌ 처리 중 오류가 났어요. 다시 시도해 주세요."); }
  };
  const suspendSub = (id: number, cafe: string) => { const reason = window.prompt(`🚫 "${cafe}" 이용 즉시정지\n사칭/위반 사유를 적어주세요(증빙으로 기록됩니다). PIN 접근·우선노출이 즉시 차단됩니다.`); if (reason != null) subAct(id, "suspend", undefined, reason || "사유 미기재"); };
  // 📰 뉴스레터
  const NLH = () => ({ "x-admin-password": pw, "Content-Type": "application/json" });
  const loadNL = () => fetch("/api/newsletter", { headers: { "x-admin-password": pw } }).then((x) => x.json()).then((d) => { if (d.ok) { setNlList(d.list ?? []); setNlRecipients(d.recipients ?? 0); } }).catch(() => {});
  const nlOpen = async (id: number) => { const d = await (await fetch(`/api/newsletter?id=${id}`, { headers: { "x-admin-password": pw } })).json(); if (d.ok) { setNlSel(d.newsletter); setNlRecipients(d.recipients ?? nlRecipients); } };
  const nlPost = async (body: any) => (await fetch("/api/newsletter", { method: "POST", headers: NLH(), body: JSON.stringify(body) })).json();
  const nlGenerate = async () => { setNlBusy("generate"); setNlMsg(""); const d = await nlPost({ action: "generate" }); setNlBusy(""); if (d.ok) { setNlMsg(`초안 생성됨 (비용 $${(d.cost ?? 0).toFixed(3)})`); await loadNL(); if (d.id) nlOpen(d.id); } else setNlMsg("생성 실패: " + (d.error || "")); };
  const nlAct = async (action: string, id: number, extra?: any) => { setNlBusy(action); const d = await nlPost({ action, id, ...extra }); setNlBusy(""); if (action === "send") setNlMsg(d.ok ? `발송 완료 — 성공 ${d.sent} / 실패 ${d.failed}` : "발송 실패: " + (d.error || "")); else if (action === "test") setNlMsg(d.ok ? "미리보기 메일 발송됨" : "실패: " + (d.error || "")); await loadNL(); if (id) nlOpen(id); };
  // '오늘의 수집' 카드 클릭 → 그 지표에 해당하는 카페 목록을 모달로(orchestrator와 동일 KST 필터).
  const openToday = (metric: string, label: string) => {
    if (!metric) return;
    setTodayDetail({ metric, label, loading: true, cafes: [] });
    fetch(`/api/admin/today-detail?metric=${metric}`, { headers: { "x-admin-password": pw }, cache: "no-store" })
      .then((x) => x.json())
      .then((d) => setTodayDetail({ metric, label, loading: false, cafes: d.ok ? d.cafes ?? [] : [], capped: d.capped, error: d.ok ? null : d.error }))
      .catch(() => setTodayDetail({ metric, label, loading: false, cafes: [], error: "불러오기 실패" }));
  };
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
    loadBorderline(password);
  };
  // 🧮 전 지표 자동 갱신(15초) — 백그라운드 작업이 실시간 반영(새로고침 불필요)
  useEffect(() => {
    if (!authed || !pw) return;
    refreshNumbers(pw);
    loadNL(); // 뉴스레터 상태 로드 — 미발송 초안 리마인더용
    loadSubscribers(pw); // 승인 대기 사장님 리마인더용
    const id = setInterval(() => refreshNumbers(pw), 15000);
    return () => clearInterval(id);
  }, [authed, pw]);
  // 📈 접속·유입 대시보드가 열려있는 동안 20초마다 자동 갱신(실시간) — 조용히(silent) 갱신해 깜빡임 없음
  useEffect(() => {
    if (!showAnalytics || !pw) return;
    const id = setInterval(() => loadAnalytics(pw, true), 20000);
    return () => clearInterval(id);
  }, [showAnalytics, pw]);

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
    fetch("/api/newsletter", { headers: { "x-admin-password": password } }).then((x) => x.json()).then((d) => { if (d.ok) { setNlList(d.list ?? []); setNlRecipients(d.recipients ?? 0); } }).catch(() => {});
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

        {/* 🎩 조직 관제(기획조정실 자율조직 브리핑) — 카페-데이터 관제탑과 별개. 모바일 전용 화면으로. */}
        <a href="/admin/org" className="flex items-center justify-between mb-5 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-stone-50 px-4 py-3 hover:from-amber-100 transition">
          <span className="flex items-center gap-2"><span className="text-lg">🎩</span><span className="flex flex-col"><span className="font-bold text-stone-800">조직 관제 (기획조정실)</span><span className="text-[11px] text-stone-500">자율 에이전트 일일 브리핑·결재·토큰</span></span></span>
          <span className="text-amber-600 font-bold">→</span>
        </a>

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
            verify: { icon: "🛡️", what: "후기수 일관성·PII·좌표·출처 표기에 더해 근거후기 오염(동명)·광고/협찬·중복공개·고아홍보까지 15종 규칙을 무오차로 점검합니다. (SQL 불변식, 토큰 0)", sched: "매일 6시", feeds: "이상 발견 시 자동 보류·자가치유" },
            grounding: { icon: "🔬", what: "만든 소개글이 실제 후기에 근거가 있는지(지어낸 환각 아닌지) 검사합니다. AI 판정이 끝난 카페만 검증해 순서가 꼬이지 않습니다.", sched: "판정 완료분 대상 상시", feeds: "환각 의심 시 → 판정 큐로 재투입" },
            audit: { icon: "🧹", what: "오염·중복 등 품질 플래그를 찾아 자동으로 수정합니다.", sched: "매일 3:30", feeds: "자동 교정 후 해소" },
            category: { icon: "🏷️", what: "네이버에서 업종(카페/비카페) 카테고리를 가져와 비카페를 거릅니다. ⚠️ '미보유'는 위험이 아닙니다 — 네이버 검색에 안 잡히는 카페(폐업·미등록·이름불일치)라 카테고리만 비어있을 뿐, 이미 합성·판정으로 검증된 진짜 카페입니다. 카테고리는 '비카페 필터용'이지 화면 표시용이 아니라 서비스 지장 0. 카카오로 채울 순 있지만(토큰 비용) 굳이 안 해도 됩니다.", sched: "네이버 한도 내 백필", feeds: "비카페면 차단(검증카페는 그대로)" },
            dongfill: { icon: "📍", what: "카페 좌표를 행정동 경계에 매핑해 법정동을 100% 정확히 채웁니다. 좌표는 항상 한 동에 속하므로 미스 없음. 공개 카페 동 100%.", sched: "네이버 백필 후 좌표로 마감", feeds: "지도·목록 동네 표시" },
            discover: { icon: "🧭", what: "수도권 동네를 순회하며 새 카페를 발굴합니다. 전수가 아니라 '다양성' 위주로 동네마다 골고루 — 옥석 큐레이션 컨셉. (지연=네이버 한도 분산, 위험 아님)", sched: "grow 매일 3시", feeds: "발굴한 카페를 → 수집·합성으로" },
            selfaudit: { icon: "🔁", what: "공개된 모든 카페를 커서로 돌아가며 '현재 규칙'으로 다시 검증합니다. 규칙을 고치면 기존 데이터가 자동으로 따라오고(드리프트 치유), 광고·동명오염 등이 사후에 끼면 자동 제외·비공개합니다. 캐시 재합성이라 토큰·API 비용 0. (대량 비공개는 규칙 회귀로 보고 자동 중단·경보)", sched: "2시간마다 600곳 (~하루 1바퀴)", feeds: "오염 발견 시 자동 비공개·근거오염 플래그" },
          };
          const nodeBorder: Record<string, string> = { ok: "border-emerald-200", behind: "border-amber-300", stalled: "border-red-300", warn: "border-amber-300", idle: "border-stone-300" };
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
            <div className="mb-4 rounded-2xl border border-stone-300 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <button onClick={() => toggleSec("tower")} className="text-[13px] font-extrabold text-stone-800 text-left">
                  {openSecs.tower ? "▾" : "▸"} 🛰️ 자율 운영 관제탑{" "}
                  {((tower.alerts?.length || 0) + (tower.risks?.length || 0)) > 0 && <span className="text-red-600 normal-case">🔴{(tower.alerts?.length || 0) + (tower.risks?.length || 0)}</span>}{" "}
                  {(tower.notices?.length || 0) > 0 && <span className="text-amber-600 normal-case">🟡{tower.notices.length}</span>}
                  {!((tower.alerts?.length || 0) + (tower.risks?.length || 0)) && !(tower.notices?.length || 0) && <span className="text-emerald-600 normal-case">✅</span>}
                </button>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setTowerFull(true)} className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">⛶ 전체화면</button>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${oc[tower.overall] || oc.degraded}`}>{ocl[tower.overall] || tower.overall}</span>
                </div>
              </div>
              {openSecs.tower && <div className="mt-3">
              {tower.alerts?.length > 0 && (
                <div className="mb-2.5 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">🚨 경보(즉시조치): {tower.alerts.join(" · ")}</div>
              )}
              {tower.risks?.length > 0 && (
                <div className="mb-2.5 text-[11px] text-red-700 bg-red-50 border border-red-300 rounded-lg px-3 py-2">🔴 위험(해자·소비자 타격): {tower.risks.join(" · ")}</div>
              )}
              {(!tower.alerts?.length && !tower.risks?.length) && (
                <div className="mb-2.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">✅ 위험·해자 검사 통과 — 소비자 노출 손상 없음(숫자 신뢰 가능)</div>
              )}
              {tower.notices?.length > 0 && (
                <div className="mb-2.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">🛠 주의(백그라운드 — 자동 처리, 소비자 무관): {tower.notices.join(" · ")}</div>
              )}
              {tower.healed?.length > 0 && (
                <div className="mb-2.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">🔧 자가치유: {tower.healed.join(" · ")}</div>
              )}
              {tower.today && (
                <div className="mb-2.5">
                  <div className="text-[10px] font-bold text-stone-500 mb-1.5">📅 오늘의 수집 (KST · 자동 갱신)</div>
                  <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5">
                    {[
                      { l: "오늘 신규발굴", v: tower.today.newCafes, c: "text-amber-700 bg-amber-50 border-amber-300", m: "newCafes" },
                      { l: "오늘 합성처리", v: tower.today.synthesized, c: "text-sky-700 bg-sky-50 border-sky-200", m: "synthesized" },
                      { l: "오늘 신규공개", v: tower.today.published, c: "text-emerald-700 bg-emerald-50 border-emerald-200", m: "published" },
                      { l: "동 채움", v: `${tower.today.dongPct}%`, c: "text-stone-700 bg-stone-50 border-stone-300", m: "dongMissing" },
                      { l: "노이즈탈락(누적)", v: tower.today.noise, c: "text-stone-500 bg-stone-50 border-stone-300", m: "noise" },
                      { l: "합성대기", v: tower.today.newQueue, c: "text-amber-600 bg-amber-50 border-amber-300", m: "newQueue" },
                      { l: "유튜브 수집(누적)", v: tower.today.ytTotal ?? 0, c: "text-rose-700 bg-rose-50 border-rose-200", m: "yt" },
                    ].map((t) => (
                      <button key={t.l} onClick={() => openToday(t.m, t.l)} title="클릭하면 상세 목록"
                        className={`rounded-xl border px-2 py-2 text-center transition hover:brightness-95 hover:shadow-sm cursor-pointer ${t.c}`}>
                        <div className="text-[15px] font-extrabold leading-none">{typeof t.v === "number" ? t.v.toLocaleString() : t.v}</div>
                        <div className="text-[9px] mt-1 font-bold whitespace-nowrap">{t.l}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* 메인은 간단히: 에이전트 상태 칩 + 전체 흐름 버튼(상세 흐름은 전체화면) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
                {tower.agents?.map((a: any) => {
                  const working = (a.queue > 0 || (a.ageH != null && a.ageH < 0.5)) && a.status !== "stalled";
                  return (
                    <button key={a.key} onClick={() => setSelAgent(a)} className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-2 text-left hover:bg-stone-100 transition">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot[a.status] || "bg-stone-300"} ${working ? "acc-blink" : ""}`} />
                      <span className="text-[11px] font-bold text-stone-700 truncate flex-1">{a.label.split(" (")[0]}</span>
                      {a.queue > 0 && <span className="text-[9px] font-bold text-amber-600 shrink-0">{a.queue.toLocaleString()}</span>}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setTowerFull(true)} className="w-full mb-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-[12px] font-bold py-2 hover:bg-indigo-100 transition">⛶ 관제탑 전체 흐름 보기 (수집 → 공개)</button>
              {/* 🔬 그라운딩 — '소비자 노출 의심'이 있을 때만 빨강 경보. 0이면 표시 안 함(아래 검증 패널이 0 확인).
                   (그라운딩은 결정론적 규칙으로 대체됨 — 안 줄어드는 '감사 대기' 백로그는 오해라 미표시) */}
              {tower.grounding && tower.grounding.suspectCount > 0 && (
                <div className="mb-2.5 rounded-xl border p-2.5 border-rose-200 bg-rose-50/60">
                  <div className="text-[11px] font-bold mb-1.5 text-stone-700">
                    🔬 LLM 그라운딩 · 소비자 노출 의심 <b className="text-rose-700">{tower.grounding.suspectCount}건</b>
                  </div>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {tower.grounding.suspects?.map((s: any, i: number) => (
                      <div key={i} className="text-[10.5px] leading-snug"><b className="text-rose-700">{s.name}</b> <span className="text-stone-400">{s.area}</span><br /><span className="text-stone-600">{s.issue}</span></div>
                    ))}
                  </div>
                </div>
              )}
              {/* 🛡️ 리뷰-카페 불일치 감시 — 표시 리뷰에 카페 맥락 없는 비율↑ = 규칙-사각 오염(딴업종·문구이름). 있을 때만 빨강 */}
              {tower.offctx && tower.offctx.count > 0 && (
                <div className="mb-2.5 rounded-xl border p-2.5 border-amber-300 bg-amber-50/60">
                  <div className="text-[11px] font-bold mb-1.5 text-stone-700">
                    🔎 리뷰 맥락 점검 목록 <b className="text-amber-700">{tower.offctx.count}곳</b> <span className="font-normal text-stone-500">· 위험 아님 · 표시 리뷰에 카페 맥락 적음(점검 권장)</span>
                  </div>
                  <div className="space-y-0.5 max-h-44 overflow-y-auto">
                    {tower.offctx.suspects?.map((s: any, i: number) => (
                      <div key={i} className="text-[10.5px] leading-snug"><b className="text-amber-800">{s.name}</b> <span className="text-stone-400">{s.area}</span> <span className="text-stone-500">맥락없음 {Math.round((s.rate ?? 0) * 100)}%</span></div>
                    ))}
                  </div>
                  <p className="text-[10px] text-stone-400 mt-1">사각 오염 감시용 watchlist — <b>일부는 진짜 카페(찻집·북카페·시적이름) 오탐</b>. 사람이 확인 후 진짜 오염만 비공개. (헛경보 방지로 위험 아닌 주의)</p>
                </div>
              )}
              {/* 📊 접속·유입 — 요약 진입 카드(상세는 전용 대시보드 1곳으로 일원화) */}
              {tower.traffic && (
                <button onClick={openAnalytics} className="w-full mb-2.5 rounded-xl border border-sky-200 bg-sky-50/60 p-2.5 text-left hover:bg-sky-100/70 transition">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-stone-700">📊 접속·유입 현황</span>
                    <span className="text-[11px] font-bold text-sky-700">전체 대시보드 →</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-stone-600">
                    <span>오늘 <b className="text-sky-700">{tower.traffic.dau}</b></span>
                    <span>주간 <b className="text-sky-700">{tower.traffic.wau}</b></span>
                    <span>월간 <b className="text-sky-700">{tower.traffic.mau}</b></span>
                    <span>재방문 <b className="text-stone-700">{tower.traffic.retention?.returning ?? 0}</b></span>
                  </div>
                </button>
              )}
              {/* 🤖 LLM 보강 대기 — 경계후기는 노출서 제외(소비자 신뢰 유지), LLM 판정 후 확인분만 보강 */}
              {blData?.summary?.cafes > 0 && (
                <button onClick={() => setShowBorderline(true)} className="w-full mb-2.5 rounded-xl border border-violet-200 bg-violet-50/60 p-2.5 text-left hover:bg-violet-100/70 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-stone-700">🤖 LLM 보강 대기 <span className="font-normal text-stone-400">· 경계후기는 노출서 제외(신뢰 유지)</span></span>
                    <span className="text-[11px] font-bold text-violet-700">목록 →</span>
                  </div>
                  <div className="text-[10.5px] text-stone-600 mt-0.5">카페 <b className="text-violet-700">{blData.summary.cafes.toLocaleString()}</b>곳 · 대기 경계후기 <b className="text-violet-700">{blData.summary.reviews.toLocaleString()}</b>건 <span className="text-stone-400">— 크레딧 복구 시 LLM 평가·확인분만 보강</span></div>
                </button>
              )}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-stone-500">
                <span>공개 <b className="text-stone-700">{tower.coverage?.published?.toLocaleString()}</b>/{tower.coverage?.total?.toLocaleString()}</span>
                <span>raw {tower.coverage?.rawCachedPct}%</span>
                <span>판정 {tower.coverage?.judgedPct}%</span>
                <span>임베딩 {tower.coverage?.embeddedPct}%</span>
                <span className="ml-auto text-stone-400">갱신 {new Date(tower.generatedAt).toLocaleTimeString("ko-KR")}</span>
              </div>
              </div>}
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
                    <div className="mt-3 space-y-1.5 text-[12px] border-t border-stone-300 pt-3">
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
            {/* 오늘의 수집 카드 상세 — 카페 목록 모달 */}
            {todayDetail && (
              <div onClick={() => setTodayDetail(null)} className="fixed inset-0 z-[75] bg-black/40 flex items-end sm:items-center justify-center p-4">
                <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-white p-5 shadow-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base font-extrabold text-stone-800">📅 {todayDetail.label}</span>
                    {!todayDetail.loading && <span className="text-[12px] font-bold text-stone-500">{todayDetail.cafes.length.toLocaleString()}곳{todayDetail.capped ? "+" : ""}</span>}
                    <button onClick={() => setTodayDetail(null)} className="ml-auto text-stone-400 text-2xl leading-none px-1">×</button>
                  </div>
                  <div className="overflow-y-auto flex-1 -mx-1 px-1">
                    {todayDetail.loading ? (
                      <div className="text-[13px] text-stone-400 text-center py-8">불러오는 중…</div>
                    ) : todayDetail.error ? (
                      <div className="text-[13px] text-red-600 text-center py-8">에러: {todayDetail.error}</div>
                    ) : todayDetail.cafes.length === 0 ? (
                      <div className="text-[13px] text-stone-400 text-center py-8">해당 카페가 없습니다.</div>
                    ) : (
                      <div className="divide-y divide-stone-100">
                        {todayDetail.cafes.map((c: any) => {
                          const inner = (
                            <>
                              <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-bold text-stone-800 truncate">{c.name}{c.published && <span className="text-[10px] text-indigo-400 font-normal"> ↗</span>}</div>
                                <div className="text-[11px] text-stone-500 truncate">{c.area}{c.dong ? ` · ${c.dong}` : ""}{c.source ? ` · ${c.source}` : ""}{c.at ? ` · ${c.at}` : ""}</div>
                              </div>
                              {c.grade && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${c.grade === "검증" ? "bg-emerald-100 text-emerald-700" : c.grade === "참고" ? "bg-sky-100 text-sky-700" : "bg-stone-100 text-stone-500"}`}>{c.grade}{c.cnt != null ? ` ${c.cnt}` : ""}</span>}
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${c.published ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-stone-50 text-stone-400 border border-stone-300"}`}>{c.published ? "공개" : "비공개"}</span>
                            </>
                          );
                          return c.published ? (
                            <a key={c.id} href={`/c/${c.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-2 hover:bg-stone-50 rounded-lg px-1.5">{inner}</a>
                          ) : (
                            <div key={c.id} className="flex items-center gap-2 py-2 px-1.5">{inner}</div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {todayDetail.capped && <div className="text-[10px] text-stone-400 text-center pt-2">최대 500곳까지 표시</div>}
                  <button onClick={() => setTodayDetail(null)} className="mt-3 w-full rounded-xl bg-stone-800 text-white text-[13px] font-bold py-2.5 shrink-0">닫기</button>
                </div>
              </div>
            )}
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
            <button onClick={() => toggleSec("auto")} className="w-full flex items-center justify-between text-left border-t-2 border-stone-300 pt-6 mt-2">
              <span className="text-[13px] font-extrabold text-stone-800">{openSecs.auto ? "▾" : "▸"} 🔄 자동화 현황 <span className="normal-case font-normal text-stone-400">· 판정대기 {jstatus.queue?.toLocaleString() ?? 0} · 오늘신규 {jstatus.newToday ?? 0}</span></span>
              <span className="text-[10px] text-stone-400 shrink-0">{openSecs.auto ? "접기" : "보기"}</span>
            </button>
            {openSecs.auto && <>

            {/* AI 판정 */}
            <div className="bg-white rounded-xl border border-stone-300 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-bold text-stone-700">🧮 AI 맥락 판정 <span className="font-normal text-stone-400">(보조 정제)</span></span>
                <span className="text-[11px] text-stone-400">{jstatus.last ? `최근 ${new Date(jstatus.last).toLocaleString("ko-KR")}` : "미실행"}</span>
              </div>
              <div className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 mb-1.5">소비자 노출 정상 ✅ <span className="font-normal text-emerald-600">— 공개 카페는 규칙으로 검증돼 노출 중. 아래 '대기'는 그 위 선택적 정제일 뿐 품질·위험과 무관.</span></div>
              <div className="flex items-end justify-between mb-1.5">
                <span className="text-xl font-bold text-stone-800">{jstatus.pct}%</span>
                <span className="text-[11px] text-stone-500">{jstatus.done?.toLocaleString()} / {jstatus.total?.toLocaleString()}곳</span>
              </div>
              <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden mb-1.5">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all" style={{ width: `${jstatus.pct}%` }} />
              </div>
              <div className="flex gap-3 text-[11px] text-stone-500">
                <span>판정 대기 <b className="text-stone-600">{jstatus.queue?.toLocaleString()}</b>곳</span>
                <span>· 오늘 <b className="text-emerald-600">{jstatus.today}</b>곳 판정</span>
              </div>
              <p className="text-[10px] text-stone-400 mt-1.5 leading-relaxed">
                ℹ️ '판정 대기' = 같은 이름의 딴 가게·맥락이 <b>애매한 '경계 리뷰'가 있어 LLM 확인이 필요한 곳</b>입니다.
                새벽 Batches가 크레딧 한도 내에서 자동 처리합니다(경계 리뷰 없는 곳은 무과금 자동완료). <b>공개 카페는 이미
                규칙으로 검증돼 정상 노출 중</b>이고 판정은 그 위 정제 레이어라, 이 대기 숫자는 <b>소비자 품질·위험과 무관</b>합니다(적체·고장 아님).
              </p>
            </div>

            {/* 수집·공개 */}
            <div className="bg-white rounded-xl border border-stone-300 p-3">
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
            <div className="bg-white rounded-xl border border-stone-300 p-3">
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
            </>}
          </div>
        )}

        {/* ===== 🚨 품질 감사 플래그 (접이식·기본 접힘 — 헤더에 건수) ===== */}
        {auditFlags && (() => {
          const unresolved = auditFlags.flags?.filter((f: any) => !f.resolved) ?? [];
          return (
            <div className="mb-6">
              <button onClick={() => toggleSec("audit")} className="w-full flex items-center justify-between text-left mb-2 border-t-2 border-stone-300 pt-6 mt-2">
                <span className={`text-[13px] font-extrabold ${unresolved.length ? "text-red-600" : "text-stone-800"}`}>{openSecs.audit ? "▾" : "▸"} {unresolved.length ? `🚨 품질 오염 감지 (${unresolved.length}건)` : "✅ 품질 오염 감지 (0건)"}</span>
                <span className="text-[11px] text-stone-400 shrink-0">{auditFlags.lastAudit}</span>
              </button>
              {openSecs.audit && (unresolved.length > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1.5">
                  {unresolved.slice(0, 8).map((f: any, i: number) => (
                    <div key={i} className="text-[11px] text-red-700">
                      <b>{f.cafe_name}</b> — {f.detail?.slice(0, 60)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] text-emerald-700">
                  ✅ 품질 감사 이상 없음 — {auditFlags.lastAudit}
                </div>
              ))}
            </div>
          );
        })()}

        {/* ===== 🛡️ 검증 에이전트(레드팀) ===== */}
        <div className="mb-6 border-t-2 border-stone-300 pt-6 mt-2">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => toggleSec("verify")} className="text-[13px] font-extrabold text-stone-800 text-left">
              {openSecs.verify ? "▾" : "▸"} 🛡️ 데이터 검증 <span className="normal-case font-normal text-stone-400">·</span>{" "}
              {verify ? (verify.status === "pass" ? <span className="text-emerald-600 normal-case">정상 ✅</span> : verify.status === "warn" ? <span className="text-amber-600 normal-case">🟡 주의 {verify.warns}</span> : <span className="text-red-600 normal-case">🔴 오류 {verify.fails}</span>) : <span className="normal-case font-normal text-stone-400">리포트 없음</span>}
            </button>
            <button onClick={runVerify} disabled={verifying} className="text-[11px] bg-stone-800 text-white rounded-full px-3 py-1 disabled:opacity-50">{verifying ? "검사 중…" : "지금 검사"}</button>
          </div>
          {openSecs.verify && <>
          {verify ? (
            <div className={`rounded-xl border p-3 ${verify.status === "pass" ? "bg-emerald-50 border-emerald-200" : verify.status === "warn" ? "bg-amber-50 border-amber-300" : "bg-rose-50 border-rose-200"}`}>
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
          {grounding && (() => {
            const pub = grounding.publicFlagged ?? grounding.flagged ?? 0; // 지금 공개 카페 중 오염 노출(현재 상태)
            return (
            <div className={`mt-2 rounded-xl border p-3 ${pub > 0 ? "bg-amber-50 border-amber-300" : "bg-emerald-50 border-emerald-200"}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] font-bold">🧠 그라운딩 (소비자 노출 오염 검사)</span>
                <span className={`text-[12px] font-bold ml-auto ${pub > 0 ? "text-amber-700" : "text-emerald-700"}`}>{pub > 0 ? `⚠ 노출 오염 ${pub}건` : "현재 0건 ✅"}</span>
              </div>
              {pub > 0 ? (
                <div className="space-y-0.5">
                  {grounding.samples.map((s: any, i: number) => (
                    <div key={i} className="text-[11px] text-stone-600"><b>{s.s}</b>: {s.issue || "근거 불충분"}</div>
                  ))}
                  <p className="text-[10px] text-stone-400 mt-1">⚠ 공개 노출 중 — 사람이 확인 후 재합성/비공개 처리하세요.</p>
                </div>
              ) : <p className="text-[11px] text-emerald-700">지금 공개 중인 카페 전부 근거 일치 — 소비자에게 보이는 오염 <b>없음</b>.</p>}
            </div>
            );
          })()}
          </>}
        </div>

        {/* 🔔 사장님 대응 리마인더 — 승인 대기·미발송 주간레터 */}
        {(subscribers.some((s: any) => s.status === "pending") || (nlList[0] && nlList[0].status !== "sent")) && (
          <div className="mb-4 space-y-2">
            {subscribers.some((s: any) => s.status === "pending") && (
              <button onClick={() => setShowSubsModal(true)} className="w-full text-left bg-amber-50 border border-amber-300 rounded-xl px-3.5 py-2.5 text-[12.5px] text-amber-800 font-bold">🔔 승인 대기 사장님 {subscribers.filter((s: any) => s.status === "pending").length}명 — 서류 확인 후 승인하세요 →</button>
            )}
            {nlList[0] && nlList[0].status !== "sent" && (
              <button onClick={() => { setShowNL(true); loadNL(); }} className="w-full text-left bg-indigo-50 border border-indigo-300 rounded-xl px-3.5 py-2.5 text-[12.5px] text-indigo-800 font-bold">📰 이번 주 사장님 레터 초안이 발송 대기 중 — 검토·발송하세요 →</button>
            )}
          </div>
        )}

        {/* ===== 모달 트리거 (접속·유입 현황 · 구독 카페 현황 · 유튜브 수집 · 내 카페 기록) ===== */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={openAnalytics} className="flex-1 py-2.5 text-[13px] font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-xl">📊 접속·유입 현황{tower?.traffic?.dau != null ? ` (오늘 ${tower.traffic.dau})` : ""}</button>
          <button onClick={() => setShowSubsModal(true)} className="flex-1 py-2.5 text-[13px] font-bold text-amber-700 bg-amber-50 border border-amber-300 rounded-xl">💳 구독 카페 현황{subscribers.length ? ` (${subscribers.length})` : ""}</button>
          <button onClick={() => { setShowNL(true); loadNL(); }} className="flex-1 py-2.5 text-[13px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl">📰 주간 뉴스레터{nlList.length ? ` (${nlList.length})` : ""}</button>
          <button onClick={() => setShowYtModal(true)} className="flex-1 py-2.5 text-[13px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">📺 유튜브 수집{yt?.withYt != null ? ` (${yt.withYt})` : ""}</button>
          <button onClick={() => { setShowVisits(true); fetch("/api/admin/visits", { headers: { "x-admin-password": pw } }).then((x) => x.json()).then((d) => { if (d.ok) setVisits(d); }); }} className="flex-1 py-2.5 text-[13px] font-bold text-pink-700 bg-pink-50 border border-pink-200 rounded-xl">❤ 내 카페 기록{visits?.stat?.total != null ? ` (${visits.stat.total})` : ""}</button>
          <button onClick={openRotation} className="flex-1 py-2.5 text-[13px] font-bold text-teal-800 bg-teal-50 border border-teal-300 rounded-xl">🔁 노출 로테이션 현황</button>
        </div>

        {/* ℹ️ 조직 활동·실행 케이던스는 '조직 관제(/admin/org)'로 이동 — 대시보드는 운영(카페·구독·품질)에 집중 */}

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
                  <div key={v.id} className="flex gap-3 border border-stone-300 rounded-xl p-3">
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
                        <div key={c.id} className="bg-white rounded-lg border border-stone-300 p-2">
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
            <div className="flex items-center justify-between mb-2"><span className="text-sm font-bold text-stone-800">💳 구독 카페 현황 ({subscribers.length})</span><button onClick={() => { setShowSubsModal(false); setSubMsg(""); }} className="text-2xl text-stone-400 leading-none">×</button></div>
            {/* 📧 승인 시 사장님께 자동 발송되는 온보딩 메일(서비스 사용법 + 전용 서비스 안내) 내용 확인 */}
            <button onClick={openOnboard} className="w-full mb-3 text-left bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-[12px] font-bold text-amber-800">📧 승인 시 발송되는 온보딩 메일 내용 보기 →</button>
            {/* 📧 이메일 발송 준비 상태 — 승인 시 키 자동발송 가능 여부(프로덕션 env) */}
            {emailReady === false && <div className="mb-3 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">🚨 이 환경에 <b>이메일 발송키(RESEND)가 없어요</b>. 승인해도 키가 자동 발송되지 않으니, 승인 후 <b>PIN을 사장님께 직접 전달</b>해야 해요. (Vercel 환경변수 RESEND_API_KEY 설정 필요)</div>}
            {emailReady === true && <div className="mb-3 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2">📧 이메일 발송 준비됨 — 승인하면 키(PIN)가 사장님 이메일로 <b>자동 발송</b>돼요.</div>}
            {/* ✨ 소비자 노출(우선노출) 실제 작동 여부 — SUBSCRIPTION_LIVE */}
            {liveExposure === false && <div className="mb-3 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">🚨 <b>소비자 노출 OFF</b> — 구독 사장님이 featured(우선노출)여도 지도 금색핀·추천카페·쇼케이스가 <b>손님에게 안 보입니다</b>. 유료 사장님이 있으면 Vercel 환경변수 <b>SUBSCRIPTION_LIVE=true</b>로 켜야 노출됩니다.</div>}
            {liveExposure === true && <div className="mb-3 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2">✨ 소비자 노출 ON — 구독 사장님 우선노출(금색핀·추천카페·쇼케이스)이 손님에게 정상 노출됩니다.</div>}
            {subMsg && <div className="mb-3 text-[12px] text-stone-800 bg-amber-50 border border-amber-300 rounded-lg px-2.5 py-2 flex items-start gap-2"><span className="flex-1">{subMsg}</span><button onClick={() => setSubMsg("")} className="text-stone-400 shrink-0">×</button></div>}
            {subscribers.length > 0 ? (
            <div className="space-y-2">
              {subscribers.map((s) => {
                const dleft = s.expires_at ? Math.max(0, Math.ceil((new Date(s.expires_at).getTime() - Date.now()) / 86400000)) : null;
                const stColor = s.status === "active" ? "text-emerald-600" : s.status === "pending" ? "text-amber-600" : s.status === "suspended" ? "text-rose-600" : "text-stone-400";
                const stLabel = s.status === "active" ? "활성" : s.status === "pending" ? "대기" : s.status === "expired" ? "만료" : s.status === "cancelled" ? "해지" : s.status === "suspended" ? "🚫 정지" : s.status;
                return (
                  <div key={s.id} className="bg-white rounded-xl border border-amber-300 p-3">
                    <div className="min-w-0">
                      <span className="font-bold text-sm">{s.cafe_name}</span>
                      <span className={`text-[11px] ml-2 font-bold ${stColor}`}>{stLabel}{s.status === "active" && dleft != null ? ` · D-${dleft}` : ""}</span>
                      <div className="text-[12px] text-stone-600 truncate">{s.owner_name} · 📞 {s.contact}{s.email ? ` · ✉️ ${s.email}` : ""} · {s.plan}{s.price ? ` ₩${s.price.toLocaleString()}` : " 무료"}</div>
                      {/* 🔒 사칭 방지 증빙 — 승인 전 대조: 사업자등록증·대표자명·번호·동의·접속기록 */}
                      <div className="mt-1.5 rounded-lg bg-amber-50/70 border border-amber-100 p-2 text-[11px] text-stone-600 space-y-0.5">
                        <div className="font-bold text-amber-800">🔒 인증 서류 (승인 전 대조)</div>
                        {s.biz_reg_url ? <a href={s.biz_reg_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-blue-700 underline font-bold">🧾 사업자등록증 보기</a> : <span className="text-rose-600">⚠️ 사업자등록증 없음</span>}
                        <div>대표자명 대조: <b>{s.owner_name}</b>{s.biz_no ? ` · 사업자번호 ${s.biz_no}` : ""}</div>
                        <div>{s.attested ? "✅ 본인확인(사업주) 법적 동의" : "❌ 본인확인 미동의"}{s.signup_ip ? ` · IP ${s.signup_ip}` : ""}</div>
                        <div className="text-[10px] text-stone-400">대표자명·상호가 이 카페와 일치하는지 확인 후 승인하세요.</div>
                      </div>
                      {s.status === "active" && s.pin && <div className="text-[12px] mt-1">🔑 PIN <b className="font-mono tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{s.pin}</b> {s.pin_emailed_at ? <span className="text-[10px] text-emerald-600">✅ 이메일 발송됨 · 사장님 로그인용</span> : <span className="text-[10px] text-rose-500">⚠️ 이메일 미발송 — 이 PIN을 직접 전달하세요</span>}</div>}
                      {s.newsletter_opt_in && <div className="text-[10px] text-stone-400 mt-0.5">📰 주간 레터 수신동의 — 매주 트렌드 레터 발송 대상</div>}
                      {/* 📈 접속 모니터링 — PIN 발급 사장님이 실제 로그인·사용하는지 */}
                      {s.status === "active" && s.pin && (() => {
                        const ago = (v: any) => { if (!v) return ""; const ms = Date.now() - new Date(v).getTime(); const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000); return d > 0 ? `${d}일 전` : h > 0 ? `${h}시간 전` : m > 0 ? `${m}분 전` : "방금"; };
                        const EV: Record<string, string> = { login: "🔑 로그인", view_analysis: "📊 분석 조회" };
                        const never = !s.login_count;
                        const issuedAgo = s.pin_emailed_at ? Math.floor((Date.now() - new Date(s.pin_emailed_at).getTime()) / 86400000) : null;
                        const evs = Array.isArray(s.recent_events) ? s.recent_events : [];
                        return (
                          <div className={`mt-1.5 rounded-lg border p-2 text-[11px] ${never ? "bg-rose-50 border-rose-200" : "bg-sky-50 border-sky-100"}`}>
                            <div className={`font-bold ${never ? "text-rose-700" : "text-sky-800"}`}>📈 접속 모니터링</div>
                            {never
                              ? <div className="text-rose-600">🔴 <b>아직 한 번도 로그인 안 함</b>{issuedAgo != null ? ` — PIN 발급 ${issuedAgo}일째 미접속` : ""}. 사용 안내(온보딩)가 필요해요.</div>
                              : <div className="text-stone-600">✅ 로그인 <b className="text-sky-700">{s.login_count}회</b> · 최근 접속 <b>{ago(s.last_seen_at)}</b>{s.first_login_at ? ` · 첫 접속 ${new Date(s.first_login_at).toLocaleDateString("ko-KR")}` : ""}</div>}
                            {evs.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{evs.slice(0, 6).map((e: any, i: number) => <span key={i} className="text-[10px] bg-white/70 border border-stone-300 rounded px-1.5 py-0.5 text-stone-500">{EV[e.event] || e.event} · {ago(e.at)}</span>)}</div>}
                          </div>
                        );
                      })()}
                    </div>
                    {s.status !== "active" && !s.cafe_published && <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-2 py-1.5">⚠️ 카페 <b>미공개</b> — 검수·공개(필요 시 분석 생성) 후에 승인할 수 있어요.</div>}
                    <div className="flex gap-2 mt-2">
                      {s.status !== "active" && <button onClick={() => subAct(s.id, "activate", 7)} disabled={!s.cafe_published} title={s.cafe_published ? "" : "카페가 공개된 뒤 승인할 수 있어요"} className="flex-1 py-1.5 text-[12px] font-bold text-blue-700 bg-blue-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">✓ 체험 승인(7일)</button>}
                      {s.status !== "active" && <button onClick={() => subAct(s.id, "activate", 30)} disabled={!s.cafe_published} title={s.cafe_published ? "" : "카페가 공개된 뒤 승인할 수 있어요"} className="flex-1 py-1.5 text-[12px] font-bold text-emerald-700 bg-emerald-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">✓ 구독 승인(30일)</button>}
                      {s.status === "active" && <button onClick={() => subAct(s.id, "extend", 30)} className="flex-1 py-1.5 text-[12px] font-bold text-stone-700 bg-stone-100 rounded-lg">+30일 연장</button>}
                      {s.status === "active" && <button onClick={() => subAct(s.id, "cancel")} className="flex-1 py-1.5 text-[12px] text-rose-600 bg-rose-50 rounded-lg">해지</button>}
                      {s.status !== "suspended" && s.status !== "cancelled" && <button onClick={() => suspendSub(s.id, s.cafe_name)} className="flex-1 py-1.5 text-[12px] font-bold text-white bg-rose-600 rounded-lg">🚫 사칭/위반 즉시정지</button>}
                    </div>
                    {s.status === "suspended" && s.suspend_reason && <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">🚫 정지 사유: {s.suspend_reason}{s.suspended_at ? ` · ${new Date(s.suspended_at).toLocaleString("ko-KR")}` : ""}</div>}
                  </div>
                );
              })}
            </div>
            ) : <p className="text-[13px] text-stone-400 py-3 text-center">구독 회원이 아직 없어요.</p>}
            <p className="text-[10px] text-stone-400 mt-2">활성화 시 우선노출 자동 ON·만료/해지 시 OFF. 연락처는 암호화 저장.</p>
            </div>
          </div>
        )}

        {/* 🤖 LLM 보강 대기 목록 */}
        {showBorderline && (
          <div className="fixed inset-0 z-[6000] bg-black/50 overflow-y-auto" onClick={() => setShowBorderline(false)}>
            <div className="min-h-full flex items-start justify-center p-2 sm:p-4">
              <div className="bg-stone-50 rounded-2xl w-full max-w-2xl shadow-2xl my-2" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 z-10 bg-white border-b border-stone-300 px-4 py-3 flex items-center justify-between rounded-t-2xl">
                  <span className="text-[14px] font-extrabold text-stone-800">🤖 LLM 보강 대기 <span className="text-[11px] font-normal text-stone-400">· 노출엔 경계후기 제외됨</span></span>
                  <button onClick={() => setShowBorderline(false)} className="text-stone-400 hover:text-stone-700 text-lg leading-none px-1">✕</button>
                </div>
                <div className="p-4">
                  <p className="text-[11px] text-stone-500 bg-stone-100 rounded-lg px-3 py-2 mb-3 leading-relaxed">아래 카페는 <b className="text-stone-600">깨끗한 후기만 노출 중</b>이고(소비자 신뢰 유지), 추가로 발견된 '경계후기'(같은 이름 딴 지점·업종 모호 등)는 <b className="text-stone-600">화면에서 빠진 채</b> LLM 판정을 기다립니다. 크레딧 복구 시 LLM이 평가해 <b className="text-stone-600">진짜로 확인된 것만</b> 노출에 보강됩니다. (숫자: 노출 / 경계대기)</p>
                  {!blData?.list?.length ? <p className="text-center text-stone-400 py-8 text-[13px]">보강 대기 카페가 없습니다.</p> : (
                    <div className="space-y-1">
                      {blData.list.map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between bg-white rounded-lg border border-stone-300 px-2.5 py-1.5">
                          <span className="text-[11px] text-stone-700 truncate mr-2"><b>{c.name}</b> <span className="text-stone-400 font-normal">{c.area}</span> <span className="text-[9px] text-stone-400">{c.synth_grade}</span></span>
                          <span className="text-[10.5px] shrink-0 whitespace-nowrap"><b className="text-emerald-600">{c.shown}</b> <span className="text-stone-300">/</span> <b className="text-violet-600">{c.borderline}</b></span>
                        </div>
                      ))}
                      {blData.list.length >= 200 && <p className="text-[10px] text-stone-400 text-center pt-1">상위 200곳 표시 (경계후기 많은 순)</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 📈 유입 분석 전체화면 */}
        {showAnalytics && (
          <div className="fixed inset-0 z-[6000] bg-black/50 overflow-y-auto" onClick={() => setShowAnalytics(false)}>
            <div className="min-h-full flex items-start justify-center p-2 sm:p-4">
              <div className="bg-stone-50 rounded-2xl w-full max-w-3xl shadow-2xl my-2" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 z-10 bg-white border-b border-stone-300 px-4 py-3 flex items-center justify-between rounded-t-2xl">
                  <span className="text-[14px] font-extrabold text-stone-800">📊 접속·유입 현황 <span className="text-[11px] font-normal text-stone-400">· 진짜 외부 사용자만 (대표·팀·봇 제외)</span></span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => loadAnalytics(pw)} className="text-[11px] font-bold text-stone-500 border border-stone-300 rounded-full px-2.5 py-1 hover:bg-stone-100">↻ 새로고침</button>
                    <button onClick={() => setShowAnalytics(false)} className="text-stone-400 hover:text-stone-700 text-lg leading-none px-1">✕</button>
                  </div>
                </div>
                {!analytics ? (
                  <div className="p-10 text-center text-stone-400 text-[13px]">불러오는 중…</div>
                ) : (() => {
                  const a = analytics; const f = a.funnel || {};
                  const retRate = a.kpi?.mau ? Math.round((a.retention?.returning / a.kpi.mau) * 100) : 0;
                  const maxDaily = Math.max(1, ...(a.daily || []).map((d: any) => d.visitors));
                  const maxSrc = Math.max(1, ...(a.sources || []).map((s: any) => s.visitors));
                  const maxRegion = Math.max(1, ...(a.topRegions || []).map((r: any) => r.views));
                  const maxCafe = Math.max(1, ...(a.topCafes || []).map((c: any) => c.views));
                  const maxBucket = Math.max(1, ...(a.pageBuckets || []).map((b: any) => b.views));
                  const maxHour = Math.max(1, ...(a.hours || []).map((h: any) => h.n));
                  const hourMap: Record<number, number> = {}; (a.hours || []).forEach((h: any) => { hourMap[h.h] = h.n; });
                  const dev: Record<string, number> = { mobile: 0, desktop: 0 }; (a.devices || []).forEach((d: any) => { dev[d.dev] = d.n; });
                  const devTotal = dev.mobile + dev.desktop || 1;
                  const noEvents = (a.kpi?.pageviews30d ?? 0) === 0;
                  const maxVReg = Math.max(1, ...(a.visitorRegions || []).map((r: any) => r.n));
                  const cs = a.consent || {};
                  const newPct = a.kpi?.mau ? Math.round(a.retention?.newcomers / a.kpi.mau * 100) : 0;
                  const retPct = a.kpi?.mau ? Math.round(a.retention?.returning / a.kpi.mau * 100) : 0;
                  const mobPct = Math.round(dev.mobile / devTotal * 100);
                  const srcTotal = (a.sources || []).reduce((t: number, x: any) => t + x.visitors, 0) || 1;
                  let peakH = -1, peakN = -1; Object.entries(hourMap).forEach(([h, n]) => { if ((n as number) > peakN) { peakN = n as number; peakH = +h; } });
                  const fSteps = [
                    { l: "방문", v: f.visitors, pct: 100 },
                    { l: "카페 상세 조회", v: f.viewedCafe, pct: f.visitors ? Math.round(f.viewedCafe / f.visitors * 100) : 0 },
                    { l: "여러 카페 탐색", v: f.engaged, pct: f.visitors ? Math.round(f.engaged / f.visitors * 100) : 0 },
                  ];
                  return (
                    <div className="p-4 space-y-4">
                      <p className="text-[10.5px] text-stone-500 bg-stone-100/70 rounded-lg px-3 py-2 leading-relaxed">우리 사이트 방문을 <b className="text-stone-600">외부 도구 없이 직접</b> 모은 현황입니다. <b className="text-emerald-700">대표·팀(내부)과 봇은 자동 제외</b>돼 아래 숫자는 모두 <b className="text-stone-600">진짜 외부 방문자</b>입니다. 실시간·방문자·유입경로·재방문은 정확하고, 페이지 단위(추이·인기카페)는 방문이 쌓이며 채워집니다. <span className="text-stone-400">※ 유입경로 '미상'은 추적 도입 전 옛 방문 또는 앱·북마크 유입(카톡·인스타 인앱은 경로가 안 남습니다).</span></p>
                      {/* 🟢 실시간 · 오늘 */}
                      <div className="bg-white rounded-xl border border-stone-300 p-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span></span>
                            <span className="text-[12px] font-bold text-stone-700">실시간 <span className="text-emerald-600 text-[16px]">{a.realtime?.active5 ?? 0}</span>명 접속 중</span>
                          </div>
                          <div className="text-[11px] text-stone-500">30분 내 {a.realtime?.active30 ?? 0}명 · 오늘 방문 <b className="text-sky-700">{a.today?.visitors ?? 0}</b> · 페이지뷰 <b className="text-sky-700">{(a.today?.pageviews ?? 0).toLocaleString()}</b></div>
                        </div>
                        <p className="text-[9.5px] text-stone-400 mt-1.5">지금 사이트에 머무는 사람(최근 5분 활동)과 오늘 다녀간 수입니다.</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { ic: "👥", l: "월간 방문자", v: a.kpi?.mau, sub: `주간 ${a.kpi?.wau} · 오늘 ${a.kpi?.dau}`, desc: "30일 순방문자(중복 제외)" },
                          { ic: "📄", l: "페이지뷰", v: a.kpi?.pageviews30d, sub: `방문당 ${a.kpi?.mau ? (a.kpi.pageviews30d / a.kpi.mau).toFixed(1) : "-"}장`, desc: "열어본 화면 총수(30일)" },
                          { ic: "🔁", l: "재방문율", v: `${retRate}%`, sub: `재방문 ${a.retention?.returning}·신규 ${a.retention?.newcomers}`, desc: "다시 찾은 사람 비율" },
                        ].map((k, i) => (
                          <div key={i} className="bg-white rounded-xl border border-stone-300 p-2.5">
                            <div className="text-[10px] text-stone-400 font-bold">{k.ic} {k.l}</div>
                            <div className="text-[22px] font-extrabold text-stone-800 leading-tight">{typeof k.v === "number" ? k.v?.toLocaleString() : k.v}</div>
                            <div className="text-[9.5px] text-stone-500">{k.sub}</div>
                            <div className="text-[9px] text-stone-400 mt-0.5 leading-tight">{k.desc}</div>
                          </div>
                        ))}
                      </div>
                      {/* 🧑 진짜 사용자 신호 — 봇으로 설명 안 되는 것들 */}
                      {a.realUsers && (
                        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3">
                          <div className="text-[12px] font-bold text-emerald-800 mb-1.5">🧑 진짜 사용자 신호 <span className="font-normal text-[10px] text-emerald-600">· 기준=브라우저(localStorage), IP 아님</span></div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div><div className="text-[19px] font-extrabold text-emerald-700">{a.realUsers.trueReturn ?? 0}</div><div className="text-[9.5px] text-stone-500">재방문(다시 켬)<br/>(세션 2회+·같은날 포함)</div></div>
                            <div><div className="text-[19px] font-extrabold text-emerald-700">{a.realUsers.consent}</div><div className="text-[9.5px] text-stone-500">위치동의<br/>(봇은 안 하는 행동)</div></div>
                            <div><div className="text-[19px] font-extrabold text-emerald-700">{(a.realSources || []).reduce((s: number, r: any) => s + r.visitors, 0)}</div><div className="text-[9.5px] text-stone-500">검색·소셜 유입<br/>(브라우저 수)</div></div>
                          </div>
                          {(a.realSources || []).length > 0 && (
                            <div className="mt-2 pt-2 border-t border-emerald-200/70 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-stone-600">
                              {a.realSources.map((r: any) => (
                                <span key={r.src}><b className="text-emerald-700">{r.src}</b> {r.visitors}명 · 재방문 {r.returned} · 평균 {r.avg_pv}장</span>
                              ))}
                            </div>
                          )}
                          <p className="text-[9.5px] text-stone-500 mt-1.5 leading-relaxed"><b>참고:</b> 페이지 여러 장 본 사람 {a.realUsers.r2}명(3+장 {a.realUsers.r3}·5+장 {a.realUsers.r5}) — 한 방문에 여러 페이지 본 것(재방문 아님). <b>재방문=브라우저를 다시 켠 것(세션 2회+, 같은날 포함)</b>이 진짜 성장 신호입니다.</p>
                        </div>
                      )}
                      {/* 📣 공유(바이럴) 기록 */}
                      {a.shares && (
                        <div className="bg-white rounded-xl border border-stone-300 p-3">
                          <div className="text-[12px] font-bold text-stone-700 mb-1.5">📣 공유(바이럴) 기록 <span className="font-normal text-[10px] text-stone-400">· 사용자가 카페를 타인에게 공유한 횟수</span></div>
                          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px]">
                            <span>30일 <b className="text-[16px] text-rose-600">{a.shares.total}</b>회 <span className="text-stone-400">(오늘 {a.shares.today})</span></span>
                            <span className="text-stone-500">공유한 사람 <b>{a.shares.sharers}</b>명</span>
                            <span className="text-stone-400">카톡 {a.shares.kakao} · 웹공유 {a.shares.web} · 링크복사 {a.shares.clip}</span>
                          </div>
                          {(a.topShared || []).length > 0 ? (
                            <div className="mt-2 pt-2 border-t border-stone-300 text-[10.5px] text-stone-600"><span className="text-stone-400">많이 공유된 카페: </span>{a.topShared.map((c: any, i: number) => <span key={i} className="mr-1.5"><b>{c.name}</b>({c.n})</span>)}</div>
                          ) : <p className="text-[9.5px] text-stone-400 mt-1.5">아직 공유 기록 없음 — 방금 추적 시작(공유 버튼 클릭 시 채워집니다). 내부(대표·팀) 공유는 제외됩니다.</p>}
                        </div>
                      )}
                      {noEvents && <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 text-[11px] text-amber-800">📊 페이지뷰 단위 지표(추이·인기카페·퍼널·시간대)는 방금 추적 시작 — 방문이 쌓이며 채워집니다. 방문자·유입경로·재방문은 지금부터 정확합니다.</div>}
                      {(a.daily || []).length > 0 && (
                        <div className="bg-white rounded-xl border border-stone-300 p-3">
                          <div className="text-[12px] font-bold text-stone-700">일별 방문 추이 <span className="font-normal text-stone-400 text-[10px]">최근 14일</span></div>
                          <p className="text-[9.5px] text-stone-400 mb-2">날짜별 방문자 수 — 늘고 주는 흐름을 봅니다. (막대에 마우스 올리면 상세)</p>
                          <div className="flex items-end gap-1 h-24">
                            {a.daily.map((d: any, i: number) => (
                              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                                <div className="w-full bg-sky-400 rounded-t" style={{ height: `${(d.visitors / maxDaily) * 100}%`, minHeight: "2px" }} title={`${d.day}: 방문 ${d.visitors}·뷰 ${d.pageviews}`}></div>
                                <span className="text-[7px] text-stone-400">{d.day.slice(3)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {f.visitors > 0 && (
                        <div className="bg-white rounded-xl border border-stone-300 p-3">
                          <div className="text-[12px] font-bold text-stone-700">전환 퍼널</div>
                          <p className="text-[9.5px] text-stone-400 mb-2">방문 → 카페를 실제로 열어봄 → 여러 곳 비교(몰입). 단계마다 몇 %가 남는지 봅니다.</p>
                          {fSteps.map((s, i) => (
                            <div key={i}>
                              <div className="flex justify-between text-[10.5px] mb-0.5"><span className="text-stone-600">{s.l}</span><span className="font-bold text-stone-700">{s.v?.toLocaleString()}명 <span className="text-emerald-600">{s.pct}%</span></span></div>
                              <div className="h-3.5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full" style={{ width: `${Math.max(s.pct, 3)}%` }}></div></div>
                              {i < fSteps.length - 1 && <div className="text-[8.5px] text-rose-400 text-center my-0.5">▼ {fSteps[i].pct - fSteps[i + 1].pct}%p 이탈</div>}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="bg-white rounded-xl border border-stone-300 p-3">
                        <div className="text-[12px] font-bold text-stone-700">유입경로</div>
                        <p className="text-[9.5px] text-stone-400 mb-2">어디서 들어왔는지(네이버·구글·직접·공유…). '평균'은 그 경로 방문자의 재방문 횟수 — 높을수록 충성도↑.</p>
                        {(a.sources || []).length === 0 ? <p className="text-[11px] text-stone-400">데이터 없음</p> : a.sources.map((s: any, i: number) => (
                          <div key={i} className="mb-1.5">
                            <div className="flex justify-between text-[10.5px] mb-0.5"><span className="text-stone-600 font-medium">{s.src === "미상" ? "미상 (추적 도입 전 방문)" : s.src}</span><span className="text-stone-500">{s.visitors}명 <span className="text-stone-400">({Math.round(s.visitors / srcTotal * 100)}%) · 평균 {s.avg_visits}회</span></span></div>
                            <div className="h-2 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-sky-400 rounded-full" style={{ width: `${(s.visitors / maxSrc) * 100}%` }}></div></div>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white rounded-xl border border-stone-300 p-3">
                          <div className="text-[12px] font-bold text-stone-700">신규 vs 재방문</div>
                          <p className="text-[9.5px] text-stone-400 mb-2">처음 온 사람 vs 다시 온 사람.</p>
                          <div className="flex h-5 rounded-full overflow-hidden bg-stone-100 text-[9px] font-bold text-white">
                            <div className="bg-indigo-400 flex items-center justify-center" style={{ width: `${newPct}%` }}>{newPct >= 14 && `${newPct}%`}</div>
                            <div className="bg-amber-400 flex items-center justify-center" style={{ width: `${retPct}%` }}>{retPct >= 14 && `${retPct}%`}</div>
                          </div>
                          <div className="flex gap-3 text-[10px] mt-1.5">
                            <span className="flex items-center gap-1 text-stone-500"><span className="w-2 h-2 rounded-full bg-indigo-400 inline-block"></span>신규 <b className="text-stone-700">{a.retention?.newcomers}</b></span>
                            <span className="flex items-center gap-1 text-stone-500"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>재방문 <b className="text-stone-700">{a.retention?.returning}</b></span>
                          </div>
                        </div>
                        <div className="bg-white rounded-xl border border-stone-300 p-3">
                          <div className="text-[12px] font-bold text-stone-700">접속 기기</div>
                          <p className="text-[9.5px] text-stone-400 mb-2">모바일 vs PC 비율.</p>
                          <div className="flex h-5 rounded-full overflow-hidden bg-stone-100 text-[9px] font-bold text-white">
                            <div className="bg-teal-400 flex items-center justify-center" style={{ width: `${mobPct}%` }}>{mobPct >= 14 && `${mobPct}%`}</div>
                            <div className="bg-stone-400 flex items-center justify-center" style={{ width: `${100 - mobPct}%` }}>{(100 - mobPct) >= 14 && `${100 - mobPct}%`}</div>
                          </div>
                          <div className="flex gap-3 text-[10px] mt-1.5">
                            <span className="flex items-center gap-1 text-stone-500"><span className="w-2 h-2 rounded-full bg-teal-400 inline-block"></span>📱 모바일 <b className="text-stone-700">{dev.mobile}</b></span>
                            <span className="flex items-center gap-1 text-stone-500"><span className="w-2 h-2 rounded-full bg-stone-400 inline-block"></span>💻 PC <b className="text-stone-700">{dev.desktop}</b></span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-white rounded-xl border border-stone-300 p-3">
                          <div className="text-[12px] font-bold text-stone-700">인기 카페 <span className="font-normal text-stone-400 text-[10px]">조회순</span></div>
                          <p className="text-[9.5px] text-stone-400 mb-2">가장 많이 열어본 카페 — 어떤 곳에 관심이 몰리는지.</p>
                          {(a.topCafes || []).length === 0 ? <p className="text-[11px] text-stone-400">데이터 쌓이는 중</p> : <div className="space-y-1 max-h-56 overflow-y-auto">{a.topCafes.map((c: any, i: number) => (
                            <div key={i} className="text-[10.5px]">
                              <div className="flex justify-between"><span className="text-stone-700 font-medium truncate">{i + 1}. {c.name} <span className="text-stone-400 font-normal">{c.area}</span></span><span className="text-sky-700 font-bold shrink-0 ml-1">{c.views}</span></div>
                              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mt-0.5"><div className="h-full bg-sky-300 rounded-full" style={{ width: `${c.views / maxCafe * 100}%` }}></div></div>
                            </div>
                          ))}</div>}
                        </div>
                        <div className="bg-white rounded-xl border border-stone-300 p-3">
                          <div className="text-[12px] font-bold text-stone-700">인기 지역 <span className="font-normal text-stone-400 text-[10px]">카페 조회 기준</span></div>
                          <p className="text-[9.5px] text-stone-400 mb-2">조회된 카페가 어느 동네에 몰리는지 — 수요 지도.</p>
                          {(a.topRegions || []).length === 0 ? <p className="text-[11px] text-stone-400">데이터 쌓이는 중</p> : <div className="space-y-1 max-h-56 overflow-y-auto">{a.topRegions.map((r: any, i: number) => (
                            <div key={i} className="text-[10.5px]">
                              <div className="flex justify-between"><span className="text-stone-700 font-medium">{r.area}</span><span className="text-stone-500 shrink-0 ml-1">{r.views}</span></div>
                              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mt-0.5"><div className="h-full bg-violet-300 rounded-full" style={{ width: `${r.views / maxRegion * 100}%` }}></div></div>
                            </div>
                          ))}</div>}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-white rounded-xl border border-stone-300 p-3">
                          <div className="text-[12px] font-bold text-stone-700">방문자 지역 <span className="font-normal text-stone-400 text-[10px]">위치 공유</span></div>
                          <p className="text-[9.5px] text-stone-400 mb-2">위치 안내에 동의한 방문자가 어디서 접속하는지.</p>
                          {(a.visitorRegions || []).length === 0 ? <p className="text-[11px] text-stone-400">위치 공유 데이터 없음</p> : a.visitorRegions.map((r: any, i: number) => (
                            <div key={i} className="mb-1">
                              <div className="flex justify-between text-[10.5px]"><span className="text-stone-600">{r.region}</span><span className="text-stone-500">{r.n}</span></div>
                              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mt-0.5"><div className="h-full bg-rose-300 rounded-full" style={{ width: `${r.n / maxVReg * 100}%` }}></div></div>
                            </div>
                          ))}
                        </div>
                        <div className="bg-white rounded-xl border border-stone-300 p-3">
                          <div className="text-[12px] font-bold text-stone-700">위치 동의 퍼널</div>
                          <p className="text-[9.5px] text-stone-400 mb-2">방문 → 위치 안내 동의 → 실제 위치 공유까지 단계별 비율.</p>
                          {[
                            { l: "방문(핑)", v: cs.pinged, pct: 100 },
                            { l: "위치 동의", v: cs.agreed, pct: cs.pinged ? Math.round(cs.agreed / cs.pinged * 100) : 0 },
                            { l: "위치 공유", v: cs.located, pct: cs.pinged ? Math.round(cs.located / cs.pinged * 100) : 0 },
                          ].map((s, i) => (
                            <div key={i} className="mb-1.5">
                              <div className="flex justify-between text-[10.5px] mb-0.5"><span className="text-stone-600">{s.l}</span><span className="font-bold text-stone-700">{(s.v ?? 0).toLocaleString()} <span className="text-stone-400 font-normal">{s.pct}%</span></span></div>
                              <div className="h-2 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-rose-400 rounded-full" style={{ width: `${s.pct}%` }}></div></div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-white rounded-xl border border-stone-300 p-3">
                          <div className="text-[12px] font-bold text-stone-700">페이지 유형</div>
                          <p className="text-[9.5px] text-stone-400 mb-2">어떤 화면(홈·카페상세·지역·취향)을 많이 보는지.</p>
                          {(a.pageBuckets || []).length === 0 ? <p className="text-[11px] text-stone-400">데이터 쌓이는 중</p> : a.pageBuckets.map((b: any, i: number) => (
                            <div key={i} className="mb-1">
                              <div className="flex justify-between text-[10.5px]"><span className="text-stone-600">{b.bucket}</span><span className="text-stone-500">{b.views.toLocaleString()}</span></div>
                              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mt-0.5"><div className="h-full bg-stone-400 rounded-full" style={{ width: `${b.views / maxBucket * 100}%` }}></div></div>
                            </div>
                          ))}
                        </div>
                        <div className="bg-white rounded-xl border border-stone-300 p-3">
                          <div className="text-[12px] font-bold text-stone-700">시간대 분포 <span className="font-normal text-stone-400 text-[10px]">KST</span></div>
                          <p className="text-[9.5px] text-stone-400 mb-2">하루 중 사람이 몰리는 시간{peakH >= 0 ? <> — <b className="text-orange-500">피크 {peakH}시</b></> : ""}. 콘텐츠 발행 타이밍 참고.</p>
                          {(a.hours || []).length === 0 ? <p className="text-[11px] text-stone-400">데이터 쌓이는 중</p> : <div className="flex items-end gap-px h-16">{Array.from({ length: 24 }).map((_, h) => (
                            <div key={h} className={`flex-1 rounded-t ${h === peakH ? "bg-orange-500" : "bg-orange-300"}`} style={{ height: `${((hourMap[h] || 0) / maxHour) * 100}%`, minHeight: "1px" }} title={`${h}시: ${hourMap[h] || 0}회`}></div>
                          ))}</div>}
                          <div className="flex justify-between text-[8px] text-stone-300 mt-0.5"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>23시</span></div>
                        </div>
                      </div>
                      <p className="text-[9.5px] text-stone-400 text-center pt-1">전부 우리 DB 자체 집계 · 외부(네이버·구글) 의존 0 · 갱신 {new Date(a.generatedAt).toLocaleTimeString("ko-KR")}</p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* 📧 온보딩 메일 미리보기 모달 — 승인 시 사장님께 실제 발송되는 내용 */}
        {showOnboard && (
          <div className="fixed inset-0 z-[6500]" onClick={() => setShowOnboard(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto bg-stone-50 rounded-t-2xl p-4 sm:inset-0 sm:m-auto sm:max-w-lg sm:h-fit sm:max-h-[90vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-1"><span className="text-sm font-bold text-stone-800">📧 온보딩 메일 미리보기</span><button onClick={() => setShowOnboard(false)} className="text-2xl text-stone-400 leading-none">×</button></div>
              <p className="text-[11px] text-stone-500 mb-3">승인 버튼을 누르면 사장님 이메일로 <b>자동 발송</b>되는 내용이에요. 서비스 사용법 + 구독 전용 서비스(리뷰 분석·쇼케이스·우선 노출·뉴스레터) 안내가 담겨 있어요. <b>열쇠(PIN)는 예시</b>이고, 실제로는 그 사장님의 진짜 열쇠가 들어갑니다.</p>
              {!onboard ? (
                <div className="py-10 text-center text-stone-400 text-[13px]">불러오는 중…</div>
              ) : (
                <>
                  <div className="flex gap-1.5 mb-2">
                    <button onClick={() => setOnboardTab("trial")} className={`flex-1 py-2 text-[12px] font-bold rounded-lg border ${onboardTab === "trial" ? "bg-amber-100 border-amber-300 text-amber-800" : "bg-white border-stone-300 text-stone-500"}`}>🎁 7일 체험 승인 시</button>
                    <button onClick={() => setOnboardTab("paid")} className={`flex-1 py-2 text-[12px] font-bold rounded-lg border ${onboardTab === "paid" ? "bg-amber-100 border-amber-300 text-amber-800" : "bg-white border-stone-300 text-stone-500"}`}>☕ 구독 승인 시</button>
                  </div>
                  <div className="text-[11px] text-stone-600 bg-white border border-stone-300 rounded-lg px-2.5 py-2 mb-2"><b>제목:</b> {onboard[onboardTab].subject}</div>
                  <iframe title="온보딩 메일 미리보기" srcDoc={onboard[onboardTab].html} className="w-full h-[60vh] bg-white rounded-lg border border-stone-300" />
                </>
              )}
            </div>
          </div>
        )}

        {/* 🔁 노출 로테이션 현황 모달 — 지금 누가 어떤 순서로 노출되는지(전체+구/군), 피크·다음 회전 */}
        {showRotation && (
          <div className="fixed inset-0 z-[6500]" onClick={() => setShowRotation(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto bg-stone-50 rounded-t-2xl p-4 sm:inset-0 sm:m-auto sm:max-w-lg sm:h-fit sm:max-h-[90vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-1"><span className="text-sm font-bold text-stone-900">🔁 노출 로테이션 현황</span><button onClick={() => setShowRotation(false)} className="text-2xl text-stone-500 leading-none">×</button></div>
              {!rotation ? (
                <div className="py-10 text-center text-stone-500 text-[13px]">불러오는 중…</div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-2 text-[11px] font-bold">
                    <span className={`px-2 py-1 rounded-full border ${rotation.isPeak ? "bg-teal-100 border-teal-400 text-teal-900" : "bg-stone-100 border-stone-300 text-stone-600"}`}>{rotation.isPeak ? "🔥 피크타임" : "🌙 비피크"} · {rotation.peakWindow}</span>
                    <span className="px-2 py-1 rounded-full border bg-white border-stone-300 text-stone-700">{rotation.sliceMin}분 회전 · 다음 회전 {rotation.nextRotateInMin}분 후</span>
                    <span className="px-2 py-1 rounded-full border bg-white border-stone-300 text-stone-700">구독 {rotation.total}곳 · 노출 자리 {rotation.cap}</span>
                    {!rotation.liveExposure && <span className="px-2 py-1 rounded-full border bg-amber-50 border-amber-400 text-amber-800">소비자 노출 OFF — 아래는 ‘예정’ 순서</span>}
                  </div>
                  <p className="text-[11px] text-stone-600 mb-3">🟢=지금 노출 중(상위 {rotation.cap}), ⚪=대기(다음 차례). 20분마다 순번이 한 칸씩 돌고, 피크(09~17시)를 모든 카페가 똑같이 나눠 가져요.</p>
                  {rotation.total === 0 ? (
                    <div className="py-6 text-center text-stone-500 text-[13px]">아직 우선노출(featured) 구독 카페가 없어요.</div>
                  ) : (
                    <>
                      {/* 전체 */}
                      <div className="mb-3">
                        <div className="text-[12px] font-bold text-stone-800 mb-1.5 border-b-2 border-stone-300 pb-1">🌐 전체 노출 순서</div>
                        <div className="space-y-1">
                          {rotation.global.map((c: any) => (
                            <div key={c.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border ${c.onair ? "bg-teal-50 border-teal-300" : "bg-white border-stone-300"}`}>
                              <span className="text-[12px] w-5 text-center font-bold text-stone-500">{c.rank}</span>
                              <span className="text-[13px]">{c.onair ? "🟢" : "⚪"}</span>
                              <span className="text-[13px] font-bold text-stone-800 flex-1 truncate">{c.name}</span>
                              <span className="text-[10px] text-stone-500 truncate max-w-[90px]">{c.area}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* 구/군별 */}
                      <div className="text-[12px] font-bold text-stone-800 mb-1.5 border-b-2 border-stone-300 pb-1">🏙️ 구·군별 노출 순서</div>
                      <div className="space-y-2.5">
                        {rotation.byGu.map((g: any) => (
                          <div key={g.gu} className="rounded-lg border border-stone-300 bg-white p-2">
                            <div className="text-[12px] font-bold text-stone-800 mb-1">{g.gu} <span className="font-normal text-stone-500">· {g.count}곳</span></div>
                            <div className="space-y-1">
                              {g.order.map((c: any) => (
                                <div key={c.id} className={`flex items-center gap-2 rounded px-2 py-1 ${c.onair ? "bg-teal-50" : ""}`}>
                                  <span className="text-[11px] w-4 text-center font-bold text-stone-500">{c.rank}</span>
                                  <span className="text-[12px]">{c.onair ? "🟢" : "⚪"}</span>
                                  <span className="text-[12.5px] font-bold text-stone-800 flex-1 truncate">{c.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <button onClick={loadRotation} className="mt-3 w-full py-2 text-[12px] font-bold text-stone-700 bg-stone-200 border border-stone-300 rounded-lg">↻ 새로고침</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* 📰 주간 뉴스레터 모달 */}
        {showNL && (
          <div className="fixed inset-0 z-[6000]" onClick={() => { setShowNL(false); setNlSel(null); }}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto bg-stone-50 rounded-t-2xl p-4 sm:inset-0 sm:m-auto sm:max-w-2xl sm:h-fit sm:max-h-[90vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-stone-800">📰 주간 뉴스레터 <span className="text-[11px] text-stone-500 font-normal">· 수신대상 {nlRecipients}명(구독+체험)</span></span>
                <button onClick={() => { setShowNL(false); setNlSel(null); }} className="text-2xl text-stone-400 leading-none">×</button>
              </div>
              <div className="flex gap-2 mb-2">
                <button onClick={nlGenerate} disabled={!!nlBusy} className="flex-1 py-2 text-[13px] font-bold text-white bg-indigo-600 rounded-lg disabled:opacity-50">{nlBusy === "generate" ? "생성 중…(네이버 수집)" : "✨ 이번 주 뉴스레터 생성 (무료)"}</button>
              </div>
              {nlMsg && <div className="text-[11.5px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 mb-2">{nlMsg}</div>}
              <p className="text-[10.5px] text-stone-400 mb-2">기본 생성은 <b>네이버 검색(무료)</b>으로 최신 기사를 모읍니다(크레딧 0). 출처 없는 사실·과장 표현은 자동 ⚠️ 플래그. 더 풍성한 에디토리얼은 제작자가 별도 생성해 드립니다.</p>

              {/* 목록 */}
              <div className="space-y-1.5 mb-3">
                {nlList.map((n) => (
                  <button key={n.id} onClick={() => nlOpen(n.id)} className={`w-full text-left rounded-lg border px-3 py-2 ${nlSel?.id === n.id ? "border-indigo-300 bg-indigo-50" : "border-stone-300 bg-white"}`}>
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="font-bold">#{n.issue_no} {n.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${n.status === "sent" ? "bg-emerald-100 text-emerald-700" : n.status === "approved" ? "bg-blue-100 text-blue-700" : "bg-stone-100 text-stone-500"}`}>{n.status}</span>
                      {n.flags?.length > 0 && <span className="text-[10px] text-amber-700">⚠️ {n.flags.length}</span>}
                      {n.sent_count > 0 && <span className="text-[10px] text-stone-400 ml-auto">발송 {n.sent_count}</span>}
                    </div>
                  </button>
                ))}
                {nlList.length === 0 && <p className="text-[12px] text-stone-400 text-center py-3">아직 생성된 뉴스레터가 없어요.</p>}
              </div>

              {/* 선택 전문 */}
              {nlSel && (
                <div className="border-t border-stone-300 pt-3">
                  {nlSel.flags?.length > 0 && (
                    <div className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 mb-2">
                      ⚠️ 확인 필요 {nlSel.flags.length}건: {nlSel.flags.slice(0, 4).join(" · ")}
                    </div>
                  )}
                  <div className="bg-white rounded-xl border border-stone-300 p-3 mb-2 max-h-72 overflow-y-auto">
                    <div className="font-bold text-[15px] mb-2">{nlSel.title}</div>
                    {(nlSel.sections || []).map((sec: any, si: number) => (
                      <div key={si} className="mb-2.5">
                        <div className="text-[12.5px] font-bold text-stone-700 border-b border-stone-300 pb-0.5 mb-1">{sec.title}</div>
                        <ul className="space-y-1">
                          {(sec.items || []).map((it: any, ii: number) => (
                            <li key={ii} className="text-[12px] text-stone-700 leading-snug">
                              {it.flag && <span className="text-amber-700 font-bold">⚠️ </span>}{it.text}
                              {it.why && <span className="text-stone-400"> ↳ {it.why}</span>}
                              {it.source_url && <a href={it.source_url} target="_blank" className="text-indigo-600 text-[10px] ml-1">[출처]</a>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {/* 편집(JSON) */}
                  <details className="mb-2">
                    <summary className="text-[11px] text-stone-500 cursor-pointer">✏️ 직접 편집(JSON) — 문구·항목 수정</summary>
                    <textarea id="nlEdit" defaultValue={JSON.stringify(nlSel.sections, null, 2)} className="w-full h-40 mt-1 text-[11px] font-mono border border-stone-300 rounded-lg p-2 bg-white" />
                    <button onClick={() => { try { const secs = JSON.parse((document.getElementById("nlEdit") as HTMLTextAreaElement).value); nlAct("update", nlSel.id, { title: nlSel.title, sections: secs }); } catch { setNlMsg("JSON 형식 오류"); } }} className="mt-1 px-3 py-1.5 text-[12px] font-bold text-stone-700 bg-stone-100 rounded-lg">저장</button>
                  </details>
                  <div className="flex flex-wrap gap-2">
                    {nlSel.status === "draft" && <button onClick={() => nlAct("approve", nlSel.id)} className="flex-1 py-2 text-[12px] font-bold text-blue-700 bg-blue-50 rounded-lg">✓ 승인</button>}
                    <button onClick={() => nlAct("test", nlSel.id, { email: "kyh30628@gmail.com" })} disabled={!!nlBusy} className="flex-1 py-2 text-[12px] font-bold text-stone-700 bg-stone-100 rounded-lg">📨 미리보기 메일</button>
                    {nlSel.status === "approved" && <button onClick={() => { if (confirm(`구독+체험 ${nlRecipients}명에게 일괄 전송할까요?`)) nlAct("send", nlSel.id); }} disabled={!!nlBusy} className="flex-1 py-2 text-[12px] font-bold text-white bg-emerald-600 rounded-lg">🚀 구독자 일괄 전송 ({nlRecipients}명)</button>}
                    {nlSel.status === "sent" && <span className="flex-1 py-2 text-[12px] font-bold text-emerald-700 text-center">✅ 발송 완료 ({nlSel.sent_count})</span>}
                    <button onClick={() => { if (confirm("삭제할까요?")) { nlAct("delete", nlSel.id); setNlSel(null); } }} className="px-3 py-2 text-[12px] text-rose-600 bg-rose-50 rounded-lg">삭제</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== 💎 구독 신청 ===== */}
        {(subs.length > 0 || purged > 0) && (
          <div className="mb-6">
            <div className="text-[13px] font-extrabold text-stone-800 mb-2">💎 홍보팩 구독 신청 ({subs.length})</div>
            {purged > 0 && <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-2 text-[11.5px] text-rose-700">🔔 보유기간 만료로 <b>{purged}건의 개인정보가 자동 삭제</b>됐어요. 해당 사장님께 다시 연락하려면 <b>재수집·재동의</b>가 필요합니다.</div>}
            <div className="space-y-2">
              {subs.map((s) => (
                <div key={s.id} className="bg-white rounded-xl border border-amber-300 p-3 flex items-center justify-between gap-3">
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
            <button onClick={() => toggleSec("promo")} className="w-full flex items-center justify-between text-left mb-2 border-t-2 border-stone-300 pt-6 mt-2">
              <span className="text-[13px] font-extrabold text-stone-800">{openSecs.promo ? "▾" : "▸"} 🎀 쇼케이스 승인 · AI 카피 생성 ({review.length})</span>
              <span className="text-[10px] text-stone-400 shrink-0">{openSecs.promo ? "접기" : "보기"}</span>
            </button>
            {openSecs.promo && <>
            {review.length === 0 && <p className="text-[12px] text-stone-400 bg-white rounded-xl border p-4">대기 중인 사장님 쇼케이스 요청이 없어요. 사장님이 글(또는 영상)을 저장하면 여기에서 <b className="text-stone-600">🤖 AI 어필 카피 생성</b> → <b className="text-stone-600">✓ 승인</b> 할 수 있어요.</p>}
            <div className="space-y-3">
              {review.map((p) => (
                <div key={p.cafe_id} className="bg-white rounded-xl border border-amber-300 overflow-hidden">
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
                  <div className="flex border-t border-stone-300">
                    {!p.approved ? (
                      <button onClick={() => promoAct(p.cafe_id, "approve")} disabled={!p.ai_headline && !p.video_url} className="flex-1 py-2.5 text-sm font-bold text-emerald-700 disabled:text-stone-300">✓ 승인 (노출)</button>
                    ) : (
                      <button onClick={() => promoAct(p.cafe_id, p.featured ? "unfeature" : "feature")} className={`flex-1 py-2.5 text-sm font-bold ${p.featured ? "text-amber-700 bg-amber-50" : "text-stone-700"}`}>{p.featured ? "⭐ 우선노출 ON (해제)" : "☆ 우선노출 켜기 (유료)"}</button>
                    )}
                    <button onClick={() => promoAct(p.cafe_id, "reject")} className="flex-1 py-2.5 text-sm text-rose-600 border-l border-stone-300">✕ {p.approved ? "내리기" : "반려"}</button>
                  </div>
                </div>
              ))}
            </div>
            </>}
          </div>
        )}

        {/* ===== 콘텐츠 현황 (접이식·기본 접힘) ===== */}
        <button onClick={() => toggleSec("content")} className="w-full flex items-center justify-between text-left mb-2 border-t-2 border-stone-300 pt-6 mt-2">
          <span className="text-[13px] font-extrabold text-stone-800">{openSecs.content ? "▾" : "▸"} 콘텐츠 현황 <span className="normal-case font-normal">· 공개 {ct?.published?.toLocaleString() ?? "·"} · 전체 {ct?.total?.toLocaleString() ?? "·"}</span></span>
          <span className="text-[10px] text-stone-400 shrink-0">{openSecs.content ? "접기" : "보기"}</span>
        </button>
        {openSecs.content && <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <Kpi label="전체 카페" value={ct?.total ?? "·"} />
          <Kpi label="공개 중" value={ct?.published ?? "·"} color="text-emerald-600" />
          <Kpi label="비공개" value={ct?.hidden ?? "·"} color="text-stone-500" />
          <Kpi label="사장님 등록대기" value={ct?.owner_pending ?? "·"} color="text-blue-600" sub="사람 검수 필요" />
        </div>

        {ct && (
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <Card title="등급 분포 (공개)" note="검증 30+ · 참고 5~30 · 후보 5미만(자동 비공개)">
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
        </>}

        {/* ===== 접속/방문자 (익명 · 접이식·기본 접힘) ===== */}
        <button onClick={() => toggleSec("visitors")} className="w-full flex items-center justify-between text-left mb-2 border-t-2 border-stone-300 pt-6 mt-2">
          <span className="text-[13px] font-extrabold text-stone-800">{openSecs.visitors ? "▾" : "▸"} 접속 · 방문자 현황 <span className="normal-case font-normal">· 총 {vs?.total?.toLocaleString() ?? "·"} · 7일 활성 {vs?.active7d ?? "·"}</span></span>
          <span className="text-[10px] text-stone-400 shrink-0">{openSecs.visitors ? "접기" : "보기"}</span>
        </button>
        {openSecs.visitors && <>
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
        </>}

        {/* ===== 검수 관리 (접이식·기본 접힘) ===== */}
        <button onClick={() => toggleSec("inspect")} className="w-full flex items-center justify-between text-left mb-2 border-t-2 border-stone-300 pt-6 mt-2">
          <span className="text-[13px] font-extrabold text-stone-800">{openSecs.inspect ? "▾" : "▸"} 검수 관리 <span className={`normal-case ${ownerPending.length ? "font-bold text-blue-600" : "font-normal"}`}>· 사장님 대기 {ownerPending.length}</span> <span className="normal-case font-normal">· 자동 비공개 {autoHidden.length}</span></span>
          <span className="text-[10px] text-stone-400 shrink-0">{openSecs.inspect ? "접기" : "보기"}</span>
        </button>
        {openSecs.inspect && <>
        <section className="mb-4">
          <h2 className="text-sm font-bold text-stone-700 mb-1">🙋 사장님 등록 검수 대기 ({ownerPending.length})</h2>
          <p className="text-[11px] text-stone-400 mb-2">사장님이 <b>/cafe/register</b>로 직접 등록한 가게. 확인 후 공개/삭제.</p>
          {ownerPending.length === 0 ? <p className="text-sm text-stone-400 bg-white rounded-xl p-4 border">아직 사장님 직접 등록 신청이 없습니다.</p> :
            <div className="space-y-2">{ownerPending.map((c) => <Row key={c.id} c={c} />)}</div>}
        </section>
        <section className="mb-6">
          <h2 className="text-sm font-bold text-stone-700 mb-1">🔍 자동수집 미공개 · 데이터 부족 ({autoHidden.length})</h2>
          <p className="text-[11px] text-stone-400 mb-2">검증 리뷰 5건 미만(후보)으로 자동 비공개. 사람 요청 아님 · 리뷰 쌓이면 자동 공개.</p>
          {autoHidden.length === 0 ? <p className="text-sm text-stone-400">없음</p> : (
            <>
              <button onClick={() => setShowAuto((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 mb-2">{showAuto ? "접기 ▲" : `목록 펼치기 ▼ (${autoHidden.length})`}</button>
              {showAuto && <div className="space-y-2">{autoHidden.map((c) => <Row key={c.id} c={c} />)}</div>}
            </>
          )}
        </section>
        </>}

        {/* ===== 카페 검색 관리 (1000+ 전체 나열 대신 검색) ===== */}
        <div className="text-[13px] font-extrabold text-stone-800 mb-2">카페 검색 관리</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`카페 이름 검색 (전체 ${cafes.length}곳)`} className="w-full border rounded-lg px-4 py-2.5 mb-3 bg-white" />
        {q.trim() === "" ? <p className="text-sm text-stone-400">이름을 검색해 개별 카페를 공개/숨김/삭제 관리하세요. (공개 {live.length} · 비공개 {ownerPending.length + autoHidden.length})</p>
          : searched.length === 0 ? <p className="text-sm text-stone-400">'{q}' 검색 결과 없음</p>
          : <div className="space-y-2">{searched.slice(0, 40).map((c) => <Row key={c.id} c={c} />)}{searched.length > 40 && <p className="text-xs text-stone-400 text-center">상위 40곳만 표시 · 더 좁혀 검색하세요</p>}</div>}
      </div>
    </main>
  );
}
