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

    // 🧼 깨끗한 기준선(2026-08-30 새벽) — 위 ISR 기준선은 671곳 판정·191곳 재수집이 겹쳐 오염됐다.
    //   무거운 배치가 다 끝난 뒤 다시 박았다. CEO 지시: 3일간 아무것도 안 하고 이 값으로 판정한다.
    //   판정 목적 둘 — ①ISR 수리가 실제로 얼마나 줄였나 ②페이지를 늘려도(지역 확장) 안전한가.
    try {
      const { readFileSync } = await import("node:fs");
      const cb = JSON.parse(readFileSync(new URL("../../agent-reports/neon-clean-baseline.json", import.meta.url), "utf8"));
      const h = (Date.now() - new Date(cb.at).getTime()) / 3600000;
      const aDay = (act - cb.active_h_total) / (h / 24), cDay = (cuh - cb.cu_h_total) / (h / 24);
      console.log(`  ── 🧼 깨끗한 실측(무거운 작업 정지 후 ${h.toFixed(1)}시간) ──`);
      // ⚠️ 경과가 짧으면 나눗셈이 폭주한다(0.0시간에 "147.9h/일" 같은 무의미한 값). 24시간 전엔 숫자를 아예 안 낸다.
      if (h < 24) {
        console.log(`     ${h.toFixed(1)}시간 경과 — 24시간은 지나야 의미 있는 값(그 전엔 표본이 짧아 왜곡)`);
      } else {
        console.log(`     활성시간 ${aDay.toFixed(1)}h/일 · 컴퓨트 ${cDay.toFixed(2)} CU-h/일 → 월 $${(cDay * 30 * 0.106).toFixed(2)}`);
        console.log(`     (수리 전 24.4h/일 · 월 $42 / 카페 ${cb.cafes.toLocaleString()}곳 기준)`);
        if (h >= 72) {
          console.log(`     ✅ 3일 경과 — 지역 확장 안전성 판정 가능`);
          console.log(`     ${aDay < 20 ? "🟢 활성시간 20h 미만 = 페이지를 늘려도 여력 있음" : "🔴 여전히 천장 근처 = 확장 전 원인 재조사 필요"}`);
        }
      }
    } catch { /* 기준선 없음 */ }
  }
} catch (e) { console.log("  조회 실패:", String(e).slice(0, 60)); }

console.log("\n═══ ⑥ 월 PV 진척률 (애드센스 트리거 10만) ═══");
const pv = (await sql.query(`SELECT count(*)::int pv, count(DISTINCT anon_id)::int uv FROM traffic_events
  WHERE ts > now()-interval '30 days' AND anon_id NOT IN (${BOT_ANON_IDS_SQL})`))[0];
console.log(`  최근 30일: ${Number(pv.pv).toLocaleString()} PV · ${Number(pv.uv).toLocaleString()}명 → 10만 PV의 ${(pv.pv/1000).toFixed(1)}%`);

// 🏪 사장님 퍼널 — 2026-08-29 CEO 지시로 추가. B안(찾아왔을 때 잡기)의 성적표.
//   같은 날 CTA를 페이지 맨 끝(FAQ 아래)에서 강·약 분석 직후로 올렸다.
//   이동 전 기준선: 30일 CTA 20회 / 4,719 PV = **0.42%** · 리포트 도달 3 · 리드 0 · 유료 0.
//   ⚠️ 표본이 작다(월 20클릭). 하루이틀 숫자로 판정하지 말 것 — 최소 한 달은 봐야 유의미하다.
console.log("\n═══ ⑧ 사장님 퍼널 (CTA 클릭률) ═══");
try {
  const cv = (await sql.query(`SELECT count(*)::int pv FROM traffic_events
    WHERE path LIKE '/c/%' AND ts > now()-interval '30 days' AND anon_id NOT IN (${BOT_ANON_IDS_SQL})`))[0];
  const ev = await sql.query(`SELECT event, count(*)::int n FROM owner_funnel_events
    WHERE ts > now()-interval '30 days' GROUP BY 1`);
  const g = (e) => Number(ev.find((x) => x.event === e)?.n ?? 0);
  const cta = g("cta_click"), view = g("free_report_view"), submit = g("submit_success");
  const rate = cv.pv > 0 ? (cta / cv.pv * 100) : 0;
  const leads = (await sql.query(`SELECT count(*)::int n FROM owner_leads`).catch(() => [{ n: 0 }]))[0].n;
  const paid = (await sql.query(`SELECT count(*)::int n FROM subscriptions WHERE COALESCE(price,0) > 0`))[0].n;
  console.log(`  카페상세 ${Number(cv.pv).toLocaleString()} PV → CTA ${cta}회 = ${rate.toFixed(2)}% (이동 전 0.42%)`);
  console.log(`  → 리포트 도달 ${view} · 신청 ${submit} · 이메일 리드 ${leads} · 유료 ${paid}`);
  // 판정은 **상대 10% 이상 차이**일 때만. 표본이 20건대라 1~2건 차이는 노이즈다.
  //   (반올림한 "0.42"와 비교하면 20/4,732=0.4227%가 '상승'으로 잘못 뜬다 — 기준선은 원값으로 둔다.)
  const BASE = 20 / 4719 * 100; // 이동 전 원값 0.4238%
  const diff = (rate - BASE) / BASE;
  const verdict = Math.abs(diff) < 0.10 ? "= 유의미한 변화 없음" : diff > 0 ? `🟢 상승 ${(diff*100).toFixed(0)}%` : `🔻 하락 ${(-diff*100).toFixed(0)}%`;
  console.log(`  ${verdict}${cta < 30 ? " (표본 작음 — 한 달은 봐야 판정 가능)" : ""}`);
  // 아웃리치(DM 등)로 들어온 건 따로 — 0이면 '실패'가 아니라 '아직 안 보냄'일 수 있다.
  const out = (await sql.query(`SELECT count(*)::int n FROM owner_funnel_events
    WHERE event='free_report_view' AND source LIKE 'outreach_%' AND ts > now()-interval '30 days'`))[0].n;
  console.log(`  아웃리치 경유 유입: ${out}건${Number(out) === 0 ? " (발송 전이면 정상)" : ""}`);
} catch (e) { console.log("  집계 실패:", String(e).slice(0, 80)); }

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
