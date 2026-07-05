import { sql } from "@/lib/db";

// 📏 화면 숫자 지표의 단일 출처(single source of truth).
//   같은 개념을 route마다 SQL로 복붙하면 정의가 갈라져 화면끼리 숫자가 어긋난다(유령/불일치 집계).
//   → 관제탑(orchestrator)·judge-status 등 여러 화면이 쓰는 지표는 반드시 여기서만 정의하고 import해서 쓴다.
//   ⚠️ Neon 태그드 템플릿은 SQL 조각(fragment) 합성이 불확실 → 조건은 함수 안에 통째로 인라인(파라미터 없음).

// 판정 대기: '실제 판정 대상'만 센다 = 위험군 게이트(cron-batch-judge)와 동일 정의.
//   ⚠️ '검증'(옥석 코어, 평균 85리뷰)은 규칙검증 완료라 AI 재판정을 '의도적으로 스킵'한다 → 대기 아님.
//   과거엔 검증 옥석까지 세서 절대 안 줄어드는 유령 백로그(3,674)로 보였음 → 화면·실제 판정범위 불일치. 이제 일치.
//   pending(공개 전 게이트) + 공개 비검증만 = 실제로 배치가 판정할 것.
export async function judgeQueueCount(): Promise<number> {
  const r = await sql`SELECT count(*) FILTER (
      WHERE (pipeline_status='pending' OR (published AND synth_grade IS DISTINCT FROM '검증'))
        AND raw_reviews IS NOT NULL
        AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at))::int n
    FROM cafes`;
  return Number((r[0] as any)?.n ?? 0);
}

// 오늘(KST 자정 기준) 신규발굴·판정·유튜브 처리 수.
//   ⚠️ UTC(CURRENT_DATE)로 세면 새벽 0~9시(KST)분이 어제로 빠져 실제보다 적게 보인다 → 반드시 KST 경계.
export async function dailyCounts(): Promise<{ newCafes: number; judged: number; yt: number }> {
  const r = await sql`SELECT
      count(*) FILTER (WHERE created_at    >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')::int new_cafes,
      count(*) FILTER (WHERE llm_judged_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')::int judged,
      count(*) FILTER (WHERE yt_checked_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')::int yt
    FROM cafes`;
  const x = r[0] as any;
  return { newCafes: Number(x?.new_cafes ?? 0), judged: Number(x?.judged ?? 0), yt: Number(x?.yt ?? 0) };
}
