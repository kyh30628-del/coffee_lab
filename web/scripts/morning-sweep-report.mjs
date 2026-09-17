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
say(`② 오늘 적재 ${t[0].n.toLocaleString()}곳 (공개 ${t[0].pub}) · 전체 공개 ${p[0].pub.toLocaleString()}곳`);

// ③ 신규 5개 시도 (전국 개방 성과)
const g = await sql`SELECT count(*)::int n, count(*) FILTER (WHERE published)::int pub FROM cafes
  WHERE address LIKE '전남광주통합%' OR address LIKE '광주광역시%' OR address LIKE '전라남%'
     OR address LIKE '전북%' OR address LIKE '전라북%' OR address LIKE '울산%' OR address LIKE '제주%'`;
say(`③ 신규 5개 시도 ${g[0].n.toLocaleString()}곳 · 공개 ${g[0].pub.toLocaleString()}곳  (09-17 개방 직후 777곳에서 출발)`);

// ④ 적체·쿼터·비용
const bl = await sql`SELECT count(*)::int n FROM cafes WHERE pipeline_status='new' AND raw_reviews IS NULL`;
const nb = await sql`SELECT used FROM naver_budget WHERE day = to_char(now() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD')`;
const ch = await sql`SELECT halted FROM cost_guard WHERE id=1`;
say(`④ 적체 ${bl[0].n}곳/800 ${bl[0].n >= 800 ? "🛑 발굴 차단" : ""} · 네이버 ${(nb[0]?.used ?? 0).toLocaleString()}/25,000 · 비용정지 ${ch[0].halted ? "🛑" : "꺼짐"}`);

// ⑤ 정합성 (픽스처와 같은 불변식)
const mm = await sql`SELECT count(*) FILTER (WHERE published)::int a, count(*) FILTER (WHERE pipeline_status='live')::int b FROM cafes`;
say(`⑤ 정합성 published ${mm[0].a.toLocaleString()} vs live ${mm[0].b.toLocaleString()} ${mm[0].a === mm[0].b ? "✅" : "🔴 불일치 " + Math.abs(mm[0].a - mm[0].b)}`);

// ⑥ 잡 실행
const j = await sql`SELECT job, ok, to_char(ran_at AT TIME ZONE 'Asia/Seoul','HH24:MI') AS t
  FROM agent_runs WHERE job IN ('cron-grow','cron-synth','cron-resynth','cron-embed','discover-sweep') ORDER BY ran_at DESC`;
say(`⑥ 잡: ${j.map((x) => `${x.job.replace("cron-", "")}=${x.t}${x.ok ? "" : "❌"}`).join(" · ")}`);

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
