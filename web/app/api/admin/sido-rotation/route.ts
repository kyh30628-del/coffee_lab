import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { rotateBySido, sidoOf, kstSlotIndex, slotEndsAt, SIDO_ORDER, ROTATION_SLOT_MS } from "@/lib/sidoRotation";
export const runtime = "nodejs";

// ⚖️ '카페 둘러보기' 시·도 순환 관제 — 지금 누가 선두이고 다음엔 누구인가.
//   CEO 지시(2026-08-25): 순환이 실제로 공평하게 도는지 관리자 화면에서 확인 가능해야 한다.
//   ⚠️ 경로 주의: /api/admin/rotation 은 **다른 기능**(유료 노출 로테이션 현황)이 이미 쓰고 있다.
//      이름이 비슷해 헷갈리기 쉬우니 여기는 sido-rotation 으로 분리했다.
//   💰 공개 카페 전수를 다시 뽑지 않는다 — 시·도별 집계 1쿼리만 하고 순서는 순수 함수로 계산한다.
const authed = (req: NextRequest) => req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

// 미리보기용 대표 area 라벨(시·도 판정이 실제로 되는 값이어야 한다).
const SIDO_SAMPLE: Record<string, string> = { 서울: "강남구", 경기: "수원시", 인천: "인천 미추홀구", 강원: "춘천시" };

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const rows = (await sql`SELECT area, count(*)::int n FROM cafes
      WHERE published AND area IS NOT NULL AND area <> '' GROUP BY area`) as any[];
    const bySido = new Map<string, number>();
    for (const r of rows) {
      const s = sidoOf(r.area) || "기타";
      bySido.set(s, (bySido.get(s) ?? 0) + Number(r.n));
    }
    const pool = SIDO_ORDER.filter((s) => bySido.has(s));
    const slot = kstSlotIndex();
    const endsAt = slotEndsAt();
    const N = pool.length || 1;

    const upcoming = Array.from({ length: 6 }, (_, i) => {
      const si = slot + i, off = si % N;
      return {
        slot: si,
        at: new Date(si * ROTATION_SLOT_MS - 9 * 3600 * 1000).toISOString(),
        order: [...pool.slice(off), ...pool.slice(0, off)],
      };
    });

    // 실제 배치 함수를 그대로 돌려 확인 — 설명과 동작이 어긋나지 않게 같은 코드로 검증한다.
    const sample = pool.flatMap((s) => Array.from({ length: 3 }, () => ({ area: SIDO_SAMPLE[s] ?? s, sido: s })));
    const preview = {
      top3: rotateBySido(sample, 3, slot).map((x: any) => x.sido),
      five: rotateBySido(sample, 5, slot).map((x: any) => x.sido),
    };

    return NextResponse.json({
      ok: true,
      slotHours: ROTATION_SLOT_MS / 3600000,
      slot, endsAt: new Date(endsAt).toISOString(),
      minutesLeft: Math.max(0, Math.round((endsAt - Date.now()) / 60000)),
      cycleSlots: N, cycleHours: N * (ROTATION_SLOT_MS / 3600000),
      pool: pool.map((s) => ({ sido: s, cafes: bySido.get(s) ?? 0 })),
      unclassified: bySido.get("기타") ?? 0, // 0이 아니면 area 라벨이 lib/regionList.ts에 없다는 뜻
      leadNow: upcoming[0]?.order[0] ?? null,
      upcoming, preview,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
  }
}
