import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 자연어 카페 검색 (PRINCIPLES §1·§5): "떠오르는 느낌"으로도 찾게 한다.
// - 시맨틱(개념): 느낌 단어 → 카페 신호(성격축·취향축·용도) 매핑. 블랙박스 없음, 근거 노출.
// - exact: 질의 토큰을 카페의 모든 텍스트 + 검증된 블로그 리뷰 인용에서 직접 매칭.
// 모든 점수는 DB의 실제 수집·검증값에서만 나온다(숫자 환각 금지).

const CONCEPTS: { id: string; triggers: string[]; axis?: string; taste?: string; uses?: string[]; label: string }[] = [
  { id: "quiet", triggers: ["조용", "혼자", "차분", "사색", "고요", "한적", "혼카", "평온", "힐링", "나홀로", "한가"], axis: "quiet", uses: ["혼자"], label: "조용·혼자" },
  { id: "work", triggers: ["작업", "공부", "노트북", "콘센트", "스터디", "와이파이", "오래", "독서", "집중", "책"], axis: "work", uses: ["작업"], label: "작업·공부" },
  { id: "mood", triggers: ["분위기", "감성", "예쁜", "이쁜", "데이트", "사진", "인테리어", "뷰", "루프탑", "아늑", "무드", "빈티지", "힙", "감각", "조명", "이국적"], axis: "mood", uses: ["사진"], label: "분위기·감성" },
  { id: "dessert", triggers: ["빵", "디저트", "케이크", "베이커리", "달달", "달콤", "스콘", "크로플", "쿠키", "티라미수", "마카롱", "휘낭시에", "과자", "구움"], axis: "dessert", uses: ["빵"], label: "디저트·빵" },
  { id: "roast", triggers: ["로스팅", "스페셜티", "원두", "핸드드립", "드립", "커피맛", "고급", "로스터리", "싱글", "에스프레소", "진심", "커피가 맛", "커피 맛"], axis: "roast", label: "직접로스팅·스페셜티" },
  { id: "space", triggers: ["넓", "대형", "테라스", "주차", "규모", "아이", "애견", "반려", "쾌적", "층고", "단체"], axis: "space", label: "넓은공간" },
  { id: "acidity", triggers: ["산미", "상큼", "과일", "베리", "시트러스", "플로럴", "꽃향", "새콤", "산뜻", "후르츠"], taste: "acidity", label: "산미 또렷" },
  { id: "body", triggers: ["고소", "묵직", "진한", "다크", "스모키", "견과", "바디", "구수", "진하게"], taste: "body", label: "묵직·고소" },
  { id: "sweet", triggers: ["단맛", "카라멜", "바닐라", "꿀", "초콜릿", "달콤한"], taste: "sweet", label: "단맛" },
];

function inRegion(area: string, region: string): boolean {
  if (!region) return true;
  const a = area ?? "";
  if (a.includes(region)) return true;
  const short = region.replace(/(특별시|광역시|시|군|구)$/, "");
  return short.length >= 2 && a.includes(short);
}
const occ = (text: string, kw: string) => (!text || !kw ? 0 : text.toLowerCase().split(kw.toLowerCase()).length - 1);

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    const region = (req.nextUrl.searchParams.get("region") ?? "").trim();
    if (q.length < 1) return NextResponse.json({ ok: false, error: "검색어 필요" }, { status: 400 });

    const ql = q.toLowerCase();
    // 질의 토큰(2글자+) — exact 매칭용
    const tokens = Array.from(new Set(ql.split(/[\s,./?!~"'()]+/).filter((t) => t.length >= 2)));
    // 발동한 개념(시맨틱)
    const hitConcepts = CONCEPTS.filter((c) => c.triggers.some((t) => ql.includes(t)));

    const rows = await sql`
      SELECT id, name, area, synth_grade, synth_count, synth_identity, signature, note, vibe, uses, beans,
             char_scores, synth_reviews, synth_acidity, synth_body, synth_sweet
      FROM cafes WHERE published = true` as unknown as any[];

    const scored = [];
    for (const c of rows) {
      if (!inRegion(c.area ?? "", region)) continue;
      const reviewText = Array.isArray(c.synth_reviews) ? c.synth_reviews.map((r: any) => r?.quote ?? "").join(" ") : "";
      const fields: [string, number][] = [
        [c.name ?? "", 4], [c.synth_identity ?? "", 2.5], [c.signature ?? "", 2], [c.note ?? "", 2],
        [c.vibe ?? "", 2], [c.uses ?? "", 1.5], [c.beans ?? "", 1.5], [reviewText, 2], [c.area ?? "", 1],
      ];

      // exact 점수 + 어디서 맞았는지(근거)
      let exact = 0;
      const tokenHit = new Set<string>();
      for (const tok of tokens) {
        for (const [text, w] of fields) {
          const n = occ(text, tok);
          if (n > 0) { exact += n * w; tokenHit.add(tok); }
        }
      }
      const inReview = tokens.some((t) => occ(reviewText, t) > 0);

      // 개념(시맨틱) 점수 — 카페가 실제로 그 신호를 가질 때만 가산(환각 금지)
      let concept = 0;
      const cs = c.char_scores ?? {};
      const reasons: string[] = [];
      for (const cc of hitConcepts) {
        let add = 0;
        if (cc.axis && (cs[cc.axis] ?? 0) > 0) add += Math.min(cs[cc.axis], 12) * 1.5;
        if (cc.taste) { const t = c[`synth_${cc.taste}`]; if (t != null) add += t >= 0.6 ? 18 : t >= 0.5 ? 8 : 0; }
        if (cc.uses && c.uses && cc.uses.some((u) => String(c.uses).includes(u))) add += 6;
        if (add > 0) { concept += add; reasons.push(`'${cc.label}' 느낌`); }
      }

      const total = exact + concept;
      if (total <= 0) continue;
      if (inReview) reasons.push(`리뷰에 '${tokens.find((t) => occ(reviewText, t) > 0)}' 언급`);
      else if (tokenHit.size > 0) reasons.push(`'${Array.from(tokenHit)[0]}' 직접 일치`);

      scored.push({
        id: c.id, name: c.name, area: c.area, grade: c.synth_grade, count: c.synth_count,
        identity: c.synth_identity, score: Math.round(total * 10) / 10, reasons: reasons.slice(0, 3),
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return NextResponse.json({
      ok: true, region: region || "수도권 전체", q,
      concepts: hitConcepts.map((c) => c.label),
      count: scored.length, results: scored.slice(0, 24),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
