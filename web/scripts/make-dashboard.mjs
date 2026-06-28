// 동네 커피 노트 — 일일 대시보드 생성기 (비서실장 호출, 결정론·토큰0)
// agent-reports/의 EXECUTIVE·proposals·USAGE.tsv·DB를 읽어 DASHBOARD.html 한 장으로.
import { readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const AR = "/Users/wangwida/coffee-platform/agent-reports";
const env = readFileSync("/Users/wangwida/coffee-platform/web/.env.local", "utf8");
const DB = env.match(/DATABASE_URL="?([^"\n]+)/)[1].trim();
const sql = neon(DB);
const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 가벼운 마크다운 → HTML (헤더·볼드·표·리스트·hr)
function md2html(md) {
  const lines = String(md || "").split("\n");
  let html = "", inTable = false, inList = false;
  const close = () => { if (inList) { html += "</ul>"; inList = false; } if (inTable) { html += "</table>"; inTable = false; } };
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
  for (const ln of lines) {
    if (/^\s*\|(.+)\|\s*$/.test(ln)) {
      const cells = ln.trim().slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      if (!inTable) { close(); html += "<table>"; inTable = true; }
      const tag = "td";
      html += "<tr>" + cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join("") + "</tr>";
      continue;
    }
    if (inTable) { html += "</table>"; inTable = false; }
    if (/^#{1,4}\s/.test(ln)) { close(); const lvl = ln.match(/^#+/)[0].length; html += `<h${lvl}>${inline(ln.replace(/^#+\s/, ""))}</h${lvl}>`; }
    else if (/^[-*]\s/.test(ln)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(ln.replace(/^[-*]\s/, ""))}</li>`; }
    else if (/^---+\s*$/.test(ln)) { close(); html += "<hr>"; }
    else if (ln.trim() === "") { close(); }
    else { close(); html += `<p>${inline(ln)}</p>`; }
  }
  close();
  return html;
}

(async () => {
  // ① EXECUTIVE
  const execF = `${AR}/EXECUTIVE-latest.md`;
  const execMd = existsSync(execF) ? readFileSync(execF, "utf8") : "_오늘 EXECUTIVE 보고서가 아직 없습니다._";

  // ② 토큰 사용량(오늘)
  let tokRows = [], tokTotal = { i: 0, o: 0, c: 0 };
  try {
    const u = readFileSync(`${AR}/USAGE.tsv`, "utf8").trim().split("\n").slice(1);
    const td = new Date().toISOString().slice(0, 10);
    const byAgent = {};
    for (const r of u) {
      const [ts, agent, ti, to, cost] = r.split("\t");
      if (!ts?.startsWith(td)) continue;
      byAgent[agent] = byAgent[agent] || { i: 0, o: 0, c: 0, n: 0 };
      byAgent[agent].i += +ti || 0; byAgent[agent].o += +to || 0; byAgent[agent].c += +cost || 0; byAgent[agent].n++;
      tokTotal.i += +ti || 0; tokTotal.o += +to || 0; tokTotal.c += +cost || 0;
    }
    tokRows = Object.entries(byAgent).sort((a, b) => b[1].i - a[1].i).map(([a, v]) => ({ a, ...v }));
  } catch {}

  // ③ 크론 건강 + 핵심 수치
  let crons = [], metrics = {};
  try {
    crons = await sql`SELECT job, ok, EXTRACT(EPOCH FROM (now()-ran_at))/3600 h FROM agent_runs ORDER BY ran_at DESC`;
    const m = await sql`SELECT count(*) FILTER(WHERE published) pub, count(*) FILTER(WHERE published AND synth_grade='검증') v, count(*) FILTER(WHERE synth_updated IS NULL) q FROM cafes`;
    metrics = m[0];
  } catch {}

  // ④ 오늘 결재 대기(proposals)
  const props = existsSync(AR) ? readdirSync(AR).filter((f) => f.includes("proposals") && f.includes(today)) : [];

  // ⑤ 전결 처리내역(L1·L2) — 위임전결 사후보고. CEO가 결재한 게 아니라 본부·기조실장이 자체 처리한 것.
  let delegated = [];
  try {
    delegated = await sql`SELECT title, team, tier, COALESCE(decided_by, CASE tier WHEN 'L1' THEN '본부 전결' WHEN 'L2' THEN '기조실장 전결' ELSE '전결' END) decided_by, status, to_char(COALESCE(decided_at,created_at),'MM-DD HH24:MI') at
      FROM decisions WHERE tier IN ('L1','L2') AND COALESCE(decided_at,created_at) > now() - interval '26 hours' ORDER BY COALESCE(decided_at,created_at) DESC LIMIT 20`;
  } catch {}

  const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(0) + "K" : n);
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="refresh" content="300">
<title>☕ 관제 대시보드 — 동네 커피 노트</title>
<link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet">
<style>
 :root{--cream:#f4ece0;--ink:#2b2018;--brown:#9c6b3f;--gold:#c98a3c;--goldl:#e8b87a}
 *{box-sizing:border-box}body{margin:0;background:#efe7d8;font-family:'Gowun Batang',serif;color:var(--ink)}
 .wrap{max-width:1100px;margin:0 auto;padding:18px}
 .hd{background:var(--ink);color:var(--goldl);border-radius:14px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center}
 .hd h1{margin:0;font-size:20px}.hd .t{font-size:12px;color:#cbb38c}
 .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
 .card{background:#fff;border:1px solid #ddc9a8;border-radius:14px;padding:16px 18px}
 .card h2{margin:0 0 10px;font-size:14px;color:var(--brown);border-bottom:2px solid var(--goldl);padding-bottom:6px}
 .full{grid-column:1/3}
 table{width:100%;border-collapse:collapse;font-size:12.5px}td{padding:5px 7px;border-bottom:1px solid #eee3cf}
 .exec h1{font-size:18px}.exec h2{font-size:14px;color:var(--brown);border-bottom:1px solid var(--goldl)}.exec h3{font-size:13px}
 .exec table{margin:6px 0;border:1px solid #e6d8bf}.exec td{border:1px solid #eee3cf}.exec b{color:var(--ink)}.exec code{background:#f3ead8;padding:1px 4px;border-radius:4px}
 .exec hr{border:none;border-top:1px dashed #d8c4a0;margin:10px 0}
 .big{font-size:26px;font-weight:700;color:var(--gold)}.lbl{font-size:11px;color:var(--brown)}
 .ok{color:#3f7a4f}.bad{color:#b03a3a;font-weight:700}.warn{color:#b06a2e}
 .pill{display:inline-block;background:#fbecd0;border:1px solid var(--gold);border-radius:20px;padding:2px 10px;font-size:12px;margin:2px}
 .foot{text-align:center;color:#9c8a6c;font-size:11px;margin:16px 0}
</style></head><body><div class="wrap">
<div class="hd"><div><h1>☕ 관제 대시보드</h1><div class="t">기획조정실 · 비서실장 자동 생성</div></div>
 <div style="text-align:right"><div class="t">갱신</div><div style="font-size:14px;font-weight:700">${new Date().toLocaleString("ko-KR")}</div></div></div>

<div class="grid">
 <div class="card"><h2>🔔 결재 대기</h2>${props.length ? props.map((p) => `<div class="pill">📄 ${esc(p.replace(/-proposals.*/, ""))}</div>`).join("") + `<p style="font-size:11px;color:#9c8a6c">제안 ${props.length}건 — 상세는 EXECUTIVE 참조</p>` : `<p class="ok">결재 대기 없음 ✅</p>`}</div>
 <div class="card"><h2>📊 오늘 토큰 사용 (실측)</h2>
   <span class="big">${fmt(tokTotal.i)}</span> <span class="lbl">input</span> &nbsp; <span class="big" style="font-size:18px">${fmt(tokTotal.o)}</span><span class="lbl">output</span><br>
   <span class="lbl">비용프록시 합계 $${tokTotal.c.toFixed(2)} (구독이라 실청구 0)</span>
   <table>${tokRows.slice(0, 6).map((r) => `<tr><td>${esc(r.a)}</td><td style="text-align:right">${fmt(r.i)} tok</td><td style="text-align:right;color:#9c8a6c">${r.n}회</td></tr>`).join("") || "<tr><td>오늘 실행 데이터 없음(내일 사이클부터)</td></tr>"}</table></div>
 <div class="card"><h2>📈 핵심 수치</h2>
   <span class="big">${(+metrics.pub || 0).toLocaleString()}</span> <span class="lbl">공개 카페</span> &nbsp;
   <span class="big" style="font-size:20px">${(+metrics.v || 0).toLocaleString()}</span><span class="lbl">검증</span><br>
   <span class="lbl">합성 대기 ${metrics.q || 0}건</span></div>
 <div class="card"><h2>🤖 크론 건강</h2><table>${crons.slice(0, 8).map((c) => `<tr><td>${c.ok ? "✅" : "<span class='bad'>❌</span>"} ${esc(c.job)}</td><td style="text-align:right;color:#9c8a6c">${Number(c.h) < 1 ? Math.round(Number(c.h) * 60) + "분 전" : Number(c.h).toFixed(1) + "h 전"}</td></tr>`).join("")}</table></div>
 <div class="card full"><h2>📋 전결 처리내역 (L1·L2 위임전결 — 사후보고)</h2>${delegated.length ? `<table>${delegated.map((d) => `<tr><td><span class="pill" style="background:${d.tier === "L1" ? "#dfeaf3" : "#ece3f5"};border-color:${d.tier === "L1" ? "#6b8fae" : "#9c7bbf"}">${d.tier}</span></td><td>${esc(d.title)}</td><td style="color:#9c8a6c">${esc(d.team || "")}</td><td style="text-align:right;color:#9c8a6c">${esc(d.decided_by)} · ${d.at}</td></tr>`).join("")}</table><p style="font-size:11px;color:#9c8a6c">최근 24h 본부·기조실장이 권한 내 결정·집행한 건. CEO 결재 불요 — 사후 가시성용.</p>` : `<p class="ok">최근 24h 전결 처리 없음</p>`}</div>
 <div class="card full exec"><h2>📋 오늘의 EXECUTIVE 보고</h2>${md2html(execMd)}</div>
</div>
<div class="foot">소비자의 마인드로 사고하고, 소비자 경험을 최우선한다 · 5분마다 자동 새로고침</div>
</div></body></html>`;
  writeFileSync(`${AR}/DASHBOARD.html`, html);

  // DB 푸시 — 배포된 모바일 관리자화면(/admin/org)이 읽게
  try {
    await sql`CREATE TABLE IF NOT EXISTS org_briefings (id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(), executive_md TEXT, approvals JSONB, token_today JSONB, crons JSONB, metrics JSONB)`;
    await sql`ALTER TABLE org_briefings ADD COLUMN IF NOT EXISTS delegated JSONB`.catch(() => {});
    await sql`INSERT INTO org_briefings (executive_md, approvals, token_today, crons, metrics, delegated) VALUES (
      ${execMd},
      ${JSON.stringify(props.map((p) => p.replace(/-proposals.*/, "")))}::jsonb,
      ${JSON.stringify({ input: tokTotal.i, output: tokTotal.o, cost: tokTotal.c, byAgent: tokRows.slice(0, 8) })}::jsonb,
      ${JSON.stringify(crons.slice(0, 12).map((c) => ({ job: c.job, ok: c.ok, h: Number(c.h) })))}::jsonb,
      ${JSON.stringify(metrics)}::jsonb,
      ${JSON.stringify(delegated)}::jsonb)`;
    await sql`DELETE FROM org_briefings WHERE created_at < now() - interval '10 days'`; // 10일치 보존(하루 여러 건 시간별 유지)
    console.log("✅ org_briefings DB 푸시 완료(모바일 관리자화면용)");
  } catch (e) { console.log("⚠️ DB 푸시 실패:", String(e).slice(0, 60)); }

  console.log("✅ DASHBOARD.html 생성:", `${AR}/DASHBOARD.html`, `(토큰 today ${tokTotal.i} in · 결재 ${props.length} · 크론 ${crons.length})`);
})();
