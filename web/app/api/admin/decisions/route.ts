import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 🔔 결재 항목 — 자율 조직이 올린 '구조화된 의사결정'. 위임전결(DoA) 4단계로 라우팅:
//   L0 실무 자율(decisions 안 거침) · L1 본부 전결 · L2 기조실장 전결 · L3 CEO 결재(치명적·비가역).
//   CEO 모바일엔 **L3만** 결재 대기로 노출 → 운영결정에 안 시달림. L1/L2는 '전결 처리됨(FYI)'로만 보임.
//   action_type: unpublish | downgrade | restore | requeue_resynth | agent_task(기조실장 배분)
async function ensure() {
  await sql`CREATE TABLE IF NOT EXISTS decisions (
    id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(),
    title TEXT, detail TEXT, team TEXT, severity TEXT,
    action_type TEXT, action_params JSONB,
    status TEXT DEFAULT 'pending', decided_at TIMESTAMPTZ, result TEXT,
    tier TEXT, decided_by TEXT
  )`.catch(() => {});
  await sql`ALTER TABLE decisions ADD COLUMN IF NOT EXISTS tier TEXT`.catch(() => {});
  await sql`ALTER TABLE decisions ADD COLUMN IF NOT EXISTS decided_by TEXT`.catch(() => {});
  await sql`ALTER TABLE decisions ADD COLUMN IF NOT EXISTS recommendation TEXT`.catch(() => {}); // 💬 기조실장 의견(결재 참고)
}

export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    await ensure();
    // CEO 결재 대기 = L3(치명적·비가역)만. tier 없는 레거시는 안전하게 L3 취급.
    const pending = await sql`SELECT id,title,detail,team,severity,action_type,action_params,tier,recommendation FROM decisions WHERE status='pending' AND COALESCE(tier,'L3')='L3' ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MED' THEN 1 ELSE 2 END, created_at DESC` as any[];
    // 하위 전결(L1 본부·L2 기조실장) 처리분 — CEO엔 FYI(가시성만, 결재 불요).
    const delegated = await sql`SELECT id,title,team,tier,COALESCE(decided_by, CASE tier WHEN 'L1' THEN '본부 전결' WHEN 'L2' THEN '기조실장 전결' ELSE '전결' END) decided_by,status,to_char(COALESCE(decided_at,created_at),'MM-DD HH24:MI') at FROM decisions WHERE tier IN ('L1','L2') ORDER BY COALESCE(decided_at,created_at) DESC LIMIT 8` as any[];
    // 🔧 실행 중 — 승인됐지만 아직 완료 안 된 실무형(agent_task·route_coord). CEO가 '진행 중인 실제 일'을 한눈에(끝남/진행중/막힘 구분).
    const inProgress = await sql`SELECT id,title,team,action_type,tier,to_char(created_at,'MM-DD HH24:MI') at,
        round(extract(epoch from (now()-created_at))/3600)::int age_h
      FROM decisions WHERE status='approved' AND action_type IN ('agent_task','route_coord') ORDER BY created_at ASC` as any[];
    // 최근 처리 = 종료된 것만(진행중은 위 inProgress로 분리 — 중복 표시 방지).
    const recent = await sql`SELECT id,title,status,result,tier,to_char(decided_at,'MM-DD HH24:MI') decided FROM decisions WHERE status IN ('done','rejected','failed') ORDER BY decided_at DESC LIMIT 8` as any[];
    return NextResponse.json({ ok: true, pending, delegated, recent, inProgress }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
