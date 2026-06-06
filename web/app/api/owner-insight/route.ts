import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

const REGIONS: Record<string, string[]> = {
  서울: ["강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구","동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구","영등포구","용산구","은평구","종로구","중구","중랑구"],
  경기: ["수원시","성남시","고양시","용인시","부천시","안산시","안양시","남양주시","화성시","평택시","의정부시","시흥시","파주시","김포시","광명시","광주시","군포시","하남시","오산시","양주시","구리시","안성시","포천시","의왕시","여주시","동두천시","과천시","이천시","양평군","가평군","연천군"],
  인천: ["중구","동구","미추홀구","연수구","남동구","부평구","계양구","서구","강화군","옹진군"],
};
function guOf(area: string): string {
  const a = (area ?? "").trim();
  if (a.includes("인천")) { for (const g of REGIONS["인천"]) if (a.includes(g)) return "인천 " + g; return "인천"; }
  for (const list of Object.values(REGIONS)) for (const g of list) if (a.includes(g)) return g;
  if (a.includes("구리")) return "구리시";
  return a;
}
const CHAR_AXES = [
  { key: "roast", label: "직접로스팅", emoji: "🔥" },
  { key: "work", label: "작업·공부", emoji: "💻" },
  { key: "quiet", label: "조용·혼자", emoji: "🤍" },
  { key: "dessert", label: "디저트", emoji: "🍰" },
  { key: "mood", label: "분위기", emoji: "📸" },
  { key: "space", label: "넓은공간", emoji: "🪑" },
];

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const name = req.nextUrl.searchParams.get("name") ?? "";
    if (!name) return NextResponse.json({ ok: false, error: "name 필요" }, { status: 400 });

    const me = (await sql`SELECT id, name, area, synth_grade, synth_count, synth_identity, char_scores FROM cafes WHERE name = ${name} LIMIT 1`)[0];
    if (!me) return NextResponse.json({ ok: false, error: "카페를 찾을 수 없음" }, { status: 404 });

    const myGu = guOf(me.area);
    const all = await sql`SELECT name, area, synth_grade, synth_count, synth_identity, char_scores FROM cafes WHERE published = true` as unknown as any[];
    const hood = all.filter((c) => guOf(c.area) === myGu);

    // 순위
    const sorted = [...hood].sort((a, b) => (b.synth_count ?? 0) - (a.synth_count ?? 0));
    const rank = sorted.findIndex((c) => c.name === me.name) + 1;
    const rankList = sorted.map((c, i) => ({ rank: i + 1, name: c.name, count: c.synth_count ?? 0, grade: c.synth_grade, isMe: c.name === me.name }));

    // ===== 축별 점수화 (절대 카운트 → 도시 전체 분포 내 백분위 0~100) =====
    // PRINCIPLES §3/§5: 절대점수 대신 분포 내 상대 위치로 변환·정규화.
    // raw 카운트는 (a)축마다 키워드 흔한 정도가 달라 baseline이 안 맞고(디저트·분위기↑, 작업·조용↓),
    // (b)리뷰량 많을수록 모든 축이 커지는 볼륨 편향이 있어 그대로 비교하면 무의미하다.
    // → 각 축을 "그 특징이 언급된 도시 카페들 분포" 안의 백분위로 환산하면 두 편향이 동시에 제거된다.
    const cityNonzero: Record<string, number[]> = {};
    for (const ax of CHAR_AXES) {
      cityNonzero[ax.key] = all
        .map((c) => (c.char_scores ?? {})[ax.key] ?? 0)
        .filter((v: number) => v > 0)
        .sort((a: number, b: number) => a - b);
    }
    // 언급 0 → 0점(근거 없음, 정직히). 그 외 → 비영 분포 내 중위순위 백분위(동률은 절반 배분).
    const axisScore = (count: number, key: string): number => {
      if (!count || count <= 0) return 0;
      const arr = cityNonzero[key];
      if (!arr.length) return 0;
      let below = 0, equal = 0;
      for (const v of arr) { if (v < count) below++; else if (v === count) equal++; }
      return Math.round(((below + equal / 2) / arr.length) * 100);
    };

    // 성격 프로필 — me/avg 모두 0~100 점수(동일 척도). raw 카운트는 근거로 함께 보존.
    const charProfile = CHAR_AXES.map((ax) => {
      const myRaw = (me.char_scores ?? {})[ax.key] ?? 0;
      const meScore = axisScore(myRaw, ax.key);
      const hoodScores = hood.map((c) => axisScore((c.char_scores ?? {})[ax.key] ?? 0, ax.key));
      const avgScore = hoodScores.length ? Math.round(hoodScores.reduce((s, x) => s + x, 0) / hoodScores.length) : 0;
      const hasCount = hood.filter((c) => ((c.char_scores ?? {})[ax.key] ?? 0) > 0).length;
      return { key: ax.key, label: ax.label, emoji: ax.emoji,
        me: meScore, avg: avgScore, diff: meScore - avgScore, meRaw: myRaw,
        ratio: avgScore > 0 ? meScore / avgScore : (meScore > 0 ? 99 : 0),
        hoodPenetration: hood.length ? Math.round((hasCount / hood.length) * 100) : 0 };
    });

    // 비슷한 카페
    const myV = CHAR_AXES.map((ax) => (me.char_scores ?? {})[ax.key] ?? 0);
    const similar = hood.filter((c) => c.name !== me.name).map((c) => {
      const v = CHAR_AXES.map((ax) => (c.char_scores ?? {})[ax.key] ?? 0);
      return { name: c.name, grade: c.synth_grade, count: c.synth_count, dist: Math.sqrt(myV.reduce((s, x, i) => s + (x - v[i]) ** 2, 0)) };
    }).sort((a, b) => a.dist - b.dist).slice(0, 3);

    // ===== 액션 플랜 자동 생성 (데이터에서만 도출) =====
    const actions: { type: string; title: string; body: string; tone: "good" | "warn" | "info" }[] = [];

    // [차별점] 동네 평균보다 20점+ 앞서고 절대 수준도 높은(60+) 축
    const strong = [...charProfile].filter((c) => c.me >= 60 && c.diff >= 20).sort((a, b) => b.diff - a.diff);
    if (strong.length > 0) {
      const s = strong[0];
      actions.push({ type: "차별점", tone: "good", title: `${s.emoji} ${s.label} — 당신의 무기`,
        body: `'${s.label}' 점수 **${s.me}/100**(언급 ${s.meRaw}회)로 동네 평균 ${s.avg}점보다 **${s.diff}점 높습니다**. 이 동네에서 당신을 규정하는 **차별점**이에요. 메뉴판·간판·온라인 소개에서 **${s.label}을(를) 1순위로** 내세우세요.` });
    }

    // [빈 포지션] 동네 침투율 30% 이하(희소)인데 내가 실제로 가진(50+) 축
    const rare = charProfile.filter((c) => c.me >= 50 && c.hoodPenetration <= 30 && c.hoodPenetration > 0).sort((a, b) => a.hoodPenetration - b.hoodPenetration);
    if (rare.length > 0) {
      const r = rare[0];
      actions.push({ type: "빈 포지션", tone: "info", title: `${r.emoji} ${r.label} — 선점 기회`,
        body: `${myGu} 카페 중 '${r.label}'(으)로 이야기되는 곳은 **${r.hoodPenetration}%뿐**인데, 당신은 이미 **${r.me}점**(언급 ${r.meRaw}회)의 신호가 있습니다. **경쟁이 비어있는 자리**예요 — '${r.label}' 포지션을 명확히 내세우면 이 수요를 **선점**할 수 있습니다.` });
    }

    // [매몰점] 동네 평균과 거의 같고(±10점) 어느 정도 존재하는(30+) 축 → 차별 안 됨
    const buried = charProfile.filter((c) => c.me >= 30 && Math.abs(c.diff) <= 10).sort((a, b) => b.me - a.me);
    if (buried.length > 0) {
      const b = buried[0];
      actions.push({ type: "매몰점", tone: "warn", title: `${b.emoji} ${b.label} — 차별화 안 됨`,
        body: `'${b.label}'은(는) 당신 ${b.me}점 vs 동네 평균 ${b.avg}점으로 **거의 같습니다**. 다른 카페도 다 가진 특징이라 **여기서 경쟁하면 묻힙니다**. 여기에 자원을 더 쏟기보다, **위의 차별점을 키우는 게 효율적**입니다.` });
    }

    // [보완점] 동네 평균보다 20점+ 뒤처진 축
    const weak = charProfile.filter((c) => c.diff <= -20).sort((a, b) => a.diff - b.diff);
    if (weak.length > 0) {
      const w = weak[0];
      actions.push({ type: "보완점", tone: "warn", title: `${w.emoji} ${w.label} — 약점`,
        body: `'${w.label}' 점수가 당신 ${w.me}점 vs 동네 평균 ${w.avg}점으로 **${Math.abs(w.diff)}점 낮습니다**. 이 부분을 **보강**하거나(메뉴·공간 개선 후 리뷰에 드러나게), 아니면 **과감히 포기하고 강점에 집중**하는 선택이 필요합니다.` });
    }

    // [순위 전략] 정량 격차
    const verified = hood.filter((c) => c.synth_grade === "검증").map((c) => c.synth_count ?? 0);
    const vAvg = verified.length ? Math.round(verified.reduce((s, x) => s + x, 0) / verified.length) : 0;
    const myCount = me.synth_count ?? 0;
    const above = sorted[rank - 2]; // 바로 위 카페
    let rankBody = `${myGu} ${hood.length}곳 중 **${rank}위** (리뷰 **${myCount}건**). `;
    if (above) rankBody += `바로 위 '${above.name}'와(과) **${(above.synth_count ?? 0) - myCount}건 차이**. `;
    if (vAvg > 0 && myCount < vAvg) rankBody += `검증등급 평균(${vAvg}건)까지 **약 ${vAvg - myCount}건 더 필요**합니다. `;
    rankBody += `순위는 리뷰 수 기준이니, 방문 손님이 자연스럽게 후기를 남기도록 하는 것(영수증 리뷰 안내, 시그니처 메뉴로 사진 유도)이 가장 직접적입니다.`;
    actions.push({ type: "순위 전략", tone: "info", title: "📈 순위를 올리려면", body: rankBody });

    return NextResponse.json({
      ok: true,
      me: { name: me.name, area: me.area, grade: me.synth_grade, count: me.synth_count, identity: me.synth_identity },
      gu: myGu, hoodCount: hood.length, rank, rankList, charProfile, similar, actions,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
