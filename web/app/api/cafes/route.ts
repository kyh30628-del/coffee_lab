import { NextResponse } from "next/server";
import { visitorBadges } from "@/lib/visitorMix";
import { loadCriteria } from "@/lib/criteria";
import { sql, ensureSchema } from "@/lib/db";
import { subscriptionLive } from "@/lib/flags";
import { encodeCharScores } from "@/lib/mapCafes";
export const runtime = "nodejs";
// 🧊 2026-09-01 — CDN 캐시 60초 재도입(CEO 승인). 이유와 조건은 아래.
//
//   금지였던 이유(2026-07-01 사고): 비공개 결재를 승인했는데 지도에 몇 분~1시간 남았다.
//     당시엔 **CDN을 지울 수단이 없어서** 캐시 자체를 포기했다(always-fresh).
//     그때 기록이 재도입 조건까지 적어뒀다 — "캐시는 실제 비용이 있을 때만 · 트래픽 성장 시 재도입".
//
//   지금 그 조건이 찼다: MAU 195→1,330(6.8배) · DB가 하루 22.6h(94%) 안 자 월 $40.
//     원인은 4MB 재생성이 아니라(그건 메모리 캐시로 막았다) **요청마다 도는 버전 확인 쿼리**다.
//     그게 5분 유휴를 영영 못 만들어 Neon 자동절전이 안 걸린다.
//
//   ⚠️ 수동 `Cache-Control: s-maxage` 헤더로 만든 CDN 항목은 revalidatePath로 **못 지운다**(별개 레이어).
//     그래서 Next 라우트 캐시(revalidate)를 쓴다 — 이건 revalidatePath로 지워진다.
//     공개상태가 바뀌면 cafeCacheInvalidate가 이 경로를 즉시 purge한다(어제 원격 purge 수리로 로컬 워커도 가능).
//   60초로 짧게 잡은 이유: purge가 실패해도 소비자 노출은 최대 1분(5분이면 절전 이득은 크지만 사고 시 5분).
export const revalidate = 60;

// 🗺️ 지도·목록용 응답. 무거운 synth_reviews는 제외(상세 열 때 따로 로드).
//
// ⚡ 2026-08-06 — 요청마다 공개 카페 13,460행(약 4MB)을 Neon에서 통째로 실어오고 CDN 캐시도 없어
//   실측 7.6초·gzip 739KB였다. 트래픽이 6.8배(MAU 195→1,330) 늘어 이제는 비용·이탈 양쪽 문제다.
//   그렇다고 CDN에 s-maxage를 다시 거는 건 금지 — 비공개 처리한 카페가 몇 분간 지도에 남던 사고로
//   이미 한 번 되돌린 길이다(CLAUDE.md §2.5 "공개 API는 always-fresh").
//   해법 = **버전 기반 메모리 캐시**. 요청마다 값 3개짜리 초경량 버전 쿼리만 돌려
//   (공개 수 · MAX(updated_at) · MAX(synth_updated)) 직전과 같으면 만들어 둔 응답을 그대로 준다.
//   데이터가 바뀌면 버전이 즉시 달라져 **always-fresh는 그대로**고, 안 바뀐 동안의 4MB 전송만 사라진다.
//   실측 근거: 공개 카페 변경은 최근 1시간 0건·24시간 21건 → 대부분의 요청이 캐시 적중.
type Cached = { version: string; body: string };
let cache: Cached | null = null;

export async function GET() {
  try {
    await ensureSchema();
    const [v] = (await sql`SELECT COUNT(*)::int n, COALESCE(MAX(updated_at)::text,'') u, COALESCE(MAX(synth_updated)::text,'') s
      FROM cafes WHERE published = true`) as any[];
    const live = subscriptionLive();
    const version = `${v?.n ?? 0}|${v?.u ?? ""}|${v?.s ?? ""}|${live ? 1 : 0}`;
    if (cache && cache.version === version) {
      return new NextResponse(cache.body, {
        headers: { "Content-Type": "application/json", "X-Cafes-Cache": "HIT" },
      });
    }
    await loadCriteria(); // 배지 임계(criteria) 프라임 — 없으면 폴백 DEFAULTS로 동작
    const cafes = await sql`
      SELECT c.id, c.name, c.area, c.dong, c.lat, c.lng, c.vibe, c.note, c.signature,
             c.synth_grade, c.synth_count, c.synth_identity, c.char_scores,
             c.visitor_n, c.visitor_trip, c.visitor_local,
             COALESCE(p.featured AND p.approved AND (p.featured_until IS NULL OR p.featured_until > now()), false) AS featured,
             COALESCE(dt.is_tourist, false) AS dong_tourist
      FROM cafes c
      LEFT JOIN cafe_promos p ON p.cafe_id = c.id
      -- 📰 관광지 동네(뉴스 기반, 2026-08-27) — dong_tourism은 ~1천 행이라 조인 비용 무시 수준.
      LEFT JOIN dong_tourism dt ON dt.area = c.area AND dt.dong = c.dong
      WHERE c.published = true
      ORDER BY (c.note IS NOT NULL AND c.note <> '') DESC, c.synth_count DESC NULLS LAST
    `;
    // 📉 페이로드 축소 — 담는 정보는 그대로 두고 낭비만 걷어낸다(실측 raw 4.04MB→2.51MB).
    //   ①빈 값은 키 자체를 뺀다(vibe·note·signature는 13,460곳 중 11곳만 값이 있다)
    //   ②좌표는 소수 5자리(약 1m)로 반올림
    //   ③char_scores 6축은 키 이름 대신 고정 순서 배열 `cs`로(단일 최대 항목, 전체의 26%)
    //   구독 라이브 전에는 featured(금색 핀·추천)를 소비자에 숨긴다 — 예전과 동일하게 값 자체를 안 보냄.
    const out = (cafes as any[]).map((c) => {
      const o: Record<string, unknown> = {
        id: c.id, name: c.name, area: c.area, dong: c.dong,
        lat: typeof c.lat === "number" ? Math.round(c.lat * 1e5) / 1e5 : c.lat,
        lng: typeof c.lng === "number" ? Math.round(c.lng * 1e5) / 1e5 : c.lng,
        synth_grade: c.synth_grade, synth_count: c.synth_count, synth_identity: c.synth_identity,
      };
      if (c.vibe) o.vibe = c.vibe;
      if (c.note) o.note = c.note;
      if (c.signature) o.signature = c.signature;
      if (live && c.featured) o.featured = true;
      const cs = encodeCharScores(c.char_scores);
      if (cs) o.cs = cs;
      // 🧳🏠 방문객 성격 배지 — 판정은 서버에서 하고 **붙는 곳만** 2글자로 보낸다("T"/"L"/"TL").
      //   13,634곳 전체에 숫자 3개를 실으면 페이로드가 커진다(위 ①~③ 축소 원칙과 같은 결).
      let vb = visitorBadges({ n: c.visitor_n ?? 0, trip: c.visitor_trip ?? 0, local: c.visitor_local ?? 0 })
        .map((b) => (b.key === "trip" ? "T" : "L")).join("");
      // "D" = 관광지로 알려진 동네(언론 보도 기준·동 단위 판정 — CEO 08-25 "후기 말투가 아니라 공개된 사실로").
      if (c.dong_tourist) vb += "D";
      if (vb) o.vb = vb;
      return o;
    });
    const body = JSON.stringify({ ok: true, cafes: out });
    cache = { version, body };
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json", "X-Cafes-Cache": "MISS" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), cafes: [] }, { status: 500 });
  }
}
