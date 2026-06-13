import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { synthAndStore } from "@/lib/synthStore";
export const runtime = "nodejs";
export const maxDuration = 60;

// 🛰️ 자율 운영 관제탑(Control Tower)
// 각 에이전트가 '만든 실제 데이터'로 가동 여부를 추론(거짓 불가) → 건강 판정 → 적체는 자가 치유 → 멈춤은 경보.
// 토큰 0. 규칙·집계만. ?heal=1 이면 합성 적체를 직접 메움(무료).

type AgentHealth = {
  key: string; label: string; lastRun: string | null; ageH: number | null;
  cadenceH: number; status: "ok" | "behind" | "stalled" | "idle" | "warn";
  queue: number; note: string;
};

const authed = (req: NextRequest) => {
  const pw = req.headers.get("x-admin-password");
  if (pw && pw === process.env.ADMIN_PASSWORD) return true;
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  return (!!secret && auth === `Bearer ${secret}`) || !secret;
};

function ageHours(ts: string | null, now: number): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return isNaN(t) ? null : (now - t) / 3.6e6;
}
// 가동 신선도 → 상태. ok: cadence*1.5내, behind: *3내, stalled: 그 이상
function freshness(ageH: number | null, cadenceH: number): "ok" | "behind" | "stalled" | "idle" {
  if (ageH == null) return "idle";
  if (ageH <= cadenceH * 1.5) return "ok";
  if (ageH <= cadenceH * 3) return "behind";
  return "stalled";
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS orchestrator_state (id INT PRIMARY KEY DEFAULT 1, health JSONB, updated_at TIMESTAMPTZ DEFAULT now())`;
    const now = Date.now();
    // 읽기(현황)는 비민감 → 공개. 자가치유(heal)는 비용 발생 가능 → 인증 필수.
    const heal = req.nextUrl.searchParams.get("heal") === "1" && authed(req);
    const healed: string[] = [];

    // ── 1) 신호 수집(에이전트가 만든 데이터) ──
    const c = (await sql`SELECT
      COUNT(*)::int total,
      COUNT(*) FILTER (WHERE published)::int published,
      COUNT(*) FILTER (WHERE raw_reviews IS NOT NULL)::int raw_cached,
      COUNT(*) FILTER (WHERE llm_judged_at IS NOT NULL)::int judged,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int embedded,
      MAX(raw_collected_at) last_collect,
      MAX(synth_updated) last_synth,
      MAX(llm_judged_at) last_judge,
      MAX(embed_updated) last_embed,
      COUNT(*) FILTER (WHERE raw_reviews IS NOT NULL AND synth_updated IS NULL)::int synth_q,
      COUNT(*) FILTER (WHERE published AND raw_reviews IS NOT NULL AND llm_judged_at IS NULL)::int judge_q,
      COUNT(*) FILTER (WHERE embedding IS NULL)::int embed_q
      FROM cafes`)[0] as any;
    const vr = (await sql`SELECT ran_at, fails, warns, status FROM verify_reports ORDER BY ran_at DESC LIMIT 1`)[0] as any;
    const af = (await sql`SELECT COUNT(*) FILTER (WHERE NOT resolved)::int open, MAX(flagged_at) last_flag FROM audit_flags`)[0] as any;
    const ds = (await sql`SELECT MIN(last_run) oldest, COUNT(*) FILTER (WHERE last_run < now() - interval '3 days')::int behind, COUNT(*)::int n FROM discovery_state`)[0] as any;

    // ── 2) 자가 치유: 합성 적체(raw 있는데 미합성) 메움 ──
    if (heal && c.synth_q > 0) {
      const todo = await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NOT NULL AND synth_updated IS NULL LIMIT 20`;
      let done = 0;
      for (const cf of todo as any[]) { try { await synthAndStore(cf, { refresh: false }); done++; } catch {} }
      if (done) healed.push(`합성 적체 ${done}건 처리`);
    }

    // ── 3) 에이전트별 건강 판정 ──
    const agents: AgentHealth[] = [];
    const add = (key: string, label: string, last: string | null, cadenceH: number, queue: number, note = "") => {
      const ageH = ageHours(last, now);
      let status: AgentHealth["status"] = freshness(ageH, cadenceH);
      agents.push({ key, label, lastRun: last, ageH: ageH == null ? null : Math.round(ageH * 10) / 10, cadenceH, status, queue, note });
    };
    add("collect", "수집 (warmup·grow)", c.last_collect, 16, c.synth_q, `발굴 지역 지연 ${ds.behind}/${ds.n}`);
    add("synth", "합성 (옥석·등급)", c.last_synth, 24, c.synth_q, c.synth_q ? "미합성 적체" : "적체 없음");
    add("judge", "AI 판정 (Haiku·새벽)", c.last_judge, 30, c.judge_q, `판정 대기 ${c.judge_q}`);
    add("embed", "임베딩", c.last_embed, 30, c.embed_q, `미임베딩 ${c.embed_q}`);
    add("verify", "검증 레드팀", vr?.ran_at ?? null, 30, (vr?.fails ?? 0) + (vr?.warns ?? 0), vr ? `fail ${vr.fails}·warn ${vr.warns}` : "리포트 없음");
    // 품질감사: 미해결 플래그 기준(가동 시각은 flag 생성 시각으로 근사)
    {
      const open = af?.open ?? 0;
      const aAge = ageHours(af?.last_flag ?? null, now);
      agents.push({ key: "audit", label: "품질 자가감사", lastRun: af?.last_flag ?? null, ageH: aAge == null ? null : Math.round(aAge * 10) / 10, cadenceH: 30, status: open > 0 ? "warn" : "ok", queue: open, note: open ? `미해결 오염 ${open}건` : "오염 없음" });
    }

    // ── 4) 종합 건강 ──
    const core = agents.filter((a) => ["collect", "synth", "judge"].includes(a.key));
    const overall = core.some((a) => a.status === "stalled") ? "critical"
      : agents.some((a) => a.status === "stalled" || a.status === "behind" || a.status === "warn") ? "degraded"
      : "healthy";
    const alerts = agents.filter((a) => a.status === "stalled").map((a) => `${a.label} 멈춤(${a.ageH}h 전 마지막 가동)`);

    const pct = (n: number) => (c.total ? Math.round((n / c.total) * 100) : 0);
    const health = {
      generatedAt: new Date(now).toISOString(),
      overall, alerts, healed,
      coverage: { total: c.total, published: c.published, rawCachedPct: pct(c.raw_cached), judgedPct: pct(c.judged), embeddedPct: pct(c.embedded) },
      agents,
    };

    await sql`INSERT INTO orchestrator_state (id, health, updated_at) VALUES (1, ${JSON.stringify(health)}, now())
      ON CONFLICT (id) DO UPDATE SET health = EXCLUDED.health, updated_at = now()`;

    return NextResponse.json({ ok: true, ...health });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
