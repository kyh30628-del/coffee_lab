// 👁️ 판정 집행 감시 — **공개 수의 순변동**만 본다. (2026-10-19)
//
// 🔴 왜 이 지표인가: 처음엔 `NOT published AND exclude_at > now()-10min`으로 "판정 비공개"를 셌는데
//   두 가지가 섞여 거짓 경보를 냈다(실측 277곳 보고 → 실제 신규 비공개 0곳).
//     ① 내가 직접 한 데이터 조작(1건 카페 320곳 되돌림)도 exclude_at을 now()로 찍는다.
//     ② **이미 비공개였던 카페**를 재합성하면 exclude_at이 갱신된다 — rescue 구간은 전부 미공개라
//        수거할 때마다 수백 곳의 exclude_at이 새로 찍힌다.
//   공개 수의 **순변동**은 이런 혼선이 없다. 소비자가 보는 것이 늘었나 줄었나를 그대로 말해준다.
//
// 사용: node --import tsx scripts/judge-watch.mjs [--log=/tmp/judge12.log]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const n = (v) => Number(v ?? 0).toLocaleString();
const STATE = "/tmp/judge-watch-state.json";
const [r] = await sql`SELECT count(*) FILTER (WHERE published)::int pub,
  count(*) FILTER (WHERE published AND COALESCE(synth_count,0) <= 1)::int thin,
  count(*) FILTER (WHERE llm_judged_at > now() - interval '5 min')::int m5,
  count(*) FILTER (WHERE published AND synth_grade = '후보')::int odd
  FROM cafes`;
const [s] = await sql`SELECT COALESCE(sum(cost_usd),0)::float spent, COALESCE(sum(rescued),0)::int resc, count(*)::int rows FROM judge_spend`;
let prev = null;
try { if (existsSync(STATE)) prev = JSON.parse(readFileSync(STATE, "utf8")); } catch {}
const d = prev ? r.pub - prev.pub : null;
writeFileSync(STATE, JSON.stringify({ pub: r.pub, at: Date.now() }));
const warn = [];
if (r.thin > 0) warn.push(`🔴 공개중 후기1건 ${n(r.thin)}곳`);           // CEO 지시: 1건은 비공개
if (r.odd > 0) warn.push(`🔴 공개중 '후보' 등급 ${n(r.odd)}곳`);          // 있어선 안 되는 상태
if (d !== null && d <= -50) warn.push(`🔴 공개 순감 ${n(-d)}곳`);         // 소비자 화면이 줄었다
console.log(`공개 ${n(r.pub)}${d === null ? "" : ` (${d >= 0 ? "+" : ""}${n(d)})`} · 재합성 분당 ${(r.m5 / 5).toFixed(0)}곳 · 구제 ${n(s.resc)}건 · $${s.spent.toFixed(4)}/100 (원장 ${s.rows}행)${warn.length ? " · " + warn.join(" · ") : ""}`);
