#!/usr/bin/env node
// 📈 신규 개방 지역 유입 분석 — 강원(8/25)·충청(9/3)·부산·경남(9/6)이 사람에게 실제로 닿았는지.
//   실행: node scripts/region-traffic.mjs [--days=30]
//
// 🔴 절대원칙([[reference_traffic_analysis]]): 봇·내부 제외는 `lib/behaviorBot.ts`의 **BOT_ANON_IDS_SQL 단일출처**만 쓴다.
//    그 값이 곧 `SELECT anon_id FROM bot_anon_cache` 이고, 여기서도 **그 문장을 그대로** 쓴다(로컬 재정의 금지).
//    캐시 갱신은 관제·크론 진입부가 한다 — 이 스크립트는 읽기만 한다(갱신 시각도 함께 보고).
// 🔴 카운팅 기준: 사람 수 = distinct anon_id(브라우저 저장소 UUID). 재방문 = user_consents.sessions >= 2.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const val = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim().replace(/^['"]|['"]$/g, "");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(val("DATABASE_URL"));
const DAYS = Number((process.argv.find((a) => a.startsWith("--days=")) || "").split("=")[1] || 30);

// 지역 라벨(area) → 시도. 카페 주소에서 만든다(단일 사실: 실주소).
const SIDO_OF = (addr) => {
  const s = String(addr || "");
  for (const [p, v] of [["서울", "서울"], ["인천", "인천"], ["경기", "경기"], ["강원", "강원"], ["대전", "대전"], ["세종", "세종"], ["충청남", "충남"], ["충청북", "충북"], ["부산", "부산"], ["경상남", "경남"]]) if (s.startsWith(p)) return v;
  return "기타";
};
const NEW_REGIONS = { 강원: "2026-08-25", 충남: "2026-09-03", 충북: "2026-09-03", 대전: "2026-09-03", 세종: "2026-09-03", 부산: "2026-09-06", 경남: "2026-09-06" };

const cafes = await sql`SELECT id, area, address FROM cafes WHERE address IS NOT NULL AND address <> ''`;
const sidoByArea = new Map(); const sidoById = new Map();
for (const c of cafes) {
  const s = SIDO_OF(c.address);
  sidoById.set(String(c.id), s);
  if (c.area && !sidoByArea.has(c.area)) sidoByArea.set(c.area, s);
}

// 봇·내부 제외(단일출처) + 지역 귀속 가능한 페이지뷰만
const rows = await sql`
  SELECT te.anon_id, te.path, te.src, te.ts::date AS d
  FROM traffic_events te
  WHERE te.ts >= now() - (${DAYS} || ' days')::interval
    AND te.anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)
    AND (te.path LIKE '/area/%' OR te.path LIKE '/c/%')`;

const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const sidoOfPath = (p) => {
  if (p.startsWith("/c/")) return sidoById.get((p.split("/")[2] || "").split("?")[0]) || null;
  if (p.startsWith("/area/")) return sidoByArea.get(dec((p.split("/")[2] || "").split("?")[0])) || null;
  return null;
};

const per = new Map(); // 시도 → { views, people:Set, src:Map, days:Set }
for (const r of rows) {
  const s = sidoOfPath(r.path);
  if (!s) continue;
  if (!per.has(s)) per.set(s, { views: 0, people: new Set(), src: new Map(), days: new Set() });
  const o = per.get(s);
  o.views++; o.people.add(r.anon_id); o.days.add(String(r.d));
  const k = r.src || "(미상)"; o.src.set(k, (o.src.get(k) || 0) + 1);
};

// 재방문(브라우저를 다시 켠 사람) — user_consents.sessions >= 2
const allPeople = [...new Set([...per.values()].flatMap((o) => [...o.people]))];
const rev = new Set((await sql`SELECT anon_id FROM user_consents WHERE anon_id = ANY(${allPeople}) AND COALESCE(sessions,0) >= 2`).map((r) => r.anon_id));

console.log(`\n📈 지역별 유입 (최근 ${DAYS}일 · 봇·내부 제외: bot_anon_cache 단일출처 · 기준=사람(anon_id))`);
console.log("시도".padEnd(6) + "사람".padStart(6) + "페이지뷰".padStart(9) + "재방문".padStart(7) + "활동일".padStart(7) + "  개방일 · 주요 유입");
const order = ["서울", "경기", "인천", "강원", "충남", "충북", "대전", "세종", "부산", "경남", "기타"];
for (const s of order) {
  const o = per.get(s); if (!o) continue;
  const back = [...o.people].filter((p) => rev.has(p)).length;
  const top = [...o.src.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(s.padEnd(6) + String(o.people.size).padStart(6) + String(o.views).padStart(9) +
    String(back).padStart(7) + String(o.days.size).padStart(7) + `  ${NEW_REGIONS[s] ? "🆕 " + NEW_REGIONS[s] : "기존"} · ${top}`);
}

// 위치동의 — 동의한 사람이 어느 지역에서 왔나
const consents = await sql`
  SELECT region, count(*)::int n
  FROM user_consents
  WHERE agreed IS TRUE AND region IS NOT NULL AND region <> ''
    AND last_seen >= now() - (${DAYS} || ' days')::interval
    AND anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)
  GROUP BY 1 ORDER BY 2 DESC`;
const bySido = new Map();
for (const c of consents) {
  const s = sidoByArea.get(c.region) || SIDO_OF(c.region) || "기타";
  bySido.set(s, (bySido.get(s) || 0) + c.n);
}
const totC = consents.reduce((a, b) => a + b.n, 0);
console.log(`\n📍 위치동의(사람이 '내 위치'를 허용한 브라우저) — 최근 ${DAYS}일 ${totC}건`);
console.log("  시도별: " + ([...bySido.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ") || "없음"));
console.log("  지역 상세: " + (consents.slice(0, 12).map((c) => `${c.region} ${c.n}`).join(" · ") || "없음"));
const newC = [...bySido.entries()].filter(([k]) => NEW_REGIONS[k]).reduce((a, b) => a + b[1], 0);
console.log(`  🆕 신규 개방 지역(강원·충청·부산·경남) 위치동의: ${newC}건`);
