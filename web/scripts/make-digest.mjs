// 🗜️ 공용 관제 다이제스트 — 결정론·토큰0. 모든 에이전트가 '관제 먼저'로 제각각 20~30번 DB 조회하던 걸
//   1회 미리 계산해 agent-reports/DIGEST.md 한 장으로. 에이전트는 이걸 한 번 Read → 턴·캐시재독 급감(품질 무영향, 데이터 동일).
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const AR = "/Users/wangwida/coffee-platform/agent-reports";
const env = readFileSync("/Users/wangwida/coffee-platform/web/.env.local", "utf8");
const url = env.match(/DATABASE_URL="?([^"\n]+)/)[1].trim();
const sql = neon(url);
const one = async (q) => Number((await q)[0].c);
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const L = [];
  L.push(`# 🗜️ 관제 다이제스트 (결정론 사전계산 · 에이전트 공용)`);
  L.push(`> 생성 ${new Date().toISOString()} · **이 파일을 먼저 읽어라. 관제·수치·백로그가 다 있다. DB 재쿼리는 여기 없는 것만 묶어서 최소 턴으로.**\n`);

  // 1) 크론 건강 — 실패(ok=false) + 정지의심(EXPECT_MAX_H 초과) 둘 다 본다(2026-07-02 수리:
  //    과거 실패만 봐서 "전 크론 정상"이 정지를 가림). 감시 계약은 lib/jobTeams.ts 단일 출처.
  //    (tsx 없이 plain node로 돌면 staleness 생략 — 러너는 --import tsx 사용)
  let EXPECT = {};
  try { ({ EXPECT_MAX_H: EXPECT } = await import("../lib/jobTeams.ts")); } catch {}
  try {
    const runs = await sql`SELECT DISTINCT ON (job) job, ok, detail, EXTRACT(EPOCH FROM (now()-ran_at))/3600 h FROM agent_runs ORDER BY job, ran_at DESC`;
    const bad = runs.filter((r) => !r.ok);
    const stale = runs.filter((r) => r.ok && EXPECT[r.job] != null && +r.h > EXPECT[r.job]);
    L.push(`## 🤖 크론 건강 (${runs.length}개)`);
    if (!bad.length && !stale.length) L.push(`- ✅ 전 크론 정상`);
    if (bad.length) L.push(bad.map((r) => `- ❌ **${r.job}** (${(+r.h).toFixed(1)}h전): ${(r.detail || "").slice(0, 80)}`).join("\n"));
    if (stale.length) L.push(stale.map((r) => `- ⏸️ **${r.job} 정지의심** (${(+r.h).toFixed(1)}h전 — 정상주기 ${EXPECT[r.job]}h 초과)`).join("\n"));
    L.push(runs.map((r) => `${!r.ok ? "❌" : (EXPECT[r.job] != null && +r.h > EXPECT[r.job]) ? "⏸️" : "✅"}${r.job}(${(+r.h).toFixed(0)}h)`).join(" · ") + "\n");
  } catch (e) { L.push(`(크론 조회 실패)\n`); }

  // 2) 핵심 수치
  try {
    const m = (await sql`SELECT count(*) FILTER(WHERE published) pub, count(*) FILTER(WHERE published AND synth_grade='검증') v, count(*) FILTER(WHERE published AND synth_grade='참고') r, count(*) FILTER(WHERE synth_updated IS NULL) q, count(*) FILTER(WHERE needs_llm) nl FROM cafes`)[0] ?? {};
    const mm = (await sql`SELECT count(*) FILTER(WHERE published) pub, count(*) FILTER(WHERE published AND synth_grade='검증') v, count(*) FILTER(WHERE published AND synth_grade='참고') r, count(*) FILTER(WHERE synth_updated IS NULL) q, count(*) FILTER(WHERE needs_llm) nl FROM cafes`);
    const x = mm[0];
    L.push(`## 📈 핵심 수치`);
    L.push(`- 공개 ${(+x.pub).toLocaleString()} (검증 ${(+x.v).toLocaleString()} · 참고 ${(+x.r).toLocaleString()}) · 합성대기 ${x.q} · needs_llm ${x.nl}\n`);
  } catch (e) { L.push(`(수치 조회 실패)\n`); }

  // 3) 백로그
  L.push(`## 📦 백로그`);
  try {
    // 관제탑과 같은 기준(L3만 CEO 결재)으로 — 화면 간 수치 갈림 방지(2026-07-02). L2 pending은 별도 표기.
    const pend = await sql`SELECT id,title,team,severity FROM decisions WHERE status='pending' AND COALESCE(tier,'L3')='L3' ORDER BY id`;
    const pendL2 = await sql`SELECT id,title FROM decisions WHERE status='pending' AND tier='L2' ORDER BY id`.catch(() => []);
    const appr = await sql`SELECT id,title,team FROM decisions WHERE status='approved' ORDER BY id`;
    const defr = await sql`SELECT id,title,team FROM decisions WHERE status IN ('deferred','resolved') ORDER BY id`.catch(() => []);
    const coord = await sql`SELECT id,from_team,to_team,topic, round(EXTRACT(EPOCH FROM (now()-created_at))/86400,1) d FROM coordination WHERE status IN ('open','in_progress') ORDER BY created_at`.catch(() => []);
    const af = await sql`SELECT cafe_id,cafe_name,detail FROM audit_flags WHERE issue!='audit_complete' AND COALESCE(resolved,false)=false ORDER BY flagged_at DESC LIMIT 10`.catch(() => []);
    const gr = await one(sql`SELECT count(*) c FROM grounding_checks WHERE grounded=false`.catch(() => [{ c: 0 }]));
    const offc = await one(sql`SELECT count(*) c FROM cafes WHERE published AND offctx_rate>=0.5 AND COALESCE(offctx_ok,false)=false`.catch(() => [{ c: 0 }]));
    const clo = await one(sql`SELECT count(*) c FROM cafes WHERE published AND closure_misses>=3`.catch(() => [{ c: 0 }]));
    const supp = await one(sql`SELECT count(*) c FROM cafe_supplements WHERE status='new'`.catch(() => [{ c: 0 }]));
    L.push(`- **CEO 결재 대기(L3) ${pend.length}**: ${pend.map((p) => `#${p.id} ${p.title.slice(0, 30)}(${p.team})`).join(" / ") || "없음"}`);
    if (pendL2.length) L.push(`- L2 전결 대기(자동승인 예정) ${pendL2.length}: ${pendL2.map((p) => `#${p.id}`).join(",")}`);
    L.push(`- **집행 대기(approved) ${appr.length}**: ${appr.map((a) => `#${a.id} ${a.title.slice(0, 30)}(${a.team})`).join(" / ") || "없음"}`);
    if (defr.length) L.push(`- **⏸️ 보류(deferred/resolved) ${defr.length} — 생애주기 확인 필요**: ${defr.map((a) => `#${a.id} ${a.title.slice(0, 30)}(${a.team})`).join(" / ")}`);
    L.push(`- **미해결 협업 ${coord.length}**: ${coord.map((c) => `#${c.id} ${c.topic}(${c.from_team}→${c.to_team}·${c.d}일)`).join(" / ") || "없음"}`);
    L.push(`- **품질오염 audit_flags ${af.length}**: ${af.map((a) => `#${a.cafe_id} ${a.cafe_name}(${(a.detail || "").slice(0, 24)})`).join(" / ") || "없음"}`);
    L.push(`- 그라운딩 의심 ${gr} · 맥락watchlist ${offc} · 폐업 검토대기 ${clo}${supp ? ` · 🆕 사장님 보완제보 ${supp}건(cafe_supplements — 운영본부 검토)` : ""}\n`);
  } catch (e) { L.push(`(백로그 조회 실패)\n`); }

  // 4) 오늘 리포트 목록 + 첫 줄
  try {
    const files = existsSync(AR) ? readdirSync(AR).filter((f) => f.endsWith(".md") && f.includes(today.replace(/-/g, ""))) : [];
    L.push(`## 📄 오늘 리포트 (${files.length})`);
    for (const f of files.slice(0, 25)) {
      let first = "";
      try { first = readFileSync(`${AR}/${f}`, "utf8").split("\n").find((l) => l.trim()) || ""; } catch {}
      L.push(`- ${f}: ${first.replace(/^#+\s*/, "").slice(0, 60)}`);
    }
    L.push("");
  } catch (e) { L.push(`(리포트 목록 실패)\n`); }

  // 5) self-audit 토큰 추세 (레이트리밋 감시 — 대표님 지시 2026-06-30). 결정론·읽기전용. chief-manager가 EXECUTIVE에 포함.
  try {
    const up = `${AR}/USAGE.tsv`;
    if (existsSync(up)) {
      const rows = readFileSync(up, "utf8").trim().split("\n").map((r) => r.split("\t")).filter((r) => r[1] && r[1].includes("self-audit"));
      const byDay = {};
      for (const r of rows) { const d = (r[0] || "").slice(0, 10); const t = parseInt(r[5]) || 0; (byDay[d] = byDay[d] || { n: 0, t: 0 }); byDay[d].n++; byDay[d].t += t; }
      const days = Object.entries(byDay).slice(-5);
      L.push(`## 🔎 self-audit 토큰 추세 (레이트리밋 감시)`);
      L.push(days.map(([d, v]) => `${d.slice(5)}: ${v.n}회·${v.t}턴`).join(" · ") || "데이터 없음");
      if (days.length >= 3) { const last = days[days.length - 1][1].t; const avg = days.slice(0, -1).reduce((s, [, v]) => s + v.t, 0) / (days.length - 1); if (last > avg * 1.8 && last > 120) L.push(`⚠️ 오늘 self-audit 턴(${last})이 최근 평균(${Math.round(avg)})의 1.8배+ — 주기(현 09·15·21시+일간사이클+이벤트5분) 재검토 권고`); }
      L.push("");
    }
  } catch (e) { /* graceful */ }

  const out = L.join("\n");
  writeFileSync(`${AR}/DIGEST.md`, out);
  console.log(`✅ DIGEST.md 생성 (${out.length}자, ${(out.length / 1024).toFixed(1)}KB)`);
})();
