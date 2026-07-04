// 📧 온보딩 메일 재발송 (운영 도구) — 이미 승인된 구독 사장님에게 '내 카페 열쇠 + 전용 서비스 사용법'을
//   구독 상태를 건드리지 않고 다시 보낸다. 본문은 lib/onboardingEmail.ts 단일 출처.
//   실행: node --import tsx scripts/resend-onboarding.mjs --cafe "브라운테일" [--dry] [--out preview.html]
//        node --import tsx scripts/resend-onboarding.mjs --id 16
//   --dry: 발송하지 않고 대상·제목만 출력(+ --out 지정 시 HTML 파일로 미리보기 저장).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

// lib는 이 스크립트 옆(워크트리/메인 무관)에서, .env.local은 있는 곳에서(gitignore라 워크트리엔 없을 수 있음).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = [`${ROOT}/.env.local`, "/Users/wangwida/coffee-platform/web/.env.local"].find(existsSync);
if (!ENV_FILE) { console.error(".env.local 없음"); process.exit(1); }
const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8")
    .split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)).filter(Boolean)
    .map((m) => [m[1], m[2].trim()])
);
for (const k of ["PII_ENC_KEY", "RESEND_API_KEY", "RESEND_FROM", "NEXT_PUBLIC_SITE_URL"]) if (env[k]) process.env[k] = env[k];

const argv = process.argv.slice(2);
const arg = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const dry = argv.includes("--dry");
const outFile = arg("--out");
const cafeQ = arg("--cafe");
const idQ = arg("--id");

const sql = neon(env.DATABASE_URL);
const { decryptPII } = await import(`${ROOT}/lib/crypto.ts`);
const { renderOnboardingEmail } = await import(`${ROOT}/lib/onboardingEmail.ts`);

const rows = idQ
  ? await sql`SELECT * FROM subscriptions WHERE id=${Number(idQ)}`
  : cafeQ
  ? await sql`SELECT * FROM subscriptions WHERE cafe_name ILIKE ${"%" + cafeQ + "%"}`
  : [];
if (!rows.length) { console.error("대상 구독 없음 — --cafe 또는 --id 확인"); process.exit(1); }
if (rows.length > 1) { console.error(`대상 ${rows.length}건(모호). --id로 특정하세요:`, rows.map((r) => `${r.id}:${r.cafe_name}`).join(", ")); process.exit(1); }

const s = rows[0];
if (!s.pin) { console.error(`구독 #${s.id}에 PIN 없음(아직 미승인?). 활성화 후 재발송하세요.`); process.exit(1); }
const to = decryptPII(s.email || "");
const days = s.expires_at ? Math.max(1, Math.ceil((new Date(s.expires_at) - Date.now()) / 86400000)) : (s.plan?.includes("체험") ? 7 : 30);
const site = process.env.NEXT_PUBLIC_SITE_URL || "https://dongnecoffeenote.com";
const { subject, html } = renderOnboardingEmail({ cafeName: s.cafe_name, pin: s.pin, days, site });

console.log(`대상: #${s.id} ${s.cafe_name} (${s.owner_name}) · plan=${s.plan} · status=${s.status} · 남은 ${days}일`);
console.log(`수신: ${to || "(이메일 없음/복호화 실패)"}`);
console.log(`제목: ${subject}`);
if (outFile) { writeFileSync(outFile, html); console.log(`미리보기 저장: ${outFile}`); }

if (dry) { console.log("DRY RUN — 발송 안 함."); process.exit(0); }
if (s.status !== "active") { console.error(`status=${s.status} (active 아님) — 안전을 위해 발송 중단. 활성 구독만 재발송.`); process.exit(1); }
if (!to || !to.includes("@")) { console.error("유효한 수신 이메일 없음 — 발송 중단."); process.exit(1); }
if (!process.env.RESEND_API_KEY) { console.error("RESEND_API_KEY 없음 — 발송 불가."); process.exit(1); }

const r = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>", to: [to], subject, html }),
});
const body = await r.text();
if (r.ok) { console.log(`✅ 발송 성공: ${body}`); }
else { console.error(`❌ 발송 실패 ${r.status}: ${body}`); process.exit(1); }
