// 네이버 검색 API로 카페 리뷰성 문서 수집 (PRINCIPLES.md 2조: 공식 API, 합법)
import { bumpNaver, markNaverExhausted } from "./naverBudget";
import { naverHeaders, markKeyExhausted, NAVER_KEY_COUNT } from "./naverKeys";

// 한 번에 받아오는 최대 건수. 포화 판정("이만큼 왔으면 더 있다")의 기준이기도 하다.
const NAVER_DISPLAY = 100;
// (A)방식: 원문 복제 금지. 인용 한 줄(요약) + 출처 링크 + 날짜만 보존.
export type WebSnippet = { text: string; title?: string; desc?: string; kind?: "blog" | "cafearticle"; time?: number; link?: string; source?: string; date?: string };

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;

function stripTags(s: string): string {
  return (s || "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
}
// 네이버가 tistory 태그/카테고리·`/m` 목록 URL 등 개별 발행일을 못 뽑는 글에 postdate="19900101"을
// 무음 기본값으로 채워 보내는 경우가 있음 — 파싱 실패로 취급해 날짜없음(undefined) 처리.
const isSentinelDate = (d: string) => d === "19900101";
function parseDate(d?: string): number | undefined {
  if (!d || d.length !== 8 || isSentinelDate(d)) return undefined;
  const y = +d.slice(0, 4), m = +d.slice(4, 6), day = +d.slice(6, 8);
  const t = new Date(y, m - 1, day).getTime();
  return isNaN(t) ? undefined : Math.floor(t / 1000);
}
function fmtDate(d?: string): string {
  if (!d || d.length !== 8 || isSentinelDate(d)) return "";
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

// display=100: 호출 수는 동일(쿼터 동일)하나 카페당 후기 텍스트 ~5배 확보(검증 정확도↑).
// 🚨 2026-08-25 교정: 네이버 검색 API 일일 한도(25,000)는 **애플리케이션 전체 공유**다.
//   local/blog/cafearticle이 각각 25,000인 줄 알고 수집을 병렬로 올렸다가 하루치를 태웠다
//   (실측 응답: 세 API 모두 `{count/quota=25000/25000}`). 그래서 여기서도 예산에 계상해야
//   naver_budget이 진실이 된다 — 예전엔 lib/discover.ts(발굴)만 계상해 절반만 보였다.
async function naverSearch(kind: "blog" | "cafearticle", query: string): Promise<{ items: WebSnippet[]; ok: boolean }> {
  if (!ID || !SECRET) return { items: [], ok: false };
  const url = `https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(query)}&display=${NAVER_DISPLAY}&sort=sim`;
  // 🔑 키가 여러 개면 소진된 키를 건너뛰며 재시도한다(lib/naverKeys.ts). 키 1개면 기존과 동일 동작.
  let res: Response | null = null;
  // ⚠️ 429는 **두 종류**다(discover.ts가 2026-07-11에 이미 겪은 함정 — 수집 경로엔 빠져 있었다):
  //   ① 일일한도(count/quota=…/25000·Query limit·errorCode 010) = 진짜 소진 → 키 교체/중단
  //   ② 초당 버스트 제한 = 일시적 → **짧게 쉬고 재시도**. 이걸 소진으로 처리하면 키가 통째로 죽고,
  //      콜은 썼는데 수확이 0이라 순수 낭비가 된다(실제로 샤드 하나가 '확보 0/20'으로 멈췄다).
  const BURST_WAIT = [300, 900, 2000];
  let burst = 0;
  for (let attempt = 0; attempt < Math.max(1, NAVER_KEY_COUNT) + BURST_WAIT.length; attempt++) {
    const k = naverHeaders();
    if (!k) return { items: [], ok: false }; // 전 키 소진 — 조용히 중단
    res = await fetch(url, { headers: k.headers });
    if (res.status !== 429) break;
    const body = await res.text().catch(() => "");
    const daily = /quota=\d+\/\d+|Query limit|"errorCode"\s*:\s*"010"/i.test(body);
    if (!daily) {
      if (burst >= BURST_WAIT.length) return { items: [], ok: false }; // 계속 버스트면 이번 질의만 포기
      await new Promise((r) => setTimeout(r, BURST_WAIT[burst++]));
      continue; // 같은 키로 재시도 — 키를 죽이지 않는다
    }
    markNaverExhausted().catch(() => {});
    if (!markKeyExhausted(k.label)) return { items: [], ok: false }; // 남은 키 없음
  }
  if (!res || !res.ok) return { items: [], ok: false };
  bumpNaver(1).catch(() => {}); // 성공 호출 계상 — 발굴과 **같은 카운터**를 쓴다(한도가 공유이므로)
  const data = await res.json();
  const items = (data.items ?? []).map((it: { title?: string; description?: string; postdate?: string; link?: string; bloggername?: string }) => {
    const title = stripTags(it.title ?? "");
    const desc = stripTags(it.description ?? "");
    return {
      text: `${title} ${desc}`.trim(),
      title, desc, kind,
      time: parseDate(it.postdate),
      link: it.link,
      source: it.bloggername || (kind === "cafearticle" ? "네이버 카페" : "네이버 블로그"),
      date: fmtDate(it.postdate),
    };
  }).filter((s: WebSnippet) => s.text.length >= 20);
  return { items, ok: true };
}

export async function fetchWebReviews(name: string, area: string, dong?: string): Promise<{ snippets: WebSnippet[]; apiError?: boolean; error?: string; debug?: unknown }> {
  if (!ID || !SECRET) return { snippets: [], error: "NAVER_CLIENT_ID/SECRET 미설정", apiError: true };
  try {
    // 지역을 모든 질의에 포함해 같은 상호의 다른 지점·동명 노이즈를 줄인다(#5).
    // 🏘️ 2026-09-06 동(洞) 계열 질의(CEO "리뷰를 더 풍성하게" — 8/26 실측 근거): 블로그는 시군구가 아니라
    //   "○○동 카페"로 쓴다(흔한이름 조사: 후기 내 시군구 언급보다 동 언급이 우세). `{이름} {동}`은
    //   `{이름} {지역}` 결과의 부분집합이 **아니므로**(다른 검색어) 포화 조기중단과 무관하게 항상 1회 돈다.
    //   비용: 곳당 +2콜(blog·cafearticle) — 쿼터 여유(일 25k) 안. 동명이 지역명에 이미 포함되면 생략.
    const dongQ = dong && dong.length >= 2 && !(area || "").includes(dong) && dong !== name ? [`${name} ${dong}`] : [];
    const queries = area
      ? [`${name} ${area}`, ...dongQ, `${name} ${area} 카페`, `${name} ${area} 후기`, `${name} ${area} 리뷰`]
      : [...dongQ, `${name} 카페 후기`, `${name} 카페 리뷰`, `${name} 후기`];
    const alwaysRun = new Set(dongQ); // 포화 조기중단 예외(별개 검색어 계열)
    const seen = new Set<string>();
    const snippets: WebSnippet[] = [];
    const debug: unknown[] = [];
    let anyOk = false, anyFail = false;
    // ⚡ 포화 조기중단(2026-08-26, CEO "낭비하지 말고 효율적으로") — 실측으로 검증한 규칙:
    //   첫 질의 `{이름} {지역}`이 display 상한(100건) **미만**을 반환하면 그 검색어의 결과가 소진된 것이라,
    //   더 좁은 질의(+카페/+후기/+리뷰)는 그 부분집합만 돌려준다 → 호출해도 **신규 0건**.
    //   검증: 비포화 6곳 전수에서 q2~q4 추가 신규 0건(위반 0). 포화(=100)일 때만 나머지를 돈다.
    //   효과: 표본상 절반이 비포화 → 곳당 8콜 → 평균 5콜(약 47% 절감), **손실 0**.
    for (const kind of ["blog", "cafearticle"] as const) {
      for (let qi = 0; qi < queries.length; qi++) {
        const q = queries[qi];
        const { items, ok } = await naverSearch(kind, q);
        if (ok) anyOk = true; else anyFail = true;
        debug.push({ q, kind, got: items.length, ok });
        for (const it of items) {
          const key = it.text.slice(0, 50);
          if (seen.has(key)) continue;
          seen.add(key);
          snippets.push(it);
        }
        await new Promise((r) => setTimeout(r, 120)); // 질의 간 최소 간격 — 샤드 2개가 동시에 때려 버스트 429 나던 걸 완화
        // 첫 질의가 비포화면 이 종류(blog/cafearticle)의 나머지 **같은 계열** 질의는 건너뛴다.
        //   ⚠️ ok=false(쿼터/오류)일 땐 items가 0이라 '비포화'로 오인할 수 있으므로 ok일 때만 판단한다.
        //   동 계열(alwaysRun)은 부분집합이 아니라 계속 돈다 — break 대신 지역계열만 스킵.
        if (qi === 0 && ok && items.length < NAVER_DISPLAY) {
          const rest = queries.slice(1).filter((x) => alwaysRun.has(x));
          for (const q2 of rest) {
            const r2 = await naverSearch(kind, q2);
            if (r2.ok) anyOk = true; else anyFail = true;
            debug.push({ q: q2, kind, got: r2.items.length, ok: r2.ok });
            for (const it of r2.items) { const k2 = it.text.slice(0, 50); if (!seen.has(k2)) { seen.add(k2); snippets.push(it); } }
            await new Promise((r) => setTimeout(r, 120));
          }
          break;
        }
      }
    }
    // 수집 0인데 호출이 한 번도 성공 못 함 → API 오류/쿼터(진짜 0건과 구분)
    const apiError = snippets.length === 0 && anyFail && !anyOk;
    return { snippets, apiError, debug };
  } catch (e) {
    return { snippets: [], error: String(e) };
  }
}
