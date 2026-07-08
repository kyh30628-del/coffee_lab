import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { embedQuery, toVectorLiteral, hasEmbedKey } from "@/lib/embed";
import { hasSearchLLM, rerankWithClaude, lastRerankError, type SearchCand } from "@/lib/searchAgent";
import { loadCriteria, getCriterionSync } from "@/lib/criteria";
import { loadCriteriaLists, getListSync } from "@/lib/criteriaLists";
export const runtime = "nodejs";
export const maxDuration = 30;

// 자연어 카페 검색 (PRINCIPLES §1·§5): "떠오르는 느낌"으로도 찾게 한다.
// - 시맨틱: 임베딩(text-embedding-004) 코사인 유사도 — 사전에 없는 표현도 의미로 매칭.
// - exact/개념: 질의 토큰을 카페 텍스트·검증 리뷰에서 직접 매칭 + 느낌→신호 가산(근거 노출).
// 키 없으면 키워드 기반으로 자동 폴백. 점수는 DB 실제값만 사용(환각 금지).

// 수도권(서울·경기·인천) 외 지역 키워드 — query 또는 region에 포함 시 미서비스 안내.
//   사전은 lib/criteriaLists.ts("search.out_of_coverage")가 단일출처(무배포 편집). 폴백=현재값.
//   감사수리: bare "광주"는 서비스 지역인 경기 광주시에 오경보 → 명시형만 유지.

function detectOutOfCoverage(q: string, region: string): string | null {
  const text = (q + " " + region).toLowerCase();
  for (const kw of getListSync("search.out_of_coverage")) {
    if (text.includes(kw)) {
      return `현재 동네 커피 노트는 수도권(서울·경기·인천)만 서비스합니다. '${kw}' 지역 카페는 아직 포함되어 있지 않아요. 수도권 검색어로 다시 시도해 보세요.`;
    }
  }
  return null;
}

// 검색 개념 트리거 — 트리거 리스트는 lib/criteriaLists.ts("concept.*.triggers")가 단일출처(무배포 편집).
//   여기엔 개념 구조(축·용도·라벨)와 리터럴 사전키(triggersKey)만 둔다. c.triggers는 getter로 매 접근시 getListSync(폴백=현재값).
const CONCEPTS_BASE: { id: string; triggersKey: string; axis?: string; taste?: string; uses?: string[]; label: string }[] = [
  { id: "quiet", triggersKey: "concept.quiet.triggers", axis: "quiet", uses: ["혼자"], label: "조용·혼자" },
  { id: "work", triggersKey: "concept.work.triggers", axis: "work", uses: ["작업"], label: "작업·공부" },
  { id: "mood", triggersKey: "concept.mood.triggers", axis: "mood", uses: ["사진"], label: "분위기·감성" },
  { id: "dessert", triggersKey: "concept.dessert.triggers", axis: "dessert", uses: ["빵"], label: "디저트·빵" },
  { id: "roast", triggersKey: "concept.roast.triggers", axis: "roast", label: "직접로스팅·스페셜티" },
  { id: "space", triggersKey: "concept.space.triggers", axis: "space", label: "넓은공간" },
  { id: "acidity", triggersKey: "concept.acidity.triggers", taste: "acidity", label: "산미 또렷" },
  { id: "body", triggersKey: "concept.body.triggers", taste: "body", label: "묵직·고소" },
  { id: "sweet", triggersKey: "concept.sweet.triggers", taste: "sweet", label: "단맛" },
];
const CONCEPTS: { id: string; triggers: string[]; axis?: string; taste?: string; uses?: string[]; label: string }[] =
  CONCEPTS_BASE.map((c) => ({ id: c.id, axis: c.axis, taste: c.taste, uses: c.uses, label: c.label, get triggers() { return getListSync(c.triggersKey); } }));

// 서울 25개 구 목록 (cafes.area에는 접두사 없이 "마포구" 형태로 저장)
const SEOUL_GU = [
  "종로구","중구","용산구","성동구","광진구","동대문구","중랑구","성북구",
  "강북구","도봉구","노원구","은평구","서대문구","마포구","양천구","강서구",
  "구로구","금천구","영등포구","동작구","관악구","서초구","강남구","송파구","강동구",
];
// 경기도 시·군 목록
const GYEONGGI_SI = [
  "수원시","성남시","의정부시","안양시","부천시","광명시","평택시","동두천시",
  "안산시","고양시","과천시","구리시","남양주시","오산시","시흥시","군포시",
  "의왕시","하남시","용인시","파주시","이천시","안성시","김포시","화성시",
  "광주시","양주시","포천시","여주시","연천군","가평군","양평군",
];
// 동네·상권명 → 행정구 매핑 (region 없는 검색에서 "홍대" → "마포구" 자동 추출)
const DONG_TO_GU: Record<string, string> = {
  "홍대": "마포구", "합정": "마포구", "망원": "마포구", "연남": "마포구", "상암": "마포구", "상수": "마포구", "공덕": "마포구",
  "이태원": "용산구", "한남": "용산구", "해방촌": "용산구", "경리단": "용산구",
  "성수": "성동구", "서울숲": "성동구", "왕십리": "성동구",
  "강남": "강남구", "신사": "강남구", "압구정": "강남구", "청담": "강남구", "역삼": "강남구", "논현": "강남구", "가로수길": "강남구",
  "서초": "서초구", "방배": "서초구", "반포": "서초구", "양재": "서초구",
  "잠실": "송파구", "석촌": "송파구",
  "을지로": "중구", "명동": "중구", "충무로": "중구",
  "종로": "종로구", "광화문": "종로구", "인사동": "종로구", "북촌": "종로구", "삼청": "종로구", "익선": "종로구",
  "신촌": "서대문구", "연희": "서대문구",
  "건대": "광진구", "뚝섬": "광진구",
  "여의도": "영등포구", "당산": "영등포구",
  "목동": "양천구", "마곡": "강서구",
  "가산": "금천구", "구로": "구로구",
};
// 광역명("서울","경기") → 하위 행정구역 목록. 없으면 null.
function metroAreaList(region: string): string[] | null {
  if (region === "서울" || region === "서울특별시") return SEOUL_GU;
  if (region === "경기" || region === "경기도") return GYEONGGI_SI;
  return null;
}

function inRegion(area: string, region: string): boolean {
  if (!region) return true;
  const a = area ?? "";
  // 🗺️ 인천 동명 구(중구·동구) 구분: 인천 area는 "인천 OO"로 저장, 서울/경기는 접두사 없음.
  //   region이 "인천 OO"면 인천만, 아니면 인천 카페는 제외(서울 중구 ≠ 인천 중구).
  if (region.startsWith("인천")) {
    const gu = region.replace(/^인천\s*/, "");
    return a.startsWith("인천") && (a.includes(gu) || a.includes(region));
  }
  if (a.startsWith("인천")) return false;
  // 서울·경기 광역명 → 하위 구/시 목록으로 확장 매칭
  const metroList = metroAreaList(region);
  if (metroList) return metroList.some((g) => a.includes(g));
  if (a.includes(region)) return true;
  const short = region.replace(/(특별시|광역시|시|군|구)$/, "");
  return short.length >= 2 && a.includes(short);
}
const occ = (text: string, kw: string) => (!text || !kw ? 0 : text.toLowerCase().split(kw.toLowerCase()).length - 1);

// exact(키워드) + 개념(느낌) 가산 — 두 모드 공통
function lexicalScore(c: any, tokens: string[], hitConcepts: typeof CONCEPTS) {
  const reviewText = Array.isArray(c.synth_reviews) ? c.synth_reviews.map((r: any) => r?.quote ?? "").join(" ") : "";
  // 필드가중치는 criteria 단일출처(폴백 4/2.5/2/2/2/1.5/1.5/2/1). GET 진입 시 loadCriteria로 캐시 프라임(동기 읽기).
  const fields: [string, number][] = [
    [c.name ?? "", getCriterionSync("search.field_weight.name")], [c.synth_identity ?? "", getCriterionSync("search.field_weight.identity")], [c.signature ?? "", getCriterionSync("search.field_weight.signature")], [c.note ?? "", getCriterionSync("search.field_weight.note")],
    [c.vibe ?? "", getCriterionSync("search.field_weight.vibe")], [c.uses ?? "", getCriterionSync("search.field_weight.uses")], [c.beans ?? "", getCriterionSync("search.field_weight.beans")], [reviewText, getCriterionSync("search.field_weight.review")], [c.area ?? "", getCriterionSync("search.field_weight.area")],
  ];
  let exact = 0;
  const tokenHit = new Set<string>();
  for (const tok of tokens) for (const [text, w] of fields) { const n = occ(text, tok); if (n > 0) { exact += n * w; tokenHit.add(tok); } }

  let concept = 0;
  const cs = c.char_scores ?? {};
  const reasons: string[] = [];
  for (const cc of hitConcepts) {
    let add = 0;
    if (cc.axis && (cs[cc.axis] ?? 0) > 0) add += Math.min(cs[cc.axis], getCriterionSync("search.char_axis.cap")) * getCriterionSync("search.char_axis.scale");
    if (cc.taste) { const t = c[`synth_${cc.taste}`]; if (t != null) add += t >= getCriterionSync("search.taste.high") ? getCriterionSync("search.taste.high_bonus") : t >= getCriterionSync("search.taste.mid") ? getCriterionSync("search.taste.mid_bonus") : 0; }
    if (cc.uses && c.uses && cc.uses.some((u) => String(c.uses).includes(u))) add += 6;
    if (add > 0) { concept += add; reasons.push(`'${cc.label}' 느낌`); }
  }
  const reviewTok = tokens.find((t) => occ(reviewText, t) > 0);
  if (reviewTok) reasons.push(`리뷰에 '${reviewTok}' 언급`);
  else if (tokenHit.size > 0) reasons.push(`'${Array.from(tokenHit)[0]}' 일치`);
  return { exact, concept, reasons };
}

const FIELDS = `id, name, area, synth_grade, synth_count, synth_identity, signature, note, vibe, uses, beans, char_scores, synth_reviews, synth_acidity, synth_body, synth_sweet`;

// 등급 가중치 — '검증'이 '참고'보다 위 노출(동네 커피 노트의 약속). 절대 우선은 아니고 가산.
//   임계값은 DB 기준(criteria) 단일출처, 폴백=검증25/참고8. GET 진입 시 loadCriteria로 캐시 프라임.
const gradeBonus = (g?: string): number => (g === "검증" ? getCriterionSync("search.grade_bonus.verified") : g === "참고" ? getCriterionSync("search.grade_bonus.reference") : 0);
// 일반 카테고리·개념 단어 — 이런 검색은 '이름이 그 단어인 카페'가 아니라 '그 부류 옥석'을 원함.
//   → 이름 직접매칭(9999 최상단 고정)을 건너뛰어 등급순 노출이 살게 한다(참고가 검증 위로 가던 버그 차단).
const CATEGORY_WORD = new Set(["로스터리", "로스터스", "로스터즈", "로스팅", "핸드드립", "드립", "베이커리", "디저트", "브런치", "스페셜티", "에스프레소", "아메리카노", "라떼", "콜드브루", "원두", "제과", "빵집", "북카페", "카페", "커피", "커피숍", "커피전문점"]);
// 브랜드 상호가 영문(STARBUCKS 등)으로 등록돼 한글 질의(스타벅스)와 표기가 달라 이름 직접매칭이 누락되던 버그(#120) —
//   실제 상호가 그 브랜드를 리뷰에서만 언급한 무관 카페보다 랭킹이 밀리던 원인. 한글↔영문 별칭을 매칭에 포함시켜 방지.
const BRAND_ALIAS: Record<string, string[]> = {
  "스타벅스": ["starbucks"], "이디야": ["ediya"], "투썸플레이스": ["twosome", "twosomeplace"],
  "커피빈": ["coffeebean", "thecoffeebean"], "폴바셋": ["paulbassett"], "블루보틀": ["bluebottle"],
  "할리스": ["hollys"], "탐앤탐스": ["tomntoms", "tomandtoms"], "빽다방": ["paikscoffee"],
  "메가커피": ["megacoffee", "megamgccoffee"], "컴포즈커피": ["composecoffee"], "매머드커피": ["mammothcoffee"],
};

// 체인·다지점 브랜드 독점 방지 — "로스터리" 같은 카테고리 검색 상위권이 한 브랜드 지점들로만 채워지던 버그(#120).
//   상호 첫 단어를 브랜드 키로 보고 같은 키는 최대 CHAIN_CAP개까지만 순위를 지키고, 초과분은 뒤로 밀어(제거 아님)
//   다른 브랜드가 상위에 섞이게 한다. 상호 직접검색(아래 이름매칭 블록)은 이 함수 이후에 추가되므로 영향 없음.
// CHAIN_CAP은 criteria 단일출처(폴백 2). GET 진입 시 loadCriteria 프라임 후 diversifyChains에서 동기 읽기.
// 마지막 단어(지점명: "역삼점" 등)를 뺀 나머지를 공백 없이 합쳐 키로 삼는다 —
// "로스터리 락온"(2단어 브랜드) 지점이 "로스터리 락온 역삼점"/"로스터리락온 역삼점"처럼 표기가 섞여도
// 같은 체인 키로 묶이게 한다(기존엔 첫 단어만 써서 "로스터리"↔"로스터리락온"으로 갈려 CHAIN_CAP이 무력화됨).
const chainKeyOf = (name: string): string => { const parts = (name ?? "").trim().split(/\s+/).filter(Boolean); return parts.length >= 2 ? parts.slice(0, -1).join("") : (name ?? ""); };
function diversifyChains<T extends { name: string }>(list: T[]): T[] {
  const chainCap = getCriterionSync("search.chain_cap");
  const count = new Map<string, number>();
  const kept: T[] = [];
  const overflow: T[] = [];
  for (const r of list) {
    const key = chainKeyOf(r.name);
    const n = count.get(key) ?? 0;
    if (n < chainCap) { kept.push(r); count.set(key, n + 1); } else overflow.push(r);
  }
  return [...kept, ...overflow];
}

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
// 검색 캐시 유효시간은 criteria 단일출처(폴백 3시간). GET 진입 시 loadCriteria 프라임 후 동기 읽기.
//   12→3시간: 비공개 카페가 캐시에 남는 시간 단축(heal이 비공개 발생 시 즉시 무효화도 함)

// 🔎 검색 수요 로깅(비차단) — 무엇을 찾고 결과가 충분했는지 적재. cron-demand가 수요-공급 갭 분석.
//   내부 헬스체크 호출(X-Internal-Check 헤더)은 실사용자 수요가 아니므로 제외 — 아니면 수요분석이 봇을 실사용자로 오인(#113).
function logSearch(q: string, region: string, results: number, mode: string, internal: boolean, aiErr?: string | null) {
  if (!q || q.length < 1 || internal) return;
  sql`CREATE TABLE IF NOT EXISTS search_log (id BIGSERIAL PRIMARY KEY, q TEXT, region TEXT, results INT, mode TEXT, ts TIMESTAMPTZ DEFAULT now())`.catch(() => {});
  sql`ALTER TABLE search_log ADD COLUMN IF NOT EXISTS ai_err TEXT`.catch(() => {});
  sql`INSERT INTO search_log (q, region, results, mode, ai_err) VALUES (${q.slice(0, 80)}, ${(region || "").slice(0, 40)}, ${results}, ${mode}, ${aiErr ?? null})`.catch(() => {});
}

export async function GET(req: NextRequest) {
  await loadCriteria(); // 등급 가산점 기준 캐시 프라임(동기 gradeBonus가 읽음)
  await loadCriteriaLists(); // 개념 트리거·미서비스지역 사전 캐시 프라임(동기 getListSync가 읽음)
  try {
    await ensureSchema();
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    const region = (req.nextUrl.searchParams.get("region") ?? "").trim();
    if (q.length < 1) return NextResponse.json({ ok: false, error: "검색어 필요" }, { status: 400 });
    const isInternalCheck = !!req.headers.get("x-internal-check"); // 헬스체크 대표질의 — search_log 수요 집계에서 제외

    const ql = q.toLowerCase();
    const tokens = Array.from(new Set(ql.split(/[\s,./?!~"'()]+/).filter((t) => t.length >= 2)));
    const hitConcepts = CONCEPTS.filter((c) => c.triggers.some((t) => ql.includes(t)));
    let effectiveRegion = region;
    if (!effectiveRegion) {
      for (const tok of tokens) {
        if (DONG_TO_GU[tok]) { effectiveRegion = DONG_TO_GU[tok]; break; }
        if (SEOUL_GU.includes(tok)) { effectiveRegion = tok; break; }
        if (GYEONGGI_SI.includes(tok)) { effectiveRegion = tok; break; }
      }
    }

    // 캐시 조회: 같은 질문+지역이면 즉시 반환(LLM·임베딩 호출 0)
    await ensureCache();
    const qkey = q.toLowerCase().replace(/\s+/g, " ").trim() + "|" + effectiveRegion;
    const nocache = req.nextUrl.searchParams.get("nocache") === "1";
    if (!nocache) {
      const hit = (await sql`SELECT payload FROM search_cache WHERE qkey=${qkey} AND created_at > now() - (${getCriterionSync("search.cache_ttl_hours")} || ' hours')::interval LIMIT 1`)[0];
      if (hit?.payload && Array.isArray(hit.payload.results) && hit.payload.results.length > 0) {
        logSearch(q, region, Number(hit.payload?.count ?? 0), "cache", isInternalCheck);
        return NextResponse.json({ ...hit.payload, cached: true }, {
          headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
        });
      }
    }
    const shortRaw = effectiveRegion.replace(/(특별시|광역시|시|군|구)$/, "");
    const short = shortRaw.length >= 2 ? shortRaw : effectiveRegion; // '중구'→'중'(1자)는 중랑구까지 오매칭 → 전체이름 유지
    const p1 = `%${effectiveRegion}%`, p2 = `%${short}%`;
    const metroList = metroAreaList(effectiveRegion);

    let mode: "semantic" | "keyword" | "ai" = "keyword";
    let scored: any[] = [];
    const byId = new Map<number, any>(); // Claude 재정렬용 원본 row 보관

    // ===== 시맨틱(임베딩) 경로 =====
    if (hasEmbedKey()) {
      try {
        const qvec = await embedQuery(q);
        if (qvec) {
          const lit = toVectorLiteral(qvec);
          const rows = metroList
            ? (await sql.query(
                `SELECT ${FIELDS}, 1 - (embedding <=> $1::vector) AS sim
                 FROM cafes
                 WHERE published = true AND embedding IS NOT NULL
                   AND area = ANY($2::text[])
                 ORDER BY embedding <=> $1::vector
                 LIMIT 80`,
                [lit, metroList],
              )) as unknown as any[]
            : (await sql.query(
                `SELECT ${FIELDS}, 1 - (embedding <=> $1::vector) AS sim
                 FROM cafes
                 WHERE published = true AND embedding IS NOT NULL
                   AND ($2 = '' OR area ILIKE $3 OR area ILIKE $4)
                 ORDER BY embedding <=> $1::vector
                 LIMIT 80`,
                [lit, effectiveRegion, p1, p2],
              )) as unknown as any[];
          if (rows.length > 0) {
            mode = "semantic";
            for (const c of rows) byId.set(c.id, c);
            scored = rows.map((c) => {
              const { exact, concept, reasons } = lexicalScore(c, tokens, hitConcepts);
              const sim = Number(c.sim) || 0;
              // #216: 키워드·느낌 완전 불일치(exact+concept===0)면 등급가산 미적용 — 브랜드명(이디야·컴포즈 등)
              //   DB無매칭 검색 시 의미유사도만 있는 무관 카페가 gradeBonus(+25)로 검증배지·고득점 1위로
              //   오인 노출되던 왜곡 차단. 키워드 폴백 경로(아래)와 동일한 가드로 두 경로를 일치시킨다.
              const lexMatched = exact + concept > 0;
              const total = sim * 100 + exact + concept + (lexMatched ? gradeBonus(c.synth_grade) : 0); // 의미 유사도 1차 + 키워드·느낌 + 등급(검증 우대, 어휘일치 시에만)
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
        if (!inRegion(c.area ?? "", effectiveRegion)) continue;
        const { exact, concept, reasons } = lexicalScore(c, tokens, hitConcepts);
        const total = exact + concept + (exact + concept > 0 ? gradeBonus(c.synth_grade) : 0);
        if (exact + concept <= 0) continue;
        byId.set(c.id, c);
        scored.push({ id: c.id, name: c.name, area: c.area, grade: c.synth_grade, count: c.synth_count, identity: c.synth_identity, score: Math.round(total * 10) / 10, reasons: reasons.slice(0, 3) });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    // ===== Claude Sonnet 맥락 재정렬 (콘솔 API 키 있을 때) =====
    // 후보를 압축해 보내고, 질문 의도에 맞는 곳만 선별·정렬. 실패/키없음 시 위 점수순 폴백.
    let results = scored.slice(0, 24);
    let aiErr: string | null = null; // 결재#135: rerankWithClaude 실패 사유(검색 로그에 함께 적재)
    if (hasSearchLLM() && scored.length > 0) {
      const cands: SearchCand[] = scored.slice(0, 25).map((s) => {
        const c = byId.get(s.id) ?? {};
        return { id: s.id, name: s.name, area: s.area, identity: c.synth_identity ?? s.identity, tags: charTags(c.char_scores), quotes: quotesOf(c.synth_reviews) };
      });
      const ranked = await rerankWithClaude(q, region, cands);
      aiErr = ranked ? null : lastRerankError(); // await 직후 즉시 캡처 — 동시 요청 간 모듈 전역상태 덮어쓰기 방지
      if (ranked && ranked.length > 0) {
        mode = "ai";
        // ⚠️ P0(2026-07-05): cafes.id=bigint → neon이 문자열("8744")로 반환하는데 Claude 재정렬은 숫자 id를 준다.
        //   양쪽을 String으로 정규화하지 않으면 sById.get(숫자)가 문자열키 맵에서 전량 미스 → 재정렬 결과 전부 탈락 → 개념검색 count 0.
        const sById = new Map(scored.map((s) => [String(s.id), s]));
        // Claude 랭킹은 의미적합도만 보고 등급(검증/참고) 신호를 못 받아, "디저트 맛집" 같은 질의에서
        // 참고 카페가 검증 카페보다 위로 가던 버그(B). LLM 순위(0~100 환산, 결정론)에 등급가산을 더해 재정렬.
        const withGrade = (ranked
          .map((r, i) => {
            const s = sById.get(String(r.id));
            if (!s) return null;
            const rankScore = ((ranked.length - i) / ranked.length) * 100 + gradeBonus(s.grade);
            return { ...s, reasons: r.reason ? [r.reason] : s.reasons, _rankScore: rankScore };
          })
          .filter(Boolean) as any[]);
        withGrade.sort((a, b) => b._rankScore - a._rankScore);
        results = withGrade.map(({ _rankScore, ...rest }) => rest).slice(0, 24);
      }
    }
    results = diversifyChains(results);

    // ===== 상호(카페명) 직접 매칭 — 시맨틱/재정렬이 놓치는 '이름 검색'을 항상 보장(최상단 고정) =====
    //   '마루빈'처럼 의미가 없는 상호는 임베딩으로 안 떠서 사라지던 버그 차단. 띄어쓰기 무시 매칭.
    //   ⚠️ 단, '로스터리·핸드드립·베이커리' 같은 카테고리·개념 단어 검색은 *이름이 그 단어인 카페*가 아니라
    //   '그 부류 옥석'을 원하므로 이름매칭 9999 고정을 건너뛴다(참고 카페가 검증 위로 가던 버그 차단).
    try {
      const dq = ql.replace(/\s+/g, "");
      const isCategory = CATEGORY_WORD.has(dq) || tokens.every((t) => CATEGORY_WORD.has(t));
      if (dq.length >= 2 && !isCategory) {
        // 브랜드가 영문 상호로 등록된 경우(STARBUCKS 등)를 대비해 한글 질의에 별칭을 더해 함께 매칭.
        const dqVariants = Array.from(new Set([dq, ...(BRAND_ALIAS[dq] ?? [])]));
        const likePatterns = dqVariants.map((v) => `%${v}%`);
        const nameRows = metroList
          ? (await sql.query(
              `SELECT ${FIELDS} FROM cafes WHERE published = true
                 AND replace(lower(name), ' ', '') LIKE ANY($1::text[])
                 AND area = ANY($2::text[])
               ORDER BY (replace(lower(name), ' ', '') = ANY($3::text[])) DESC, (synth_grade = '검증') DESC, synth_count DESC NULLS LAST LIMIT 8`,
              [likePatterns, metroList, dqVariants],
            )) as unknown as any[]
          : (await sql.query(
              `SELECT ${FIELDS} FROM cafes WHERE published = true
                 AND replace(lower(name), ' ', '') LIKE ANY($1::text[])
                 AND ($2 = '' OR area ILIKE $3 OR area ILIKE $4)
               ORDER BY (replace(lower(name), ' ', '') = ANY($5::text[])) DESC, (synth_grade = '검증') DESC, synth_count DESC NULLS LAST LIMIT 8`,
              [likePatterns, effectiveRegion, p1, p2, dqVariants],
            )) as unknown as any[];
        if (nameRows.length > 0) {
          const byId = new Map(results.map((r: any) => [r.id, r]));
          // 정확히 이름이 일치하는 것만 최상단 고정(9999). 부분일치는 등급가점만 받아 일반 랭킹과 경쟁.
          const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "");
          const variantSet = new Set(dqVariants);
          let boosted = false;
          const nameResults: any[] = [];
          for (const c of nameRows) {
            const exactName = variantSet.has(norm(c.name));
            const existing = byId.get(c.id);
            if (existing) {
              // 이미 시맨틱/키워드 결과에 낮은 점수로 들어있던 정확매칭 후보 — 스킵하지 말고 9999로 승격(버그 N).
              if (exactName && existing.score < 9999) { existing.score = 9999; boosted = true; }
              continue;
            }
            nameResults.push({
              id: c.id, name: c.name, area: c.area, grade: c.synth_grade, count: c.synth_count,
              identity: c.synth_identity,
              score: exactName ? 9999 : 200 + gradeBonus(c.synth_grade) + Math.min(50, Number(c.synth_count) || 0),
              reasons: ["카페명 일치"],
            });
          }
          if (nameResults.length > 0 || boosted) results = [...nameResults, ...results].sort((a: any, b: any) => b.score - a.score).slice(0, 24);
        }
      }
    } catch { /* 상호매칭 실패해도 기존 결과 유지 */ }

    const coverageNote = detectOutOfCoverage(q, region);
    const payload: Record<string, unknown> = {
      ok: true, mode, region: effectiveRegion || "수도권 전체", q,
      concepts: hitConcepts.map((c) => c.label),
      count: results.length, results,
    };
    if (coverageNote) payload.coverageNote = coverageNote;
    // 결과가 있으면 캐시에 저장(다음 동일 질문은 재계산 0)
    if (results.length > 0) {
      sql`INSERT INTO search_cache (qkey, payload, created_at) VALUES (${qkey}, ${JSON.stringify(payload)}, now())
          ON CONFLICT (qkey) DO UPDATE SET payload=EXCLUDED.payload, created_at=now()`.catch(() => {});
    }
    logSearch(q, region, results.length, mode, isInternalCheck, aiErr); // 🔎 수요 로깅(수요-공급 갭·발굴 우선순위·콘텐츠 소재)
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
