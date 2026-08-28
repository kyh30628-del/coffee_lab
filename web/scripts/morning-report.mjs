// 📋 아침 보고 — 수집 결과 + 유입을 한 번에. (CEO 요청 2026-08-26)
//   💰 밤새 감시 폴링을 두지 않는다 — 03~05시 절전 구간을 깨우기 때문. 아침에 이 한 번만 조회한다.
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const GW = ["춘천","원주","강릉","속초","동해","삼척","태백","홍천","횡성","영월","평창","정선","철원","화천","양구","인제","고성","양양"];

console.log("═══ ① 수집 결과 ═══");
const g = (await sql`SELECT count(*) n, count(*) FILTER (WHERE raw_reviews IS NOT NULL) raw,
  count(*) FILTER (WHERE published) pub, count(*) FILTER (WHERE pipeline_status='new' AND raw_reviews IS NULL) wait,
  count(*) FILTER (WHERE pipeline_status='pending') pend
  FROM cafes WHERE address LIKE '강원%'`)[0];
console.log(`  강원 ${g.n}곳 · 후기확보 ${g.raw} · 공개 ${g.pub} · 대기 ${g.wait} · 승격대기 ${g.pend}`);
const all = (await sql`SELECT count(*) FILTER (WHERE published) pub, count(*) FILTER (WHERE pipeline_status='new' AND raw_reviews IS NULL) wait FROM cafes`)[0];
console.log(`  전체 공개 ${all.pub} · 남은 적체 ${all.wait}`);
const q = (await sql`SELECT used FROM naver_budget WHERE day = to_char(now() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD')`)[0];
console.log(`  오늘 쿼터 ${q?.used ?? 0}/25000`);

console.log("\n═══ ② 시군별 공개 ═══");
for (const r of await sql`SELECT area, count(*) n, count(*) FILTER (WHERE synth_grade='검증') v,
  count(*) FILTER (WHERE visitor_n>=10 AND visitor_local>=0.08) h, count(*) FILTER (WHERE visitor_n>=15 AND visitor_trip>=0.20) t
  FROM cafes WHERE published AND address LIKE '강원%' GROUP BY 1 ORDER BY 2 DESC`)
  console.log(`  ${String(r.area).padEnd(9)}${String(r.n).padStart(4)}곳  검증${String(r.v).padStart(4)}  🏠${String(r.h).padStart(3)}  🧳${String(r.t).padStart(3)}`);

// ⑥ 월 PV 진척률(애드센스 재검토 트리거 = 10만) + 신설 테마 색인→유입 곡선 — CEO 요청 2026-08-27.
//   💰 봇 제외 집계 2회 추가일 뿐(아침 1회). BOT_ANON_IDS_SQL은 무겁게 임포트하지 않고 동일 정의를 재사용해야 하나
//   이 스크립트는 .ts 임포트가 가능하므로 단일출처를 그대로 쓴다.
const { BOT_ANON_IDS_SQL } = await import("../lib/behaviorBot.ts");
// 💰 Neon 실측(2026-08-28 NEON_API_KEY 연동) — 추정 금지. 활성시간이 곧 "DB가 안 자는 시간".
console.log("\n═══ ⑤-b Neon 비용 실측 ═══");
try {
  const K = process.env.NEON_API_KEY;
  if (!K) console.log("  NEON_API_KEY 미설정");
  else {
    const r = await fetch("https://console.neon.tech/api/v2/projects/damp-dew-22096939", { headers: { Authorization: `Bearer ${K}`, Accept: "application/json" } });
    const p2 = (await r.json()).project ?? {};
    const cuh = (p2.compute_time_seconds ?? 0) / 3600, act = (p2.active_time_seconds ?? 0) / 3600;
    const start = new Date(p2.consumption_period_start ?? Date.now());
    const days = Math.max(1, (Date.now() - start.getTime()) / 86400000);
    console.log(`  이번 달 컴퓨트 ${cuh.toFixed(1)} CU-h → $${(cuh * 0.106).toFixed(2)} · 전송 ${((p2.data_transfer_bytes ?? 0)/1e9).toFixed(1)}GB`);
    console.log(`  하루 평균: 컴퓨트 ${(cuh/days).toFixed(1)} CU-h · $${(cuh*0.106/days).toFixed(2)}`);
    console.log(`  🌙 활성시간 ${(act/days).toFixed(1)}h/일 ${act/days > 20 ? "← 🔴 거의 안 잠(ISR·크롤러 점검)" : "← 절전 확보됨"}`);

    // 🎯 2026-08-28 /c/[id] ISR 복구(커밋 4778af4)의 **실측 효과**.
    //   그날 CEO 지시: "숫자 재서 보고해." 월 누계 평균은 배포 전 24일치에 희석돼 효과가 안 보이므로,
    //   배포 시각의 누계를 박아두고 **그 이후 증가분만** 따로 계산한다.
    //   기준선 파일이 없으면(측정 종료) 이 블록은 조용히 건너뛴다.
    try {
      const { readFileSync } = await import("node:fs");
      const base = JSON.parse(readFileSync(new URL("../../agent-reports/neon-isr-baseline.json", import.meta.url), "utf8"));
      const hrs = (Date.now() - new Date(base.at).getTime()) / 3600000;
      if (hrs >= 1) {
        const dAct = act - base.active_h_total, dCu = cuh - base.cu_h_total;
        const actPerDay = dAct / (hrs / 24), cuPerDay = dCu / (hrs / 24);
        console.log(`  ── ISR 수리 효과(배포 후 ${hrs.toFixed(1)}시간 실측) ──`);
        console.log(`     활성시간 ${actPerDay.toFixed(1)}h/일  (수리 전 24.4h/일)`);
        console.log(`     컴퓨트 ${cuPerDay.toFixed(2)} CU-h/일 → 월 $${(cuPerDay * 30 * 0.106).toFixed(2)}  (수리 전 월 $42)`);
        console.log(`     ${actPerDay < 20 ? "✅ DB가 자기 시작함" : "🔴 여전히 안 잠 — 다른 원인 남아있음"}`);
      } else console.log(`  ── ISR 수리 효과: 배포 후 ${hrs.toFixed(1)}시간 — 24시간 지나야 유의미`);
    } catch { /* 기준선 없음 = 측정 종료 */ }
  }
} catch (e) { console.log("  조회 실패:", String(e).slice(0, 60)); }

console.log("\n═══ ⑥ 월 PV 진척률 (애드센스 트리거 10만) ═══");
const pv = (await sql.query(`SELECT count(*)::int pv, count(DISTINCT anon_id)::int uv FROM traffic_events
  WHERE ts > now()-interval '30 days' AND anon_id NOT IN (${BOT_ANON_IDS_SQL})`))[0];
console.log(`  최근 30일: ${Number(pv.pv).toLocaleString()} PV · ${Number(pv.uv).toLocaleString()}명 → 10만 PV의 ${(pv.pv/1000).toFixed(1)}%`);

console.log("\n═══ ⑦ 신설 테마(베이커리·테라스) 색인→유입 곡선 ═══");
const th = await sql.query(`SELECT split_part(path,'/',4) axis, (ts AT TIME ZONE 'Asia/Seoul')::date d, count(*)::int pv
  FROM traffic_events WHERE (path LIKE '%/bakery%' OR path LIKE '%/terrace%')
    AND ts > now()-interval '14 days' AND anon_id NOT IN (${BOT_ANON_IDS_SQL})
  GROUP BY 1,2 ORDER BY 2,1`);
if (!th.length) console.log("  아직 유입 0 — 색인 대기(08-27 제출·전례상 ~열흘 소요). 곡선이 시작되면 CEO 보고할 것.");
else th.forEach((x) => console.log(`  ${x.d} ${x.axis}: ${x.pv} PV`));

console.log("\n═══ ③ 강원 유입(어제 대비) ═══");
const ids = new Set((await sql`SELECT id FROM cafes WHERE address LIKE '강원%'`).map(r => String(r.id)));
const isGw = (p) => { const d = decodeURIComponent(p || ""); if (GW.some(x => d.includes(`/area/${x}`))) return true; const m = d.match(/^\/c\/(\d+)/); return !!(m && ids.has(m[1])); };
for (const [label, since, until] of [["오늘", "0 days", null], ["어제", "1 day", "0 days"]]) {
  const rows = await sql.query(`SELECT t.anon_id, t.path, t.src, COALESCE(u.internal,false) internal, u.user_agent
    FROM traffic_events t LEFT JOIN user_consents u ON u.anon_id=t.anon_id
    WHERE t.ts >= (now() AT TIME ZONE 'Asia/Seoul')::date::timestamptz - interval '${since}'
      ${until ? `AND t.ts < (now() AT TIME ZONE 'Asia/Seoul')::date::timestamptz - interval '${until}'` : ""}`);
  const gw = rows.filter(r => isGw(r.path));
  const ext = gw.filter(r => !r.internal);          // 내부(대표·팀) 제외 = 진짜 사용자
  const users = new Set(ext.map(r => r.anon_id));
  const srcs = {}; for (const r of ext) srcs[r.src || "직접"] = (srcs[r.src || "직접"] ?? 0) + 1;
  console.log(`  ${label}: 강원 조회 ${gw.length}건 (내부 제외 ${ext.length}건 · 방문자 ${users.size}명)`);
  if (ext.length) console.log(`     유입경로: ${Object.entries(srcs).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
}

console.log("\n═══ ④ 공지 모달 효과 ═══");
const d = (await sql`SELECT count(*) n FROM notice_dismissals WHERE notice_id='gangwon-2026-08'`.catch(() => [{ n: 0 }]))[0];
console.log(`  '다시 보지 않기' 클릭 ${d.n}건`);
const map = await sql`SELECT count(*) n FROM outbound_clicks WHERE target='map_cta' AND ts >= (now() AT TIME ZONE 'Asia/Seoul')::date::timestamptz`.catch(() => [{ n: 0 }]);
console.log(`  오늘 지도 진입 클릭 ${map[0].n}건`);

console.log("\n═══ ⑤ 관광지 캘리브레이션 ═══");
const t = await sql`SELECT count(*) n, count(*) FILTER (WHERE is_tourist) yes FROM dong_tourism`.catch(() => null);
if (t && Number(t[0].n) > 0) console.log(`  판정 완료 ${t[0].n}개 동 · 관광지 판정 ${t[0].yes}개`);
else console.log("  아직 미실행 — 수집 큐가 완전히 비면 자동으로 40개 표본을 뜬다");
