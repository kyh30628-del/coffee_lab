import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { sql } from "@/lib/db";
import { ownerScope } from "@/lib/ownerAuth";
import { invalidateCafeCaches } from "@/lib/cafeCacheInvalidate";
import { readOwnerContent, publicOwnerContent, writeOwnerContent, OWNER_PHOTO_MAX, OWNER_NOTE_MAX, type OwnerPhoto } from "@/lib/ownerContent";

export const runtime = "nodejs";

// GET ?cafeId= : 소비자용(구독 활성일 때만 값) · ?mine=1 + PIN/관리자: 편집용 원본
export async function GET(req: NextRequest) {
  const cafeId = Number(req.nextUrl.searchParams.get("cafeId"));
  if (!Number.isFinite(cafeId) || cafeId <= 0) return NextResponse.json({ ok: false, error: "cafeId 필요" }, { status: 400 });
  if (req.nextUrl.searchParams.get("mine") === "1") {
    const scope = await ownerScope(req);
    if (scope !== "admin" && scope !== cafeId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const c = await readOwnerContent(cafeId);
    return NextResponse.json({ ok: true, content: c ?? { cafeId, photos: [], note: "", noteAt: null, updatedAt: null, hidden: false }, limits: { photos: OWNER_PHOTO_MAX, note: OWNER_NOTE_MAX } }, { headers: { "Cache-Control": "no-store" } });
  }
  const c = await publicOwnerContent(cafeId);
  return NextResponse.json({ ok: true, content: c }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } });
}

// POST multipart: cafeId, note(선택), photo(파일, 여러 개 가능), remove(제거할 사진 url, 여러 개 가능)
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const cafeId = Number(form.get("cafeId"));
    if (!Number.isFinite(cafeId) || cafeId <= 0) return NextResponse.json({ ok: false, error: "cafeId 필요" }, { status: 400 });
    const scope = await ownerScope(req);
    if (scope !== "admin" && scope !== cafeId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const cur = (await readOwnerContent(cafeId)) ?? { cafeId, photos: [] as OwnerPhoto[], note: "", noteAt: null, updatedAt: null, hidden: false };
    const removes = new Set(form.getAll("remove").map(String));
    let photos = cur.photos.filter((p) => !removes.has(p.url));
    const files = form.getAll("photo").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
    if (photos.length + files.length > OWNER_PHOTO_MAX) return NextResponse.json({ ok: false, error: `사진은 최대 ${OWNER_PHOTO_MAX}장이에요` }, { status: 400 });
    for (const f of files) {
      if (!ALLOWED.has(f.type)) return NextResponse.json({ ok: false, error: "JPG·PNG·WEBP만 올릴 수 있어요" }, { status: 400 });
      if (f.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "사진 한 장은 4MB 이하로 올려주세요" }, { status: 400 });
      const buf = Buffer.from(await f.arrayBuffer());
      const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
      const blob = await put(`owner/${cafeId}-${Date.now()}-${photos.length}.${ext}`, buf, { access: "public", contentType: f.type });
      photos.push({ url: blob.url, at: new Date().toISOString() });
    }
    const noteRaw = form.get("note");
    const patch: { photos: OwnerPhoto[]; note?: string } = { photos };
    if (typeof noteRaw === "string") patch.note = noteRaw;
    const saved = await writeOwnerContent(cafeId, patch);
    await sql`INSERT INTO owner_events (cafe_id, event, at, meta) VALUES (${cafeId}, 'owner_content_save', now(), ${JSON.stringify({ photos: saved.photos.length, note: saved.note.length })}::jsonb)`.catch(() => {});
    await invalidateCafeCaches([cafeId]).catch(() => {}); // 상세 ISR 즉시 갱신 — 사장님이 저장하면 바로 보인다
    return NextResponse.json({ ok: true, content: saved });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 140) }, { status: 500 });
  }
}
