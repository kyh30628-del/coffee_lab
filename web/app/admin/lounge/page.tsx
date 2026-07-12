"use client";
import { useState, useEffect, useCallback } from "react";
import { ORG, MEMBER_INFO, JOB_TO_MEMBER, type Team, type Division, type Worker } from "@/lib/org";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";

// 경량 마크다운(회의록·조직평가 렌더용) — 제목·목록·굵게·표
function md2html(md: string) {
  const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  let html = "", inList = false; let tbl: string[] = [];
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  const flushTbl = () => {
    if (!tbl.length) return;
    const rows = tbl.filter((r) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r)); // |---| 구분행 제거
    html += "<div style='overflow-x:auto;margin:4px 0'><table style='border-collapse:collapse;font-size:10.5px;width:100%'>";
    rows.forEach((r, i) => {
      const cells = r.replace(/^\s*\||\|\s*$/g, "").split("|").map((c) => c.trim());
      const tag = i === 0 ? "th" : "td";
      html += "<tr>" + cells.map((c) => `<${tag} style="border:1px solid #e0d2b8;padding:3px 6px;text-align:left;${i === 0 ? "background:#f0e6d4" : ""}">${inline(c)}</${tag}>`).join("") + "</tr>";
    });
    html += "</table></div>"; tbl = [];
  };
  for (const ln of String(md || "").split("\n")) {
    if (/^\s*\|.*\|/.test(ln)) { closeList(); tbl.push(ln); continue; }
    flushTbl();
    if (/^#{1,4}\s/.test(ln)) { closeList(); html += `<div style="font-weight:700;margin:8px 0 3px">${inline(ln.replace(/^#+\s/, ""))}</div>`; }
    else if (/^[-*]\s/.test(ln)) { if (!inList) { html += "<ul style='margin:2px 0;padding-left:16px'>"; inList = true; } html += `<li>${inline(ln.replace(/^[-*]\s/, ""))}</li>`; }
    else if (/^>\s/.test(ln)) { closeList(); html += `<div style="border-left:3px solid #ddc9a8;padding-left:8px;color:#8a7a5c;margin:3px 0">${inline(ln.replace(/^>\s/, ""))}</div>`; }
    else if (ln.trim() === "") { closeList(); }
    else { closeList(); html += `<div>${inline(ln)}</div>`; }
  }
  flushTbl(); closeList();
  return html;
}

type Perf = { ok: boolean; processed: number; ranAt: string; detail: string; ok7: number; tot7: number };
type Data = {
  perf: Record<string, Perf>;
  brief: { meeting: string; work_order: string; d: string } | null;
  coord: { id: number; from_team: string; to_team: string; topic: string; status: string; resolution: string; t: string }[];
  decisions: { id: number; title: string; team: string; recommendation: string }[];
  today: { runs: number; ok: number };
  comments: { id: number; target: string; author: string; body: string; t: string }[];
  peers: { id: number; reviewer: string; target: string; note: string; t: string }[];
  reports: { kind: string; title: string; md: string; d: string }[];
  kpi: Record<string, { goal: string; by: string; wk: string }>;
  acq: Record<string, { visitors: number; returned: number }>;
};
// 잡키 → 읽기 좋은 직원명
const reviewerName = (job: string) => JOB_TO_MEMBER[job]?.name || job;

const ago = (iso: string) => {
  if (!iso) return "";
  const h = (Date.now() - new Date(iso).getTime()) / 3.6e6;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}분 전`;
  if (h < 24) return `${Math.round(h)}시간 전`;
  return `${Math.round(h / 24)}일 전`;
};
// 팀·본부 성과 롤업(소속 직원의 7일 성공 집계)
function rollup(members: Worker[], perf: Record<string, Perf>) {
  let ok = 0, tot = 0, tracked = 0, live = 0;
  for (const w of members) {
    if (!w.j) { live++; continue; }
    const p = perf[w.j]; if (!p) continue;
    tracked++; ok += p.ok7; tot += p.tot7;
  }
  return { rate: tot ? Math.round((100 * ok) / tot) : null, tracked, live, members: members.length };
}
const teamMembers = (t: Team) => t.w;
const divMembers = (d: Division) => d.teams.flatMap((t) => t.w);

export default function Lounge() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showFeed, setShowFeed] = useState(true);
  const [showPeers, setShowPeers] = useState(true);
  const [showMeeting, setShowMeeting] = useState(false);
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ target: string; label: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [kpiEdit, setKpiEdit] = useState<{ scope: string; label: string } | null>(null);
  const [kpiDraft, setKpiDraft] = useState("");

  const load = useCallback(async (p: string) => {
    try {
      const r = await fetch("/api/admin/lounge", { headers: { "x-admin-password": p }, cache: "no-store" }).then((x) => x.json());
      if (!r.ok) { setErr(r.error || "오류"); setAuthed(false); return; }
      setData(r); setAuthed(true); setErr("");
    } catch { setErr("네트워크 오류"); }
  }, []);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("adm_pw") : "";
    if (saved) { setPw(saved); load(saved); }
  }, [load]);
  useEffect(() => {
    if (!authed) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") load(pw); }, 30000);
    return () => clearInterval(id);
  }, [authed, pw, load]);
  useLockBodyScroll(info !== null || composer !== null || kpiEdit !== null);

  const doLogin = () => { if (pw) { localStorage.setItem("adm_pw", pw); load(pw); } };
  const perf = data?.perf || {};
  const commentsFor = (target: string) => (data?.comments || []).filter((c) => c.target === target);
  const peersFor = (name: string) => (data?.peers || []).filter((p) => p.target && (p.target.includes(name) || name.includes(p.target)));
  const submitComment = async () => {
    if (!composer || !draft.trim()) return;
    await fetch("/api/admin/lounge", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" }, body: JSON.stringify({ target: composer.target, body: draft.trim() }) });
    setDraft(""); setComposer(null); load(pw);
  };
  const submitKpi = async () => {
    if (!kpiEdit || !kpiDraft.trim()) return;
    await fetch("/api/admin/lounge", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" }, body: JSON.stringify({ kpiScope: kpiEdit.scope, goal: kpiDraft.trim() }) });
    setKpiDraft(""); setKpiEdit(null); load(pw);
  };
  const delComment = async (id: number) => { await fetch(`/api/admin/lounge?id=${id}`, { method: "DELETE", headers: { "x-admin-password": pw } }); load(pw); };

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#efe7d6", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Apple SD Gothic Neo', sans-serif" }}>
        <div style={{ background: "#f7f1e4", padding: 28, borderRadius: 16, width: 300, boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#2b2018", marginBottom: 4 }}>🏛️ 전사 라운지</div>
          <div style={{ fontSize: 12, color: "#9c8a6c", marginBottom: 16 }}>동네 커피 노트 · 임직원 공간</div>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder="관리자 비밀번호" style={{ width: "100%", padding: 11, border: "1px solid #d8c4a4", borderRadius: 9, fontSize: 16, boxSizing: "border-box" }} />
          {err && <div style={{ color: "#b03a3a", fontSize: 12, marginTop: 8 }}>{err}</div>}
          <button onClick={doLogin} style={{ width: "100%", marginTop: 12, padding: 11, background: "#2b2018", color: "#e8b87a", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 15 }}>입장</button>
        </div>
      </div>
    );
  }

  const okRate = data?.today?.runs ? Math.round((100 * data.today.ok) / data.today.runs) : null;

  return (
    <div style={{ minHeight: "100vh", background: "#efe7d6", fontFamily: "'Apple SD Gothic Neo', sans-serif", color: "#2b2018", paddingBottom: 40 }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 12px" }}>
        {/* 헤더 */}
        <div style={{ background: "linear-gradient(135deg,#2b2018,#3d2f22)", color: "#f4ece0", padding: "20px 18px", borderRadius: "0 0 18px 18px", marginBottom: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🏛️ 전사 라운지</div>
          <div style={{ fontSize: 12.5, color: "#d9c3a0", marginTop: 3 }}>동네 커피 노트 · 자율 조직이 함께 일하고 나누는 공간</div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <Stat label="오늘 실행" value={`${data?.today?.runs ?? 0}`} />
            <Stat label="오늘 성공률" value={okRate == null ? "—" : `${okRate}%`} accent={okRate != null && okRate < 90 ? "#e0a05a" : "#8fd19e"} />
            <Stat label="본부" value={`${ORG.divisions.length}`} />
            <Stat label="결재 대기" value={`${data?.decisions?.length ?? 0}`} accent={(data?.decisions?.length ?? 0) > 0 ? "#e8b87a" : undefined} />
          </div>
          <div style={{ fontSize: 11.5, color: "#c9b291", marginTop: 12, lineHeight: 1.5 }}>
            👑 {ORG.ceo} · {ORG.chief} · {ORG.secretary}
          </div>
        </div>

        {/* 🧭 진짜 유입 북극성 — 검색 유입 재방문율 (상시 노출) */}
        {data?.acq && (
          <div style={{ background: "linear-gradient(135deg,#0f5132,#157347)", color: "#eafaf0", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>🧭 진짜 유입 신호 <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.8 }}>· 검색 유입 브라우저 + 재방문(다시 켬=세션 2회+) · 봇·내부 제외 30일</span></div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              {[["네이버", "naver"], ["구글", "google"]].map(([label, key]) => {
                const a = data.acq[key] || { visitors: 0, returned: 0 };
                const rate = a.visitors ? Math.round((100 * a.returned) / a.visitors) : 0;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 11.5, opacity: 0.85 }}>{label}</span>
                    <b style={{ fontSize: 19 }}>{a.visitors}</b>
                    <span style={{ fontSize: 11, opacity: 0.85 }}>브라우저 · 다른날 재방문</span>
                    <b style={{ fontSize: 16, color: rate >= 20 ? "#8fe0a8" : "#e9d38a" }}>{a.returned}</b>
                    <span style={{ fontSize: 10.5, opacity: 0.7 }}>명 ({rate}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 전략 밸류업 제언·인사팀 조직평가·주간 리포트 */}
        {(data?.reports || []).map((r) => {
          const meta = r.kind === "strategy-valueup" ? { ic: "🚀", bg: "#eef4ff", bd: "#c9d9f0" } : r.kind === "weekly-eval" ? { ic: "🏅", bg: "#faf3e8", bd: "#e6d8bf" } : { ic: "📄", bg: "#fff", bd: "#e6d8bf" };
          return (
            <div key={r.kind} style={{ background: "#fff", border: `1px solid ${meta.bd}`, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
              <div onClick={() => setOpenReport((o) => (o === r.kind ? null : r.kind))} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", cursor: "pointer", background: meta.bg }}>
                <b style={{ fontSize: 13.5 }}>{meta.ic} {r.title}</b>
                <span style={{ fontSize: 11.5, color: "#9c8a6c" }}>{r.d} · {openReport === r.kind ? "접기 ▾" : "펼치기 ▸"}</span>
              </div>
              {openReport === r.kind && <div style={{ padding: "4px 14px 14px", fontSize: 12, lineHeight: 1.65, color: "#4a3f34", maxHeight: "62vh", overflowY: "auto" }} dangerouslySetInnerHTML={{ __html: md2html(r.md) }} />}
            </div>
          );
        })}

        {/* 공유회 피드 */}
        <Section title="📢 공유회 — 오늘의 회의·자율 협업" open={showFeed} onToggle={() => setShowFeed((v) => !v)} summary={`최근 협업 ${data?.coord?.length ?? 0} · 결재 ${data?.decisions?.length ?? 0}`}>
          {data?.brief?.work_order && (
            <div style={{ background: "#fff", border: "1px solid #e6d8bf", borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setShowMeeting((v) => !v)}>
                <b style={{ fontSize: 13.5 }}>📋 기획조정실장 업무지시 · {data.brief.d}</b>
                <span style={{ fontSize: 12, color: "#9c8a6c" }}>{showMeeting ? "접기 ▾" : "펼치기 ▸"}</span>
              </div>
              {showMeeting && <div style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 8, color: "#4a3f34" }} dangerouslySetInnerHTML={{ __html: md2html(data.brief.work_order) }} />}
            </div>
          )}
          {(data?.decisions?.length ?? 0) > 0 && (
            <div style={{ background: "#fdeecf", border: "2px solid #e0a94a", borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
              <b style={{ fontSize: 13.5, color: "#8a4e12" }}>⚖️ CEO 결재 대기 {data!.decisions.length}건</b>
              {data!.decisions.slice(0, 6).map((d) => (
                <div key={d.id} style={{ fontSize: 12, fontWeight: 600, color: "#4a3820", marginTop: 5, lineHeight: 1.45 }}>#{d.id} {d.title}{d.recommendation ? <span style={{ color: "#2f5d3a", fontWeight: 500 }}> · 의견: {d.recommendation.slice(0, 40)}</span> : ""}</div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "#9c8a6c", margin: "4px 2px 6px", fontWeight: 700 }}>🤝 최근 협업·피드백 스트림 <span style={{ fontWeight: 400, fontSize: 10 }}>(종결 포함 최근 20 · 진행중만 보려면 조직관제)</span></div>
          {(data?.coord || []).length === 0 && <div style={{ fontSize: 12, color: "#9c8a6c", padding: "4px 2px" }}>최근 협업 없음</div>}
          {(data?.coord || []).map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, padding: "7px 2px", borderBottom: "1px solid #ece1cc" }}>
              <span style={{ fontSize: 15 }}>{c.status === "open" ? "🟡" : "✅"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: "#3d3126", lineHeight: 1.4 }}><b>{c.from_team || "?"}</b> → <b>{c.to_team || "?"}</b></div>
                <div style={{ fontSize: 12, color: "#5c4f40", lineHeight: 1.4 }}>{c.topic}</div>
                {c.resolution && <div style={{ fontSize: 11.5, color: "#2f5d3a", marginTop: 2 }}>↳ {c.resolution.slice(0, 80)}</div>}
              </div>
              <span style={{ fontSize: 10.5, color: "#a89878", whiteSpace: "nowrap" }}>{c.t}</span>
            </div>
          ))}
        </Section>

        {/* 다면평가 — 에이전트 상호평가 */}
        <Section title="🔄 다면평가 — 에이전트 상호평가" open={showPeers} onToggle={() => setShowPeers((v) => !v)} summary={`${data?.peers?.length ?? 0}건`}>
          {(data?.peers || []).length === 0 && <div style={{ fontSize: 12, color: "#9c8a6c", padding: "2px" }}>아직 상호평가 없음 — 에이전트가 다음 실행에서 서로의 산출물을 평가하면 여기 쌓입니다.</div>}
          {(data?.peers || []).map((p) => (
            <div key={p.id} style={{ padding: "7px 2px", borderBottom: "1px solid #ece1cc" }}>
              <div style={{ fontSize: 12.5, lineHeight: 1.45 }}><b style={{ color: "#6a468c" }}>{reviewerName(p.reviewer)}</b> → <b>{p.target || "전반"}</b></div>
              <div style={{ fontSize: 12, color: "#5c4f40", lineHeight: 1.45 }}>{p.note} <span style={{ fontSize: 10.5, color: "#a89878" }}>· {p.t}</span></div>
            </div>
          ))}
        </Section>

        {/* 본부 → 팀 → 직원 */}
        {ORG.divisions.map((d) => {
          const dr = rollup(divMembers(d), perf);
          const isOpen = open[d.n] ?? false;
          return (
            <div key={d.n} style={{ marginBottom: 10 }}>
              <div onClick={() => setOpen((o) => ({ ...o, [d.n]: !isOpen }))} style={{ display: "flex", alignItems: "center", gap: 8, background: d.c, color: "#fff", padding: "11px 14px", borderRadius: isOpen ? "12px 12px 0 0" : 12, cursor: "pointer" }}>
                <b style={{ fontSize: 15, flex: 1 }}>{d.n}{d.note ? <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 400 }}> · {d.note}</span> : ""}</b>
                <RateBadge rate={dr.rate} />
                <span style={{ fontSize: 11, opacity: 0.9 }}>{isOpen ? "▾" : "▸"}</span>
              </div>
              {isOpen && (
                <div style={{ background: "#f7f1e4", border: `1px solid ${d.c}33`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: 10 }}>
                  {/* 본부 이번 주 목표 */}
                  {data?.kpi?.[d.n] ? (
                    <div style={{ fontSize: 11.5, background: "#fff7e8", border: "1px solid #f0dcae", borderRadius: 8, padding: "6px 9px", marginBottom: 9, lineHeight: 1.45 }}>
                      <b style={{ color: "#b5852a" }}>📅 본부 주간 목표</b> <span style={{ color: "#c9a86a", fontSize: 10 }}>({data.kpi[d.n].by === "CEO" ? "대표님 설정" : "수립"})</span>
                      <span onClick={() => { setKpiEdit({ scope: d.n, label: d.n }); setKpiDraft(data!.kpi[d.n].goal); }} style={{ float: "right", cursor: "pointer", color: "#c9a86a" }}>✎</span>
                      <div style={{ color: "#7a5f2a" }}>{data.kpi[d.n].goal}</div>
                    </div>
                  ) : (
                    <div onClick={() => { setKpiEdit({ scope: d.n, label: d.n }); setKpiDraft(""); }} style={{ fontSize: 10.5, color: "#c0a878", marginBottom: 9, cursor: "pointer" }}>📅 본부 주간 목표 대기 — 자율 수립 예정(클릭 시 대표님 지정)</div>
                  )}
                  {d.teams.map((t) => {
                    const tr = rollup(teamMembers(t), perf);
                    const tgt = `team:${t.n}`;
                    return (
                      <div key={t.n} style={{ background: "#fff", border: "1px solid #ece0cd", borderRadius: 11, padding: 11, marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <b style={{ fontSize: 13.5, flex: 1 }}>{t.n}</b>
                          <RateBadge rate={tr.rate} />
                          <button onClick={() => setComposer({ target: tgt, label: t.n })} title="팀에 코멘트" style={{ border: "none", background: "#f0e6d4", borderRadius: 7, fontSize: 12, padding: "2px 7px", cursor: "pointer" }}>💬</button>
                        </div>
                        {t.s && <div style={{ fontSize: 11.5, color: "#8a7a5c", marginTop: 3, lineHeight: 1.45 }}><b style={{ color: "#7a6a4c" }}>🎯 맡은 일</b> · {t.s}</div>}
                        {/* 이번 주 목표·KPI */}
                        {data?.kpi?.[t.n] ? (
                          <div style={{ fontSize: 11.5, background: "#fff7e8", border: "1px solid #f0dcae", borderRadius: 8, padding: "5px 8px", marginTop: 5, lineHeight: 1.45 }}>
                            <b style={{ color: "#b5852a" }}>📅 이번 주 목표·KPI</b> <span style={{ color: "#c9a86a", fontSize: 10 }}>({data.kpi[t.n].by === "CEO" ? "대표님 설정" : "팀 수립"})</span>
                            <span onClick={() => { setKpiEdit({ scope: t.n, label: t.n }); setKpiDraft(data!.kpi[t.n].goal); }} style={{ float: "right", cursor: "pointer", color: "#c9a86a", fontSize: 11 }}>✎</span>
                            <div style={{ color: "#7a5f2a" }}>{data.kpi[t.n].goal}</div>
                          </div>
                        ) : (
                          <div onClick={() => { setKpiEdit({ scope: t.n, label: t.n }); setKpiDraft(""); }} style={{ fontSize: 10.5, color: "#c0a878", marginTop: 5, cursor: "pointer" }}>📅 이번 주 목표 대기 — 팀이 자율 수립 예정(클릭 시 대표님 지정)</div>
                        )}
                        <div style={{ fontSize: 10.5, color: "#a89878", fontWeight: 700, margin: "7px 0 1px" }}>📋 한 일 (최근)</div>
                        {/* 직원들 */}
                        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                          {t.w.map((w) => {
                            const p = w.j ? perf[w.j] : undefined;
                            const rate = p && p.tot7 ? Math.round((100 * p.ok7) / p.tot7) : null;
                            const mtgt = `member:${w.n}`;
                            return (
                              <div key={w.n} style={{ background: "#faf5ea", borderRadius: 9, padding: "8px 10px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 15 }}>{w.k}</span>
                                  <span onClick={() => MEMBER_INFO[w.n] && setInfo(w.n)} style={{ fontSize: 12.5, fontWeight: 700, flex: 1, cursor: MEMBER_INFO[w.n] ? "pointer" : "default", textDecoration: MEMBER_INFO[w.n] ? "underline dotted #cbb" : "none" }}>{w.n}</span>
                                  {p ? <span title="최근 실행" style={{ fontSize: 13 }}>{p.ok ? "🟢" : "🔴"}</span> : <span style={{ fontSize: 10.5, color: "#a89878" }}>실시간</span>}
                                  <button onClick={() => setComposer({ target: mtgt, label: w.n })} title="직원에 코멘트" style={{ border: "none", background: "#f0e6d4", borderRadius: 6, fontSize: 11, padding: "1px 6px", cursor: "pointer" }}>💬</button>
                                </div>
                                <div style={{ fontSize: 11, color: "#9c8a6c", marginTop: 2 }}>{w.t}</div>
                                {p && (
                                  <div style={{ fontSize: 11, color: "#5c4f40", marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                                    <span>7일 성공 <b>{p.ok7}/{p.tot7}</b>{rate != null ? ` (${rate}%)` : ""}</span>
                                    <span style={{ color: "#a89878" }}>{ago(p.ranAt)}</span>
                                  </div>
                                )}
                                {p?.detail && p.detail !== "완료" && <div style={{ fontSize: 11, color: "#6b5d4a", marginTop: 3, lineHeight: 1.4 }}>📤 {p.detail}</div>}
                                {peersFor(w.n).slice(0, 3).map((pr) => (
                                  <div key={pr.id} style={{ fontSize: 11, color: "#6a468c", background: "#f3eef8", border: "1px solid #ddd0ea", borderRadius: 7, padding: "4px 7px", marginTop: 4, lineHeight: 1.4 }}>🔄 <b>{reviewerName(pr.reviewer)}</b>: {pr.note}</div>
                                ))}
                                {commentsFor(mtgt).map((c) => (
                                  <div key={c.id} style={{ fontSize: 11.5, background: "#eef6ee", border: "1px solid #cfe6cf", borderRadius: 7, padding: "5px 7px", marginTop: 5, lineHeight: 1.4 }}>
                                    <b style={{ color: "#2f5d3a" }}>💬 {c.author}</b> <span style={{ color: "#a89878" }}>{c.t}</span> <span onClick={() => delComment(c.id)} style={{ float: "right", cursor: "pointer", color: "#b0967d" }}>✕</span>
                                    <div style={{ color: "#3d5040" }}>{c.body}</div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                        {/* 팀 코멘트 */}
                        {commentsFor(tgt).map((c) => (
                          <div key={c.id} style={{ fontSize: 11.5, background: "#eef6ee", border: "1px solid #cfe6cf", borderRadius: 7, padding: "5px 7px", marginTop: 6, lineHeight: 1.4 }}>
                            <b style={{ color: "#2f5d3a" }}>💬 {c.author} → {t.n}</b> <span style={{ color: "#a89878" }}>{c.t}</span> <span onClick={() => delComment(c.id)} style={{ float: "right", cursor: "pointer", color: "#b0967d" }}>✕</span>
                            <div style={{ color: "#3d5040" }}>{c.body}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ textAlign: "center", fontSize: 11, color: "#a89878", marginTop: 14 }}>30초마다 자동 갱신 · <a href="/admin/org" style={{ color: "#9c6b3f" }}>운영 관제로 →</a></div>
      </div>

      {/* 멤버 설명 모달 */}
      {info && (
        <div onClick={() => setInfo(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#f7f1e4", borderRadius: 14, padding: 18, maxWidth: 400 }}>
            <b style={{ fontSize: 14 }}>{info}</b>
            <div style={{ fontSize: 12.5, color: "#4a3f34", lineHeight: 1.6, marginTop: 8 }}>{MEMBER_INFO[info]}</div>
            <button onClick={() => setInfo(null)} style={{ marginTop: 12, padding: "7px 16px", background: "#2b2018", color: "#e8b87a", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>닫기</button>
          </div>
        </div>
      )}

      {/* 코멘트 작성 */}
      {composer && (
        <div onClick={() => setComposer(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#f7f1e4", borderRadius: "16px 16px 0 0", padding: 16, maxWidth: 640, width: "100%" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>💬 {composer.label}에게 코멘트</div>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus placeholder="피드백·격려·지시를 남기세요…" style={{ width: "100%", height: 90, padding: 10, border: "1px solid #ddc9a8", borderRadius: 10, fontSize: 15, boxSizing: "border-box", resize: "none" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => setComposer(null)} style={{ flex: 1, padding: 11, background: "#e8ddc8", color: "#6b5d4a", border: "none", borderRadius: 9, fontWeight: 700 }}>취소</button>
              <button onClick={submitComment} disabled={!draft.trim()} style={{ flex: 2, padding: 11, background: "#2b2018", color: "#e8b87a", border: "none", borderRadius: 9, fontWeight: 700, opacity: draft.trim() ? 1 : 0.5 }}>남기기</button>
            </div>
          </div>
        </div>
      )}

      {/* 주간 목표·KPI 설정 */}
      {kpiEdit && (
        <div onClick={() => setKpiEdit(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#f7f1e4", borderRadius: "16px 16px 0 0", padding: 16, maxWidth: 640, width: "100%" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>📅 {kpiEdit.label} — 이번 주 목표·KPI</div>
            <div style={{ fontSize: 11, color: "#9c8a6c", marginBottom: 8 }}>측정 가능하게 지표=목표치로. 예: “검증 승격 20건, 신규 발굴 40곳, 오염 0건”</div>
            <textarea value={kpiDraft} onChange={(e) => setKpiDraft(e.target.value)} autoFocus placeholder="이번 주 목표와 KPI 지표·목표치…" style={{ width: "100%", height: 84, padding: 10, border: "1px solid #ddc9a8", borderRadius: 10, fontSize: 15, boxSizing: "border-box", resize: "none" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => setKpiEdit(null)} style={{ flex: 1, padding: 11, background: "#e8ddc8", color: "#6b5d4a", border: "none", borderRadius: 9, fontWeight: 700 }}>취소</button>
              <button onClick={submitKpi} disabled={!kpiDraft.trim()} style={{ flex: 2, padding: 11, background: "#b5852a", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, opacity: kpiDraft.trim() ? 1 : 0.5 }}>목표 확정</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  // 강조색이 지정된 지표(예: 낮은 성공률·결재 대기)는 옅은 배경까지 입혀 한눈에 띄게. 값은 자릿수 정렬·한 줄 유지(넘침 방지).
  return (
    <div style={{ background: accent ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.1)", borderRadius: 10, padding: "7px 12px", minWidth: 62, boxShadow: accent ? `inset 0 0 0 1px ${accent}55` : undefined }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent || "#f7f0e4", lineHeight: 1.15, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: "#d6c1a0" }}>{label}</div>
    </div>
  );
}
function RateBadge({ rate }: { rate: number | null }) {
  if (rate == null) return <span style={{ fontSize: 10.5, color: "#fff", opacity: 0.7 }}>—</span>;
  const c = rate >= 90 ? "#8fd19e" : rate >= 70 ? "#e0c05a" : "#e08a6a";
  return <span style={{ fontSize: 11, fontWeight: 800, color: c, background: "rgba(0,0,0,0.18)", borderRadius: 20, padding: "2px 8px" }}>{rate}%</span>;
}
function Section({ title, open, onToggle, summary, children }: { title: string; open: boolean; onToggle: () => void; summary: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#f7f1e4", border: "1px solid #e6d8bf", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", cursor: "pointer", background: "#fff" }}>
        <b style={{ fontSize: 14 }}>{title}</b>
        <span style={{ fontSize: 11.5, color: "#9c8a6c" }}>{summary} {open ? "▾" : "▸"}</span>
      </div>
      {open && <div style={{ padding: "10px 12px 14px" }}>{children}</div>}
    </div>
  );
}
