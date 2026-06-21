import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { collectAndSynthesize } = await import("../lib/collectOrchestrator.ts");
const sql = neon(process.env.DATABASE_URL);
delete process.env.ANTHROPIC_API_KEY;

// ID만 먼저 가져오기 (가벼움)
const ids = await sql`SELECT id, name, area FROM cafes WHERE published=true AND raw_reviews IS NOT NULL AND synth_reviews_all IS NULL ORDER BY synth_count DESC NULLS LAST`;
console.log(`대상: ${ids.length}곳`);

let done = 0, skip = 0;

async function one(c) {
  try {
    // 한 카페씩 raw_reviews 가져오기
    const row = (await sql`SELECT raw_reviews FROM cafes WHERE id=${c.id}`)[0];
    const raw = typeof row?.raw_reviews === "string" ? JSON.parse(row.raw_reviews) : (row?.raw_reviews ?? []);
    if (!raw.length) { skip++; return; }
    const texts = raw.map((r) => ({
      text: r.desc ?? r.text ?? r.quote ?? "",
      title: r.title ?? "",
      link: r.link ?? null, date: r.date ?? null, source: r.source ?? "naver",
    })).filter(t => t.text?.length > 5);
    if (!texts.length) { skip++; return; }
    const areaTerms = [(c.area ?? "").replace(/(특별시|광역시|시|도)$/, "").trim()];
    const result = collectAndSynthesize(c.name, areaTerms, [{ source: "naver", texts }]);
    const allEv = result.allEvidence ?? result.evidenceReviews;
    await sql`UPDATE cafes SET synth_reviews_all=${JSON.stringify(allEv)} WHERE id=${c.id}`;
    done++;
    if (done % 200 === 0) console.log(`  …${done}/${ids.length}`);
  } catch (e) { skip++; }
}

// 병렬 4개씩 (DB 과부하 방지)
for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i+4).map(one));
console.log(`완료: ${done}곳 / 스킵 ${skip}`);
