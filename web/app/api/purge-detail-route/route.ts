import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

// 🧹 카페 상세 **라우트 전체** 캐시 무효화 (2026-10-19)
//
// 왜 필요한가 — 실사고:
//   `/c/[id]`는 ISR 30일(`revalidate = 2592000`)이다. 새 컴포넌트를 배포해도
//   **이미 캐시된 페이지는 배포 전 HTML을 그대로 내보낸다.** 클라이언트 컴포넌트도 마찬가지다 —
//   마운트 지점이 그 페이지의 RSC 페이로드에 들어 있어야 하는데, 옛 페이로드엔 없다.
//   실제로 사용자 피드백 바를 배포했는데 **대부분의 카페 페이지에서 보이지 않았다**
//   (내가 확인한 한 곳은 마침 재생성된 페이지였다 — 그래서 "배포 완료"라고 잘못 보고했다).
//
// 💰 비용: 무효화 자체는 쓰기가 아니다. 재생성은 **그 페이지를 누가 방문할 때만** 일어나므로
//   ISR write는 실제 트래픽만큼만 발생한다(2주 PV 10,979 수준). 49,874곳을 미리 굽지 않는다.
//   `revalidatePath(route, "page")`는 그 라우트의 **모든 동적 페이지**를 한 번에 무효화한다 —
//   id별로 49,874번 부르는 것과 달리 호출 1회다.
//
// 🔒 CRON_SECRET 필요. 배포 후 1회만 부른다(상시 호출 금지 — 전수 재생성은 비싸다).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { revalidatePath } = await import("next/cache");
  const done: string[] = [];
  for (const [route, type] of [["/c/[id]", "page"], ["/share/[id]", "page"]] as const) {
    try { revalidatePath(route, type); done.push(route); } catch { /* 없는 라우트는 건너뛴다 */ }
  }
  return NextResponse.json({
    ok: true, purged: done,
    note: "라우트 전체 무효화. 재생성은 방문 시에만 일어나므로 ISR write는 실제 트래픽만큼만 발생한다.",
  });
}
