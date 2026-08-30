import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// 📇 아웃리치 콘솔 API — 사장님께 DM 보내는 일을 **클릭 몇 번**으로 줄인다(2026-08-29 CEO 지시).
//   기존엔 100줄짜리 마크다운을 열어 핸들 찾고 문구 복사하고 인스타 열고… 사람이 지쳐서 못 한다.
//
// 💰 비용: 대상 선정 쿼리가 공개 카페 전체에 윈도우 함수를 건다(약 1.8만 행).
//   관리자만 여는 화면이지만 새로고침마다 돌면 낭비다 → **프로세스 메모리에 6시간 캐시**
//   (app/c/[id]의 axisDist와 같은 패턴). 순위는 하루 단위로도 충분히 최신이다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const authed = (req: NextRequest) =>
  !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

const AXIS: Record<string, string> = { roast: "직접로스팅", work: "작업하기 좋은", quiet: "조용한",
  dessert: "디저트", mood: "분위기", space: "넓은공간", pet: "애견동반", brunch: "브런치",
  view: "뷰 좋은", bakery: "베이커리", terrace: "테라스·야외" };

type Target = { id: number; name: string; area: string; dong: string | null; handle: string;
  rank: number; areaN: number; count: number; strength: string | null };

let cache: { at: number; v: Target[] } | null = null;
const TTL = 6 * 60 * 60 * 1000;

/** 받침이 있으면 '이', 없으면 '가'. 없으면 "베이커리이(가)" 같은 문장이 사장님께 간다. */
function josaIGa(w: string): string {
  const c = String(w || "").trim().slice(-1).charCodeAt(0);
  if (Number.isNaN(c) || c < 0xac00 || c > 0xd7a3) return "가";
  return (c - 0xac00) % 28 !== 0 ? "이" : "가";
}

export function messageFor(t: Target): string {
  return [
    `안녕하세요, 동네 카페를 후기 데이터로 소개하는 '동네 커피 노트'입니다 ☕`,
    `${t.area} 후기를 정리하다 보니 ${t.name}${josaIGa(t.name)} ${t.area} 카페 ${t.areaN}곳 중 검증 후기 ${t.rank}위더라고요.`,
    t.strength ? `특히 '${t.strength}' 이야기가 많았어요.` : "",
    `사장님 가게만의 데이터(동네 순위·강점·손님들이 하는 말)를 무료 리포트로 정리해뒀습니다.`,
    `가입 없이 바로 보실 수 있어요: https://dongnecoffeenote.com/owner/r/${t.id}?src=dm`,
  ].filter(Boolean).join("\n");
}

async function loadTargets(): Promise<Target[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.v;
  // ⚠️ 순위·분모는 리포트 화면(/owner/r/[id])과 **같은 산식**이어야 한다(그 지역 공개 전체·동점은 id).
  //   부분집합으로 세면 분모가 작아져 DM 숫자가 화면과 어긋난다 — 사장님이 링크 열자마자 알아챈다.
  const rows = (await sql`
    WITH ranked AS (
      SELECT c.id, c.name, c.area, c.dong, c.instagram_url, c.synth_count, c.char_scores, c.synth_grade,
             RANK() OVER (PARTITION BY c.area ORDER BY COALESCE(c.synth_count,0) DESC, c.id ASC) rk,
             COUNT(*) OVER (PARTITION BY c.area) area_n
      FROM cafes c WHERE c.published = true
    )
    SELECT id, name, area, dong, instagram_url, synth_count, char_scores, rk, area_n FROM ranked
    WHERE rk <= 10 AND synth_grade = '검증'
      AND instagram_url IS NOT NULL AND instagram_url <> ''
      AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.cafe_id = ranked.id)
    ORDER BY synth_count DESC NULLS LAST LIMIT 300`) as any[];

  const v: Target[] = [];
  for (const r of rows) {
    const m = String(r.instagram_url || "").match(/instagram\.com\/([A-Za-z0-9_.]+)/);
    if (!m) continue;
    const cs = r.char_scores && typeof r.char_scores === "object" ? r.char_scores : null;
    const top = cs ? Object.entries(cs).filter(([k]) => k in AXIS).sort((a, b) => Number(b[1]) - Number(a[1]))[0] : null;
    v.push({ id: Number(r.id), name: r.name, area: r.area, dong: r.dong, handle: m[1],
      rank: Number(r.rk), areaN: Number(r.area_n), count: Number(r.synth_count ?? 0),
      strength: top && Number(top[1]) > 0 ? AXIS[top[0]] : null });
  }
  cache = { at: Date.now(), v };
  return v;
}

async function ensure() {
  await sql`CREATE TABLE IF NOT EXISTS outreach_log (
    cafe_id INT PRIMARY KEY, channel TEXT, sent_at TIMESTAMPTZ DEFAULT now(), note TEXT)`;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    await ensure();
    const targets = await loadTargets();
    const sent = (await sql`SELECT cafe_id, channel, sent_at::text FROM outreach_log`) as any[];
    const sentMap = new Map(sent.map((s) => [Number(s.cafe_id), s]));
    // 도착 여부 — 그 카페 리포트에 아웃리치 출처로 들어온 기록이 있나.
    const hits = (await sql`SELECT cafe_id, count(*)::int n FROM owner_funnel_events
      WHERE event = 'free_report_view' AND source LIKE 'outreach_%' GROUP BY 1`) as any[];
    const hitMap = new Map(hits.map((h) => [Number(h.cafe_id), Number(h.n)]));

    const today = (await sql`SELECT count(*)::int n FROM outreach_log
      WHERE sent_at > (now() AT TIME ZONE 'Asia/Seoul')::date AT TIME ZONE 'Asia/Seoul'`)[0] as any;

    const list = targets.map((t) => ({
      ...t,
      message: messageFor(t),
      link: `https://dongnecoffeenote.com/owner/r/${t.id}?src=dm`,
      // 💬 프로필이 아니라 **DM 대화창으로 직행**한다(2026-08-30).
      //   프로필로 보내면 사장님이 매번 [메시지] 버튼을 찾아 눌러야 한다 — 100건이면 그 클릭만 100번이다.
      //   ig.me/m/{handle}은 인스타 공식 단축링크로 해당 사용자와의 대화창을 바로 연다(실측 302 확인).
      instagram: `https://ig.me/m/${t.handle}`,
      profile: `https://www.instagram.com/${t.handle}/`,
      sentAt: sentMap.get(t.id)?.sent_at ?? null,
      visits: hitMap.get(t.id) ?? 0,
    }));
    return NextResponse.json({ ok: true, todaySent: Number(today.n), total: list.length,
      sentTotal: sent.length, list });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 150) }, { status: 500 });
  }
}

/** 보냈다고 표시(멱등). 되돌리기는 undo:true. */
export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    await ensure();
    const b = await req.json();
    const cafeId = Number(b.cafeId);
    if (!Number.isFinite(cafeId) || cafeId <= 0) return NextResponse.json({ ok: false }, { status: 400 });
    if (b.undo) await sql`DELETE FROM outreach_log WHERE cafe_id = ${cafeId}`;
    else await sql`INSERT INTO outreach_log (cafe_id, channel) VALUES (${cafeId}, ${String(b.channel ?? "dm").slice(0, 12)})
      ON CONFLICT (cafe_id) DO UPDATE SET sent_at = now()`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
  }
}
