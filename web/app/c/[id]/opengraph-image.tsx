import { sql } from "@/lib/db";
import { ogCard, OG_SIZE } from "@/lib/ogCard";
import { topCharTraits } from "@/lib/charScore";

export const runtime = "nodejs";
// 🌙 2026-09-02 — OG 이미지가 페이지 본체보다 자주 재생성되고 있었다(6h vs 48h, 8배).
//   내용은 본문보다 덜 변하는데 주기가 거꾸로였다. 본체와 같은 주기로 맞춘다.
export const revalidate = 604800; // 💰 2026-08-20: 페이지(21600)와 짝 맞춤 — 13.5k 이미지가 1시간마다 재생성 대상이던 것을 6시간으로
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "동네 커피 노트 — 검증한 동네 카페";

const GRADE_BADGE: Record<string, string> = { "검증": "✓ 검증", "참고": "참고" };

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let cafe: any = null;
  try { cafe = (await sql`SELECT name, area, dong, synth_grade, synth_identity, char_scores FROM cafes WHERE id=${Number(id)} AND published`)[0]; } catch {}
  if (!cafe) return ogCard({ title: "동네 커피 노트", subtitle: "진짜 후기로 고른 우리 동네 카페" });
  const loc = [cafe.area, cafe.dong].filter(Boolean).join(" ");
  const sub = cafe.synth_identity ? String(cafe.synth_identity).slice(0, 60) : loc;
  const badge = (cafe.synth_grade && GRADE_BADGE[cafe.synth_grade]) || cafe.synth_grade || undefined;
  const traits = topCharTraits(cafe.char_scores, 2);
  return ogCard({ title: cafe.name, subtitle: sub, badge, traits, footer: `${loc} · 진짜 후기로 검증` });
}
