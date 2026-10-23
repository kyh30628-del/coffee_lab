#!/usr/bin/env node
// 🔄 "사람이 본 카페" 원본 재수집 — 네이버 신규 리뷰 반영 (2026-10-23 재설계)
//
// 왜 폐기했다가 다시 만드나: 10-17 사고로 재수집(refresh:true)이 누적 원본을 **덮어써서**
// 공개 카페 2곳의 근거를 171→36건으로 망가뜨렸다(scripts/refresh-viewed.mjs 삭제, 레인 폐기).
// CEO 지적(10-23): "네이버 리뷰는 계속 늘잖아. 효과적으로 가져와야 될 거 아냐" — 맞는 말이다.
// 그 사고 이후 근본 수리 두 겹이 이미 들어갔다(lib/synthStore.ts·evidenceMerge.ts, 테스트 13건):
//   ① mergeRawEvidence — 기존 ∪ 신규(덮어쓰기 아님). 중복은 링크/출처+제목으로 제거, 최신 우선 RAW_KEEP_MAX(600)건.
//   ② shouldBlockShrink — 공개 중인 카페는 새 집계가 기존보다 많이 줄면 **쓰기 자체를 거부**(화면 그대로 유지).
// 이 둘이 서 있으면 재수집은 더 이상 "덮어쓰기" 위험이 아니라 "새 글을 보태는" 정상 동작이다.
// 남은 건 **범위**뿐이었다 — 공개 50,699곳 전수를 매일 훑으면 네이버 하루 쿼터(25,000)를 혼자 다 쓴다.
//
// 🎯 대상 축소: **사람이 실제로 본 카페만** (실측 2026-10-23, traffic_events)
//   60일간 상세를 연 고유 카페 12,198곳 중 원본이 30일 넘은 곳 7,100곳.
//   안 보는 카페를 매일 새로고침해봐야 아무도 득을 안 본다 — 트래픽이 없으면 신선도도 무의미하다.
//
// 🔒 안전장치
//   ① naverBlocked() 선확인 — 발굴·수집과 쿼터를 공유하므로 소진 중엔 아예 안 돈다.
//   ② 예산 가드 — 최근 7일 평균 사용 18,830/25,000(여유 ~6,170). 하루 상한을 보수적으로 300곳만 잡는다
//      (실측 필요: 카페당 평균 호출 수는 아래 1회 실행 로그로 확정한다).
//   ③ synthAndStore가 이미 합치기(①)+급감차단(②)을 통과해야 쓴다 — 이 스크립트는 그 경로만 호출한다.
//   ④ --limit으로 상한, --dry로 미리보기.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { synthAndStore } = await import("../lib/synthStore.ts");
const { naverBlocked } = await import("../lib/naverBudget.ts");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split("=")[1]) : d; };
const LIMIT = arg("limit", 300);
const DRY = process.argv.includes("--dry");

if (await naverBlocked()) { console.log("쿼터 소진 — 오늘은 건너뜀"); process.exit(0); }

const rows = await sql`SELECT c.id, c.name, c.area, c.synth_count prev FROM cafes c
  JOIN (SELECT DISTINCT CAST(regexp_replace(path,'^/c/','') AS int) id FROM traffic_events
        WHERE path ~ '^/c/[0-9]+$' AND ts > now() - interval '60 days') v ON v.id = c.id
  WHERE c.published AND (c.raw_collected_at IS NULL OR c.raw_collected_at < now() - interval '30 days')
  ORDER BY c.raw_collected_at ASC NULLS FIRST LIMIT ${LIMIT}`;
console.log(`대상 ${rows.length}곳 (사람이 60일 내 본 카페 중 원본 30일+)`);
if (DRY) process.exit(0);

let grown = 0, same = 0, blocked = 0, err = 0;
for (const c of rows) {
  if (await naverBlocked()) { console.log(`쿼터 소진 — ${rows.indexOf(c)}곳에서 중단`); break; }
  try {
    await synthAndStore({ id: c.id, name: c.name, area: c.area ?? "" }, { refresh: true });
    const [a] = await sql`SELECT synth_count FROM cafes WHERE id=${c.id}`;
    const now = Number(a?.synth_count ?? 0), prev = Number(c.prev ?? 0);
    if (now > prev) grown++; else if (now === prev) same++; else blocked++;   // blocked = 급감차단이 막았거나 변동 없음
  } catch { err++; }
}
console.log(`완료 — 늘어남 ${grown} · 그대로 ${same} · 급감차단/감소 ${blocked} · 오류 ${err}`);
