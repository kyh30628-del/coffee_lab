import { sql, ensureOnce } from "./db";
import { isOwnerManaged } from "./ownerManaged";

// 📷✍ 사장님 사진·한마디(2026-09-13, CEO 지시 "사진, 한마디 기능 착수").
//   왜: 네이버 사진은 약관상 저장 불가라 우리 카페 페이지는 전부 사진이 없다. 합법적인 사진 출처는 **사장님 본인**뿐.
//       구독 카페만 사진과 한마디가 실리는 구조 = 노출 '양'이 아니라 '질'의 차이(9,900원의 체감 메리트).
//   원칙: ①등급·후기·판정은 절대 건드리지 않는다(사장님 글은 '사장님 한마디'로 분리 표기) ②구독이 끝나면 숨김(삭제 아님)
//         ③저작권·초상권 책임은 업로드한 사장님(약관 4조) ④관리자가 hidden으로 내릴 수 있다(신고 대응).
//   비용: 작은 테이블 1행/카페, 상세 페이지에서 PK 조회 1회(캐시된 ISR 안). 사진 파일은 Blob(공개 URL).
export type OwnerPhoto = { url: string; at: string };
export type OwnerContent = { cafeId: number; photos: OwnerPhoto[]; note: string; noteAt: string | null; updatedAt: string | null; hidden: boolean };

export const OWNER_PHOTO_MAX = 5;
export const OWNER_NOTE_MAX = 200;

async function ensure() {
  await ensureOnce("db.ownerContent.v1", async () => {
    await sql`CREATE TABLE IF NOT EXISTS owner_content (
      cafe_id INT PRIMARY KEY, photos JSONB NOT NULL DEFAULT '[]'::jsonb, note TEXT, note_at TIMESTAMPTZ,
      hidden BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  });
}

/** 원본 행(관리·편집용). 구독 여부와 무관하게 읽는다. */
export async function readOwnerContent(cafeId: number): Promise<OwnerContent | null> {
  await ensure();
  const r = (await sql`SELECT cafe_id, photos, note, note_at, hidden, updated_at FROM owner_content WHERE cafe_id=${cafeId}`)[0] as any;
  if (!r) return null;
  return { cafeId, photos: Array.isArray(r.photos) ? r.photos : [], note: r.note ?? "", noteAt: r.note_at ?? null, updatedAt: r.updated_at ?? null, hidden: !!r.hidden };
}

/** 소비자 화면용 — 구독 활성(사장님 관리) + 숨김 아님일 때만. 아니면 null(아무것도 안 보임). */
// 🔓 2026-09-14(CEO 승인 "사장님 사진 무료 개방") — **사진은 구독과 무관하게 보여준다. 한마디는 유료 유지.**
//   왜 바꿨나(실측): 공개 카페 26,711곳 중 사진이 있는 곳이 **0곳**이었다. 경쟁 서비스(카페맵)는 썸네일을 보여준다.
//     네이버 사진은 약관상 저장 불가, 인스타는 우리 URL의 99.7%가 프로필이라 oEmbed가 거부한다(실측 확인).
//     → 합법적인 대량 사진 출처는 사장님 본인뿐인데, 그걸 유료 뒤에 가둬 두니 **유료 0건 = 사진 0장**이 됐다.
//     사진은 사장님이 우리 페이지를 처음 열어볼 이유이자 구독 퍼널의 입구다. 입구를 잠가 두면 퍼널이 시작되지 않는다.
//   ⚠️ 업로드 경로는 그대로 PIN 인증(사업자 확인 후 발급)이다 — 아무나 올리는 길은 열지 않는다.
//   ⚠️ 유료 차별점은 남긴다: '사장님 한마디'와 🏅배지는 구독 활성일 때만.
export async function publicOwnerContent(cafeId: number): Promise<OwnerContent | null> {
  const c = await readOwnerContent(cafeId).catch(() => null);
  if (!c || c.hidden) return null;
  if (!c.photos.length && !c.note.trim()) return null;
  const managed = await isOwnerManaged(cafeId).catch(() => false);
  if (managed) return c;
  if (!c.photos.length) return null;           // 구독이 없고 사진도 없으면 보여줄 게 없다
  return { ...c, note: "", noteAt: null };     // 사진만 공개, 한마디는 숨김(삭제 아님 — 재구독 시 그대로 돌아온다)
}

export async function writeOwnerContent(cafeId: number, patch: { photos?: OwnerPhoto[]; note?: string }): Promise<OwnerContent> {
  await ensure();
  const cur = (await readOwnerContent(cafeId)) ?? { cafeId, photos: [], note: "", noteAt: null, updatedAt: null, hidden: false };
  const photos = (patch.photos ?? cur.photos).slice(0, OWNER_PHOTO_MAX);
  const note = (patch.note ?? cur.note).replace(/[<>]/g, "").slice(0, OWNER_NOTE_MAX);
  const noteChanged = patch.note !== undefined && note !== cur.note;
  await sql`INSERT INTO owner_content (cafe_id, photos, note, note_at, updated_at)
    VALUES (${cafeId}, ${JSON.stringify(photos)}::jsonb, ${note}, ${noteChanged ? new Date().toISOString() : cur.noteAt}, now())
    ON CONFLICT (cafe_id) DO UPDATE SET photos=EXCLUDED.photos, note=EXCLUDED.note, note_at=EXCLUDED.note_at, updated_at=now()`;
  return (await readOwnerContent(cafeId))!;
}
