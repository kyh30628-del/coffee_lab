import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

// 🧹 ISR 무효화 원격 실행구 — **로컬 워커가 캐시를 못 지우던 구멍**을 메운다(2026-08-31).
//
// 왜 필요한가:
//   `revalidatePath`는 Next의 **요청 컨텍스트 안에서만** 동작한다. 그런데 우리 비공개 집행은
//   두 곳에서 일어난다 — ①Vercel 크론(요청 컨텍스트 O) ②맥의 로컬 워커·스크립트(X).
//   ②에서는 revalidatePath가 던지고 `catch {}`가 그걸 삼켜, DB만 비공개가 되고
//   **CDN은 옛 페이지를 계속 냈다.** 실측: id24609를 비공개했는데 36분 뒤에도 200(x-vercel-cache: HIT).
//   즉 "비공개 처리했습니다"가 소비자 화면에서는 거짓이었다.
//
// 그래서 로컬에서는 이 엔드포인트를 호출해 **프로덕션 안에서** 무효화를 실행한다.
export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const { ids, broad } = await req.json();
    const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite).slice(0, 50);
    for (const id of list) { revalidatePath(`/c/${id}`); revalidatePath(`/share/${id}`); revalidatePath(`/c/${id}/opengraph-image`); }
    revalidatePath("/api/cafes");   // 로컬 워커에서 비공개했을 때도 지도 캐시가 지워지도록(같은 이유)
    // 🔴 2026-09-26 — 유형 전체 purge는 호출측(lib/cafeCacheInvalidate.claimBroadPurge)이 정한 대로만 한다.
    //   여기가 무조건 지우고 있어서 카페 1곳마다 4,163페이지가 식었다(하루 5,740회 = 2,390만 페이지).
    //   `broad`가 명시적으로 false면 건너뛴다. 필드가 없으면(옛 호출자) 기존 동작 유지 = 항상 지운다.
    if (broad === false) return NextResponse.json({ ok: true, revalidated: list.length, broad: false });
    revalidatePath("/sitemap.xml");
    revalidatePath("/area/[gu]", "page");
    revalidatePath("/area/[gu]/[taste]", "page");
    revalidatePath("/area/[gu]/dong/[dong]", "page");
    return NextResponse.json({ ok: true, revalidated: list.length, broad: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 150) }, { status: 500 });
  }
}
