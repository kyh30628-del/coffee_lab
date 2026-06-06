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
const CHAR_LABELS: Record<string, { label: string; emoji: string }> = {
  roast: { label: "직접로스팅", emoji: "🔥" }, work: { label: "작업하기 좋은", emoji: "💻" },
  quiet: { label: "조용한", emoji: "🤍" }, dessert: { label: "디저트", emoji: "🍰" },
  mood: { label: "분위기", emoji: "📸" }, space: { label: "넓은공간", emoji: "🪑" },
};
// 카페의 "원두·맛의 결" — 리뷰 데이터에서만 (헌법1)
function beanNote(c: any): string[] {
  const cs = c.char_scores ?? {};
  const tags = Object.entries(cs).filter(([, v]: any) => v > 0).sort((a: any, b: any) => b[1] - a[1]).slice(0, 2)
    .map(([k]: any) => CHAR_LABELS[k]?.label ?? k);
  return tags;
}
function reasonFor(c: any, kind: string): string {
  const cs = c.char_scores ?? {};
  const cnt = c.synth_count ?? 0;
  const beans = beanNote(c);
  if (kind === "top") return `리뷰 ${cnt}건이 모인 동네 대표 카페. ${beans.length ? beans.join("·") + " 결이 두드러집니다." : "꾸준히 회자되는 곳이에요."}`;
  if (kind === "specialty") {
    const r = cs.roast ?? 0;
    return `직접 로스팅 언급이 ${r}회로 또렷한, 커피에 진심인 집. 검증 등급(리뷰 ${cnt}건)으로 신뢰도도 높아요.`;
  }
  if (kind === "fresh") return `최근 우리 지도에 새로 발견된 곳. ${beans.length ? beans.join("·") + " 신호가 잡혔어요." : "리뷰가 쌓이는 중이에요."}`;
  return c.identity ?? "";
}
function slim(c: any, kind = "") {
  return { id: c.id, name: c.name, area: c.area, lat: c.lat, lng: c.lng,
    grade: c.synth_grade, count: c.synth_count, identity: c.synth_identity, note: c.note,
    beanNote: beanNote(c), reason: reasonFor(c, kind) };
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const region = req.nextUrl.searchParams.get("region") ?? ""; // 시군구 이름(선택)
    const all = await sql`
      SELECT id, name, area, lat, lng, synth_grade, synth_count, synth_identity, note, char_scores, created_at
      FROM cafes WHERE published = true` as unknown as any[];
    const scope = region ? all.filter((c) => guOf(c.area) === region) : all;

    // 🏆 Top 3 (리뷰 수)
    const top3 = [...scope].sort((a, b) => (b.synth_count ?? 0) - (a.synth_count ?? 0)).slice(0, 3).map((c:any)=>slim(c,"top"));

    // ✨ 새로 발견 (최근 등록 5)
    const fresh = [...scope].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5).map((c:any)=>slim(c,"fresh"));

    // 🔥 스페셜티 픽 (검증등급 + 직접로스팅 점수 높은 순)
    const specialty = scope.filter((c) => c.synth_grade === "검증" && ((c.char_scores ?? {}).roast ?? 0) >= 2)
      .sort((a, b) => ((b.char_scores ?? {}).roast ?? 0) - ((a.char_scores ?? {}).roast ?? 0)).slice(0, 5).map((c:any)=>slim(c,"specialty"));

    // 헤드라인 a: 리뷰 수 1위 (가장 검증된 곳)
    // headlineB 먼저 결정 (로스팅 점수 최고 = 주목할 로스터리)
    const headlineB = specialty[0] ?? null;

    // headlineA = 검증 스페셜티 대표 (검증 + 로스팅 확실(roast>=5) 중 리뷰 1위, headlineB와 중복 회피)
    const verifiedScope = scope.filter((c: any) => c.synth_grade === "검증");
    const strongRoast = verifiedScope
      .filter((c: any) => ((c.char_scores ?? {}).roast ?? 0) >= 5 && c.id !== headlineB?.id)
      .sort((a: any, b: any) => (b.synth_count ?? 0) - (a.synth_count ?? 0));
    const verifiedByReview = verifiedScope
      .filter((c: any) => c.id !== headlineB?.id)
      .sort((a: any, b: any) => (b.synth_count ?? 0) - (a.synth_count ?? 0));
    const headlineA = strongRoast.length > 0 ? slim(strongRoast[0], "top")
      : (verifiedByReview[0] ? slim(verifiedByReview[0], "top") : (top3[0] ?? null));
    // 헤드라인 b: 스페셜티 중 직접로스팅 점수 최고 (커피에 진심인 집)
    const usedIds = new Set([headlineA?.id, headlineB?.id].filter(Boolean));

    return NextResponse.json({
      ok: true, region: region || "전체", scopeCount: scope.length,
      headlineA, headlineB,
      top3: top3.filter((c) => !usedIds.has(c.id)),
      fresh: fresh.filter((c) => !usedIds.has(c.id)),
      specialty: specialty.filter((c) => !usedIds.has(c.id)),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
