import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { embedQuery, toVectorLiteral, hasEmbedKey } from "@/lib/embed";
import { hasSearchLLM, rerankWithClaude, type SearchCand } from "@/lib/searchAgent";
export const runtime = "nodejs";
export const maxDuration = 30;

// 자연어 카페 검색 (PRINCIPLES §1·§5): "떠오르는 느낌"으로도 찾게 한다.
// - 시맨틱: 임베딩(text-embedding-004) 코사인 유사도 — 사전에 없는 표현도 의미로 매칭.
// - exact/개념: 질의 토큰을 카페 텍스트·검증 리뷰에서 직접 매칭 + 느낌→신호 가산(근거 노출).
// 키 없으면 키워드 기반으로 자동 폴백. 점수는 DB 실제값만 사용(환각 금지).

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

// exact(키워드) + 개념(느낌) 가산 — 두 모드 공통
function lexicalScore(c: any, tokens: string[], hitConcepts: typeof CONCEPTS) {
  const reviewText = Array.isArray(c.synth_reviews) ? c.synth_reviews.map((r: any) => r?.quote ?? "").join(" ") : "";
  const fields: [string, number][] = [
    [c.name ?? "", 4], [c.synth_identity ?? "", 2.5], [c.signature ?? "", 2], [c.note ?? "", 2],
    [c.vibe ?? "", 2], [c.uses ?? "", 1.5], [c.beans ?? "", 1.5], [reviewText, 2], [c.area ?? "", 1],
  ];
  let exact = 0;
  const tokenHit = new Set<string>();
  for (const tok of tokens) for (const [text, w] of fields) { const n = occ(text, tok); if (n > 0) { exact += n * w; tokenHit.add(tok); } }

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
  const reviewTok = tokens.find((t) => occ(reviewText, t) > 0);
  if (reviewTok) reasons.push(`리뷰에 '${reviewTok}' 언급`);
  else if (tokenHit.size > 0) reasons.push(`'${Array.from(tokenHit)[0]}' 일치`);
  return { exact, concept, reasons };
}

const FIELDS = `id, name, area, synth_grade, synth_count, synth_identity, signature, note, vibe, uses, beans, char_scores, synth_reviews, synth_acidity, synth_body, synth_sweet`;

// Claude 후보용: char_scores → 한국어 특징 태그, 검증 리뷰 → 인용
const AXIS_LABEL: Record<string, string> = Object.fromEntries(CONCEPTS.filter((c) => c.axis).map((c) => [c.axis as string, c.label]));
function charTags(cs: any): string {
  if (!cs || typeof cs !== "object") return "";
  return Object.entries(cs).filter(([, v]) => Number(v) > 0).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 4).map(([k]) => AXIS_LABEL[k] ?? k).join(", ");
}
function quotesOf(reviews: any): string {
  if (!Array.isArray(reviews)) return "";
  return reviews.slice(0, 3).map((r: any) => r?.quote ?? "").filter(Boolean).join(" / ");
}

// 검색 캐시: (질문+지역)별 결과를 저장해 같은/비슷한 질문은 LLM·임베딩 재계산 없이 즉시 응답.
let cacheReady = false;
async function ensureCache() {
  if (cacheReady) return;
  await sql`CREATE TABLE IF NOT EXISTS search_cache (qkey TEXT PRIMARY KEY, payload JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`;
  cacheReady = true;
}
const CACHE_TTL_HOURS = 12;

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    const region = (req.nextUrl.searchParams.get("region") ?? "").trim();
    if (q.length < 1) return NextResponse.json({ ok: false, error: "검색어 필요" }, { status: 400 });

    // 캐시 조회: 같은 질문+지역이면 즉시 반환(LLM·임베딩 호출 0)
    await ensureCache();
    const qkey = q.toLowerCase().replace(/\s+/g, " ").trim() + "|" + region;
    const nocache = req.nextUrl.searchParams.get("nocache") === "1";
    if (!nocache) {
      const hit = (await sql`SELECT payload FROM search_cache WHERE qkey=${qkey} AND created_at > now() - (${CACHE_TTL_HOURS} || ' hours')::interval LIMIT 1`)[0];
      if (hit?.payload && Array.isArray(hit.payload.results) && hit.payload.results.length > 0) {
        return NextResponse.json({ ...hit.payload, cached: true }, {
          headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
        });
      }
    }

    const ql = q.toLowerCase();
    const tokens = Array.from(new Set(ql.split(/[\s,./?!~"'()]+/).filter((t) => t.length >= 2)));
    const hitConcepts = CONCEPTS.filter((c) => c.triggers.some((t) => ql.includes(t)));
    const short = region.replace(/(특별시|광역시|시|군|구)$/, "");
    const p1 = `%${region}%`, p2 = `%${short}%`;

    let mode: "semantic" | "keyword" | "ai" = "keyword";
    let scored: any[] = [];
    const byId = new Map<number, any>(); // Claude 재정렬용 원본 row 보관

    // ===== 시맨틱(임베딩) 경로 =====
    if (hasEmbedKey()) {
      try {
        const qvec = await embedQuery(q);
        if (qvec) {
          const lit = toVectorLiteral(qvec);
          const rows = (await sql.query(
            `SELECT ${FIELDS}, 1 - (embedding <=> $1::vector) AS sim
             FROM cafes
             WHERE published = true AND embedding IS NOT NULL
               AND ($2 = '' OR area ILIKE $3 OR area ILIKE $4)
             ORDER BY embedding <=> $1::vector
             LIMIT 80`,
            [lit, region, p1, p2],
          )) as unknown as any[];
          if (rows.length > 0) {
            mode = "semantic";
            for (const c of rows) byId.set(c.id, c);
            scored = rows.map((c) => {
              const { exact, concept, reasons } = lexicalScore(c, tokens, hitConcepts);
              const sim = Number(c.sim) || 0;
              const total = sim * 100 + exact + concept; // 의미 유사도가 1차, 키워드·느낌이 가산
              const why = [`의미 유사 ${Math.round(sim * 100)}%`, ...reasons];
              return { id: c.id, name: c.name, area: c.area, grade: c.synth_grade, count: c.synth_count, identity: c.synth_identity, score: Math.round(total * 10) / 10, reasons: why.slice(0, 3) };
            });
          }
        }
      } catch {
        // 임베딩 실패 → 키워드 폴백
      }
    }

    // ===== 키워드/개념 폴백 =====
    if (scored.length === 0) {
      const rows = (await sql.query(`SELECT ${FIELDS} FROM cafes WHERE published = true`)) as unknown as any[];
      for (const c of rows) {
        if (!inRegion(c.area ?? "", region)) continue;
        const { exact, concept, reasons } = lexicalScore(c, tokens, hitConcepts);
        const total = exact + concept;
        if (total <= 0) continue;
        byId.set(c.id, c);
        scored.push({ id: c.id, name: c.name, area: c.area, grade: c.synth_grade, count: c.synth_count, identity: c.synth_identity, score: Math.round(total * 10) / 10, reasons: reasons.slice(0, 3) });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    // ===== Claude Sonnet 맥락 재정렬 (콘솔 API 키 있을 때) =====
    // 후보를 압축해 보내고, 질문 의도에 맞는 곳만 선별·정렬. 실패/키없음 시 위 점수순 폴백.
    let results = scored.slice(0, 24);
    if (hasSearchLLM() && scored.length > 0) {
      const cands: SearchCand[] = scored.slice(0, 25).map((s) => {
        const c = byId.get(s.id) ?? {};
        return { id: s.id, name: s.name, area: s.area, identity: c.synth_identity ?? s.identity, tags: charTags(c.char_scores), quotes: quotesOf(c.synth_reviews) };
      });
      const ranked = await rerankWithClaude(q, region, cands);
      if (ranked && ranked.length > 0) {
        mode = "ai";
        const sById = new Map(scored.map((s) => [s.id, s]));
        results = ranked.map((r) => { const s = sById.get(r.id); return s ? { ...s, reasons: r.reason ? [r.reason] : s.reasons } : null; }).filter(Boolean).slice(0, 24) as any[];
      }
    }

    // ===== 상호(카페명) 직접 매칭 — 시맨틱/재정렬이 놓치는 '이름 검색'을 항상 보장(최상단 고정) =====
    //   '마루빈'처럼 의미가 없는 상호는 임베딩으로 안 떠서 사라지던 버그 차단. 띄어쓰기 무시 매칭.
    try {
      const dq = ql.replace(/\s+/g, "");
      if (dq.length >= 2) {
        const nameRows = (await sql.query(
          `SELECT ${FIELDS} FROM cafes WHERE published = true
             AND replace(lower(name), ' ', '') LIKE $1
             AND ($2 = '' OR area ILIKE $3 OR area ILIKE $4)
           ORDER BY (replace(lower(name), ' ', '') = $5) DESC, synth_count DESC NULLS LAST LIMIT 8`,
          [`%${dq}%`, region, p1, p2, dq],
        )) as unknown as any[];
        if (nameRows.length > 0) {
          const have = new Set(results.map((r: any) => r.id));
          const nameResults = nameRows.filter((c) => !have.has(c.id)).map((c) => ({
            id: c.id, name: c.name, area: c.area, grade: c.synth_grade, count: c.synth_count,
            identity: c.synth_identity, score: 9999, reasons: ["카페명 일치"],
          }));
          if (nameResults.length > 0) results = [...nameResults, ...results].slice(0, 24);
        }
      }
    } catch { /* 상호매칭 실패해도 기존 결과 유지 */ }

    const payload = {
      ok: true, mode, region: region || "수도권 전체", q,
      concepts: hitConcepts.map((c) => c.label),
      count: results.length, results,
    };
    // 결과가 있으면 캐시에 저장(다음 동일 질문은 재계산 0)
    if (results.length > 0) {
      sql`INSERT INTO search_cache (qkey, payload, created_at) VALUES (${qkey}, ${JSON.stringify(payload)}, now())
          ON CONFLICT (qkey) DO UPDATE SET payload=EXCLUDED.payload, created_at=now()`.catch(() => {});
    }
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
