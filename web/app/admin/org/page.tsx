"use client";
import { useState, useEffect } from "react";

function md2html(md: string) {
  const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
  const lines = String(md || "").split("\n");
  let html = "", inTable = false, inList = false;
  const close = () => { if (inList) { html += "</ul>"; inList = false; } if (inTable) { html += "</table>"; inTable = false; } };
  for (const ln of lines) {
    if (/^\s*\|(.+)\|\s*$/.test(ln)) {
      const cells = ln.trim().slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      if (!inTable) { close(); html += "<table>"; inTable = true; }
      html += "<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>"; continue;
    }
    if (inTable) { html += "</table>"; inTable = false; }
    if (/^#{1,4}\s/.test(ln)) { close(); const lvl = Math.min(4, ln.match(/^#+/)![0].length); html += `<h${lvl}>${inline(ln.replace(/^#+\s/, ""))}</h${lvl}>`; }
    else if (/^[-*]\s/.test(ln)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(ln.replace(/^[-*]\s/, ""))}</li>`; }
    else if (/^---+\s*$/.test(ln)) { close(); html += "<hr>"; }
    else if (ln.trim() === "") { close(); }
    else { close(); html += `<p>${inline(ln)}</p>`; }
  }
  close(); return html;
}

// 조직도(계층) — 본부→팀 단위까지. 모달 도식화용
const ORG = {
  ceo: "CEO (대표이사)",
  chief: "🎩 기획조정실장 (2인자·브레인·종합)",
  secretary: "🗂️ 비서실장 (일정·일지·원칙)",
  // w: 가동 멤버 — 🧠배치(LLM 에이전트)·⚙️상시(결정론 크론)·🌐실시간(API). 결정론 크론도 팀 소속이다.
  divisions: [
    { n: "🟦 품질본부", c: "#3a6ea5", teams: [
      { n: "데이터정합성팀", s: "수도권·area·중복·필드 무결성 스캔·자동치유", w: [
        { k: "🧠", n: "정합성 에이전트", t: "매일" }, { k: "⚙️", n: "cron-sentinel", t: "매일 00시" }, { k: "⚙️", n: "orchestrator-heal", t: "2시간마다" }] },
      { n: "리뷰품질팀", s: "옥석 검증규칙(동명비카페·주소·오염) 발굴·적용", w: [
        { k: "🧠", n: "룰갭 에이전트", t: "매일" }, { k: "⚙️", n: "cron-rulegap", t: "매일 01:30" }, { k: "⚙️", n: "reviewQuality(verifyReview)", t: "실시간(합성마다)" }] },
      { n: "검증심사팀", s: "검증 등급 자격 적대검증·15점검", w: [
        { k: "🧠", n: "품질레드팀 에이전트", t: "매일" }, { k: "⚙️", n: "cron-verify", t: "매일 06시" }] },
      { n: "심층판정팀", s: "AI판정·그라운딩 — 경계 리뷰 의미판정·환각차단", w: [
        { k: "🧠", n: "심층판정 에이전트(로컬·무료)", t: "격일" }] }] },
    { n: "🟩 성장본부", c: "#3f7a4f", teams: [
      { n: "발굴전략팀", s: "수요·공급갭 추론 → 발굴 타겟 적재", w: [
        { k: "🧠", n: "발굴 에이전트", t: "매일" }, { k: "⚙️", n: "cron-grow", t: "2시간마다" }, { k: "⚙️", n: "cron-demand", t: "매일 17시" }] },
      { n: "콘텐츠·SEO팀", s: "롱테일 SEO 발행 (보류)", w: [
        { k: "⚙️", n: "cron-newsletter", t: "주간(보류)" }] }] },
    { n: "🟧 운영본부", c: "#b06a2e", teams: [
      { n: "생애주기팀", s: "폐업 다중증거 조사·평판 신선도", w: [
        { k: "🧠", n: "폐업 에이전트", t: "매일" }, { k: "⚙️", n: "cron-closure", t: "6시간마다(1·7·13·19)" }, { k: "⚙️", n: "cron-enrich", t: "3시간마다" }] },
      { n: "합성·데이터팀", s: "합성·임베딩·자가치유 (결정론)", w: [
        { k: "⚙️", n: "cron-synth", t: "매시간" }, { k: "⚙️", n: "cron-embed", t: "매시간" }, { k: "⚙️", n: "cron-resynth", t: "주간(월)" }, { k: "⚙️", n: "cron-snapshot", t: "주간(일)" }] }] },
    { n: "🟪 경험본부 ★", c: "#2a7a72", note: "소비자 최전선", teams: [
      { n: "검색품질팀", s: "실제 질의로 검색·추천 품질 검증", w: [
        { k: "🧠", n: "검색품질 에이전트", t: "매일" }, { k: "🌐", n: "api/search", t: "실시간(매 요청)" }] },
      { n: "추천·피드팀", s: "취향 6축 매칭·피드 품질 감시", w: [
        { k: "🌐", n: "api/momentum·cafeProfile", t: "실시간(매 요청)" }] }] },
    { n: "🟥 영업본부", c: "#b03a3a", teams: [
      { n: "마케팅팀 (B2C)", s: "무료 소비자 유입·바이럴 연구·기획", w: [
        { k: "🧠", n: "마케팅 에이전트", t: "매일" }] },
      { n: "사장님영업팀 (B2B)", s: "유료 구독 전환 연구·아웃리치", w: [
        { k: "🧠", n: "B2B영업 에이전트", t: "매일" }] }] },
    { n: "🟫 전략기획본부", c: "#7a5a2a", note: "격일", teams: [
      { n: "전략기획팀", s: "시장조사·벤치마킹·약점보완·예측", w: [
        { k: "🧠", n: "전략 에이전트", t: "격일" }] }] },
    { n: "🏛️ 경영지원본부", c: "#6a468c", note: "격일", teams: [
      { n: "인사팀", s: "주간 평가·스코어카드·MVP·문화", w: [{ k: "🧠", n: "평가 에이전트", t: "격일" }] },
      { n: "법무팀", s: "약관·구독토큰·PII·AI OFF 감사", w: [{ k: "🧠", n: "법무 에이전트", t: "격일" }] },
      { n: "재무팀", s: "과금0·쿼터·크레딧·토큰 실측 감시", w: [{ k: "🧠", n: "재무 에이전트", t: "격일" }] },
      { n: "경영지원팀", s: "가동률 관제 + 협업 코디네이션 주관", w: [{ k: "🧠", n: "경영지원 에이전트", t: "격일" }] },
      { n: "리스크매니지먼트팀", s: "직·간접 리스크 발굴·조율", w: [{ k: "🧠", n: "리스크 에이전트", t: "격일" }] }] },
  ],
};

export default function OrgDashboard() {
  const [pw, setPw] = useState("");
  const [brief, setBrief] = useState<any>(null);
  const [briefs, setBriefs] = useState<any[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [dec, setDec] = useState<{ pending: any[]; delegated: any[]; recent: any[] }>({ pending: [], delegated: [], recent: [] });
  const [coord, setCoord] = useState<{ open: any[]; resolved: any[] }>({ open: [], resolved: [] });
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [showOrg, setShowOrg] = useState(false);
  const [toast, setToast] = useState("");

  const [synced, setSynced] = useState("");
  const load = (password: string, silent = false) => {
    if (!silent) { setLoading(true); setErr(""); }
    Promise.all([
      fetch("/api/admin/org-briefing", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/decisions", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/coordination", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()),
    ]).then(([b, d, co]) => {
      if (b.ok) { setBrief(b.brief); setBriefs(b.briefs || (b.brief ? [b.brief] : [])); localStorage.setItem("adm_pw", password); } else if (!silent) setErr("비밀번호 확인");
      if (d.ok) setDec({ pending: d.pending || [], delegated: d.delegated || [], recent: d.recent || [] });
      if (co.ok) setCoord({ open: co.open || [], resolved: co.resolved || [] });
      if (b.ok) setSynced(new Date().toLocaleTimeString("ko-KR"));
    }).catch(() => { if (!silent) setErr("불러오기 실패"); }).finally(() => { if (!silent) setLoading(false); });
  };
  useEffect(() => {
    const p = localStorage.getItem("adm_pw"); if (p) { setPw(p); load(p); }
    const id = setInterval(() => { const pw2 = localStorage.getItem("adm_pw"); if (pw2 && document.visibilityState === "visible") load(pw2, true); }, 20000);
    return () => clearInterval(id);
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

  const tok = brief?.token_today || {}; const crons = brief?.crons || []; const m = brief?.metrics || {};
  const fmt = (n: number) => (n >= 1000 ? Math.round(n / 1000) + "K" : n || 0);
  const sevC: Record<string, string> = { HIGH: "#b03a3a", MED: "#b06a2e", LOW: "#6a5a48" };

  return (
    <main style={{ minHeight: "100vh", background: "#efe7d8", color: "#2b2018", fontFamily: "'Gowun Batang',serif", padding: "12px", maxWidth: 640, margin: "0 auto", paddingTop: "calc(12px + env(safe-area-inset-top))" }}>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box}.ex{overflow-x:auto}.ex h1{font-size:17px}.ex h2{font-size:14px;color:#9c6b3f;border-bottom:1px solid #e8b87a;padding-bottom:4px;margin-top:14px}.ex h3{font-size:13px}.ex table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0;border:1px solid #e6d8bf;display:block;overflow-x:auto;white-space:nowrap}.ex td{border:1px solid #eee3cf;padding:5px 7px}.ex code{background:#f3ead8;padding:1px 5px;border-radius:4px;font-size:12px}.ex hr{border:none;border-top:1px dashed #d8c4a0;margin:10px 0}.ex b{color:#2b2018}.ex ul{padding-left:18px}.ex li{margin:2px 0}.ex p{margin:5px 0}`}</style>

      <div style={{ background: "#2b2018", color: "#e8b87a", borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={{ fontSize: 17, fontWeight: 700 }}>🎩 조직 관제</div><div style={{ fontSize: 11, color: "#cbb38c" }}>기획조정실 · 자율 조직 브리핑</div></div>
        <button onClick={() => setShowOrg(true)} style={{ background: "#c98a3c", color: "#fff", border: "none", borderRadius: 9, padding: "8px 11px", fontSize: 12, fontWeight: 700 }}>🏢 조직도</button>
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
          <div style={card}><div style={lbl}>🔔 결재 대기</div><div style={big}>{dec.pending.length}건</div></div>
          <div style={card}><div style={lbl}>📊 오늘 토큰(in)</div><div style={big}>{fmt(tok.input || 0)}</div><div style={sub}>비용프록시 ${Number(tok.cost || 0).toFixed(2)}</div></div>
          <div style={card}><div style={lbl}>📈 공개 카페</div><div style={big}>{(+m.pub || 0).toLocaleString()}</div><div style={sub}>검증 {(+m.v || 0).toLocaleString()}</div></div>
          <div style={card}><div style={lbl}>🤖 크론</div><div style={big}>{crons.filter((c: any) => c.ok).length}/{crons.length} ✅</div></div>
        </div>

        {/* 💰 오늘 토큰 사용 — 상시 일일 항목(묻지 않아도 매일 보임) */}
        <div style={{ ...card, marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#9c6b3f", marginBottom: 2 }}>💰 오늘 토큰 사용 (실측)</div>
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
        </div>

        {/* 🔔 결재 — 승인 클릭 시 실행 */}
        <div style={{ ...card, marginTop: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#9c6b3f", marginBottom: 2 }}>🔔 CEO 결재 대기 ({dec.pending.length})</div>
          <div style={{ fontSize: 10.5, color: "#9c8a6c", marginBottom: 8 }}>치명적·비가역(L3)만 — 카페 비공개·등급변경·새 규칙로직·외부발송. 운영결정(L1·L2)은 본부·기조실장 전결.</div>
          {dec.pending.length === 0 ? <div style={{ color: "#3f7a4f", fontSize: 13 }}>대기 중인 결재 없음 ✅</div> :
            dec.pending.map((d) => (
              <div key={d.id} style={{ border: "1px solid #e6d8bf", borderRadius: 11, padding: 12, marginBottom: 10, background: "#fffdf8" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ background: sevC[d.severity] || "#888", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>{d.severity || "—"}</span>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{d.title}</span>
                  {d.team && <span style={{ fontSize: 10, color: "#9c8a6c" }}>· {d.team}</span>}
                </div>
                {d.detail && <div style={{ fontSize: 12, color: "#5a4631", margin: "6px 0", lineHeight: 1.5 }}>{d.detail}</div>}
                <div style={{ fontSize: 10.5, color: "#9c8a6c", marginBottom: 8 }}>실행: {d.action_type === "agent_task" ? "기조실장이 담당 본부 배분" : `${d.action_type}${d.action_params?.ids ? ` (${d.action_params.ids.length}곳)` : ""}`}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button disabled={busy === d.id} onClick={() => decide(d.id, "approve")} style={{ flex: 2, padding: 10, background: "#3f7a4f", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, opacity: busy === d.id ? 0.5 : 1 }}>{busy === d.id ? "실행 중…" : "✅ 승인 · 실행"}</button>
                  <button disabled={busy === d.id} onClick={() => decide(d.id, "reject")} style={{ flex: 1, padding: 10, background: "#efe7d8", color: "#8a6534", border: "1px solid #ddc9a8", borderRadius: 9, fontWeight: 700, fontSize: 13 }}>반려</button>
                </div>
              </div>
            ))}
          {dec.recent.length > 0 && <div style={{ fontSize: 10.5, color: "#9c8a6c", marginTop: 6 }}>최근 처리: {dec.recent.slice(0, 4).map((r) => `${r.title}(${r.status})`).join(" · ")}</div>}
        </div>

        {/* 🟢 하위 전결 FYI — 본부(L1)·기조실장(L2)이 자체 처리한 결정. 상시 일일 항목(0건이어도 노출). */}
        <div style={{ ...card, marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#3f7a4f", marginBottom: 2 }}>🟢 전결 처리내역 (L1·L2 사후보고)</div>
          <div style={{ fontSize: 10.5, color: "#9c8a6c", marginBottom: 8 }}>본부·기조실장이 권한 내 결정·집행 — CEO 결재 불필요, 매일 가시성만.</div>
          {dec.delegated.length > 0 ? dec.delegated.map((d) => (
            <div key={d.id} style={{ display: "flex", gap: 7, alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f0e8d8", fontSize: 12 }}>
              <span style={{ background: d.tier === "L1" ? "#6b8fae" : "#9c7bbf", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20 }}>{d.tier}</span>
              <span style={{ flex: 1, color: "#5a4631" }}>{d.title}</span>
              <span style={{ fontSize: 10, color: "#9c8a6c" }}>{d.decided_by} · {d.at}</span>
            </div>
          )) : <div style={{ fontSize: 12, color: "#9c8a6c" }}>최근 전결 처리 없음</div>}
        </div>

        {/* 🤝 협업 현황 — 경영지원팀 주관 코디네이션 */}
        <div style={{ ...card, marginTop: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#9c6b3f", marginBottom: 8 }}>🤝 협업 현황 ({coord.open.length}) <span style={{ fontSize: 10, fontWeight: 400, color: "#9c8a6c" }}>· 경영지원팀 주관</span></div>
          {coord.open.length === 0 ? <div style={{ color: "#3f7a4f", fontSize: 13 }}>진행 중인 부서 간 협업 없음</div> :
            coord.open.map((c) => (
              <div key={c.id} style={{ border: "1px solid #e6d8bf", borderRadius: 10, padding: "9px 11px", marginBottom: 8, background: "#fbfaf5" }}>
                <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ background: typeC[c.type] || "#888", color: "#fff", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>{typeLabel[c.type] || c.type}</span>
                  {Number(c.days) >= 2 && <span style={{ background: "#b03a3a", color: "#fff", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>지연</span>}
                  <span style={{ fontWeight: 700, fontSize: 12.5 }}>{c.topic}</span>
                </div>
                <div style={{ fontSize: 11, color: "#8a7458", margin: "4px 0 2px" }}>{c.from_team} <span style={{ color: "#c98a3c" }}>→</span> {c.to_team}</div>
                {c.detail && <div style={{ fontSize: 11.5, color: "#5a4631", lineHeight: 1.45 }}>{c.detail}</div>}
              </div>
            ))}
          {coord.resolved.length > 0 && <div style={{ fontSize: 10.5, color: "#9c8a6c", marginTop: 4 }}>최근 해결: {coord.resolved.slice(0, 3).map((r: any) => r.topic).join(" · ")}</div>}
        </div>

        <div style={{ ...card, marginTop: 10 }} className="ex">
          <div style={{ fontSize: 13, fontWeight: 700, color: "#9c6b3f", marginBottom: 6 }}>📋 EXECUTIVE 일일보고서 (최근 10일 · 시간별)</div>
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
            {/* 비서실장 + 본부 트리 */}
            <div style={{ borderLeft: "2px solid #d8c4a0", marginLeft: 10, paddingLeft: 14, marginTop: 2 }}>
              <div style={{ background: "#efe2cf", color: "#6b5640", fontWeight: 600, fontSize: 12.5, padding: "5px 10px", borderRadius: 8, marginBottom: 10, display: "inline-block" }}>{ORG.secretary}</div>
              {ORG.divisions.map((d) => (
                <div key={d.n} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ background: d.c, color: "#fff", fontWeight: 700, fontSize: 13, padding: "4px 11px", borderRadius: 8 }}>{d.n}</span>
                    {d.note && <span style={{ fontSize: 10, color: "#9c8a6c", fontWeight: 700 }}>· {d.note}</span>}
                  </div>
                  <div style={{ borderLeft: `2px solid ${d.c}`, marginLeft: 12, paddingLeft: 12, marginTop: 5, opacity: 0.95 }}>
                    {d.teams.map((t: any) => (
                      <div key={t.n} style={{ margin: "6px 0" }}>
                        <div style={{ fontSize: 12.5, color: "#3d2f22", display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
                          <span style={{ color: d.c, fontFamily: "monospace" }}>└</span>{t.n}
                        </div>
                        <div style={{ fontSize: 10.5, color: "#9c8a6c", marginLeft: 16, lineHeight: 1.35 }}>{t.s}</div>
                        {t.w && <div style={{ marginLeft: 16, marginTop: 3, display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {t.w.map((m: any, mi: number) => (
                            <span key={mi} style={{ fontSize: 10, background: m.k === "⚙️" ? "#eef3ee" : m.k === "🌐" ? "#eef0f6" : "#f6efe2", border: `1px solid ${m.k === "⚙️" ? "#bcd4bc" : m.k === "🌐" ? "#c2c8e0" : "#e2cfa8"}`, borderRadius: 6, padding: "1.5px 6px", color: "#5a4631" }}>
                              {m.k} {m.n} <span style={{ color: "#9c8a6c" }}>· {m.t}</span>
                            </span>
                          ))}
                        </div>}
                      </div>
                    ))}
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

      {toast && <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#2b2018", color: "#fff", padding: "10px 18px", borderRadius: 22, fontSize: 13, zIndex: 60, maxWidth: "90%", textAlign: "center" }}>{toast}</div>}
    </main>
  );
}
const card: React.CSSProperties = { background: "#fff", border: "1px solid #ddc9a8", borderRadius: 12, padding: "12px 14px" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#9c6b3f" };
const big: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: "#c98a3c" };
const sub: React.CSSProperties = { fontSize: 10, color: "#9c8a6c" };
const typeC: Record<string, string> = { help: "#3a6ea5", handoff: "#3f7a4f", cowork: "#7a5a2a", dependency: "#b06a2e" };
const typeLabel: Record<string, string> = { help: "도움요청", handoff: "인계", cowork: "코웍", dependency: "의존" };
