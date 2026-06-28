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
  divisions: [
    { n: "🟦 품질본부", c: "#3a6ea5", teams: ["데이터정합성팀", "리뷰품질팀", "검증심사팀", "심층판정팀"] },
    { n: "🟩 성장본부", c: "#3f7a4f", teams: ["발굴전략팀", "콘텐츠·SEO팀 (보류)"] },
    { n: "🟧 운영본부", c: "#b06a2e", teams: ["생애주기팀", "합성·데이터팀"] },
    { n: "🟪 경험본부 ★", c: "#2a7a72", teams: ["검색품질팀", "추천·피드팀"], note: "소비자 최전선" },
    { n: "🟥 영업본부", c: "#b03a3a", teams: ["마케팅팀 (B2C)", "사장님영업팀 (B2B)"] },
    { n: "🟫 전략기획본부", c: "#7a5a2a", teams: ["전략기획팀 (시장조사·벤치마킹·예측)"], note: "격일" },
    { n: "🏛️ 경영지원본부", c: "#6a468c", teams: ["인사팀", "법무팀", "재무팀", "경영지원팀", "리스크매니지먼트팀"], note: "격일" },
  ],
};

export default function OrgDashboard() {
  const [pw, setPw] = useState("");
  const [brief, setBrief] = useState<any>(null);
  const [dec, setDec] = useState<{ pending: any[]; recent: any[] }>({ pending: [], recent: [] });
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [showOrg, setShowOrg] = useState(false);
  const [toast, setToast] = useState("");

  const load = (password: string) => {
    setLoading(true); setErr("");
    Promise.all([
      fetch("/api/admin/org-briefing", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/decisions", { headers: { "x-admin-password": password }, cache: "no-store" }).then((r) => r.json()),
    ]).then(([b, d]) => {
      if (b.ok) { setBrief(b.brief); localStorage.setItem("adm_pw", password); } else setErr("비밀번호 확인");
      if (d.ok) setDec({ pending: d.pending || [], recent: d.recent || [] });
    }).catch(() => setErr("불러오기 실패")).finally(() => setLoading(false));
  };
  useEffect(() => { const p = localStorage.getItem("adm_pw"); if (p) { setPw(p); load(p); } }, []);

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

        {/* 🔔 결재 — 승인 클릭 시 실행 */}
        <div style={{ ...card, marginTop: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#9c6b3f", marginBottom: 8 }}>🔔 결재 대기 ({dec.pending.length})</div>
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

        <div style={{ ...card, marginTop: 10 }} className="ex">
          <div style={{ fontSize: 13, fontWeight: 700, color: "#9c6b3f", marginBottom: 6 }}>📋 오늘의 EXECUTIVE</div>
          <div dangerouslySetInnerHTML={{ __html: md2html(brief.executive_md || "_보고서 없음_") }} />
        </div>
        <button onClick={() => load(pw)} style={{ marginTop: 12, width: "100%", padding: 11, background: "#c98a3c", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700 }}>↻ 새로고침</button>
        <div style={{ textAlign: "center", color: "#9c8a6c", fontSize: 11, margin: "14px 0" }}>소비자 경험을 최우선한다 · 기획조정실</div>
      </>)}

      {/* 조직도 모달 */}
      {showOrg && (
        <div onClick={() => setShowOrg(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,14,10,.6)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#f4ece0", borderRadius: "18px 18px 0 0", padding: 18, width: "100%", maxWidth: 640, maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#2b2018" }}>🏢 자율 조직도</div>
              <button onClick={() => setShowOrg(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#9c8a6c" }}>✕</button>
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
                    {d.teams.map((t) => (
                      <div key={t} style={{ fontSize: 12.5, color: "#3d2f22", margin: "3px 0", display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ color: d.c, fontFamily: "monospace" }}>└</span>{t}
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
