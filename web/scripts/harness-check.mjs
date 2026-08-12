// 🩺 하네스 상태 점검 — 자동 실행 이후 "하네스가 제대로 물렸는지"를 한 번에 본다.
//   사용: node --import tsx scripts/harness-check.mjs
//   ⚠️ 비용 규율: 집계 4회, 전부 작은 컬럼/숫자만. 큰 컬럼(raw_reviews·synth_reviews*)은 조회하지 않는다.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const kst = (s) => String(s ?? "").slice(5, 16);

console.log("═".repeat(72));
console.log("🩺 하네스 점검 —", new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }));
console.log("═".repeat(72));

// ① 자동 실행이 실제로 돌았나 (스케줄 크론이 하네스를 태우는지)
const runs = await sql`SELECT job, (started_at AT TIME ZONE 'Asia/Seoul')::text kst, ok,
    fingerprint IS NOT NULL fp, metrics->>'blobReads' blob, metrics->>'skipped' skipped,
    metrics->>'noEffect' ne, metrics->>'scopeViolations' sv, LEFT(detail, 60) d
  FROM run_ledger WHERE started_at > now() - interval '14 hours' ORDER BY id DESC LIMIT 25`;
console.log(`\n① 최근 14시간 실행 ${runs.length}건`);
for (const r of runs) {
  const tag = [r.fp ? "지문" : null, r.blob != null ? `blob${r.blob}` : null,
    r.skipped ? `동결스킵${r.skipped}` : null, r.ne && r.ne !== "0" ? `무효${r.ne}` : null,
    r.sv && r.sv !== "0" ? `🔐위반${r.sv}` : null].filter(Boolean).join(" ");
  console.log(`  ${kst(r.kst)} ${r.ok ? "✅" : "❌"} ${String(r.job).padEnd(22)} ${tag.padEnd(28)} ${r.d}`);
}

// ② 정체(헛돎) — 같은 문제집합 3회 연속
const { detectStuck } = await import("../lib/runLedger.ts");
const stuck = await detectStuck(48, 3);
console.log(`\n② 정체(같은 문제집합 3회+ 연속): ${stuck.length}건`);
stuck.forEach((s) => console.log(`  🔁 ${s.job} — ${s.repeats}회 (${kst(s.first_at)} ~ ${kst(s.last_at)})`));

// ③ 효과검증·동결 현황 = 사람 확인 대기
const frozen = await sql`SELECT job, COUNT(*)::int n,
    COUNT(*) FILTER (WHERE note LIKE '%오탐%')::int fp,
    COUNT(*) FILTER (WHERE note LIKE '%보존판정%')::int keep,
    COUNT(*) FILTER (WHERE note IS NULL OR note NOT LIKE '[사람판독%')::int unread
  FROM heal_attempts WHERE frozen_until > now() GROUP BY job ORDER BY n DESC`;
console.log(`\n③ 동결(자동으로 못 고쳐 사람에게 넘긴 것)`);
if (!frozen.length) console.log("  없음");
frozen.forEach((f) => console.log(`  ${String(f.job).padEnd(28)} ${f.n}건 (판독 대기 ${f.unread} · 오탐 ${f.fp} · 보존 ${f.keep})`));

// ④ 예산·게이트
const budget = await sql`SELECT job, SUM((metrics->>'blobReads')::int)::int n FROM run_ledger
  WHERE started_at > now() - interval '24 hours' AND metrics ? 'blobReads' GROUP BY job ORDER BY n DESC LIMIT 6`;
console.log(`\n④ 24시간 큰컬럼 로드 누적`);
budget.forEach((b) => console.log(`  ${String(b.job).padEnd(22)} ${b.n}`));
const iss = await sql`SELECT ikey, detail FROM issues WHERE ikey LIKE 'budget:%' AND status='open'`;
console.log(`  예산 초과 경고: ${iss.length ? iss.map((i) => i.ikey).join(", ") : "없음 ✅"}`);
const gates = await sql`SELECT COUNT(*)::int n, MAX(ROUND(EXTRACT(EPOCH FROM (now()-COALESCE(decided_at,created_at)))/3600))::int h
  FROM decisions WHERE (status='pending' AND COALESCE(tier,'L3')='L3')
     OR (status='approved' AND action_type='dev_task' AND action_params->>'dev_status'='배포대기')`;
console.log(`\n⑤ 사람 대기(게이트): ${gates[0].n}건 · 최장 ${gates[0].h ?? 0}h ${(gates[0].h ?? 0) >= 24 ? "⚠️ 24h+ 지연" : ""}`);

// ⑦ 산출물 신선도 — 하네스 1원칙("실행이 아니라 효과가 성공")을 **에이전트 산출물**까지 확장.
//   2026-08-12 사고: launchd 시각이 17→16시로 바뀌었는데 run-daily.sh의 `HOUR="17"` 조건이 안 따라가
//   종합브리핑·비서실장·검색품질·마케팅이 **10일간 조용히 한 번도 실행되지 않았다.** 그런데 잡 자체는
//   "실행됨(OK)"으로 기록돼 기존 감시망은 전부 초록불이었다 — 안에서 아무 일도 안 일어난 걸 아무도 안 봤다.
//   급기야 마지막 브리핑이 API의 10일 창 밖으로 밀리며 조직 관제가 통째로 잠겼다.
//   → 이제 **산출물이 실제로 갱신되는지**를 본다. 조회는 DB 1건 + 로컬 파일 stat(무료).
{
  const { readdirSync, statSync } = await import("node:fs");
  const DIR = "/Users/wangwida/coffee-platform/agent-reports";
  const ageH = (t) => (Date.now() - t) / 3600000;
  // 파일 산출물: [표시명, 파일 접두사, 허용 나이(시간)]
  const FILES = [
    ["종합 브리핑(EXECUTIVE)", "EXECUTIVE", 36],
    ["검색품질 에이전트", "search-quality", 36],
    ["마케팅/B2B(격일)", "marketing", 60],
    ["B2B 세일즈(격일)", "b2b-sales", 60],
    ["룰갭 발굴", "rulegap", 30],
    ["품질 레드팀", "redteam", 30],
    ["자율진단", "selfaudit-report", 14],
    ["폐업 조사", "closure", 30],
    ["수요·발굴", "demand-grow", 30],
  ];
  let names = [];
  try { names = readdirSync(DIR).filter((f) => f.endsWith(".md")); } catch { /* 디렉터리 없음 */ }
  const newest = (prefix) => {
    let best = 0;
    for (const f of names) {
      if (!f.startsWith(prefix)) continue;
      try { const t = statSync(`${DIR}/${f}`).mtimeMs; if (t > best) best = t; } catch { /* skip */ }
    }
    return best;
  };
  const stale = [];
  const lines = [];
  for (const [label, prefix, maxH] of FILES) {
    const t = newest(prefix);
    const h = t ? ageH(t) : Infinity;
    const bad = h > maxH;
    if (bad) stale.push(label);
    lines.push(`  ${bad ? "🔴" : "🟢"} ${label.padEnd(22)} ${t ? `${h.toFixed(1)}h 전` : "산출물 없음"}${bad ? `  (허용 ${maxH}h)` : ""}`);
  }
  // DB 산출물: 조직 브리핑(이번 사고의 진원지)
  const ob = await sql`SELECT COUNT(*)::int n, ROUND(EXTRACT(EPOCH FROM (now()-MAX(created_at)))/3600)::int h FROM org_briefings`.catch(() => [{ n: 0, h: null }]);
  const obH = ob[0].h;
  const obBad = obH == null || obH > 36;
  if (obBad) stale.push("조직 브리핑(DB)");
  lines.push(`  ${obBad ? "🔴" : "🟢"} ${"조직 브리핑(DB)".padEnd(22)} ${obH == null ? "없음" : `${obH}h 전`}${obBad ? "  (허용 36h · 관제탑 잠김 원인)" : ""}`);

  console.log(`\n⑦ 산출물 신선도 — 잡이 '돌았다'가 아니라 '결과물이 갱신됐나'`);
  lines.forEach((l) => console.log(l));
  if (stale.length) console.log(`   ⚠️ ${stale.length}건 정체 — 스케줄 조건과 실제 실행시각이 어긋났는지 먼저 확인(run-daily.sh)`);
  else console.log("   전부 최신 ✅");
}

// ⑧ 검색 품질 — 하네스 원칙 "효과가 성공"의 소비자 화면판. 골든셋 결정론 채점(LLM 0원).
//   회귀를 실제로 잡아낸 이력: 조사 절단이 '고양이'를 '고양시'로 만들어 정확도 100%→20%로 떨어진 것을 여기서 검출.
try {
  const { runEval } = await import("./search-eval.mjs");
  const ev = await runEval(sql);
  const pct = (x) => `${Math.round(x * 100)}%`;
  console.log(`\n⑧ 검색 품질(골든셋 26질의): 종합 ${pct(ev.total)} · 지역 ${pct(ev.byType.area ?? 0)} · 사실 ${pct(ev.byType.fact ?? 0)} · 상호 ${pct(ev.byType.name ?? 0)} · 수도권핵심 ${pct(ev.coreRate)}`);
  const bad = ev.rows.filter((r) => r.score < 0.6);
  bad.forEach((r) => console.log(`   🔴 ${pct(r.score)} ${r.q} — ${r.note}`));
  if (!bad.length) console.log("   저조 질의 없음 ✅");
} catch (e) { console.log(`\n⑧ 검색 품질: 점검 실패(${String(e).slice(0, 70)})`); }

// ⑨ 배포 즉시발화 경로 — 승인해도 안 나가던 4일 사고(2026-08-09)의 재발 감시.
//   사람이 Vercel에 env를 심는 절차라 조용히 죽을 수 있다 → 승인 때가 아니라 **평상시 점검에서** 잡는다.
//   프로덕션 불리언 1회 + 로컬 리스너 프로세스 확인. DB 조회 0.
try {
  const r = await fetch("https://dongnecoffeenote.com/api/admin/dev-pipeline", {
    headers: { "x-admin-password": process.env.ADMIN_PASSWORD || "" },
  }).then((x) => x.json());
  const listener = (await import("node:child_process")).execSync("pgrep -f run-trigger-listener.sh | head -1").toString().trim();
  const ok = r?.triggerConfigured && listener;
  console.log(`\n⑨ 배포 즉시발화: ${ok ? "정상 ✅" : "⚠️ 끊김"} (프로덕션 TRIGGER_NTFY_TOPIC ${r?.triggerConfigured ? "설정됨" : "❌ 미설정"} · 맥 리스너 ${listener ? "가동" : "❌ 중지"})`);
  if (!ok) console.log("   → 승인해도 즉시 안 나가고 다음 창(08/12/16/20시)까지 최대 4h 대기합니다.");
} catch (e) {
  console.log(`\n⑨ 배포 즉시발화: 점검 실패(${String(e).slice(0, 60)})`);
}
