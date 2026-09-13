import { NextRequest, NextResponse } from "next/server";
import { sql, ensureOnce } from "@/lib/db";

export const runtime = "nodejs";

// 🔬 랜딩 글씨 '두 번 써짐' 계측(2026-09-13). CEO 폰에서만 재현되고 데스크톱에선 안 나온다.
//   추측을 멈추고 사실을 잡는다: 글씨 쓰기가 **시작될 때마다** 한 줄 기록 — 같은 loadId 안에서 두 번이면 컴포넌트 재마운트,
//   loadId가 다르면 페이지가 다시 로드된 것(리로드·리다이렉트·PWA 재시작). 7일 지나면 자동 삭제. 비용: 랜딩 1회당 INSERT 1.
async function ensure() {
  await ensureOnce("db.landingDebug.v1", async () => {
    await sql`CREATE TABLE IF NOT EXISTS landing_debug (id BIGSERIAL PRIMARY KEY, load_id TEXT, mount_id TEXT, anon TEXT, memo_hash TEXT,
      nav_type TEXT, standalone BOOLEAN, visible TEXT, ua TEXT, t_since_load INT, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`CREATE INDEX IF NOT EXISTS idx_landing_debug_created ON landing_debug (created_at DESC)`;
  });
}
export async function POST(req: NextRequest) {
  try {
    await ensure();
    const b = await req.json().catch(() => ({}));
    const s = (v: unknown, n = 80) => String(v ?? "").slice(0, n);
  const memoHash = String(b.memoHash ?? "").slice(0, 600);
    await sql`INSERT INTO landing_debug (load_id, mount_id, anon, memo_hash, nav_type, standalone, visible, ua, t_since_load, note)
      VALUES (${s(b.loadId, 40)}, ${s(b.mountId, 40)}, ${s(b.anon, 64)}, ${memoHash}, ${s(b.navType, 20)}, ${!!b.standalone}, ${s(b.visible, 12)}, ${s(b.ua, 200)}, ${Number(b.tSinceLoad) || 0}, ${s(b.note, 120)})`;
    sql`DELETE FROM landing_debug WHERE created_at < now() - interval '7 days'`.catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e).slice(0, 80) }, { status: 500 }); }
}
