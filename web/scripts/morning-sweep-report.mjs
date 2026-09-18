// 📋 아침 스윕 종합 보고 — 매일 08:20 자동 실행(launchd com.coffee.morning-sweep-report).
//   왜 잡으로 만들었나: "내일 아침 보고하겠다"는 말이 반복해서 안 지켜졌다(CEO 지적 2026-09-17).
//   사람 기억에 기대지 않는다. 세션이 끊겨도 이 파일이 리포트를 남긴다.
//   출력: agent-reports/logs/morning-sweep-YYYYMMDD.log  (+ stdout)
import { readFileSync, readdirSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const KST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
const K = sql`(date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')`;
const out = [];
const say = (s) => { out.push(s); console.log(s); };

say(`═══ 아침 스윕 보고 ${KST()} KST ═══`);

// ⓪ 사람 유입(어제, 봇 제외) — 북극성 지표. 카페 수는 수단이고 이게 결과다(CEO 2026-09-14 "사람의 검색으로 유입되는 것만 중요").
//   ⚠️ 봇 제외는 BOT_ANON_IDS_SQL 단일출처. 어제 = KST 어제 00:00~24:00.
try {
  const { BOT_ANON_IDS_SQL } = await import("../lib/behaviorBot.ts");
  const Y0 = "(date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') - interval '1 day'";
  const Y1 = "(date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')";
  const [v] = await sql.query(`SELECT count(DISTINCT anon_id)::int uv, count(*)::int pv,
      count(*) FILTER (WHERE src='naver')::int naver,
      count(*) FILTER (WHERE src LIKE '%chatgpt%' OR src IN ('openai','perplexity','perplexity.ai','claude.ai','gemini','copilot.com'))::int ai,
      count(*) FILTER (WHERE src='google')::int google,
      count(*) FILTER (WHERE src='naver' AND path ~ '^/area/[^/]+/dong/')::int naver_dong
    FROM traffic_events WHERE ts >= ${Y0} AND ts < ${Y1} AND anon_id NOT IN (${BOT_ANON_IDS_SQL})`);
  const [w] = await sql.query(`SELECT count(DISTINCT anon_id)::int uv,
      count(*) FILTER (WHERE src='naver' AND path ~ '^/area/[^/]+/dong/')::int naver_dong
    FROM traffic_events WHERE ts >= ${Y0} - interval '7 days' AND ts < ${Y0} AND anon_id NOT IN (${BOT_ANON_IDS_SQL})`);
  const avg7 = Math.round(w.uv / 7);
  // 🔴 2026-09-18 — 판정을 '어제 하루 vs 7일평균'으로 하면 **평일마다 거짓 경보**가 뜬다.
  //   실측 요일편차: 네이버 PV 일요일 977 vs 화요일 431(2.3배). 평일은 구조적으로 주간평균보다 낮다.
  //   실제로 09-18 아침 리포트가 '🔴 -20%↓ 사이트맵 원복 검토'를 띄웠는데, 주 단위로 재보니
  //   동 계열은 88 → 165(+88%)로 **늘고 있었다.** 되돌릴 이유가 없는데 되돌릴 뻔했다.
  //   → 어제 수치는 정보로 계속 보여주되, **판정은 7일 합계끼리** 한다(요일 효과 상쇄).
  say(`⓪ 사람 유입(어제) 방문자 ${v.uv}명 · PV ${v.pv}  ← 7일평균 ${avg7}명 (일별 판정 안 함 — 요일편차 2.3배)`);
  say(`   출처: 네이버 ${v.naver} · AI ${v.ai} · 구글 ${v.google}`);
  // 🔙 사이트맵에서 동×취향을 뺀(09-17) 되돌림 조건: 네이버 경유 동 계열 유입이 20% 이상 줄면 원복
  // 주 단위 추세 — 이게 실제 판정선이다(요일 효과 없음).
  const [wk] = await sql.query(`SELECT
      count(DISTINCT anon_id) FILTER (WHERE ts >= now() - interval '7 days')::int uv0,
      count(DISTINCT anon_id) FILTER (WHERE ts >= now() - interval '14 days' AND ts < now() - interval '7 days')::int uv1,
      count(*) FILTER (WHERE src='naver' AND ts >= now() - interval '7 days')::int nv0,
      count(*) FILTER (WHERE src='naver' AND ts >= now() - interval '14 days' AND ts < now() - interval '7 days')::int nv1,
      count(*) FILTER (WHERE src='naver' AND path ~ '^/area/[^/]+/dong/' AND ts >= now() - interval '7 days')::int dg0,
      count(*) FILTER (WHERE src='naver' AND path ~ '^/area/[^/]+/dong/' AND ts >= now() - interval '14 days' AND ts < now() - interval '7 days')::int dg1
    FROM traffic_events WHERE ts >= now() - interval '14 days' AND anon_id NOT IN (${BOT_ANON_IDS_SQL})`);
  const pct = (a, b) => b > 0 ? `${a >= b ? "+" : ""}${((a - b) / b * 100).toFixed(0)}%` : "-";
  say(`   📊 주 단위(최근7일 ← 직전7일): 방문자 ${wk.uv0} ← ${wk.uv1} ${pct(wk.uv0, wk.uv1)} · 네이버 ${wk.nv0} ← ${wk.nv1} ${pct(wk.nv0, wk.nv1)}`);
  // 🔙 사이트맵에서 동×취향을 뺀 되돌림 조건 — **주 단위로** 20% 이상 줄었을 때만.
  say(`   네이버→동 계열(주) ${wk.dg0} ← ${wk.dg1} ${pct(wk.dg0, wk.dg1)} ${wk.dg1 > 0 && wk.dg0 < wk.dg1 * 0.8 ? "🔴 -20%↓ 사이트맵 원복 검토" : "✅"}`);
} catch (e) { say(`⓪ 사람 유입 조회 실패: ${String(e).slice(0, 60)}`); }

// ① 스윕 로그 — 오늘 07시대 것
const dir = "/Users/wangwida/coffee-platform/agent-reports/logs";
const ymd = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
const f = readdirSync(dir).filter((x) => x.startsWith(`discover-sweep-${ymd}-07`)).sort().pop();
if (!f) say("🔴 오늘 07시 스윕 로그 없음 — launchd 미발화 의심");
else {
  const log = readFileSync(`${dir}/${f}`, "utf8");
  const regions = [...log.matchAll(/^\[(\d+)\] (.+?)\(직전수확률 ([^)]+)\): 발견 (\d+) · 신규 (\d+)/gm)];
  const end = log.match(/처리 (\d+)개 지역 · 신규 (\d+)곳 적재 · 네이버 ([\d,]+)/);
  const found = regions.reduce((s, m) => s + Number(m[4]), 0);
  say(`① 스윕 — ${end ? `${end[1]}개 지역 · 신규 ${end[2]}곳 · 네이버 ${end[3]}콜` : `진행 중(${regions.length}개 지역)`}`);
  if (end && found) say(`   발견 ${found.toLocaleString()} → 적재율 ${(Number(end[2]) / found * 100).toFixed(1)}% · 카페당 ${(Number(end[3].replace(/,/g, "")) / Number(end[2])).toFixed(1)}콜`);
  say(`   상위 5: ${regions.slice(0, 5).map((m) => `${m[2]} ${m[5]}곳`).join(" · ") || "없음"}`);
  if (!end) say("   ⚠️ 종료줄 없음 — 아직 돌거나 중단됨");
}

// ② 적재·공개
const t = await sql`SELECT count(*)::int n, count(*) FILTER (WHERE published)::int pub FROM cafes WHERE created_at >= ${K}`;
const p = await sql`SELECT count(*) FILTER (WHERE published)::int pub FROM cafes`;
let pubDelta = "";
try {
  const yd = new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10).replace(/-/g, "");
  const prev = readFileSync(`${dir}/morning-sweep-${yd}.log`, "utf8").match(/전체 공개 ([\d,]+)곳/);
  if (prev) { const b = Number(prev[1].replace(/,/g, "")); const d = p[0].pub - b;
    pubDelta = ` (전일 ${b.toLocaleString()} → ${d >= 0 ? "+" : ""}${d.toLocaleString()})${d < -b * 0.03 ? " 🔴 -3%↓ 대량 비공개 의심(09-12형)" : ""}`; }
} catch { /* 첫날은 전일 로그가 없다 */ }
say(`② 오늘 적재 ${t[0].n.toLocaleString()}곳 (공개 ${t[0].pub}) · 전체 공개 ${p[0].pub.toLocaleString()}곳${pubDelta}`);

// ③ 신규 5개 시도 (전국 개방 성과)
const g = await sql`SELECT count(*)::int n, count(*) FILTER (WHERE published)::int pub FROM cafes
  WHERE address LIKE '전남광주통합%' OR address LIKE '광주광역시%' OR address LIKE '전라남%'
     OR address LIKE '전북%' OR address LIKE '전라북%' OR address LIKE '울산%' OR address LIKE '제주%'`;
say(`③ 신규 5개 시도 ${g[0].n.toLocaleString()}곳 · 공개 ${g[0].pub.toLocaleString()}곳  (09-17 개방 직후 777곳에서 출발)`);

// ③-b 🗺️ 전국 완주 현황 — 대표님이 매일 묻는 "어디까지 열렸나"를 한 줄로(2026-09-18 신설).
//   미착수(last_run IS NULL)가 0이 되면 전국 한 바퀴 완주다. 시·도별로 남은 곳을 그대로 적는다.
{
  const un = await sql`SELECT region FROM discovery_state WHERE last_run IS NULL ORDER BY region`;
  const bySido = {};
  for (const r of un) { const k = String(r.region).split(" ")[0]; (bySido[k] ??= []).push(String(r.region).split(" ").slice(1).join(" ")); }
  const total = un.length;
  if (!total) say(`③-b 🗺️ 전국 완주 — 미착수 0개 지역 (전 지역 최소 1회 발굴 완료)`);
  else {
    say(`③-b 🗺️ 미착수 ${total}개 지역 남음`);
    for (const [k, v] of Object.entries(bySido)) say(`   ${k} ${v.length}곳: ${v.join(" · ")}`);
  }
}

// ④ 적체·쿼터·비용
const bl = await sql`SELECT count(*)::int n FROM cafes WHERE pipeline_status='new' AND raw_reviews IS NULL`;
const nb = await sql`SELECT used FROM naver_budget WHERE day = to_char(now() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD')`;
const ch = await sql`SELECT halted FROM cost_guard WHERE id=1`;
// ⚠️ 2026-09-18 — 임계를 800으로 **하드코딩**해 두고 있었다. 같은 날 임계를 1,500으로 올렸는데
//   리포트만 800으로 판정해 "발굴 차단"이라고 거짓 보고할 뻔했다. 가드 본체와 같은 값을 읽는다.
//   (판정 기준을 두 군데 적어두면 반드시 갈라진다 — criteria 하드코딩 금지와 같은 자리다.)
const { discoveryMayRun } = await import("../lib/naverBudget.ts");
const dgd = await discoveryMayRun();
say(`④ 적체 ${dgd.backlog.toLocaleString()}곳/${dgd.limit.toLocaleString()} ${dgd.ok ? "✅ 발굴 허용" : "🛑 발굴 차단"} · 네이버 ${(nb[0]?.used ?? 0).toLocaleString()}/25,000 · 비용정지 ${ch[0].halted ? "🛑" : "꺼짐"}`);

// ⑤ 정합성 (픽스처와 같은 불변식)
const mm = await sql`SELECT count(*) FILTER (WHERE published)::int a, count(*) FILTER (WHERE pipeline_status='live')::int b FROM cafes`;
say(`⑤ 정합성 published ${mm[0].a.toLocaleString()} vs live ${mm[0].b.toLocaleString()} ${mm[0].a === mm[0].b ? "✅" : "🔴 불일치 " + Math.abs(mm[0].a - mm[0].b)}`);

// ⑥ 잡 실행
const j = await sql`SELECT job, ok, to_char(ran_at AT TIME ZONE 'Asia/Seoul','HH24:MI') AS t
  FROM agent_runs WHERE job IN ('cron-grow','cron-synth','cron-resynth','cron-embed','discover-sweep') ORDER BY ran_at DESC`;
// 08:20 기준 '오늘 08시대 실행이 있어야 하는 잡'이 어제 시각을 달고 있으면 = 아침 회차가 조용히 죽은 것.
//   (cron-resynth 20시 타임아웃이 기록조차 안 남아 관제탑에 안 보이던 2026-09-16 함정 재발 방지)
const expectMorning = new Set(["cron-grow", "cron-synth", "cron-resynth", "cron-embed", "discover-sweep"]);
//   ⚠️ 08:15~09:30 사이에 돌 때만 판정한다 — 낮에 수동으로 돌리면 아침 시각이 아니라 거짓 빨강이 난다(21시 시험에서 실제로 났다).
const hhmm = Number(new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16).replace(":", ""));
const missed = (hhmm >= 815 && hhmm <= 930) ? j.filter((x) => expectMorning.has(x.job) && !/^0[78]:/.test(x.t)).map((x) => x.job.replace("cron-", "")) : [];
say(`⑥ 잡: ${j.map((x) => `${x.job.replace("cron-", "")}=${x.t}${x.ok ? "" : "❌"}`).join(" · ")}${missed.length ? ` 🔴 아침 회차 누락: ${missed.join(",")}` : ""}`);

// ⑦ 지역별 유입 효율 — 지방 확장이 방문자를 데려오는지(2026-09-17 CEO 지시 "제대로 똑바로 해놔")
//   판정선 10-08: 신규 5개 시도 PV/천곳 ≥ 40 → 지방 확장 계속 · < 40 → 지방 발굴 중단, 수도권·AI로 회수.
//   실측 09-17: 수도권 373 · 강원(3주) 50.2 · 대구경북(5일) 2.9. 강원이 3주에 50을 찍었으니 같은 기간을 준다.
//   ⚠️ 매일 찍는 이유: 3주를 기다리지 않고도 '오르는 중인지 멈춰 있는지' 추세가 보이게.
try {
  const { BOT_ANON_IDS_SQL } = await import("../lib/behaviorBot.ts");
  const SIDO = `CASE
      WHEN c.address LIKE '서울%' THEN '서울' WHEN c.address LIKE '경기%' THEN '경기' WHEN c.address LIKE '인천%' THEN '인천'
      WHEN c.address LIKE '강원%' THEN '강원' WHEN c.address LIKE '충청북%' OR c.address LIKE '충북%' THEN '충북'
      WHEN c.address LIKE '충청남%' OR c.address LIKE '충남%' THEN '충남' WHEN c.address LIKE '대전%' THEN '대전'
      WHEN c.address LIKE '세종%' THEN '세종' WHEN c.address LIKE '부산%' THEN '부산'
      WHEN c.address LIKE '경상남%' OR c.address LIKE '경남%' THEN '경남' WHEN c.address LIKE '대구%' THEN '대구'
      WHEN c.address LIKE '경상북%' OR c.address LIKE '경북%' THEN '경북'
      WHEN c.address LIKE '전남광주통합%' OR c.address LIKE '광주광역시%' THEN '광주'
      WHEN c.address LIKE '전라남%' THEN '전남' WHEN c.address LIKE '전북%' OR c.address LIKE '전라북%' THEN '전북'
      WHEN c.address LIKE '울산%' THEN '울산' WHEN c.address LIKE '제주%' THEN '제주' ELSE '기타' END`;
  const pv = await sql.query(`SELECT ${SIDO} AS sido, count(*)::int pv FROM traffic_events t
    JOIN cafes c ON c.id = substring(t.path from '^/c/([0-9]+)')::int
    WHERE t.ts >= now() - interval '30 days' AND t.path LIKE '/c/%' AND t.anon_id NOT IN (${BOT_ANON_IDS_SQL})
    GROUP BY 1`);
  const cnt = await sql.query(`SELECT ${SIDO} AS sido, count(*)::int n FROM cafes c WHERE published GROUP BY 1`);
  const P = Object.fromEntries(pv.map((x) => [x.sido, x.pv])), C = Object.fromEntries(cnt.map((x) => [x.sido, x.n]));
  const row = (k) => { const n = C[k] ?? 0, p = P[k] ?? 0; return n ? `${k} ${(p / n * 1000).toFixed(1)}` : `${k} -`; };
  const capital = ["서울", "경기", "인천"], mature = ["강원", "충북", "충남", "대전", "세종", "부산", "경남", "대구", "경북"], fresh = ["광주", "전남", "전북", "울산", "제주"];
  const agg = (ks) => { const n = ks.reduce((s, k) => s + (C[k] ?? 0), 0), p = ks.reduce((s, k) => s + (P[k] ?? 0), 0); return n ? (p / n * 1000).toFixed(1) : "-"; };
  say(`⑦ 유입효율 PV/천곳(30일)  수도권 ${agg(capital)} · 기존지방 ${agg(mature)} · 신규5시도 ${agg(fresh)} ${Number(agg(fresh)) >= 40 ? "✅ 판정선 40 통과" : "(판정선 40 · 10-08 확정)"}`);
  say(`   ${[...capital, ...mature].map(row).join(" · ")}`);
  say(`   신규: ${fresh.map(row).join(" · ")}`);
} catch (e) { say(`⑦ 유입효율 조회 실패: ${String(e).slice(0, 60)}`); }

const { writeFileSync } = await import("node:fs");
writeFileSync(`${dir}/morning-sweep-${ymd}.log`, out.join("\n") + "\n");
