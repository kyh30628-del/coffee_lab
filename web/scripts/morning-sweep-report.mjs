// 📋 아침 스윕 종합 보고 — 매일 08:20 자동 실행(launchd com.coffee.morning-sweep-report).
//   왜 잡으로 만들었나: "내일 아침 보고하겠다"는 말이 반복해서 안 지켜졌다(CEO 지적 2026-09-17).
//   사람 기억에 기대지 않는다. 세션이 끊겨도 이 파일이 리포트를 남긴다.
//   출력: agent-reports/logs/morning-sweep-YYYYMMDD.log  (+ stdout)
import { readFileSync, readdirSync } from "node:fs";
import { sidoFromAreaSql } from "../lib/regionList.ts";
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
  const { AI_SRC_SQL } = await import("../lib/trafficSource.ts"); // AI 출처 단일출처(목록 중복 정의 금지)
  const Y0 = "(date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') - interval '1 day'";
  const Y1 = "(date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')";
  const [v] = await sql.query(`SELECT count(DISTINCT anon_id)::int uv, count(*)::int pv,
      count(*) FILTER (WHERE src='naver')::int naver,
      count(*) FILTER (WHERE ${AI_SRC_SQL})::int ai,
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
  // 🤖 ⓪-b AI 출처별 분해(2026-09-26, CEO "AI 유입 다양하게") — 지금은 ChatGPT 쏠림이다.
  //   다양화가 됐는지는 합계가 아니라 **출처별로** 봐야 안다. 30일 기준(일별은 표본이 작다).
  {
    const rows = await sql.query(`SELECT lower(split_part(src,'.',1)) g, count(*)::int pv, count(DISTINCT anon_id)::int uv
      FROM traffic_events WHERE ts > now() - interval '30 days'
        AND anon_id NOT IN (${BOT_ANON_IDS_SQL}) AND ${AI_SRC_SQL}
      GROUP BY 1 ORDER BY 2 DESC`);
    const tot = rows.reduce((a2, r) => a2 + r.pv, 0);
    const top = rows[0];
    const share = tot ? Math.round((top?.pv ?? 0) / tot * 100) : 0;
    say(`⓪-b 🤖 AI 경유 30일 ${tot.toLocaleString()}PV — ${rows.map((r) => `${r.g} ${r.pv}(${r.uv}명)`).join(" · ") || "없음"}`);
    say(`     출처 ${rows.length}종 · 1위 ${top?.g ?? "-"} 점유 ${share}%${rows.length <= 1 ? " ⚠️ 단일 출처 쏠림(다양화 필요)" : share >= 90 ? " ⚠️ 쏠림 90%↑" : " ✅"}`);
  }
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

// ① 07시 적재 로그 — 09-21부터 discover-sweep(정지)은 원장 적재(import-permits)로 대체됐다.
//   09-24 수리: 정지된 스윕 로그를 계속 찾아 매일 '🔴 로그 없음' 오경보를 냈다. 살아 있는 잡을 본다.
const dir = "/Users/wangwida/coffee-platform/agent-reports/logs";
const ymd = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
const pf = readdirSync(dir).filter((x) => x.startsWith(`import-permits-${ymd}-07`)).sort().pop();
if (!pf) say("⚠️ 오늘 07시 원장 적재 로그 없음 — launchd 미발화 의심");
else {
  const plog = readFileSync(`${dir}/${pf}`, "utf8");
  const m = plog.match(/적재 (\d+)곳 · 시도 (\d+) · 네이버 미발견 (\d+).*?공개규칙 불가 제외 (\d+) · 교차소스 중복 제외 (\d+)/) || plog.match(/적재 (\d+)곳 · 시도 (\d+) · 네이버 미발견 (\d+)/);
  const per = plog.match(/적재 1곳당 ([\d.]+)콜/);
  say(`① 원장 적재 — ${m ? `${m[1]}곳 · 시도 ${m[2]} · 미발견 ${m[3]}${m[4] ? ` · 공개불가 ${m[4]} · 중복 ${m[5]}` : ""} · 곳당 ${per ? per[1] : "?"}콜` : "종료줄 없음(진행 중이거나 중단)"}`);
}
const f = null; // 스윕 로그 파서는 재기동 대비로 남겨 둔다(discover-sweep 재가동 시 f를 되살릴 것)
if (f) {
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
// 🧭 2026-09-23: 주소 접두 목록 → area 단일출처(sidoFromAreaSql). 통합표기 누락으로 숫자가 새던 사고 재발 방지.
const g = await sql.query(`SELECT count(*)::int n, count(*) FILTER (WHERE published)::int pub FROM cafes
  WHERE ${sidoFromAreaSql("area")} IN ('광주','전남','전북','울산','제주')`);
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

// ④-b 🧟 은퇴 잡 부활 감시 — 2026-09-26 사고: CEO 승인으로 09-21 은퇴시킨 `discover-sweep`이 되살아나
//   그날 아침 쿼터 3,890콜(하루의 16%)을 먹고 있었다. 원인은 `launchctl unload`만 하고 plist를 남겨둔 것 —
//   unload는 재로그인하면 풀린다(다른 은퇴 잡 5종은 전부 `.plist.disabled`였는데 이 잡만 규약을 벗어나 있었다).
//   사람이 로그를 뒤져야 알 수 있던 것을 매일 자동으로 잡는다. 판정은 launchd가 아니라 **실행 흔적**으로 한다.
{
  const { RETIRED_JOBS } = await import("../lib/jobTeams.ts");
  //   ⚠️ 시각은 SQL에서 **문자열로** 받는다 — `AT TIME ZONE`이 준 벽시계를 드라이버가 로컬시각으로 재해석해
  //   9시간 어긋나던 것을 막는다(이 파일이 naver_budget 날짜를 to_char로 받는 것과 같은 이유).
  const zombies = await sql`SELECT job, to_char(max(ran_at) AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') last, count(*)::int n
    FROM agent_runs WHERE ran_at > now() - interval '24 hours' AND job = ANY(${[...RETIRED_JOBS]}) GROUP BY 1 ORDER BY 2 DESC`;
  if (!zombies.length) say(`④-b 🧟 은퇴 잡 부활 없음 ✅ (감시 ${RETIRED_JOBS.size}종)`);
  else for (const z of zombies) say(`④-b 🔴 은퇴 잡 '${z.job}'이 24h 내 ${z.n}회 실행됨(최근 ${z.last} KST) — plist가 .disabled인지 확인하라`);
}

// ⑤ 정합성 (픽스처와 같은 불변식)
const mm = await sql`SELECT count(*) FILTER (WHERE published)::int a, count(*) FILTER (WHERE pipeline_status='live')::int b FROM cafes`;
say(`⑤ 정합성 published ${mm[0].a.toLocaleString()} vs live ${mm[0].b.toLocaleString()} ${mm[0].a === mm[0].b ? "✅" : "🔴 불일치 " + Math.abs(mm[0].a - mm[0].b)}`);

// ⑤-b 🗺️ 지도 데이터 신선도(2026-09-23 신설) — 09-23 사고: /api/cafes 응답이 캐시 한도를 넘겨 2시간45분간 굳었고
//   공개 35,405곳인데 지도는 34,376곳을 보여줬다(대표님이 화면 숫자로 발견). 사람이 발견하는 건 방어선이 아니다.
//   응답 맨 앞 `"n":건수`만 Range로 200바이트 받아 대조한다(전송 0에 가깝다).
try {
  const r = await fetch("https://dongnecoffeenote.com/api/cafes", { headers: { Range: "bytes=0-199" } });
  const head = await r.text();
  const m = head.match(/"n":(\d+)/);
  const mapN = m ? Number(m[1]) : null;
  const age = Number(r.headers.get("age") || 0);
  if (mapN == null) say("⑤-b 🗺️ 지도 데이터 — 건수 확인 불가(응답 형식 변경 의심)");
  else {
    const gap = Math.abs(mapN - mm[0].a);
    say(`⑤-b 🗺️ 지도 데이터 ${mapN.toLocaleString()}곳 vs 공개 ${mm[0].a.toLocaleString()}곳 ${gap <= 50 ? "✅" : "🔴 굳음 " + gap + "곳 차이(캐시 점검)"}${age > 300 ? ` · 캐시나이 ${age}s` : ""}`);
  }
} catch (e) { say(`⑤-b 🗺️ 지도 데이터 확인 실패: ${String(e).slice(0, 60)}`); }

// ⑤-c 🧮 지표 자동 검산(2026-09-23 신설) — **쪼갠 합이 전체와 맞는가**를 매일 기계가 대조한다.
//   09-22~23 사고 4건이 전부 "쪼갠 값이 조용히 새는" 형태였고, 넷 다 대표님이 화면에서 먼저 발견하셨다.
//   사람이 발견하는 건 방어선이 아니다. 어긋나면 여기서 🔴로 뜬다. 비용: 작은 집계 6회.
try {
  const A = sidoFromAreaSql("area");
  const bad = [];
  const [x1] = await sql.query(`SELECT count(*)::int tot, (SELECT coalesce(sum(n),0)::int FROM (SELECT count(*)::int n FROM cafes WHERE published GROUP BY ${A}) q) AS parts FROM cafes WHERE published`);
  if (x1.tot !== x1.parts) bad.push(`시도별 합 ${x1.parts} ≠ 공개 ${x1.tot}`);
  const [x2] = await sql`SELECT count(*)::int tot, (SELECT coalesce(sum(n),0)::int FROM (SELECT count(*)::int n FROM cafes WHERE published GROUP BY synth_grade) q) AS parts FROM cafes WHERE published`;
  if (x2.tot !== x2.parts) bad.push(`등급별 합 ${x2.parts} ≠ 공개 ${x2.tot}`);
  const [x3] = await sql`SELECT count(*) FILTER (WHERE published AND pipeline_status<>'live')::int a, count(*) FILTER (WHERE NOT published AND pipeline_status='live')::int b FROM cafes`;
  if (x3.a || x3.b) bad.push(`공개↔상태 어긋남 ${x3.a + x3.b}곳`);
  const [x4] = await sql`SELECT count(*)::int tot, count(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL)::int geo FROM cafes WHERE published`;
  if (x4.tot !== x4.geo) bad.push(`좌표 없는 공개 ${x4.tot - x4.geo}곳(지도에서 빠짐)`);
  say(bad.length ? `⑤-c 🧮 지표 검산 🔴 ${bad.length}건 — ${bad.join(" · ")}` : "⑤-c 🧮 지표 검산 ✅ 시도·등급·상태·좌표 합계 전부 일치");
} catch (e) { say(`⑤-c 🧮 지표 검산 실패: ${String(e).slice(0, 60)}`); }

// ⑥ 잡 실행
const j = await sql`SELECT job, ok, to_char(ran_at AT TIME ZONE 'Asia/Seoul','HH24:MI') AS t
  FROM agent_runs WHERE job IN ('cron-grow','cron-synth','cron-resynth','cron-embed','discover-sweep') ORDER BY ran_at DESC`;
// 08:20 기준 '오늘 08시대 실행이 있어야 하는 잡'이 어제 시각을 달고 있으면 = 아침 회차가 조용히 죽은 것.
//   (cron-resynth 20시 타임아웃이 기록조차 안 남아 관제탑에 안 보이던 2026-09-16 함정 재발 방지)
const expectMorning = new Set(["cron-grow", "cron-synth", "cron-resynth", "cron-embed"]); // discover-sweep은 09-21 정지(RETIRED) — 기대 목록에서 제외
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
  // 🧭 2026-09-23 수리: 주소 접두 CASE는 '전남광주통합특별시'를 전부 광주로 몰아넣어 **전남이 0으로 보였다**(카페가 없어서가 아니었다).
  //   지도·관리자와 같은 area 단일출처로 통일한다.
  const SIDO = sidoFromAreaSql("c.area");
  const pv = await sql.query(`SELECT COALESCE(${SIDO},'기타') AS sido, count(*)::int pv FROM traffic_events t
    JOIN cafes c ON c.id = substring(t.path from '^/c/([0-9]+)')::int
    WHERE t.ts >= now() - interval '30 days' AND t.path LIKE '/c/%' AND t.anon_id NOT IN (${BOT_ANON_IDS_SQL})
    GROUP BY 1`);
  const cnt = await sql.query(`SELECT COALESCE(${SIDO},'기타') AS sido, count(*)::int n FROM cafes c WHERE published GROUP BY 1`);
  const P = Object.fromEntries(pv.map((x) => [x.sido, x.pv])), C = Object.fromEntries(cnt.map((x) => [x.sido, x.n]));
  const row = (k) => { const n = C[k] ?? 0, p = P[k] ?? 0; return n ? `${k} ${(p / n * 1000).toFixed(1)}` : `${k} -`; };
  const capital = ["서울", "경기", "인천"], mature = ["강원", "충북", "충남", "대전", "세종", "부산", "경남", "대구", "경북"], fresh = ["광주", "전남", "전북", "울산", "제주"];
  const agg = (ks) => { const n = ks.reduce((s, k) => s + (C[k] ?? 0), 0), p = ks.reduce((s, k) => s + (P[k] ?? 0), 0); return n ? (p / n * 1000).toFixed(1) : "-"; };
  say(`⑦ 유입효율 PV/천곳(30일)  수도권 ${agg(capital)} · 기존지방 ${agg(mature)} · 신규5시도 ${agg(fresh)} ${Number(agg(fresh)) >= 40 ? "✅ 판정선 40 통과" : "(판정선 40 · 10-08 확정)"}`);
  say(`   ${[...capital, ...mature].map(row).join(" · ")}`);
  say(`   신규: ${fresh.map(row).join(" · ")}`);
} catch (e) { say(`⑦ 유입효율 조회 실패: ${String(e).slice(0, 60)}`); }

// ⑧ 🛡️ 검증 엔진 회귀 관문 — DB 학습 사전까지 적용해서(2026-09-24). 룰갭 에이전트가 밤새 바꾼 사전이 기존 규칙을 깼는지 매일 본다.
try {
  const { spawnSync } = await import("node:child_process");
  const fx = spawnSync(process.execPath, ["scripts/fixtures-all.mjs", "--db"], { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8", timeout: 600_000 });
  const out = `${fx.stdout || ""}`.trim().split("\n");
  say(fx.status === 0 ? `⑧ 🛡️ ${out[0]} ✅` : `⑧ 🛡️ 🔴 ${out.join(" / ").slice(0, 300)} — 규칙 회귀(오염 재개방 위험), 오늘 규칙 변경부터 확인`);
} catch (e) { say(`⑧ 검증 엔진 회귀 관문 실행 실패: ${String(e).slice(0, 60)}`); }
const { writeFileSync } = await import("node:fs");
writeFileSync(`${dir}/morning-sweep-${ymd}.log`, out.join("\n") + "\n");
