import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureBilling, chargeOnce } from "@/lib/billing";
import { paymentsLive } from "@/lib/flags";
import { decryptPII } from "@/lib/crypto";
import { sendBillingEmail } from "@/lib/billingEmail";
import { recordRun } from "@/lib/agentLog";
export const runtime = "nodejs";
export const maxDuration = 120;

const DUNNING_MAX = 4; // 연속 실패 4회(약 4일 유예) 초과 → 일시정지

// 💳 정기결제 크론(매일 09:00 KST = UTC 00:00). 만료 임박·유예중 구독을 과금·재시도.
//   멱등: chargeOnce가 order_id=dcn_{cafeId}_{YYYYMM} 슬롯 선점 → 같은 주기 중복과금 없음.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // 안전장치: 라이브 아니면 실제 과금 안 함(테스트 환경 보호). 기록만.
  if (!paymentsLive()) { await recordRun("cron-billing", true, "skipped: PAYMENTS_LIVE off", 0); return NextResponse.json({ ok: true, skipped: true }); }

  try {
    await ensureBilling();
    // 과금 대상: 자동결제 + 빌링키 有 + (활성이며 만료 임박) 또는 (만료됐지만 유예중 재시도).
    const due = await sql`SELECT cafe_id, cafe_name, email, COALESCE(dunning_count,0) AS dunning FROM subscriptions
      WHERE autopay=true AND billing_key IS NOT NULL
        AND ( (status='active' AND expires_at IS NOT NULL AND expires_at <= now() + interval '1 day')
              OR (status='expired' AND COALESCE(dunning_count,0) < ${DUNNING_MAX}) )
      ORDER BY expires_at ASC LIMIT 50` as unknown as any[];

    let paid = 0, failed = 0, suspended = 0, skipped = 0;
    for (const row of due) {
      const cafeId = Number(row.cafe_id);
      const to = decryptPII(row.email ?? "");
      const res = await chargeOnce(cafeId);
      if (res.skipped) { skipped++; continue; }
      if (res.ok) { paid++; continue; }
      failed++;
      // 실패 후 dunning 재확인 → 임계 초과면 정지(노출 OFF·캐시 무효화), 아니면 실패 알림.
      const dc = Number(((await sql`SELECT COALESCE(dunning_count,0) AS d FROM subscriptions WHERE cafe_id=${cafeId}`)[0] as any)?.d ?? 0);
      if (dc >= DUNNING_MAX) {
        await sql`UPDATE subscriptions SET status='suspended', suspend_reason='결제 실패(정기결제)', suspended_at=now(), autopay=false, updated_at=now() WHERE cafe_id=${cafeId}`;
        await sql`UPDATE cafe_promos SET featured=false, approved=false, featured_until=NULL, updated_at=now() WHERE cafe_id=${cafeId}`;
        try { const { invalidateCafeCaches } = await import("@/lib/cafeCacheInvalidate"); await invalidateCafeCaches([cafeId]); } catch {}
        suspended++;
        if (to) await sendBillingEmail(to, "suspended", { cafeName: row.cafe_name ?? "" }).catch(() => {});
      } else if (to) {
        await sendBillingEmail(to, "failed", { cafeName: row.cafe_name ?? "" }).catch(() => {});
      }
    }
    const detail = `due=${due.length} paid=${paid} failed=${failed} suspended=${suspended} skipped=${skipped}`;
    await recordRun("cron-billing", true, detail, paid);
    return NextResponse.json({ ok: true, detail });
  } catch (e) {
    await recordRun("cron-billing", false, String(e), 0);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
