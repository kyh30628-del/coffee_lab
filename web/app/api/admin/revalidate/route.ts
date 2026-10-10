import { NextRequest, NextResponse } from "next/server";
import { invalidateCafeCaches } from "@/lib/cafeCacheInvalidate";

export const runtime = "nodejs";

// 🧹 ISR 무효화 원격 실행구 — **로컬 워커가 캐시를 못 지우던 구멍**을 메운다(2026-08-31).
//
// 왜 필요한가:
//   `revalidatePath`는 Next의 **요청 컨텍스트 안에서만** 동작한다. 비공개 집행은 ①Vercel 크론(O)
//   ②맥의 로컬 워커·스크립트(X) 두 곳에서 일어난다. ②에서는 이 엔드포인트를 불러 **프로덕션 안에서** 지운다.
//
// 🔴 2026-10-10 — 여기서 유형 전체 purge(4,163페이지)와 50곳 상한을 없앴다. 이제 로컬과 똑같은
//   lib/cafeCacheInvalidate를 그대로 실행한다(상세 즉시 · 실린 목록만 큐 · 공개 변화 때만 지도).
//   옛 호출자가 보내던 `broad` 필드는 무시한다.
export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const { ids } = await req.json();
    const list = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
    await invalidateCafeCaches(list);
    return NextResponse.json({ ok: true, revalidated: list.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 150) }, { status: 500 });
  }
}
