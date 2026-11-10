import { NextRequest, NextResponse } from "next/server";
import { recordRun } from "@/lib/agentLog";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization");
    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const base = new URL(req.url).origin;
    let totalRecorded = 0, rounds = 0;
    while (rounds < 30) {
      const r = await fetch(`${base}/api/snapshot-record`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
        body: JSON.stringify({ limit: 50 }),
      });
      // 🔧 비JSON 응답(플랫폼 타임아웃/오류 텍스트)에 SyntaxError로 죽지 않고, 원인(상태코드·앞부분)을 남기며 지금까지 기록분은 보존한다.
      const raw = await r.text();
      let d: any;
      try { d = JSON.parse(raw); } catch {
        throw new Error(`snapshot-record 비JSON 응답 HTTP ${r.status} (${rounds + 1}라운드, 누적 ${totalRecorded}): ${raw.slice(0, 80)}`);
      }
      totalRecorded += d.recorded ?? 0;
      rounds++;
      if ((d.remaining ?? 0) === 0 || (d.recorded ?? 0) === 0) break;
      await new Promise((x) => setTimeout(x, 300));
    }
    await recordRun("cron-snapshot", true, `스냅샷 ${totalRecorded} ${rounds}라운드`, totalRecorded);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), totalRecorded, rounds });
  } catch (e) {
    await recordRun("cron-snapshot", false, `에러: ${String(e).slice(0, 120)}`).catch(() => {});
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
