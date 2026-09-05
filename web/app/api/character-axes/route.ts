import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

const AXES = [
  { key: "분위기", emoji: "📸", kws: ["분위기","예쁜","감성","인테리어","사진","뷰","루프탑","아늑"] },
  { key: "작업·공부", emoji: "💻", kws: ["작업","노트북","공부","콘센트","좌석","집중","와이파이"] },
  { key: "디저트", emoji: "🍰", kws: ["디저트","케이크","빵","스콘","크로플","티라미수","베이커리","쿠키"] },
  { key: "직접로스팅", emoji: "🔥", kws: ["로스팅","로스터리","직접 볶","자가배전","스페셜티","싱글오리진"] },
  { key: "조용·혼자", emoji: "🤍", kws: ["조용","차분","혼자","고요","사색","한적"] },
  { key: "넓은공간", emoji: "🪑", kws: ["넓","대형","규모","층","테라스","주차"] },
  { key: "친절·서비스", emoji: "💬", kws: ["친절","사장님","응대","서비스","정성"] },
  { key: "가성비", emoji: "💰", kws: ["가성비","저렴","합리","가격 착","양 많"] },
];

export async function GET() {
  try {
    await ensureSchema();
    const rows = await sql`SELECT synth_identity, synth_reviews FROM cafes WHERE published = true` as unknown as any[];
    const stat: Record<string, { cafes: number; mentions: number }> = {};
    AXES.forEach((a) => (stat[a.key] = { cafes: 0, mentions: 0 }));

    for (const row of rows) {
      const texts: string[] = [];
      if (row.synth_identity) texts.push(row.synth_identity);
      if (Array.isArray(row.synth_reviews)) row.synth_reviews.forEach((r: any) => r.quote && texts.push(r.quote));
      const blob = texts.join(" ");
      for (const ax of AXES) {
        const cnt = ax.kws.reduce((s, k) => s + (blob.split(k).length - 1), 0);
        if (cnt > 0) { stat[ax.key].cafes++; stat[ax.key].mentions += cnt; }
      }
    }
    const total = rows.length;
    const axes = AXES.map((a) => ({
      key: a.key, emoji: a.emoji,
      cafes: stat[a.key].cafes,
      pct: Math.round((stat[a.key].cafes / total) * 100),
      mentions: stat[a.key].mentions,
    })).sort((a, b) => b.mentions - a.mentions);
    return NextResponse.json({ ok: true, total, axes }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
