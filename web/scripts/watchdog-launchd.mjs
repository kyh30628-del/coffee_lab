// 🐶 **등재 워치독** — "만들어 놓은 자율 서비스가 실제로 스케줄러에 올라가 있는가"를 본다.
//   (2026-10-16, CEO "내가 자율 서비스들을 다 만들었는데 제대로 작동을 안 시킨다")
//
// 왜 필요한가(10-04~10-15 사고 실측):
//   · plist 파일은 전부 그대로 있었는데 **launchd에 등재(bootstrap)만 안 돼** 있었다. 파일을 보면 "있다"고 보인다.
//   · 그 결과 조직 전체 실행량이 run_ledger 기준 10-03 67건/33종 → **10-04~09 1건/1종**으로 붕괴.
//   · 그런데 감시자(cron-selfaudit)도 같은 정지에 들어가 **12일간 경보 0건**이었다.
//   · 기존 로컬 워치독(run-trigger-watch.sh)은 cron-selfaudit '신선도'만 봤다 — **등재 여부는 아무도 안 봤다.**
//
// 설계 원칙(이 사고에서 배운 것):
//   ① 감시자는 감시대상의 스위치를 공유하지 않는다 → 이 스크립트는 LLM·Vercel·cron_gate에 의존하지 않는다.
//   ② '없음'과 '안 봄'을 구분한다 → launchctl 조회 자체가 실패하면 조용히 통과시키지 않고 그렇다고 말한다.
//   ③ 경보는 **사람에게 닿는 채널**로 간다 → DB에만 쌓으면 12일간 아무도 안 본다(실제로 그랬다).
//      macOS 알림(비용 0·외부 의존 0)은 auth_alarm이 쓰는 것과 같은, 지금 유일하게 즉시 닿는 채널이다.
//
// 💰 비용: launchctl 로컬 호출 N회(0원) + DB 1쿼리. Vercel 함수 호출 0. LLM 0.
// 실행: run-trigger-watch.sh(= com.coffee.audit-watch, KST 08·12·16·20시)가 함께 호출한다.
//   새 launchd 잡을 만들지 않는다 — 감시기를 늘리면 그 감시기를 또 감시해야 한다.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const ROOT = "/Users/wangwida/coffee-platform";
const envRaw = readFileSync(`${ROOT}/web/.env.local`, "utf8");
for (const line of envRaw.split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { RETIRED_JOBS, JOB_TEAM } = await import("../lib/jobTeams.ts");

// 📌 **"등재돼야 하는 것"의 단일 출처 = plist 파일 그 자체.**
//   처음엔 jobTeams.ts의 LAUNCHD_JOBS(손으로 관리하는 목록)를 썼는데 대상이 7개뿐이었다 —
//   permit-resume·trigger-listener·no-sleep·neon-hourly·collect-catchup·morning-sweep-report는
//   plist가 멀쩡히 있는데도 목록에 없어 **사라져도 모르는** 상태였다(그중 permit-resume이 실제로 미등재였다).
//   손으로 관리하는 목록은 언젠가 반드시 실물과 어긋난다 → 실물(파일)을 진실로 삼는다.
//   `.disabled`·`.bak`은 "일부러 내려둔 것"이라는 선언이므로 제외한다(정확히 `.plist`로 끝나는 것만).
const LA_DIR = `${process.env.HOME}/Library/LaunchAgents`;
const declared = readdirSync(LA_DIR)
  .filter((f) => /^com\.coffee\.[A-Za-z0-9._-]+\.plist$/.test(f))
  .map((f) => f.replace(/^com\.coffee\./, "").replace(/\.plist$/, ""));

const notify = (title, msg) => {
  try {
    execFileSync("/usr/bin/osascript", ["-e",
      `display notification ${JSON.stringify(msg)} with title ${JSON.stringify(title)} sound name "Basso"`]);
  } catch { /* 알림 실패가 감시를 멈추게 하지 않는다 */ }
};

// ① 등재 점검 — 은퇴한 잡은 안 올라가 있는 게 정상이므로 제외한다.
const expected = declared.filter((j) => !RETIRED_JOBS.has(j));
const missing = [];
let probeBroken = false;
for (const job of expected) {
  const label = `com.coffee.${job}`;
  try {
    execFileSync("/bin/launchctl", ["list", label], { stdio: ["ignore", "ignore", "ignore"] });
  } catch (e) {
    // launchctl은 "미등재"에도 "launchctl 자체 고장"에도 0이 아닌 코드를 준다.
    // 원칙② — 구분이 안 되면 통과시키지 않는다. status가 없으면 조회 자체를 의심한다.
    if (e?.status == null) probeBroken = true;
    else missing.push({ job, label, team: JOB_TEAM[job] ?? "미배정" });
  }
}

// ② 조직 실행량 붕괴 점검 — 등재돼 있어도 실제로 안 돌면 의미가 없다.
//   오늘 돈 '잡 종류 수'를 직전 7일 중간값과 견준다(건수는 시각에 따라 흔들려 종류 수가 더 안정적이다).
let volume = null;
try {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  // ⚠️ 날짜 비교는 **전부 SQL에서 문자열로** 만든다. 처음엔 `::date`를 받아 JS에서 String()으로 비교했는데
  //   드라이버가 Date 객체를 줘서 "Fri Oct 16 2026…" vs "2026-10-16"이 영영 안 맞았다 →
  //   오늘 29종이 돌았는데 **0종으로 읽어 '붕괴' 오경보**를 냈다(2026-10-16 테스트에서 잡음).
  const rows = await sql`
    SELECT to_char(started_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') d,
           to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') today,
           count(DISTINCT job)::int jobs
    FROM run_ledger
    WHERE started_at > now() - interval '8 days'
    GROUP BY 1, 2 ORDER BY 1`;
  const today = rows[0]?.today ?? null;
  const cur = rows.find((r) => r.d === today)?.jobs ?? 0;
  const past = rows.filter((r) => r.d !== today).map((r) => r.jobs).sort((a, b) => a - b);
  const med = past.length ? past[Math.floor(past.length / 2)] : 0;
  volume = { cur, med, collapsed: med >= 10 && cur < med * 0.5 };
} catch (e) {
  volume = { err: String(e).slice(0, 120) };
}

// ③ 보고 — 사람이 읽는 한 줄 + 하트비트(관제탑) + 문제일 때만 알림.
const lines = [];
if (missing.length) {
  lines.push(`🔴 launchd 미등재 ${missing.length}개: ` + missing.map((m) => `${m.job}(${m.team})`).join(", "));
}
if (probeBroken) lines.push("🔴 launchctl 조회 자체 실패 — 등재 여부를 '확인하지 못했다'(정상 아님)");
if (volume?.err) lines.push(`🔴 실행량 조회 실패: ${volume.err}`);
else if (volume?.collapsed) lines.push(`🔴 조직 실행량 붕괴 — 오늘 잡 ${volume.cur}종 vs 직전 7일 중간값 ${volume.med}종`);

const bad = lines.length > 0;
console.log(`[${new Date().toISOString()}] 등재 워치독 — 대상 ${expected.length}개 · ` +
  (bad ? lines.join(" | ") : `정상(미등재 0 · 오늘 잡 ${volume?.cur ?? "?"}종/중간값 ${volume?.med ?? "?"}종)`));

if (bad) {
  notify("동네 커피 노트 — 자율조직 정지",
    missing.length ? `launchd 미등재 ${missing.length}개: ${missing.map((m) => m.job).join(", ")}`
                   : lines[0].replace(/^🔴 /, ""));
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    await sql`INSERT INTO agent_runs (job, ran_at, ok, detail) VALUES ('audit-watch', now(), false, ${lines.join(" | ").slice(0, 500)})`;
  } catch { /* 기록 실패가 알림을 되돌리지 않는다 */ }
}
process.exit(0); // 워치독 실패가 부모 사이클을 죽이지 않는다
