import { sql } from "@/lib/db";

// 📏 화면 숫자 지표의 단일 출처(single source of truth).
//   같은 개념을 route마다 SQL로 복붙하면 정의가 갈라져 화면끼리 숫자가 어긋난다(유령/불일치 집계).
//   → 관제탑(orchestrator)·judge-status 등 여러 화면이 쓰는 지표는 반드시 여기서만 정의하고 import해서 쓴다.
//   ⚠️ Neon 태그드 템플릿은 SQL 조각(fragment) 합성이 불확실 → 조건은 함수 안에 통째로 인라인(파라미터 없음).

// 판정 대기: 공개 또는 pending인데 raw 있고 미판정/신규후기로 재판정 필요.
//   (공개만 세면 아직 안 뜬 pending 백로그를 숨겨 실제보다 적게 보인다 → 공개+pending로 정의.)
export async function judgeQueueCount(): Promise<number> {
  const r = await sql`SELECT count(*) FILTER (
      WHERE (published OR pipeline_status='pending') AND raw_reviews IS NOT NULL
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
