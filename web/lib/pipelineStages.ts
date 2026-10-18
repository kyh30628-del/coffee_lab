import { sql } from "@/lib/db";

// 🪜 파이프라인 단계 모델 — **단일 사실 출처**. (2026-10-18 신설)
//
// 왜 이게 없으면 안 되는가:
//   실측(최근 7일 run_ledger): 계량을 남긴 잡 **42종 중 '남은 일'을 보고하는 건 2종**뿐이었다.
//   '남은 일'이 없으면 **"할 일이 없어서 0건"과 "막혀서 0건"을 구분할 수 없다** — 어느 단계가 막혔는지
//   아무도 모른다. 2026-10-04~15에 조직이 하루 1건으로 떨어져도 12일간 경보가 0건이었던 구조적 원인이다.
//
// 왜 라우트가 아니라 여기인가:
//   각 크론의 대상 선정 SQL을 역추적해 계량을 끼워 넣으면 **단계 정의가 34곳으로 흩어진다**(그게
//   오늘 하루 종일 고친 "부분 적용" 병이다). 파이프라인은 본질적으로 **`cafes`의 상태 전이**이므로
//   그 상태를 한 곳에서 정의한다 — 모호하지 않고, 라우트를 안 건드려도 전 단계를 한 번에 볼 수 있다.
//
// 💰 비용: 단계별 COUNT 1회(전부 인덱스 사용 가능한 작은 컬럼, 큰 blob 미접촉). 보고 시 1회만 호출한다.
//   ⚠️ `raw_reviews IS NULL` 같은 조건은 **컬럼 값을 읽지 않는다**(NULL 여부만) — 큰 blob 읽기가 아니다.
//
// 🔑 **철칙: 단계의 적체 정의는 그 단계를 전진시키는 잡의 큐 정의와 글자까지 같아야 한다.**
//   다르면 관제 숫자가 갈라진다. 실제로 ④ 임베딩에서 한 번 났다 — 여기선 149곳, 잡은 5,611곳으로
//   보고했다(잡은 '낡은 임베딩'까지 센다). 잡의 정의가 진실이다(그게 실제로 일을 고르는 기준이니까).
//   잡의 큐를 바꿀 때는 여기도 같이 바꾼다. 짝이다.

export type Stage = {
  id: string;            // 단계 이름(화면·보고 표시용)
  owner: string;         // 이 단계를 전진시키는 잡 — 적체가 쌓이면 여기를 본다
  note: string;          // 무엇이 '남은 일'인지
  cyclic?: boolean;      // true = 순환 단계(적체가 0이 되지 않는 게 정상 — 주기 안에 도는지가 성공 기준)
  backlog: () => Promise<number>;
};

const one = async (q: Promise<any>): Promise<number> => Number((await q)?.[0]?.n ?? 0);

export const STAGES: Stage[] = [
  {
    id: "① 원본 수집",
    owner: "collect-catchup / cron-grow",
    note: "발굴은 됐는데 후기 원본이 아직 없는 카페",
    backlog: () => one(sql`SELECT count(*)::int n FROM cafes WHERE raw_reviews IS NULL`),
  },
  {
    id: "② 합성·판정",
    owner: "cron-synth",
    note: "원본은 있는데 아직 한 번도 합성되지 않은 카페",
    backlog: () => one(sql`SELECT count(*)::int n FROM cafes WHERE raw_reviews IS NOT NULL AND synth_updated IS NULL`),
  },
  {
    id: "③ 공개 심사",
    owner: "cron-synth / cron-issues",
    note: "공개 게이트 앞에서 대기 중(pipeline_status='pending')",
    backlog: () => one(sql`SELECT count(*)::int n FROM cafes WHERE pipeline_status = 'pending'`),
  },
  {
    id: "④ 임베딩",
    owner: "cron-embed",
    // 🔴 2026-10-18 — 처음엔 `embedding IS NULL`만 셌는데 **149곳**이 나왔다. 그런데 cron-embed 자신은
    //   `remain 5,611`을 보고했다. 그 잡은 **낡은 임베딩**(재합성 후 재임베딩 필요)까지 센다.
    //   → 단계 정의는 **그 단계를 전진시키는 잡의 정의와 같아야 한다**(app/api/cron-embed/route.ts:75).
    //   정의가 두 갈래면 관제 숫자가 갈라지고, 그게 오늘 하루 종일 고친 병이다.
    note: "공개·대기 카페 중 벡터가 없거나 재합성 뒤 낡은 것(cron-embed의 큐 정의와 동일)",
    backlog: () => one(sql`SELECT count(*)::int n FROM cafes
      WHERE (published = true OR pipeline_status = 'pending')
        AND synth_updated IS NOT NULL
        AND (embedding IS NULL OR embed_updated IS NULL OR embed_updated < synth_updated)`),
  },
  {
    id: "⑤ 재합성 순환",
    owner: "cron-resynth",
    cyclic: true,
    // 🔴 2026-10-18 — 처음엔 `synth_updated`로 셌다가 11,858곳이 나왔는데, **그 컬럼은 순환 기준이 아니다.**
    //   cron-resynth 주석이 명시적으로 경고한다(2026-07-05 정정): `synth_updated`는 '결과가 **바뀐** 시각'이라
    //   안 변한 카페는 안 움직여 순환 기준으로 못 쓴다. 커버리지는 `synth_checked_at`('마지막 **재점검** 시각',
    //   변경 여부 무관 매 재합성마다 갱신)으로 봐야 전진이 보인다.
    //   30일은 그 잡의 **④ 안전망** 한도다(고덕방 38일 방치 사고의 재발 한도).
    note: "공개 카페 중 30일 넘게 재점검되지 않은 것(cron-resynth의 안전망 기준 — 0이 목표가 아니라 순환이 도는지를 본다)",
    backlog: () => one(sql`SELECT count(*)::int n FROM cafes WHERE published AND (synth_checked_at IS NULL OR synth_checked_at < now() - interval '30 days')`),
  },
  {
    id: "⑥ 폐업 확인",
    owner: "cron-closure",
    note: "폐업 신호가 쌓였는데 아직 확인되지 않은 공개 카페",
    backlog: () => one(sql`SELECT count(*)::int n FROM cafes WHERE published AND COALESCE(closure_misses, 0) >= 2`),
  },
  {
    id: "⑦ 보류 해제",
    owner: "cron-issues / 힐러",
    note: "오염·근거부족으로 보류(held)돼 사람·결재를 기다리는 카페",
    backlog: () => one(sql`SELECT count(*)::int n FROM cafes WHERE pipeline_status = 'held'`),
  },
];

export type StageBacklog = { id: string; owner: string; note: string; cyclic: boolean; backlog: number };

/** 전 단계 적체를 한 번에. 한 단계가 실패해도 나머지는 보고한다(−1 = 측정 실패). */
export async function pipelineBacklog(): Promise<StageBacklog[]> {
  return Promise.all(STAGES.map(async (s) => ({
    id: s.id, owner: s.owner, note: s.note, cyclic: !!s.cyclic,
    backlog: await s.backlog().catch(() => -1),
  })));
}
