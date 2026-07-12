"use client";
import { useState, useEffect } from "react";
import BackLink from "../../BackLink";
import { ORG, MEMBER_INFO, type Division, type Team, type Worker } from "@/lib/org";
import { CADENCE } from "@/lib/cadence";
import { isSearchDegradeTrackItem, SEARCH_DEGRADE_TRACK } from "@/lib/searchDegradeTrack";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";
// 💬 관제 챗봇 + md2html은 /admin·/admin/org 공용 컴포넌트로 분리됨(app/admin/ChatWidget.tsx).
import { ChatWidget, md2html } from "../ChatWidget";

// 조직도(계층) — 본부→팀 단위까지. 모달 도식화용

export default function OrgDashboard() {
  const [pw, setPw] = useState("");
  const [brief, setBrief] = useState<any>(null);
  const [briefs, setBriefs] = useState<any[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showWO, setShowWO] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [showDeferred, setShowDeferred] = useState(false);
  const [showInProg, setShowInProg] = useState(false);
  const [showDeleg, setShowDeleg] = useState(false);
  const [showCoord, setShowCoord] = useState(false);
  const [showBriefs, setShowBriefs] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [showTok, setShowTok] = useState(false);
  const [member, setMember] = useState<{ k: string; n: string; t: string } | null>(null);
  const [dec, setDec] = useState<{ pending: any[]; delegated: any[]; recent: any[]; inProgress: any[]; deferred: any[] }>({ pending: [], delegated: [], recent: [], inProgress: [], deferred: [] });
  const [coord, setCoord] = useState<{ open: any[]; resolved: any[]; overdue: number }>({ open: [], resolved: [], overdue: 0 });
  const [issues, setIssues] = useState<any[]>([]);
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [showOrg, setShowOrg] = useState(false);
  const [toast, setToast] = useState("");

  const [synced, setSynced] = useState("");
  const [live, setLive] = useState<any>(null);
  const [jobs, setJobs] = useState<any>(null);
  const [showJobs, setShowJobs] = useState(false);
  const [devpipe, setDevpipe] = useState<any>(null);
  const [showDev, setShowDev] = useState(false);
  const [orgAct, setOrgAct] = useState<any>(null); // 본부별 활동 현황
  const [showRhythm, setShowRhythm] = useState(false); // 조직 운영 리듬(활동+케이던스) — 기본 접힘(다른 카드와 통일)
  const [crit, setCrit] = useState<any>(null); // 🎛️ 기준 관제 상태(스냅샷·최근변경·검증에이전트 결과)
  const [showCrit, setShowCrit] = useState(false);
  useLockBodyScroll(showOrg || !!member);
  const load = (password: string, silent = false) => {
    if (!silent) { setLoading(true); setErr(""); }
    Promise.all([
      fetch("/api/admin/org-briefing", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/decisions", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/coordination", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/issues", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/metrics", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch("/api/admin/jobs", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch("/api/admin/dev-pipeline", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch("/api/admin/org-activity", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch("/api/admin/criteria-status", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false })),
    ]).then(([b, d, co, iss, lv, jb, dp, oa, cr]) => {
      if (cr && cr.ok) setCrit(cr);
      if (oa && oa.ok) setOrgAct(oa);
      if (dp && dp.ok) setDevpipe(dp);
      if (b.ok) { setBrief(b.brief); setBriefs(b.briefs || (b.brief ? [b.brief] : [])); localStorage.setItem("adm_pw", password); } else if (!silent) setErr("비밀번호 확인");
      if (d.ok) setDec({ pending: d.pending || [], delegated: d.delegated || [], recent: d.recent || [], inProgress: d.inProgress || [], deferred: d.deferred || [] });
      if (co.ok) setCoord({ open: co.open || [], resolved: co.resolved || [], overdue: co.overdue || 0 }); // overdue 보존 — 접힌 헤더 '⚠️ 지연 N' 배선
      // 검색 AI 저하(크레딧 소진 계열)는 RM 실시간 이슈에서 제외 — 아래 '실행 중'에 상시 추적 항목으로 표기(#207).
      //   표시 필터 전용(이슈 DB row 불변). 되돌리려면 이 필터만 제거.
      if (iss.ok) setIssues((iss.open || []).filter((i: any) => !isSearchDegradeTrackItem(i?.title)));
      if (lv && lv.ok) setLive(lv);
      if (jb && jb.ok) setJobs(jb);
      setSynced(new Date().toLocaleTimeString("ko-KR"));
    }).catch(() => { if (!silent) setErr("불러오기 실패"); }).finally(() => { if (!silent) setLoading(false); });
  };
  useEffect(() => {
    const p = localStorage.getItem("adm_pw"); if (p) { setPw(p); load(p); }
    const id = setInterval(() => { const pw2 = localStorage.getItem("adm_pw"); if (pw2 && document.visibilityState === "visible") load(pw2, true); }, 15000);
    return () => clearInterval(id);
  }, []);
  // 본체 대시보드 KPI 카드에서 "?open=pending"으로 딥링크 시 결재 대기 섹션을 펼쳐서 바로 보여줌
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("open") === "pending") setShowPending(true);
  }, []);

  const decide = async (id: number, decision: "approve" | "reject") => {
    setBusy(id);
    try {
      const r = await fetch("/api/admin/decide", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" }, body: JSON.stringify({ id, decision }) }).then((x) => x.json());
      setToast(r.ok ? `✅ ${decision === "approve" ? "승인·실행" : "반려"}: ${r.result || ""}` : `⚠️ ${r.error}`);
      load(pw);
    } catch { setToast("⚠️ 처리 실패"); }
    setBusy(null); setTimeout(() => setToast(""), 4000);
  };

  const devAction = async (id: number, action: "deploy" | "discard") => {
    if (action === "deploy" && !confirm("이 브랜치를 main에 배포(git push)합니다. 진행할까요?")) return;
    setBusy(id);
    try {
      const r = await fetch("/api/admin/dev-action", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) }).then((x) => x.json());
      setToast(r.ok ? `✅ ${action === "deploy" ? "배포 확정 — 진행 중" : "폐기"}` : `⚠️ ${r.error}`);
      load(pw);
    } catch { setToast("⚠️ 처리 실패"); }
    setBusy(null); setTimeout(() => setToast(""), 4000);
  };

  const completeTask = async (id: number) => {
    if (!confirm("이 실무를 '완료' 처리합니다(실행 중에서 제거). 진행할까요?")) return;
    setBusy(id);
    try {
      const r = await fetch("/api/admin/complete-task", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).then((x) => x.json());
      setToast(r.ok ? "✅ 완료 처리됨" : `⚠️ ${r.error}`);
      load(pw);
    } catch { setToast("⚠️ 처리 실패"); }
    setBusy(null); setTimeout(() => setToast(""), 4000);
  };

  const tok = brief?.token_today || {}; const crons = brief?.crons || []; const m = brief?.metrics || {};
  const fmt = (n: number) => (n >= 1000 ? Math.round(n / 1000) + "K" : n || 0);
  const sevC: Record<string, string> = { HIGH: "#b03a3a", MED: "#b06a2e", LOW: "#6a5a48" };

  // 조직도 — 기조실장 직할(스태프)과 라인 본부를 분리 표시. 데이터/로직 변경 없이 표시만 구분.
  const staffDivs = ORG.divisions.filter((d) => d.note === "기조실장 직속");
  const lineDivs = ORG.divisions.filter((d) => d.note !== "기조실장 직속");
  // 팀 렌더 공용(직할·라인 본부가 동일한 팀 표현을 씀)
  const renderTeams = (d: Division) => d.teams.map((t: Team) => (
    <div key={t.n} style={{ margin: "6px 0" }}>
      <div style={{ fontSize: 12.5, color: "#3d2f22", display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
        <span style={{ color: d.c, fontFamily: "monospace" }}>└</span>{t.n}
      </div>
      <div style={{ fontSize: 10.5, color: "#9c8a6c", marginLeft: 16, lineHeight: 1.35 }}>{t.s}</div>
      {t.w && <div style={{ marginLeft: 16, marginTop: 3, display: "flex", flexWrap: "wrap", gap: 4 }}>
        {t.w.map((mm: Worker, mi: number) => (
          <button key={mi} onClick={() => setMember(mm)} style={{ fontSize: 10, background: mm.k === "⚙️" ? "#eef3ee" : mm.k === "🌐" ? "#eef0f6" : "#f6efe2", border: `1px solid ${mm.k === "⚙️" ? "#bcd4bc" : mm.k === "🌐" ? "#c2c8e0" : "#e2cfa8"}`, borderRadius: 6, padding: "2px 6px", color: "#5a4631", cursor: "pointer", fontFamily: "inherit" }}>
            {mm.k} {mm.n} <span style={{ color: "#9c8a6c" }}>· {mm.t}</span>
          </button>
        ))}
      </div>}
    </div>
  ));

  return (
    <main style={{ minHeight: "100vh", background: "#efe7d8", color: "#2b2018", fontFamily: "'Gowun Batang',serif", padding: "12px", maxWidth: 640, margin: "0 auto", paddingTop: "calc(12px + env(safe-area-inset-top))" }}>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box}.ex{overflow-x:auto}.ex h1{font-size:17px}.ex h2{font-size:14px;color:#9c6b3f;border-bottom:1px solid #e8b87a;padding-bottom:4px;margin-top:14px}.ex h3{font-size:13px}.ex table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0;border:1px solid #e6d8bf;display:block;overflow-x:auto;white-space:nowrap}.ex td{border:1px solid #eee3cf;padding:5px 7px}.ex code{background:#f3ead8;padding:1px 5px;border-radius:4px;font-size:12px}.ex hr{border:none;border-top:1px dashed #d8c4a0;margin:10px 0}.ex b{color:#2b2018}.ex ul{padding-left:18px}.ex li{margin:2px 0}.ex p{margin:5px 0}`}</style>

      {/* 뒤로가기는 항상 관리자 대시보드로 명시 이동 — history.back()이 인증 게이트로 빠지지 않도록 router.push('/admin') 고정(#213) */}
      <BackLink to="/admin" label="대시보드" className="text-stone-500 mb-2" />

      <div style={{ background: "#2b2018", color: "#e8b87a", borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={{ fontSize: 17, fontWeight: 700 }}>🎩 조직 관제</div><div style={{ fontSize: 11, color: "#cbb38c" }}>기획조정실 · 자율 조직 브리핑</div></div>
        <div style={{ display: "flex", gap: 5, flexWrap: "nowrap", justifyContent: "flex-end" }}>
          <a href="/admin/criteria" style={{ background: "#c98a3c", color: "#fff", borderRadius: 9, padding: "7px 11px", fontSize: 12, fontWeight: 700, textDecoration: "none", textAlign: "center", whiteSpace: "nowrap" }}>🎛️ 기준</a>
          <a href="/admin/lounge" style={{ background: "#6a468c", color: "#fff", borderRadius: 9, padding: "7px 11px", fontSize: 12, fontWeight: 700, textDecoration: "none", textAlign: "center", whiteSpace: "nowrap" }}>🏛️ 라운지</a>
          <button onClick={() => setShowOrg(true)} style={{ background: "#c98a3c", color: "#fff", border: "none", borderRadius: 9, padding: "7px 11px", fontSize: 12, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap", cursor: "pointer" }}>🏢 조직도</button>
        </div>
      </div>

      {!brief && (
        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>관리자 비밀번호</div>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(pw)} style={{ width: "100%", padding: 10, border: "1px solid #d8c4a4", borderRadius: 9, fontSize: 16 }} placeholder="비밀번호" />
          <button onClick={() => load(pw)} style={{ marginTop: 10, width: "100%", padding: 12, background: "#2b2018", color: "#f4ece0", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15 }}>{loading ? "불러오는 중…" : "열기"}</button>
          {err && <div style={{ color: "#b03a3a", fontSize: 12, marginTop: 8 }}>{err}</div>}
        </div>
      )}

      {brief && (<>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
          {/* 🔔 결재 대기 — 대기 건이 있으면 앰버 배경·진한 빨강 볼드로 한눈에 강조 */}
          <div style={{ ...card, ...(dec.pending.length ? { background: "#fff5e6", border: "2px solid #e8b046" } : {}) }}>
            <div style={lbl}>🔔 결재 대기</div>
            <div style={{ ...big, color: dec.pending.length ? "#b03a1e" : "#7a6a4c" }}>{dec.pending.length}건</div>
          </div>
          <div style={card}><div style={lbl}>📊 오늘 토큰(in)</div><div style={big}>{fmt(tok.input || 0)}</div><div style={sub}>비용프록시 ${Number(tok.cost || 0).toFixed(2)}</div></div>
          <div style={card}><div style={lbl}>📈 공개 카페 <span style={{ fontSize: 9.5, color: "#9c8a6c", fontWeight: 700 }}>실시간</span></div><div style={big}>{live ? live.pub.toLocaleString() : "—"}</div><div style={sub}>검증 {live ? live.v.toLocaleString() : "—"}{live?.backlog ? ` · 대기 ${live.backlog}` : ""}</div></div>
          <div style={card}><div style={lbl}>🤖 자율 잡 가동 <span style={{ fontSize: 9.5, color: "#9c8a6c", fontWeight: 700 }}>최신 실행</span></div><div style={{ ...big, color: (live ? live.cronFail?.length === 0 : crons.every((c: any) => c.ok)) ? "#2f7a4a" : "#b06a1e" }}>{live ? `${live.cronOk}/${live.cronTotal}` : `${crons.filter((c: any) => c.ok).length}/${crons.length}`} {(live ? live.cronFail?.length === 0 : crons.every((c: any) => c.ok)) ? "✅" : "⚠️"}</div><div style={sub}>잡별 최신 실행 성공/전체(크론·에이전트·워커)</div></div>
        </div>

        {/* 🎛️ 기준 관제 — 비즈니스 기준(criteria) 스냅샷·최근변경·검증에이전트 결과. 품질본부 소유·기조실장(L2) 관장 */}
        {crit && (
          <div style={{ ...card, marginTop: 10, border: crit.verify?.status === "fail" ? "2px solid #b03a3a" : crit.verify?.status === "warn" ? "1px solid #e0b357" : "1px solid #ddc9a8" }}>
            <button onClick={() => setShowCrit(!showCrit)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: crit.verify?.status === "fail" ? "#b03a3a" : crit.verify?.status === "warn" ? "#a5701e" : "#3f7a4f" }}>
                {showCrit ? "▾" : "▸"} 🎛️ 기준 관제 <span style={{ fontSize: 10, fontWeight: 700, color: "#9c8a6c" }}>· {crit.adjusted}/{crit.total} 조정</span>
                {crit.verify?.status === "fail" ? <span style={{ fontSize: 10, fontWeight: 700, color: "#b03a3a" }}> · 🔴 검증실패 {crit.verify.fails}{crit.verify.deadKnobs?.length ? ` (dead-knob ${crit.verify.deadKnobs.length})` : ""}</span>
                  : crit.verify?.status === "warn" ? <span style={{ fontSize: 10, fontWeight: 700, color: "#a5701e" }}> · 🟡 주의 {crit.verify.warns}</span>
                  : <span style={{ fontSize: 10, color: "#3f7a4f" }}> · 검증 정상 ✅</span>}
              </span>
              <a href="/admin/criteria" onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, fontWeight: 700, color: "#6a468c", textDecoration: "none", whiteSpace: "nowrap" }}>관제 열기 →</a>
            </button>
            {showCrit && (
              <div style={{ marginTop: 9, fontSize: 12, color: "#5a4631" }}>
                <div style={{ fontSize: 10.5, color: "#9c8a6c" }}>검증 에이전트(criteria-verify · 결정론) — 소스 {crit.verify?.scanned ?? "?"}파일 스캔 · {crit.verify?.ranAt ? new Date(crit.verify.ranAt).toLocaleTimeString("ko-KR") : ""}</div>
                {crit.verify?.failing?.length > 0 && (
                  <div style={{ marginTop: 6, padding: "7px 9px", borderRadius: 8, background: "#fbeeee", border: "1px solid #e6b3b3" }}>
                    {crit.verify.failing.map((f: any, i: number) => (
                      <div key={i} style={{ fontSize: 11.5, color: "#b03a3a", fontWeight: 600 }}>🔴 {f.label} — {f.count}건{f.samples?.length ? <span style={{ fontWeight: 400, color: "#8a5a5a" }}> ({f.samples.join(", ")})</span> : null}</div>
                    ))}
                  </div>
                )}
                {crit.verify?.warning?.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "#a5701e" }}>
                    {crit.verify.warning.map((w: any, i: number) => <div key={i}>🟡 {w.label} — {w.count}건</div>)}
                  </div>
                )}
                {crit.lastChange ? (
                  <div style={{ marginTop: 7, fontSize: 11, color: "#7a6a4c" }}>
                    최근 변경: <span style={{ fontFamily: "monospace", color: "#8a5e30" }}>{crit.lastChange.key}</span> {crit.lastChange.old_value} → <b style={{ color: "#b5731f" }}>{crit.lastChange.new_value}</b> · {crit.lastChange.changed_by} · {new Date(crit.lastChange.changed_at).toLocaleString("ko-KR")}
                  </div>
                ) : <div style={{ marginTop: 7, fontSize: 11, color: "#9c8a6c" }}>변경 이력 없음(전부 기본값)</div>}
                <div style={{ marginTop: 7, fontSize: 10.5, color: "#9c8a6c", lineHeight: 1.5 }}>
                  DoA: <b>대량영향</b>(등급바닥·좌표박스 → 공개상태 흔들림)=<b style={{ color: "#b03a3a" }}>L3 CEO 확인 게이트</b> · <b>소영향</b>(검색가산점·노출상한)=L2 기조실장 전결(바로 적용). 소유=품질본부.
                </div>
              </div>
            )}
          </div>
        )}

        {/* 🛠 로컬 잡 상태 — 접이식·기본 접힘(헤더에 정상/정지 요약). 8개 launchd 잡 하트비트 기준 실시간 */}
        <div style={{ ...card, marginTop: 10, border: jobs?.bad ? "2px solid #b03a3a" : "1px solid #ddc9a8" }}>
          <button onClick={() => setShowJobs(!showJobs)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: jobs?.bad ? "#b03a3a" : "#3f7a4f" }}>
              {showJobs ? "▾" : "▸"} 🛠 핵심 잡 신선도 (launchd {jobs?.total ?? 8}종){jobs?.bad ? <span style={{ fontSize: 10, fontWeight: 700, color: "#b03a3a" }}> · ⚠️ 정지 {jobs.bad}</span> : <span style={{ fontSize: 10, color: "#3f7a4f" }}> · 전체 정상 ✅</span>}
            </span>
          </button>
          {/* 🕐 오늘의 핵심 사이클(08·12·17시) 실행여부 — 항상 표시. "12시 배치 돌았나?"를 물어보지 않고 한눈에. */}
          {jobs?.cycles && (
            <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
              {jobs.cycles.map((c: any) => {
                const st = c.state;
                const done = st === "ran" || st === "ran_inferred";
                const bg = done ? "#eaf5ec" : st === "missing" ? "#fbeaea" : st === "running" ? "#e8f0fb" : "#f3ede0";
                const bd = done ? "#bfe0c6" : st === "missing" ? "#e6b3b3" : st === "running" ? "#bcd4ee" : "#e0d3b8";
                const fg = done ? "#2f6b3f" : st === "missing" ? "#b03a3a" : st === "running" ? "#2a5d9c" : "#9c8a6c";
                const icon = done ? "✅" : st === "missing" ? "🔴" : st === "running" ? "🔄" : "⏳";
                const txt = st === "ran" ? `${c.at} 실행` : st === "ran_inferred" ? "실행됨" : st === "missing" ? "누락!" : st === "running" ? "진행중" : "예정";
                return (
                  <div key={c.name} style={{ flex: 1, minWidth: 92, background: bg, border: `1px solid ${bd}`, borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "#2b2018" }}>{c.name} {c.label}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: fg, marginTop: 2 }}>{icon} {txt}</div>
                  </div>
                );
              })}
            </div>
          )}
          {showJobs && jobs?.jobs && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 10 }}>
              {jobs.jobs.map((j: any) => {
                const c = j.state === "정상" ? "#3f7a4f" : "#b03a3a";
                const dot = j.state === "정상" ? "🟢" : j.state === "실패" ? "🔴" : "🟠";
                const age = j.ageMin == null ? "기록없음" : j.ageMin < 60 ? `${j.ageMin}분 전` : j.ageMin < 1440 ? `${Math.round(j.ageMin / 60)}시간 전` : `${Math.round(j.ageMin / 1440)}일 전`;
                return (
                  <div key={j.job} style={{ background: "#fbf6ec", border: `1px solid ${j.state === "정상" ? "#e6d8bf" : "#e6b3b3"}`, borderRadius: 9, padding: "8px 9px" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#2b2018" }}>{dot} {j.label}</div>
                    <div style={{ fontSize: 10, color: c, fontWeight: 700, marginTop: 2 }}>{j.state} · {age}</div>
                    <div style={{ fontSize: 9.5, color: "#9c8a6c", marginTop: 2 }}>{j.team} · {j.sched}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 🕐 조직 운영 리듬 — 본부별 활동(live) + 실행 케이던스(설계). 기본 펼침 */}
        <div style={{ ...card, marginTop: 10 }}>
          <button onClick={() => setShowRhythm(!showRhythm)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#2a7a72" }}>{showRhythm ? "▾" : "▸"} 🕐 조직 운영 리듬</span>
            {orgAct && <span style={{ fontSize: 10.5, color: "#9c8a6c", fontWeight: 700 }}>24h {orgAct.totalRan24h}회 · 다음 {orgAct.nextCycleHour}시({orgAct.nextCycleToday ? "오늘" : "내일"})</span>}
          </button>
          {showRhythm && (
            <div style={{ marginTop: 10 }}>
              {/* 본부별 활동(현재) */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9c6b3f", marginBottom: 6 }}>본부별 활동 (현재)</div>
              {orgAct?.teams ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {orgAct.teams.map((t: any) => {
                    const dot = !t.ok ? "🔴" : t.lastH < 24 ? "🟢" : "🟡";
                    const ago = t.lastH < 1 ? "방금" : `${t.lastH}h 전`;
                    return (
                      <div key={t.team} style={{ background: "#fbf6ec", border: "1px solid #e6d8bf", borderRadius: 9, padding: "7px 9px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#2b2018" }}>{dot} {t.team}</div>
                        <div style={{ fontSize: 9.5, color: "#9c8a6c", marginTop: 2 }}>{ago} · {t.lastJob} ({t.ran24h}/{t.jobs})</div>
                      </div>
                    );
                  })}
                </div>
              ) : <div style={{ fontSize: 11, color: "#9c8a6c" }}>불러오는 중…</div>}

              {/* 🔎 조직도↔본부맵 드리프트 경보 — 자동감지(정상=숨김). org.ts와 jobTeams.ts가 어긋난 잡. */}
              {orgAct?.drift?.length > 0 && (
                <div style={{ marginTop: 10, background: "#fbeaea", border: "1px solid #e0b4b4", borderRadius: 9, padding: "8px 10px" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#b03a3a" }}>⚠️ 조직도 드리프트 {orgAct.drift.length}건 — org.ts↔jobTeams.ts 본부 불일치</div>
                  {orgAct.drift.map((d: any) => (
                    <div key={d.job} style={{ fontSize: 10, color: "#8a4a4a", marginTop: 3 }}>{d.name}({d.job}): 조직도 <b>{d.orgDivision}</b> ↔ 본부맵 <b>{d.jobTeamDivision}</b></div>
                  ))}
                </div>
              )}

              {/* 실행 케이던스(설계) */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9c6b3f", margin: "12px 0 6px" }}>실행 케이던스 (설계 · 도메인 변화속도에 맞춤)</div>
              <div style={{ overflowX: "auto", border: "1px solid #ddc9a8", borderRadius: 9 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 480 }}>
                  <thead>
                    <tr style={{ background: "#f3e9d8", color: "#8a7a5c", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>계층</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>빈도</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>시각</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>에이전트 · 근거</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CADENCE.map((c) => {
                      const teal = /3×|2×/.test(c.freq); const sky = c.freq === "상시";
                      const bg = teal ? "#d6efe9" : sky ? "#dceaf5" : "#ece1cc";
                      const fg = teal ? "#2a7a72" : sky ? "#3a6a92" : "#7a6a4c";
                      return (
                        <tr key={c.tier} style={{ borderTop: "1px solid #e6d8bf", verticalAlign: "top" }}>
                          <td style={{ padding: "7px 8px", fontWeight: 700, color: "#2b2018", whiteSpace: "nowrap" }}>{c.tier}</td>
                          <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}><span style={{ background: bg, color: fg, fontWeight: 700, padding: "1px 7px", borderRadius: 20, fontSize: 10 }}>{c.freq}</span></td>
                          <td style={{ padding: "7px 8px", color: "#6a5a44" }}>{c.when}</td>
                          <td style={{ padding: "7px 8px", color: "#9c8a6c" }}>{c.items} · {c.why}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 9.5, color: "#a89574", marginTop: 6 }}>조간회의 폐지 · 12시 점심=오염 가드만 · 결정론 품질크론은 토큰0이라 2×로 촘촘. 변경 출처: run-daily/weekly·vercel.json (lib/cadence.ts)</div>
            </div>
          )}
        </div>

        {/* 🛠 개발 파이프라인 — 승인된 dev_task 진행(개발대기→배포대기→배포). 배포대기는 CEO 배포/폐기 조치 */}
        {devpipe?.jobs?.length > 0 && (
          <div style={{ ...card, marginTop: 10, border: devpipe.stuckNonChatCount ? "2px solid #b03a3a" : devpipe.waiting ? "2px solid #6a468c" : "1px solid #ddc9a8" }}>
            <button onClick={() => setShowDev(!showDev)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: devpipe.stuckNonChatCount ? "#b03a3a" : devpipe.waiting ? "#6a468c" : "#9c6b3f" }}>
                {showDev ? "▾" : "▸"} 🛠 개발 파이프라인 ({devpipe.jobs.length}){devpipe.waiting ? <span style={{ fontSize: 10, fontWeight: 700, color: "#6a468c" }}> · 🚀 배포대기 {devpipe.waiting}</span> : null}{devpipe.stuckCount ? <span style={{ fontSize: 10, fontWeight: 700, color: "#b03a3a" }}> · ⏱ 정체 {devpipe.stuckCount}{devpipe.stuckNonChatCount ? `(자동승격 없음 ${devpipe.stuckNonChatCount})` : ""}</span> : null}
              </span>
              <span style={{ fontSize: 10.5, color: "#9c8a6c" }}>승인→브랜치구현→검증→배포</span>
            </button>
            {/* ⏱ 배포정체 경보(#280) — 접힘 여부와 무관하게 항상 노출. source≠'chat'은 자동승격 경로 없음(우선 표시) */}
            {devpipe.stuckCount > 0 && (
              <div style={{ marginTop: 8, background: devpipe.stuckNonChatCount ? "#fbeaea" : "#fdf3e3", border: `1px solid ${devpipe.stuckNonChatCount ? "#e0b4b4" : "#e6cfa0"}`, borderRadius: 9, padding: "8px 10px" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: devpipe.stuckNonChatCount ? "#b03a3a" : "#9c6b3f" }}>
                  ⏱ 배포 정체 {devpipe.stuckCount}건 — 30분+ 배포대기{devpipe.stuckNonChatCount ? ` (그중 자동승격 경로 없음 ${devpipe.stuckNonChatCount}건 — 수동 배포/폐기 필요)` : ""}
                </div>
                {devpipe.stuck.map((s: any) => (
                  <div key={s.id} style={{ fontSize: 10, color: s.source !== "chat" ? "#8a4a4a" : "#8a7458", marginTop: 3 }}>
                    #{s.id} {s.title.replace(/^\[개발\]\s*/, "")} — {s.age_min}분 경과{s.source !== "chat" ? " · 출처: 비챗(자동승격 없음)" : " · 출처: 챗"}
                  </div>
                ))}
              </div>
            )}
            {showDev && <div style={{ marginTop: 8 }}>
              {devpipe.jobs.map((j: any) => {
                // 사실대로 — '실패' 왜곡 금지. 색: 회색=중립, 자주=배포대기, 청록=진행, 주황=조치필요, 빨강=진짜오류
                const sc: Record<string, string> = { "개발대기": "#8a7458", "building": "#2a7a72", "배포대기": "#6a468c", "빌드오류": "#b03a3a", "구현불가": "#9c8a6c", "스코프반려": "#b06a2e", "회귀반려": "#b06a2e", "deploy_approved": "#2a7a72", "배포오류": "#b06a2e" };
                const sl: Record<string, string> = { "개발대기": "개발 대기", "building": "구현 중", "배포대기": "검증완료·배포대기", "빌드오류": "빌드 오류(수정 필요)", "구현불가": "코드 변경 불필요/불가", "스코프반려": "스코프 반려(목적 외 파일)", "회귀반려": "회귀검증 반려(재작업/폐기)", "deploy_approved": "배포 진행 중", "배포오류": "배포 오류(자동 재시도)" };
                return (
                  <div key={j.id} style={{ border: `1px solid ${j.dev_status === "배포대기" ? "#d3c0e6" : "#e6d8bf"}`, borderRadius: 10, padding: "9px 11px", marginBottom: 8, background: j.dev_status === "배포대기" ? "#faf7fd" : "#fbfaf5" }}>
                    <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ background: sc[j.dev_status] || "#888", color: "#fff", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>{sl[j.dev_status] || j.dev_status}</span>
                      <span style={{ fontWeight: 700, fontSize: 12.5 }}>#{j.id} {j.title.replace(/^\[개발\]\s*/, "")}</span>
                    </div>
                    {j.summary && <div style={{ fontSize: 11.5, color: "#5a4631", lineHeight: 1.45, margin: "4px 0 2px" }}>{j.summary}</div>}
                    {j.branch && <div style={{ fontSize: 10, color: "#9c8a6c" }}>🌿 {j.branch}{j.result ? ` · ${j.result}` : ""}</div>}
                    {j.dev_status === "배포대기" && (
                      <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                        <button disabled={busy === j.id} onClick={() => devAction(j.id, "deploy")} style={{ flex: 1, padding: "7px 0", background: "#6a468c", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12.5 }}>🚀 배포</button>
                        <button disabled={busy === j.id} onClick={() => devAction(j.id, "discard")} style={{ flex: 1, padding: "7px 0", background: "#efe7d8", color: "#8a5a5a", border: "1px solid #d8c4a4", borderRadius: 8, fontWeight: 700, fontSize: 12.5 }}>폐기</button>
                      </div>
                    )}
                    {["빌드오류", "구현불가", "스코프반려", "회귀반려"].includes(j.dev_status) && (
                      <button disabled={busy === j.id} onClick={() => devAction(j.id, "discard")} style={{ marginTop: 7, width: "100%", padding: "6px 0", background: "#efe7d8", color: "#8a5a5a", border: "1px solid #d8c4a4", borderRadius: 8, fontWeight: 700, fontSize: 12 }}>폐기</button>
                    )}
                  </div>
                );
              })}
            </div>}
          </div>
        )}

        {/* 🚨 RM 실시간 이슈 — 접이식·기본 접힘(헤더에 건수·HIGH 표시) */}
        <div style={{ ...card, marginTop: 10, border: issues.length ? "2px solid #b03a3a" : "1px solid #bcd4bc" }}>
          <button onClick={() => setShowIssues(!showIssues)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: issues.length ? "#b03a3a" : "#3f7a4f" }}>
              {showIssues ? "▾" : "▸"} 🚨 RM 실시간 이슈 ({issues.length}) {issues.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#b03a3a" }}>· HIGH {issues.filter((i) => i.severity === "HIGH").length}</span>}
            </span>
            <span style={{ fontSize: 10.5, color: "#9c8a6c" }}>{showIssues ? "접기" : issues.length ? "조치 보기" : "보기"}</span>
          </button>
          {showIssues && <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10.5, color: "#9c8a6c", marginBottom: 8 }}>발견 즉시 RM 분류·담당 배정. 상태: <b style={{ color: "#3f7a4f" }}>🔵처리중</b>(팀이 처리 중) · <b style={{ color: "#b06a2e" }}>🔔결재대기</b>(CEO 승인 요청) · <b style={{ color: "#b03a3a" }}>🔴OUTSTANDING</b>(즉시해결 불가·중대). 해결되면 자동 사라짐.</div>
          {issues.length === 0 ? <div style={{ color: "#3f7a4f", fontSize: 13 }}>현재 열린 이슈 없음 ✅</div> :
            issues.map((i) => (
              <div key={i.ikey} style={{ border: "1px solid #e6d8bf", borderRadius: 10, padding: "9px 11px", marginBottom: 8, background: i.severity === "HIGH" ? "#fff6f4" : "#fbfaf5" }}>
                <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                  {(() => { const st = i.state || "처리중"; const c = st === "결재대기" ? "#b06a2e" : st === "OUTSTANDING" ? "#b03a3a" : "#3f7a4f"; const ic = st === "결재대기" ? "🔔" : st === "OUTSTANDING" ? "🔴" : "🔵"; return <span style={{ background: c, color: "#fff", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>{ic} {st}</span>; })()}
                  <span style={{ background: sevC[i.severity] || "#888", color: "#fff", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>{i.severity}</span>
                  <span style={{ fontWeight: 700, fontSize: 12.5 }}>{i.title}</span>
                </div>
                {i.detail && <div style={{ fontSize: 11, color: "#5a4631", margin: "4px 0 3px", lineHeight: 1.4 }}>{i.detail}</div>}
                {(() => {
                  const st = i.state || "처리중";
                  const eta = st === "결재대기" ? "대표님 결재 시 즉시 집행"
                    : st === "OUTSTANDING" ? "기조실장 집행 — 시점 추적 중(자동 미해결)"
                    : (i.note && /(시간|매시|매 |분|즉시|:\d|주기|사이클|일\b)/.test(i.note)) ? i.note
                    : "다음 자동 교정 사이클 (~10분 주기)";
                  const elapsed = Number(i.hrs) >= 24 ? `${Math.floor(Number(i.hrs) / 24)}일 경과` : Number(i.hrs) >= 1 ? `${Math.floor(Number(i.hrs))}시간 경과` : "방금";
                  return (
                    <div style={{ fontSize: 10.5, color: "#9c8a6c", lineHeight: 1.55 }}>
                      🕐 <b>발생</b> {i.seen} ({elapsed}) · ⏱ <b>조치예상</b> {eta} · 담당 <b style={{ color: "#7a5a2a" }}>{i.team}</b>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>}
        </div>

        {/* 💰 오늘 토큰 사용 — 접이식·기본 접힘 */}
        <div style={{ ...card, marginTop: 10 }}>
          <button onClick={() => setShowTok(!showTok)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#9c6b3f" }}>{showTok ? "▾" : "▸"} 💰 오늘 토큰 사용 ({fmt(tok.input || 0)} in · ${Number(tok.cost || 0).toFixed(2)})</span>
            <span style={{ fontSize: 10.5, color: "#9c8a6c" }}>{showTok ? "접기" : "보기"}</span>
          </button>
          {showTok && <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10.5, color: "#9c8a6c", marginBottom: 8 }}>구독 기반이라 실청구 0 · 비용프록시는 콘솔키 환산 참고치</div>
          <div style={{ display: "flex", gap: 14, alignItems: "baseline", marginBottom: 8 }}>
            <div><span style={{ fontSize: 22, fontWeight: 700, color: "#c98a3c" }}>{fmt(tok.input || 0)}</span><span style={{ fontSize: 11, color: "#9c6b3f" }}> in</span></div>
            <div><span style={{ fontSize: 18, fontWeight: 700, color: "#c98a3c" }}>{fmt(tok.output || 0)}</span><span style={{ fontSize: 11, color: "#9c6b3f" }}> out</span></div>
            <div><span style={{ fontSize: 15, fontWeight: 700, color: "#5a4631" }}>${Number(tok.cost || 0).toFixed(2)}</span><span style={{ fontSize: 11, color: "#9c8a6c" }}> 프록시</span></div>
          </div>
          {(tok.byAgent || []).length > 0 ? (
            <div>{(tok.byAgent || []).slice(0, 5).map((a: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "3px 0", borderBottom: "1px solid #f0e8d8", color: "#5a4631" }}>
                <span>{i + 1}. {a.a}</span><span style={{ color: "#9c8a6c" }}>{fmt(a.i || 0)} tok · {a.n}회</span>
              </div>))}</div>
          ) : <div style={{ fontSize: 11.5, color: "#9c8a6c" }}>오늘 실행 데이터 없음 — 사이클(08:00) 후 집계</div>}
          </div>}
        </div>

        {/* 🔔 결재 — 승인 클릭 시 실행 (접이식·기본 접힘) */}
        <div style={{ ...card, marginTop: 10 }}>
          <button onClick={() => setShowPending(!showPending)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: dec.pending.length ? "#b03a3a" : "#9c6b3f" }}>{showPending ? "▾" : "▸"} 🔔 CEO 결재 대기 ({dec.pending.length})</span>
            <span style={{ fontSize: 10.5, color: "#9c8a6c" }}>{showPending ? "접기" : dec.pending.length ? "결재하기" : "보기"}</span>
          </button>
          {showPending && <>
          <div style={{ fontSize: 10.5, color: "#9c8a6c", margin: "6px 0 8px" }}>치명적·비가역(L3)만 — 카페 비공개·등급변경·새 규칙로직·외부발송. 운영결정(L1·L2)은 본부·기조실장 전결.</div>
          {dec.pending.length === 0 ? <div style={{ color: "#3f7a4f", fontSize: 13 }}>대기 중인 결재 없음 ✅</div> :
            dec.pending.map((d) => (
              <div key={d.id} style={{ border: "1px solid #e6d8bf", borderRadius: 11, padding: 12, marginBottom: 10, background: "#fffdf8" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ background: sevC[d.severity] || "#888", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>{d.severity || "—"}</span>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{d.title}</span>
                  {d.team && <span style={{ fontSize: 10, color: "#9c8a6c" }}>· {d.team}</span>}
                </div>
                {d.detail && <div style={{ fontSize: 12, color: "#5a4631", margin: "6px 0", lineHeight: 1.5 }}>{d.detail}</div>}
                {d.recommendation && <div style={{ fontSize: 12, color: "#2f5d3a", background: "#eef6ee", border: "1px solid #cfe6cf", borderRadius: 8, padding: "7px 9px", margin: "6px 0", lineHeight: 1.5 }}><b>💬 기조실장 의견</b> · {d.recommendation}</div>}
                <div style={{ fontSize: 10.5, color: "#9c8a6c", marginBottom: 8 }}>실행: {d.action_type === "agent_task" ? "기조실장이 담당 본부 배분" : `${d.action_type}${d.action_params?.ids ? ` (${d.action_params.ids.length}곳)` : ""}`}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button disabled={busy === d.id} onClick={() => decide(d.id, "approve")} style={{ flex: 2, padding: 10, background: "#3f7a4f", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, opacity: busy === d.id ? 0.5 : 1 }}>{busy === d.id ? "실행 중…" : "✅ 승인 · 실행"}</button>
                  <button disabled={busy === d.id} onClick={() => decide(d.id, "reject")} style={{ flex: 1, padding: 10, background: "#efe7d8", color: "#8a6534", border: "1px solid #ddc9a8", borderRadius: 9, fontWeight: 700, fontSize: 13 }}>반려</button>
                </div>
              </div>
            ))}
          {dec.recent.length > 0 && <div style={{ fontSize: 10.5, color: "#9c8a6c", marginTop: 6 }}>최근 처리: {dec.recent.slice(0, 4).map((r) => `${r.title}(${r.status})`).join(" · ")}</div>}
          </>}
        </div>

        {/* ⏸️ 보류(deferred·resolved) — 림보 결재의 가시성+의사결정 확보. 접이식·기본 접힘.
            decide API가 deferred도 처리(2026-07-02) → status='deferred'는 재개/종결 버튼으로 화면에서 바로 결정. resolved(종결)는 표시만. */}
        {dec.deferred.length > 0 && (
          <div style={{ ...card, marginTop: 10 }}>
            <button onClick={() => setShowDeferred(!showDeferred)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#8a6534" }}>{showDeferred ? "▾" : "▸"} ⏸️ 보류 (deferred) ({dec.deferred.length})</span>
              <span style={{ fontSize: 10.5, color: "#9c8a6c" }}>{showDeferred ? "접기" : "보기"}</span>
            </button>
            {showDeferred && <>
            <div style={{ fontSize: 10.5, color: "#9c8a6c", margin: "6px 0 8px" }}>보류 상태의 결재 — 여기서 바로 결정하세요. <b style={{ color: "#3f7a4f" }}>▶ 재개</b>(활성 큐로 되돌림 → 기조실장이 배분·실행) · <b style={{ color: "#8a5a5a" }}>종결</b>(폐기). 자동 만료 없음 — 결정 전까지 계속 떠 있습니다.</div>
            {dec.deferred.map((d) => (
              <div key={d.id} style={{ border: "1px solid #e6d8bf", borderRadius: 10, padding: "9px 11px", marginBottom: 8, background: "#fbfaf5" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ background: d.status === "deferred" ? "#8a6534" : "#9c8a6c", color: "#fff", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>{d.status === "deferred" ? "⏸️ 보류" : "종결"}</span>
                  {d.tier && <span style={{ background: "#6b8fae", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20 }}>{d.tier}</span>}
                  <span style={{ fontWeight: 700, fontSize: 12.5 }}>#{d.id} {d.title}</span>
                </div>
                <div style={{ fontSize: 10.5, color: "#9c8a6c", marginTop: 3 }}>{d.team || "-"} · {d.created_at}</div>
                {d.recommendation && <div style={{ fontSize: 11.5, color: "#2f5d3a", background: "#eef6ee", border: "1px solid #cfe6cf", borderRadius: 8, padding: "6px 8px", marginTop: 5, lineHeight: 1.5 }}><b>💬 기조실장 의견</b> · {d.recommendation}</div>}
                {d.status === "deferred" && (
                  <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                    <button disabled={busy === d.id} onClick={() => decide(d.id, "approve")} style={{ flex: 1, padding: "7px 0", background: "#3f7a4f", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12.5, opacity: busy === d.id ? 0.5 : 1 }}>▶ 재개</button>
                    <button disabled={busy === d.id} onClick={() => { if (confirm(`#${d.id} 종결(폐기)합니다. 되돌리려면 다시 상신해야 합니다.`)) decide(d.id, "reject"); }} style={{ flex: 1, padding: "7px 0", background: "#efe7d8", color: "#8a5a5a", border: "1px solid #d8c4a4", borderRadius: 8, fontWeight: 700, fontSize: 12.5, opacity: busy === d.id ? 0.5 : 1 }}>종결</button>
                  </div>
                )}
              </div>
            ))}
            </>}
          </div>
        )}

        {/* 🔧 실행 중 — 승인됐지만 아직 완료 안 된 실무형(실세계·판단 필요). 끝난 것/진행중 구분. 접이식·기본 접힘. */}
        <div style={{ ...card, marginTop: 10 }}>
          <button onClick={() => setShowInProg(!showInProg)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#8a6534" }}>{showInProg ? "▾" : "▸"} 🔧 실행 중 ({dec.inProgress.length + 1})</span>
            <span style={{ fontSize: 10.5, color: "#9c8a6c" }}>{showInProg ? "접기" : "보기"}</span>
          </button>
          {showInProg && <>
          <div style={{ fontSize: 10.5, color: "#9c8a6c", margin: "6px 0 8px" }}>CEO 승인 후 담당 본부가 실제 실행 중인 실무(방문·정책·룰적용 등). 완료되면 자동으로 여기서 빠짐.</div>
          {/* 📌 상시 추적 항목 — 검색 AI 저하(콘솔키 크레딧 소진). 관제탑 실시간 이슈에서 제외하고 여기서만 추적(#207). 코드 상수(DB 아님) — 완료 버튼 없음. */}
          <div style={{ display: "flex", gap: 7, alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f0e8d8", fontSize: 12 }}>
            <span style={{ background: "#8a6534", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20 }}>추적</span>
            <span style={{ flex: 1, color: "#5a4631" }}>{SEARCH_DEGRADE_TRACK.title} <span style={{ fontSize: 10, color: "#9c8a6c" }}>· {SEARCH_DEGRADE_TRACK.note}</span></span>
            <span style={{ fontSize: 10, color: "#9c8a6c" }}>{SEARCH_DEGRADE_TRACK.team}</span>
          </div>
          {dec.inProgress.map((d) => (
            <div key={d.id} style={{ display: "flex", gap: 7, alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f0e8d8", fontSize: 12 }}>
              <span style={{ background: "#c08a3e", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20 }}>실행중</span>
              <span style={{ flex: 1, color: "#5a4631" }}>{d.title}</span>
              <span style={{ fontSize: 10, color: d.age_h >= 72 ? "#b03a3a" : "#9c8a6c" }}>{d.team || "-"} · {d.age_h}h</span>
              <button disabled={busy === d.id} onClick={() => completeTask(d.id)} style={{ fontSize: 10, fontWeight: 700, color: "#3f7a4f", background: "#eef5ef", border: "1px solid #cfe3d2", borderRadius: 7, padding: "2px 8px", cursor: "pointer", opacity: busy === d.id ? 0.5 : 1 }}>완료</button>
            </div>
          ))}
          </>}
        </div>

        {/* 🟢 하위 전결 FYI — 본부(L1)·기조실장(L2)이 자체 처리한 결정. 접이식·기본 접힘. */}
        <div style={{ ...card, marginTop: 10 }}>
          <button onClick={() => setShowDeleg(!showDeleg)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#3f7a4f" }}>{showDeleg ? "▾" : "▸"} 🟢 전결 처리내역 ({dec.delegated.length})</span>
            <span style={{ fontSize: 10.5, color: "#9c8a6c" }}>{showDeleg ? "접기" : "보기"}</span>
          </button>
          {showDeleg && <>
          <div style={{ fontSize: 10.5, color: "#9c8a6c", margin: "6px 0 8px" }}>본부·기조실장이 권한 내 결정·집행 — CEO 결재 불필요, 사후 가시성.</div>
          {dec.delegated.length > 0 ? dec.delegated.map((d) => (
            <div key={d.id} style={{ display: "flex", gap: 7, alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f0e8d8", fontSize: 12 }}>
              <span style={{ background: d.tier === "L1" ? "#6b8fae" : "#9c7bbf", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20 }}>{d.tier}</span>
              <span style={{ flex: 1, color: "#5a4631" }}>{d.title}</span>
              <span style={{ fontSize: 10, color: "#9c8a6c" }}>{d.decided_by} · {d.at}</span>
            </div>
          )) : <div style={{ fontSize: 12, color: "#9c8a6c" }}>최근 전결 처리 없음</div>}
          </>}
        </div>

        {/* 🤝 협업 현황 — 경영지원팀 주관 코디네이션 (접이식·기본 접힘) */}
        <div style={{ ...card, marginTop: 10 }}>
          <button onClick={() => setShowCoord(!showCoord)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: (coord as any).overdue ? "#b03a3a" : "#9c6b3f" }}>{showCoord ? "▾" : "▸"} 🤝 협업 현황 (진행 {coord.open.length}){(coord as any).overdue ? <span style={{ fontSize: 10, fontWeight: 700, color: "#b03a3a" }}> · ⚠️ 지연 {(coord as any).overdue}</span> : null} <span style={{ fontSize: 10, fontWeight: 400, color: "#9c8a6c" }}>· 경영지원팀 주관</span></span>
            <span style={{ fontSize: 10.5, color: "#9c8a6c" }}>{showCoord ? "접기" : "보기"}</span>
          </button>
          {showCoord && <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: "#9c8a6c", marginBottom: 6 }}>흐름: 요청 → 조율 → 수신확인 → 완료 (기한초과 시 지연·재촉)</div>
          {coord.open.length === 0 ? <div style={{ color: "#3f7a4f", fontSize: 13 }}>진행 중인 부서 간 협업 없음</div> :
            coord.open.map((c: any) => {
              const stg = c.stage || "요청";
              const stageC: Record<string, string> = { "요청": "#8a7458", "조율": "#c98a3c", "수신확인": "#2a7a72", "지연": "#b03a3a", "CEO결재": "#6a468c", "개발승인": "#3a6ea5", "CEO정체판단": "#a53a6e", "기조실장 재배정": "#3f7a4f" };
              return (
              <div key={c.id} style={{ border: `1px solid ${stg === "지연" ? "#e6b3b3" : "#e6d8bf"}`, borderRadius: 10, padding: "9px 11px", marginBottom: 8, background: stg === "지연" ? "#fdf3f3" : "#fbfaf5" }}>
                <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ background: typeC[c.type] || "#888", color: "#fff", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>{typeLabel[c.type] || c.type}</span>
                  <span style={{ background: stageC[stg] || "#888", color: "#fff", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>{stg}</span>
                  {c.due_h != null && stg !== "지연" && <span style={{ fontSize: 9.5, color: Number(c.due_h) < 0 ? "#b03a3a" : "#9c8a6c" }}>{Number(c.due_h) >= 0 ? `${c.due_h}h 내` : "기한초과"}</span>}
                  <span style={{ fontWeight: 700, fontSize: 12.5 }}>{c.topic}</span>
                </div>
                <div style={{ fontSize: 11, color: "#8a7458", margin: "4px 0 2px" }}>{c.from_team} <span style={{ color: "#c98a3c" }}>→</span> {c.to_team}</div>
                {c.detail && <div style={{ fontSize: 11.5, color: "#5a4631", lineHeight: 1.45 }}>{c.detail}</div>}
              </div>
            );})}
          {coord.resolved.length > 0 && <div style={{ fontSize: 10.5, color: "#9c8a6c", marginTop: 4 }}>최근 해결: {coord.resolved.slice(0, 3).map((r: any) => r.topic).join(" · ")}</div>}
          </div>}
        </div>

        {/* 📋 기획조정실장 업무지시 (WORK-ORDER) — 다음 사이클 본부별 명확한 지시 */}
        {brief?.work_order && (
          <div style={{ ...card, marginTop: 10 }} className="ex">
            <button onClick={() => setShowWO(!showWO)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#6a468c" }}>{showWO ? "▾" : "▸"} 🗂️ 기획조정실장 업무지시 (다음 사이클)</span>
              <span style={{ fontSize: 10.5, color: "#9c8a6c" }}>{showWO ? "접기" : "본부별 지시 보기"}</span>
            </button>
            {showWO && <div style={{ marginTop: 8 }} dangerouslySetInnerHTML={{ __html: md2html(brief.work_order) }} />}
          </div>
        )}

        <div style={{ ...card, marginTop: 10 }} className="ex">
          <button onClick={() => setShowBriefs(!showBriefs)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#9c6b3f" }}>{showBriefs ? "▾" : "▸"} 📋 EXECUTIVE 일일보고서 (최근 10일 · 시간별)</span>
            <span style={{ fontSize: 10.5, color: "#9c8a6c" }}>{showBriefs ? "접기" : "보기"}</span>
          </button>
          {showBriefs && <div style={{ marginTop: 6 }}>
          {briefs.length === 0 ? <div style={{ fontSize: 12, color: "#9c8a6c" }}>보고서 없음</div> :
            briefs.map((bf: any, i: number) => {
              const day = bf.day || String(bf.created_at || "").slice(0, 10);
              const time = bf.time || String(bf.created_at || "").slice(11, 16);
              const open = openId === bf.id; // 기본 전부 접힘 — 클릭한 항목만 펼침
              const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(day + "T00:00:00+09:00").getDay()];
              const newDay = i === 0 || (briefs[i - 1]?.day !== day); // 날짜 바뀌는 지점에 구분선
              return (
                <div key={bf.id ?? i}>
                  {newDay && <div style={{ fontSize: 11, fontWeight: 700, color: "#9c6b3f", marginTop: i === 0 ? 0 : 8, padding: "4px 2px 2px", borderTop: i === 0 ? "none" : "1px solid #e6d8bf" }}>{day} ({wd})</div>}
                  <div style={{ borderBottom: "1px solid #f0e8d8" }}>
                    <button onClick={() => setOpenId(open ? null : bf.id)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: "9px 2px", cursor: "pointer", fontFamily: "inherit" }}>
                      <span style={{ fontWeight: 600, fontSize: 12.5, color: "#5a4631" }}>{open ? "▾" : "▸"} {time}{i === 0 && <span style={{ fontSize: 10, color: "#c98a3c", fontWeight: 400 }}> · 최신</span>}</span>
                      <span style={{ fontSize: 10.5, color: "#9c8a6c" }}>{open ? "접기" : "보기"}</span>
                    </button>
                    {open && <div style={{ padding: "2px 2px 12px" }} dangerouslySetInnerHTML={{ __html: md2html(bf.executive_md || "_이 보고서 내용 없음_") }} />}
                  </div>
                </div>
              );
            })}
          </div>}
        </div>
        <div style={{ marginTop: 12, textAlign: "center", fontSize: 11.5, color: "#3f7a4f", fontWeight: 600 }}>🟢 실시간 자동 갱신 중{synced && <span style={{ color: "#9c8a6c", fontWeight: 400 }}> · 마지막 동기 {synced}</span>}</div>
        <div style={{ textAlign: "center", color: "#9c8a6c", fontSize: 11, margin: "10px 0 16px" }}>소비자 경험을 최우선한다 · 기획조정실</div>
      </>)}

      {/* 조직도 모달 */}
      {showOrg && (
        <div onClick={() => setShowOrg(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,14,10,.6)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#f4ece0", borderRadius: "18px 18px 0 0", padding: 18, width: "100%", maxWidth: 640, maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#2b2018" }}>🏢 자율 조직도</div>
              <button onClick={() => setShowOrg(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#9c8a6c" }}>✕</button>
            </div>
            <div style={{ fontSize: 10.5, color: "#6b5640", marginBottom: 12, lineHeight: 1.5, background: "#efe2cf", borderRadius: 8, padding: "7px 10px" }}>
              서비스 전 영역에 주인 팀이 있습니다. 각 팀의 가동 멤버: <b>🧠 배치</b>(LLM 에이전트·하루1회/격일) · <b>⚙️ 상시</b>(결정론 크론·매시간~매일 자동) · <b>🌐 실시간</b>(API·매 요청). 결정론 크론도 팀 소속입니다.
            </div>
            {/* CEO */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <span style={{ background: "#2b2018", color: "#e8b87a", fontWeight: 700, fontSize: 14, padding: "7px 16px", borderRadius: 10 }}>👤 {ORG.ceo}</span>
            </div>
            <div style={{ width: 2, height: 14, background: "#c98a3c", margin: "0 auto" }} />
            {/* 기획조정실장 */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <span style={{ background: "#c98a3c", color: "#fff", fontWeight: 700, fontSize: 13.5, padding: "7px 16px", borderRadius: 10, textAlign: "center" }}>{ORG.chief}</span>
            </div>
            <div style={{ width: 2, height: 14, background: "#c98a3c", margin: "0 auto" }} />
            {/* 직할(스태프) + 라인 본부 트리 — 기조실장 아래 계층 연결선 */}
            <div style={{ borderLeft: "2px solid #d8c4a0", marginLeft: 10, paddingLeft: 14, marginTop: 2 }}>
              {/* 🎯 기조실장 직할 — 라인 본부와 위치(맨 위)·스타일(톤다운 배경·점선 액센트 보더)로 구분되는 스태프 그룹 */}
              <div style={{ background: "#f0e7d5", border: "1.5px dashed #c9a56a", borderRadius: 10, padding: "9px 11px 5px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
                  <span style={{ background: "#8a6d3b", color: "#fff", fontWeight: 700, fontSize: 9.5, letterSpacing: 0.5, padding: "2px 8px", borderRadius: 5 }}>직할</span>
                  <span style={{ fontSize: 10.5, color: "#8a6d3b", fontWeight: 700 }}>기조실장 직속 · 스태프 유닛</span>
                </div>
                {/* 비서실장 — 스태프이므로 점선 보더로 톤다운 */}
                <div style={{ background: "#fbf6ec", color: "#6b5640", fontWeight: 600, fontSize: 12.5, padding: "5px 10px", borderRadius: 8, border: "1px dashed #d3bd94", marginBottom: 10, display: "inline-block" }}>{ORG.secretary}</div>
                {staffDivs.map((d) => (
                  <div key={d.n} style={{ marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {/* 라인 본부는 solid 채움, 직할은 투명배경·점선 아웃라인으로 스태프 성격 표시 */}
                      <span style={{ background: "transparent", color: d.c, border: `1.5px dashed ${d.c}`, fontWeight: 700, fontSize: 13, padding: "3px 10px", borderRadius: 8 }}>{d.n}</span>
                      {d.note && <span style={{ fontSize: 10, color: "#9c8a6c", fontWeight: 700 }}>· {d.note}</span>}
                    </div>
                    <div style={{ borderLeft: `2px dashed ${d.c}`, marginLeft: 12, paddingLeft: 12, marginTop: 5, opacity: 0.95 }}>
                      {renderTeams(d)}
                    </div>
                  </div>
                ))}
              </div>
              {/* 라인 본부 — 기존 solid 카드 스타일 유지 */}
              {lineDivs.map((d) => (
                <div key={d.n} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ background: d.c, color: "#fff", fontWeight: 700, fontSize: 13, padding: "4px 11px", borderRadius: 8 }}>{d.n}</span>
                    {d.note && <span style={{ fontSize: 10, color: "#9c8a6c", fontWeight: 700 }}>· {d.note}</span>}
                  </div>
                  <div style={{ borderLeft: `2px solid ${d.c}`, marginLeft: 12, paddingLeft: 12, marginTop: 5, opacity: 0.95 }}>
                    {renderTeams(d)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "#9c6b3f", borderTop: "1px dashed #d8c4a0", paddingTop: 10 }}>
              실행: 현업 본부 매일 자율 가동 → 기조실장 종합 → CEO 보고. 결재는 기조실장이 담당 본부·팀에 배분. (전략기획·경영지원은 격일)
            </div>
          </div>
        </div>
      )}

      {/* 가동 멤버 의미·역할 팝업 */}
      {member && (
        <div onClick={() => setMember(null)} style={{ position: "fixed", inset: 0, background: "rgba(20,14,10,.55)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 18, maxWidth: 340, width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,.3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>{member.k}</span>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: "#2b2018" }}>{member.n}</span>
            </div>
            <div style={{ fontSize: 11, color: "#9c8a6c", marginBottom: 9 }}>
              {member.k === "⚙️" ? "결정론 크론 · 상시 자동" : member.k === "🌐" ? "API · 실시간 서빙" : "LLM 에이전트 · 배치"} · 가동 {member.t}
            </div>
            <div style={{ fontSize: 12.5, color: "#3d2f22", lineHeight: 1.6 }}>{MEMBER_INFO[member.n] || "설명 준비 중."}</div>
            <button onClick={() => setMember(null)} style={{ marginTop: 12, width: "100%", padding: 9, background: "#efe7d8", color: "#5a4631", border: "1px solid #ddc9a8", borderRadius: 9, fontWeight: 700, fontSize: 12.5, fontFamily: "inherit" }}>닫기</button>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#2b2018", color: "#fff", padding: "10px 18px", borderRadius: 22, fontSize: 13, zIndex: 60, maxWidth: "90%", textAlign: "center" }}>{toast}</div>}
      <ChatWidget pw={pw} />
    </main>
  );
}
const card: React.CSSProperties = { background: "#fff", border: "1px solid #ddc9a8", borderRadius: 12, padding: "12px 14px", minWidth: 0 };
const lbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: "#8a5e30" };
// 핵심 수치 — 폭에 맞춰 잘림 없이(자릿수 정렬 tabular-nums·한 줄 유지·넘치면 축약). 대비 강한 진한 색.
const big: React.CSSProperties = { fontSize: 23, fontWeight: 800, color: "#b5731f", lineHeight: 1.15, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const sub: React.CSSProperties = { fontSize: 10.5, color: "#8a7a5c", fontWeight: 600 };
const typeC: Record<string, string> = { help: "#3a6ea5", handoff: "#3f7a4f", cowork: "#7a5a2a", dependency: "#b06a2e" };
const typeLabel: Record<string, string> = { help: "도움요청", handoff: "인계", cowork: "코웍", dependency: "의존" };
