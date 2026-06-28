"use client";
import { useState, useEffect } from "react";

// 가벼운 마크다운 → HTML (헤더·볼드·표·리스트·hr) — 대시보드와 동일 톤
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
      html += "<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>";
      continue;
    }
    if (inTable) { html += "</table>"; inTable = false; }
    if (/^#{1,4}\s/.test(ln)) { close(); const lvl = Math.min(4, ln.match(/^#+/)![0].length); html += `<h${lvl}>${inline(ln.replace(/^#+\s/, ""))}</h${lvl}>`; }
    else if (/^[-*]\s/.test(ln)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(ln.replace(/^[-*]\s/, ""))}</li>`; }
    else if (/^---+\s*$/.test(ln)) { close(); html += "<hr>"; }
    else if (ln.trim() === "") { close(); }
    else { close(); html += `<p>${inline(ln)}</p>`; }
  }
  close();
  return html;
}

export default function OrgDashboard() {
  const [pw, setPw] = useState("");
  const [brief, setBrief] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = (password: string) => {
    setLoading(true); setErr("");
    fetch("/api/admin/org-briefing", { headers: { "x-admin-password": password }, cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) { setBrief(d.brief); localStorage.setItem("adm_pw", password); } else setErr("비밀번호 확인"); })
      .catch(() => setErr("불러오기 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { const p = localStorage.getItem("adm_pw"); if (p) { setPw(p); load(p); } }, []);

  const tok = brief?.token_today || {};
  const crons = brief?.crons || [];
  const m = brief?.metrics || {};
  const fmt = (n: number) => (n >= 1000 ? Math.round(n / 1000) + "K" : n || 0);

  return (
    <main style={{ minHeight: "100vh", background: "#efe7d8", color: "#2b2018", fontFamily: "'Gowun Batang',serif", padding: "14px", maxWidth: 640, margin: "0 auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
      <style>{`.ex h1{font-size:18px}.ex h2{font-size:15px;color:#9c6b3f;border-bottom:1px solid #e8b87a;padding-bottom:4px;margin-top:14px}.ex h3{font-size:13px}.ex table{width:100%;border-collapse:collapse;font-size:12.5px;margin:6px 0;border:1px solid #e6d8bf}.ex td{border:1px solid #eee3cf;padding:5px 7px}.ex code{background:#f3ead8;padding:1px 5px;border-radius:4px;font-size:12px}.ex hr{border:none;border-top:1px dashed #d8c4a0;margin:10px 0}.ex b{color:#2b2018}.ex ul{padding-left:18px}.ex li{margin:2px 0}`}</style>

      <div style={{ background: "#2b2018", color: "#e8b87a", borderRadius: 14, padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={{ fontSize: 18, fontWeight: 700 }}>🎩 조직 관제</div><div style={{ fontSize: 11, color: "#cbb38c" }}>기획조정실 · 자율 조직 일일 브리핑</div></div>
        <div style={{ textAlign: "right", fontSize: 11, color: "#cbb38c" }}>{brief?.created_at ? new Date(brief.created_at).toLocaleString("ko-KR") : ""}</div>
      </div>

      {!brief && (
        <div style={{ background: "#fff", border: "1px solid #ddc9a8", borderRadius: 14, padding: 18, marginTop: 14 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>관리자 비밀번호</div>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(pw)}
            style={{ width: "100%", padding: 10, border: "1px solid #d8c4a4", borderRadius: 9, fontSize: 14 }} placeholder="비밀번호" />
          <button onClick={() => load(pw)} style={{ marginTop: 10, width: "100%", padding: 11, background: "#2b2018", color: "#f4ece0", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14 }}>{loading ? "불러오는 중…" : "열기"}</button>
          {err && <div style={{ color: "#b03a3a", fontSize: 12, marginTop: 8 }}>{err}</div>}
        </div>
      )}

      {brief && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <div style={card}><div style={lbl}>🔔 결재 대기</div><div style={big}>{(brief.approvals || []).length}건</div></div>
            <div style={card}><div style={lbl}>📊 오늘 토큰(in)</div><div style={big}>{fmt(tok.input || 0)}</div><div style={{ fontSize: 10, color: "#9c8a6c" }}>비용프록시 ${Number(tok.cost || 0).toFixed(2)}</div></div>
            <div style={card}><div style={lbl}>📈 공개 카페</div><div style={big}>{(+m.pub || 0).toLocaleString()}</div><div style={{ fontSize: 10, color: "#9c8a6c" }}>검증 {(+m.v || 0).toLocaleString()}</div></div>
            <div style={card}><div style={lbl}>🤖 크론</div><div style={big}>{crons.filter((c: any) => c.ok).length}/{crons.length} ✅</div></div>
          </div>
          <div style={{ ...card, marginTop: 10 }} className="ex">
            <div style={{ fontSize: 13, fontWeight: 700, color: "#9c6b3f", marginBottom: 6 }}>📋 오늘의 EXECUTIVE</div>
            <div dangerouslySetInnerHTML={{ __html: md2html(brief.executive_md || "_보고서 없음_") }} />
          </div>
          <button onClick={() => load(pw)} style={{ marginTop: 12, width: "100%", padding: 10, background: "#c98a3c", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700 }}>↻ 새로고침</button>
          <div style={{ textAlign: "center", color: "#9c8a6c", fontSize: 11, margin: "14px 0" }}>소비자 경험을 최우선한다 · 기획조정실</div>
        </>
      )}
    </main>
  );
}
const card: React.CSSProperties = { background: "#fff", border: "1px solid #ddc9a8", borderRadius: 12, padding: "12px 14px" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#9c6b3f" };
const big: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: "#c98a3c" };
