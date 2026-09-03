import { NextRequest, NextResponse } from "next/server";
import { sql , ensureOnce } from "@/lib/db";

export const runtime = "nodejs";

// 🔔 결재 항목 — 자율 조직이 올린 '구조화된 의사결정'. 위임전결(DoA) 4단계로 라우팅:
//   L0 실무 자율(decisions 안 거침) · L1 본부 전결 · L2 기조실장 전결 · L3 CEO 결재(치명적·비가역).
//   CEO 모바일엔 **L3만** 결재 대기로 노출 → 운영결정에 안 시달림. L1/L2는 '전결 처리됨(FYI)'로만 보임.
//   action_type: unpublish | downgrade | restore | requeue_resynth | set_offctx(offctx_ok 토글) | agent_task(기조실장 배분)
async function ensure() {
  // 💰 2026-08-20 전수 적용: 이 함수 일부는 메모 플래그조차 없어 **매 요청** DDL이 돌았다 — 배포 단위 1회로.
  await ensureOnce("admin_decisions.ensure", async () => {
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
  // 🚧 action_type 오분류 재발방지 게이트(#400) — 코드수정 상신이 'agent_task'/'investigate'로 등록되면
  //   scripts/dev-claim.mjs가 영구 미픽업(07-03·07-05·07-08·07-11·07-18 5회+ 재발, 상신 경로마다 텍스트
  //   지침 재공지로는 전파 안 됨 확인됨). 상신 주체(에이전트 종류)와 무관하게 DB 레이어에서 일괄 정규화.
  // 🩹 #794: 파일확장자(.mjs/.tsx?) 매칭은 title에서만 — detail 안 참조성 언급(예: #742 "원인추정(instagram-
  //   backfill.mjs 오매칭)"은 데이터정정 작업이 근거로 코드파일을 언급한 것뿐, 그 파일을 고치라는 게 아님)이
  //   데이터작업을 dev_task로 오분류(#742→4일 스톨). "코드 수정" 문구는 명시적 의도 표현이라 title/detail
  //   어디든 매칭 유지(#780류: detail에만 "정식 코드수정 결재로 상신" 있어도 정탐 필요).
  await sql`CREATE OR REPLACE FUNCTION decisions_normalize_action_type() RETURNS trigger AS $fn$
    DECLARE
      orig TEXT;
    BEGIN
      IF NEW.action_type IN ('agent_task', 'investigate')
         AND (COALESCE(NEW.title, '') ~* '\\.tsx?\\M|\\.mjs\\M|코드\\s*수정'
              OR COALESCE(NEW.detail, '') ~* '코드\\s*수정') THEN
        orig := NEW.action_type;
        NEW.action_type := 'dev_task';
        NEW.action_params := COALESCE(NEW.action_params, '{}'::jsonb)
          || jsonb_build_object('action_type_gate_400', jsonb_build_object('from', orig, 'at', now()));
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql`.catch(() => {});
  await sql`DROP TRIGGER IF EXISTS trg_decisions_normalize_action_type ON decisions`.catch(() => {});
  await sql`CREATE TRIGGER trg_decisions_normalize_action_type
    BEFORE INSERT ON decisions
    FOR EACH ROW EXECUTE FUNCTION decisions_normalize_action_type()`.catch(() => {});
  // 🚧 #945: status 이탈 재발방지 게이트 — LLM 에이전트가 자유 SQL INSERT 시 상태값을
  //   pending 대신 proposed/investigate 등으로 자연어 추정해 적어 CEO 결재큐(status='pending' 필터)·
  //   L2 자동집행 밖으로 새는 구조적 갭(#901·#927·#928·#931, 발견까지 24~27h 지연 반복).
  //   상신 주체·스크립트와 무관하게 DB 레이어에서 유효 상태값 집합 밖은 pending으로 정규화(원값은 보존).
  await sql`CREATE OR REPLACE FUNCTION decisions_normalize_status() RETURNS trigger AS $fn$
    BEGIN
      IF NEW.status IS NULL OR NEW.status NOT IN ('pending','approved','done','rejected','deferred','resolved','failed') THEN
        NEW.action_params := COALESCE(NEW.action_params, '{}'::jsonb)
          || jsonb_build_object('status_gate_945', jsonb_build_object('from', NEW.status, 'at', now()));
        NEW.status := 'pending';
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql`.catch(() => {});
  await sql`DROP TRIGGER IF EXISTS trg_decisions_normalize_status ON decisions`.catch(() => {});
  await sql`CREATE TRIGGER trg_decisions_normalize_status
    BEFORE INSERT ON decisions
    FOR EACH ROW EXECUTE FUNCTION decisions_normalize_status()`.catch(() => {});
  });
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
      FROM decisions WHERE status='approved' AND action_type IN ('agent_task','route_coord','investigate') ORDER BY created_at ASC` as any[];
    // 최근 처리 = 종료된 것만(진행중은 위 inProgress로 분리 — 중복 표시 방지).
    const recent = await sql`SELECT id,title,status,result,tier,to_char(decided_at,'MM-DD HH24:MI') decided FROM decisions WHERE status IN ('done','rejected','failed') ORDER BY decided_at DESC LIMIT 8` as any[];
    // ⏸️ 보류·기타 종결 — status='deferred'/'resolved'는 pending/delegated/inProgress/recent 어디에도 안 잡혀
    //   '보이지 않는 림보'가 됨(감사 #27·#30·#33·#34) → CEO 가시성 확보용으로 별도 노출.
    const deferred = await sql`SELECT id,title,team,tier,status,to_char(created_at,'MM-DD HH24:MI') created_at,recommendation FROM decisions WHERE status IN ('deferred','resolved') ORDER BY decisions.created_at DESC` as any[];
    return NextResponse.json({ ok: true, pending, delegated, recent, inProgress, deferred }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
