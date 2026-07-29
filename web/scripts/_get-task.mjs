import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, title, detail, action_params FROM decisions WHERE id=536`;
console.log(JSON.stringify(rows, null, 2));
