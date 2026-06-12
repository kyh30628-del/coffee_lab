// 자동 품질 감사: 공개 카페 랜덤 샘플링 → 제목에 다른 카페명 있으면 flagging
// 매일 새벽 자동 실행, 이상 발견 시 DB에 기록 → 관리자 화면에 표시
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);

// audit_flags 테이블 생성
await sql`CREATE TABLE IF NOT EXISTS audit_flags (
  id SERIAL PRIMARY KEY,
  cafe_id INT REFERENCES cafes(id) ON DELETE CASCADE,
  cafe_name TEXT,
  issue TEXT,
  detail TEXT,
  flagged_at TIMESTAMPTZ DEFAULT now(),
  resolved BOOLEAN DEFAULT false
)`;

// 기존 미해결 플래그 클리어 후 재검사
await sql`DELETE FROM audit_flags WHERE resolved = false`;

// 공개 카페 전체 샘플 (review 있는 것)
const cafes = await sql`
  SELECT id, name, synth_reviews_all 
  FROM cafes 
  WHERE published AND synth_reviews_all IS NOT NULL
  ORDER BY synth_count DESC NULLS LAST
  LIMIT 500`;

let flagged = 0;
const issues = [];

for (const cafe of cafes) {
  const reviews = typeof cafe.synth_reviews_all === "string"
    ? JSON.parse(cafe.synth_reviews_all) : (cafe.synth_reviews_all ?? []);
  
  // 제목에 카페명이 없는 리뷰 비율 체크
  const titled = reviews.filter(r => r.quote && r.quote.length > 20);
  if (titled.length < 3) continue;

  const cafeName = (cafe.name || "").replace(/\s/g, "");
  const cafeCore = cafeName.slice(0, Math.min(4, cafeName.length));
  
  // 카페명이 전혀 안 나오는 리뷰 비율
  const noMatch = titled.filter(r => {
    const q = (r.quote || "").replace(/\s/g, "");
    return !q.includes(cafeName) && !q.includes(cafeCore);
  });
  
  const ratio = noMatch.length / titled.length;
  if (ratio > 0.7 && titled.length >= 5) {
    // 70% 이상이 카페명 없으면 오염 의심
    const sample = noMatch.slice(0, 2).map(r => (r.quote || "").slice(0, 60)).join(" / ");
    issues.push({ cafe_id: cafe.id, name: cafe.name, ratio: Math.round(ratio * 100), sample });
    flagged++;
  }
}

// DB에 저장
for (const issue of issues) {
  await sql`INSERT INTO audit_flags (cafe_id, cafe_name, issue, detail)
    VALUES (${issue.cafe_id}, ${issue.name}, 'review_contamination',
      ${`카페명 불일치 ${issue.ratio}% (샘플: ${issue.sample})`})`;
}

// 결과 저장
await sql`INSERT INTO audit_flags (cafe_id, cafe_name, issue, detail)
  VALUES (NULL, 'SYSTEM', 'audit_complete',
    ${`감사완료: ${cafes.length}곳 검사 / ${flagged}곳 플래그`})`;

console.log(`감사완료: ${cafes.length}곳 검사 / ${flagged}곳 플래그`);
if (issues.length > 0) {
  console.log("플래그된 카페:");
  issues.slice(0,10).forEach(i => console.log(`  ${i.name}: ${i.ratio}% 불일치`));
}
