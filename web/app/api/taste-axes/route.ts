import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

// 우리 카페들의 리뷰에서 실제로 자주 나오는 취향/특징 축을 데이터로 집계.
// 추측이 아니라, 저장된 근거 리뷰 텍스트의 실제 출현 빈도 기반(헌법1).
type Axis = { key: string; label: string; keywords: string[]; emoji: string };

// 후보 축들 — 어느 게 "실제로 많이 나오는지"를 데이터로 검증해서 채택
const CANDIDATE_AXES: Axis[] = [
  { key: "acidity", label: "산미", emoji: "🍋", keywords: ["산미", "신맛", "상큼", "과일", "베리", "시트러스", "플로럴", "꽃향", "게이샤"] },
  { key: "nutty", label: "고소·견과", emoji: "🌰", keywords: ["고소", "견과", "너트", "헤이즐넛", "구수"] },
  { key: "dark", label: "묵직·다크", emoji: "🍫", keywords: ["묵직", "진한", "다크", "초콜릿", "카라멜", "스모키", "바디"] },
  { key: "sweet", label: "단맛·디저트", emoji: "🍰", keywords: ["단맛", "달달", "달콤", "바닐라", "디저트", "케이크", "티라미수", "스콘", "크로플"] },
  { key: "work", label: "작업하기 좋은", emoji: "💻", keywords: ["작업", "노트북", "공부", "콘센트", "좌석", "넓"] },
  { key: "quiet", label: "조용·혼자", emoji: "🤍", keywords: ["조용", "혼자", "차분", "고요", "사색"] },
  { key: "vibe", label: "분위기·사진", emoji: "📸", keywords: ["분위기", "예쁜", "감성", "인테리어", "사진", "루프탑", "뷰"] },
  { key: "bread", label: "빵·베이커리", emoji: "🥐", keywords: ["빵", "베이커리", "크루아상", "스콘", "소금빵", "페이스트리"] },
  { key: "roaster", label: "직접 로스팅", emoji: "🔥", keywords: ["로스팅", "직접 볶", "로스터리", "자가배전", "원두"] },
];

type ReviewRow = { synth_reviews: { quote: string }[] | null; note: string | null; synth_identity: string | null };

export async function GET() {
  try {
    await ensureSchema();
    const rows = (await sql`SELECT synth_reviews, note, synth_identity FROM cafes WHERE published = true`) as unknown as ReviewRow[];

    // 모든 리뷰/노트 텍스트를 하나로 모아 축별 출현 카페 수 + 총 언급 수 집계
    const stat: Record<string, { cafes: number; mentions: number }> = {};
    CANDIDATE_AXES.forEach((a) => (stat[a.key] = { cafes: 0, mentions: 0 }));

    for (const row of rows) {
      const texts: string[] = [];
      if (Array.isArray(row.synth_reviews)) row.synth_reviews.forEach((r) => r.quote && texts.push(r.quote));
      if (row.note) texts.push(row.note);
      if (row.synth_identity) texts.push(row.synth_identity);
      const blob = texts.join(" ");

      for (const ax of CANDIDATE_AXES) {
        const count = ax.keywords.reduce((sum, kw) => sum + (blob.split(kw).length - 1), 0);
        if (count > 0) {
          stat[ax.key].cafes += 1;
          stat[ax.key].mentions += count;
        }
      }
    }

    // 2개 이상 카페에서 나온 축만 "유효 축"으로 채택 (교차검증, 헌법1)
    const axes = CANDIDATE_AXES
      .map((a) => ({ ...a, cafes: stat[a.key].cafes, mentions: stat[a.key].mentions }))
      .filter((a) => a.cafes >= 2)
      .sort((a, b) => b.mentions - a.mentions);

    return NextResponse.json({ ok: true, totalCafes: rows.length, axes }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
