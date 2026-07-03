// 로컬 리포트(agent-reports/*.md)를 org_reports 테이블로 밀어 Vercel(라운지)이 읽게 한다.
//   로컬 파일은 배포 안 되므로, 로컬에서 이 스크립트로 DB에 upsert.
//   사용: node --import tsx scripts/push-report.mjs <kind> <절대경로> [제목]
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");

const kind = process.argv[2], path = process.argv[3], title = process.argv[4] || kind;
if (!kind || !path) { console.error("사용: push-report.mjs <kind> <경로> [제목]"); process.exit(1); }
let md = "";
try { md = readFileSync(path, "utf8"); } catch (e) { console.error("파일 못읽음:", String(e).slice(0, 90)); process.exit(1); }
await sql`CREATE TABLE IF NOT EXISTS org_reports (kind TEXT PRIMARY KEY, title TEXT, md TEXT, updated_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
await sql`INSERT INTO org_reports (kind, title, md, updated_at) VALUES (${kind}, ${title}, ${md.slice(0, 40000)}, now())
  ON CONFLICT (kind) DO UPDATE SET title=EXCLUDED.title, md=EXCLUDED.md, updated_at=now()`;
console.log(`✅ ${kind} 푸시 완료 (${md.length}자)`);
process.exit(0);
