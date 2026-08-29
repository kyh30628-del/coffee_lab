#!/usr/bin/env node
// 📇 사장님 아웃리치 킷 생성기 (B안 — "사장님이 있는 곳으로 나간다").
//
// 2026-08-27에 한 번 손으로 만든 킷(100곳)을 **재생성 가능한 스크립트**로 만든다.
//   손으로 만든 킷은 순위·후기수가 그날 기준으로 굳어, 며칠만 지나도 DM 문구의 숫자가 틀린다.
//   사장님께 "414곳 중 1위"라고 보냈는데 실제로 3위면 그 자리에서 신뢰를 잃는다.
//
// 🎯 링크에 `?src=dm`을 붙인다 — 지금까지 전부 "free_report"로만 찍혀서 DM 100건을 보내도
//   그 성과를 분리할 수 없었다(Track.tsx가 화이트리스트로 받아 outreach_dm 으로 기록).
//
// ⚠️ 발송은 사람이 한다. 이 스크립트는 **문구와 링크만** 만든다.
//    하루 10~15건 이하 권장(동일 링크 대량 DM = 인스타 스팸 처리 위험).
//
// 사용: node --import tsx scripts/outreach-kit.mjs [대상수]

import { readFileSync, writeFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { sql } = await import("../lib/db.ts");

const N = Number(process.argv[2]) || 100;
const SITE = "https://dongnecoffeenote.com";
const AXIS = { roast: "직접로스팅", work: "작업하기 좋은", quiet: "조용한", dessert: "디저트",
  mood: "분위기", space: "넓은공간", pet: "애견동반", brunch: "브런치", view: "뷰 좋은",
  bakery: "베이커리", terrace: "테라스·야외" };

// 대상: 인스타 있고·미구독·동네 순위 상위. 후기 많은 순.
// ⚠️ 순위·분모는 **리포트 화면(/owner/r/[id])과 반드시 같은 산식**이어야 한다.
//   화면은 "그 지역 공개 카페 전체" 안에서 순위를 내고 동점은 id로 타이브레이크한다.
//   여기서 필터링된 부분집합으로 세면 분모가 작아져(실측: 화성시 414 → 106) DM 숫자가 화면과 어긋난다.
//   사장님이 링크를 열자마자 숫자가 다르면 그 자리에서 신뢰를 잃는다.
const rows = await sql`
  WITH ranked AS (
    SELECT c.id, c.name, c.area, c.dong, c.instagram_url, c.synth_count, c.char_scores, c.synth_grade,
           RANK() OVER (PARTITION BY c.area ORDER BY COALESCE(c.synth_count,0) DESC, c.id ASC) rk,
           COUNT(*) OVER (PARTITION BY c.area) area_n
    FROM cafes c WHERE c.published = true
  )
  SELECT * FROM ranked
  WHERE rk <= 10 AND synth_grade = '검증'
    AND instagram_url IS NOT NULL AND instagram_url <> ''
    AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.cafe_id = ranked.id)
  ORDER BY synth_count DESC NULLS LAST LIMIT ${N}`;

const strengthOf = (cs) => {
  if (!cs || typeof cs !== "object") return null;
  const top = Object.entries(cs).filter(([k]) => k in AXIS).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  return top && Number(top[1]) > 0 ? AXIS[top[0]] : null;
};
// 한국어 조사 — 받침이 있으면 '이', 없으면 '가'. 이걸 안 하면 "혜경궁베이커리이(가)"처럼 나간다.
const josaIGa = (w) => {
  const ch = String(w || "").trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return "가"; // 한글이 아니면(영문·숫자) 기본형
  return (code - 0xac00) % 28 !== 0 ? "이" : "가";
};

const handle = (u) => {
  const m = String(u || "").match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  return m ? `@${m[1]}` : null;
};

const today = new Date().toISOString().slice(0, 10);
const out = [`# 사장님 아웃리치 킷 — ${today}`, "",
  `**대상**: 동네 검증후기 순위 10위 안 + 인스타 보유 + 미구독, ${rows.length}곳(후기 많은 순)`,
  `**사용법**: 인스타 DM 복붙. 링크 = 가입 없이 열리는 그 카페 전용 무료 리포트.`,
  `**🎯 링크에 \`?src=dm\`이 붙어 있다** — 이게 있어야 관제탑에서 DM 성과가 따로 잡힌다. 지우지 말 것.`,
  `**⚠️ 하루 10~15건 이하 권장** — 동일 링크 대량 DM은 인스타 스팸 처리 위험. 문구를 조금씩 변형 권장.`,
  `**⚠️ 숫자는 ${today} 기준** — 며칠 지나면 순위가 바뀔 수 있으니 다시 생성해서 쓸 것.`, "", "---", ""];

let n = 0;
for (const r of rows) {
  const h = handle(r.instagram_url);
  if (!h) continue;
  const st = strengthOf(r.char_scores);
  const link = `${SITE}/owner/r/${r.id}?src=dm`;
  n++;
  out.push(`## ${r.name} — ${r.area}${r.dong ? " " + r.dong : ""} · ${h}`);
  out.push(`순위 ${r.rk}/${r.area_n} · 후기 ${r.synth_count}건(검증)${st ? ` · 강점 ${st}` : ""}`);
  out.push(`리포트: ${link}`);
  out.push("```");
  out.push(`안녕하세요, 동네 카페를 후기 데이터로 소개하는 '동네 커피 노트'입니다 ☕`);
  out.push(`${r.area} 후기를 정리하다 보니 ${r.name}${josaIGa(r.name)} ${r.area} 카페 ${r.area_n}곳 중 검증 후기 ${r.rk}위더라고요.`);
  if (st) out.push(`특히 '${st}' 이야기가 많았어요.`);
  out.push(`사장님 가게만의 데이터(동네 순위·강점·손님들이 하는 말)를 무료 리포트로 정리해뒀습니다.`);
  out.push(`가입 없이 바로 보실 수 있어요: ${link}`);
  out.push("```");
  out.push("");
}

const path = `/Users/wangwida/coffee-platform/agent-reports/outreach-kit-${today.replace(/-/g, "")}.md`;
writeFileSync(path, out.join("\n"));
console.log(`✅ ${n}곳 · ${path}`);
