import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";
export const maxDuration = 60;

// 🔔 재방문 장치 발송기(2026-10-23) — 찜한 카페에 새 소식이 생긴 기기에만 **하루 한 번** 보낸다.
//
// 왜: 재방문율 2.1%. 계정·이메일이 없어 유일한 재접촉 통로는 브라우저 푸시다(app/pushSubscribe.ts로 구독).
//   "새 소식" = 북마크한 카페의 synth_updated(재합성 시각)가 **지난 발송 이후** 갱신된 것.
//   오늘 배포한 조부보호 수리 덕에 이제 정체돼 있던 카페도 새 글이 실제로 반영되므로, 이 신호가 의미를 가진다.
//
// 🔒 스팸 방지: 첫 구독 기기는 **발송하지 않고 기준선만** 잡는다(last_sent_at=now) — 과거 누적 변동을
//   한꺼번에 들이밀지 않는다. 그 이후부터 "진짜 새로 생긴 것"만 비교해 보낸다.
// 💰 비용: 북마크·구독 둘 다 있는 기기만 대상(실측 전까지는 모집단이 작다). web-push 호출은 변동 있는
//   기기에만. Vercel 크론 1일 1회, DB는 가벼운 조인 1회.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, PRIV = process.env.VAPID_PRIVATE_KEY;
  if (!PUB || !PRIV) return NextResponse.json({ ok: true, skipped: "VAPID 키 미설정" });

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@dongnecoffeenote.com", PUB, PRIV);

  // ① 첫 구독(한 번도 발송 안 함) — 기준선만 잡는다(스팸 방지).
  const baselined = await sql`UPDATE push_subscriptions SET last_sent_at = now() WHERE last_sent_at IS NULL RETURNING device_id`;

  // ② 북마크 ∩ 구독 — 북마크한 카페 중 지난 발송 이후 갱신된 게 있는 기기만.
  const targets = await sql`
    SELECT ps.device_id, ps.endpoint, ps.p256dh, ps.auth, COUNT(*)::int changed
    FROM push_subscriptions ps
    JOIN bookmarks b ON b.device_id = ps.device_id
    JOIN cafes c ON c.id = b.cafe_id AND c.published AND c.synth_updated > ps.last_sent_at
    GROUP BY ps.device_id, ps.endpoint, ps.p256dh, ps.auth`;

  let sent = 0, gone = 0, err = 0;
  for (const t of targets) {
    try {
      const payload = JSON.stringify({
        title: "☕ 찜한 카페에 새 소식",
        body: t.changed === 1 ? "저장하신 카페 1곳에 새 후기가 반영됐어요." : `저장하신 카페 ${t.changed}곳에 새 후기가 반영됐어요.`,
        url: "/",
      });
      await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload);
      await sql`UPDATE push_subscriptions SET last_sent_at = now() WHERE device_id = ${t.device_id}`;
      sent++;
    } catch (e: any) {
      // 410/404 = 구독이 브라우저에서 이미 해지됨(기기 변경·알림 꺼짐) — 더 이상 보낼 수 없으니 정리한다.
      if (e?.statusCode === 410 || e?.statusCode === 404) {
        await sql`DELETE FROM push_subscriptions WHERE device_id = ${t.device_id}`.catch(() => {});
        gone++;
      } else err++;
    }
  }
  return NextResponse.json({ ok: true, baselined: baselined.length, candidates: targets.length, sent, gone, err });
}
