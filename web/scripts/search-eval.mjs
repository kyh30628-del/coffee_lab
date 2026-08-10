// 🔎 검색 품질 계측 — 하네스 원칙 "실행이 아니라 효과가 성공"의 검색판.
//   골든셋 질의를 실제 검색에 태우고 **결정론 규칙**으로 채점한다(LLM 0원, 사람 판단 0).
//   사용: node scripts/search-eval.mjs [--base=http://localhost:3100] [--json]
//   ⚠️ 비용: 질의당 임베딩 1회 + 인덱스 조회. 큰 컬럼 전수 로드 없음.
//
// 채점 기준 — 질의 유형마다 "맞다"의 정의가 다르므로 유형별 결정론 판정을 쓴다.
//   area   : 상위 K건이 요구 지역인가                  (지역 정확도)
//   fact   : 상위 K건이 그 사실어를 실제로 담고 있는가   (구체 사실 정확도)
//   name   : 그 카페가 1위인가                          (상호 검색)
//   none   : 결과가 적은가(무의미 질의에 억지 결과 금지)  (거짓양성 억제)
const BASE = (process.argv.find((a) => a.startsWith("--base=")) || "--base=https://dongnecoffeenote.com").split("=")[1];
const AS_JSON = process.argv.includes("--json");
const K = 5;

export const GOLDEN = [
  // ── 지역: 지역어가 들어간 질의는 그 지역이 상위를 채워야 한다
  { q: "성수동 디저트 맛있는 카페", type: "area", expect: ["성동구"] },
  { q: "홍대 조용한 카페", type: "area", expect: ["마포구"] },
  { q: "강남 작업하기 좋은 카페", type: "area", expect: ["강남구"] },
  { q: "연남동 브런치", type: "area", expect: ["마포구"] },
  { q: "판교 카페 추천", type: "area", expect: ["성남시"] },
  { q: "송도 분위기 좋은 카페", type: "area", expect: ["인천 연수구"] },
  // ── 구체 사실: 리뷰·정보에 그 단어가 실제로 있어야 한다(없는데 상위면 엉뚱한 결과)
  { q: "루프탑 야경 보이는 카페", type: "fact", terms: ["루프탑", "루프 탑", "옥상", "야경"] },
  { q: "고양이 있는 카페", type: "fact", terms: ["고양이", "냥이", "고냥"] },
  { q: "노트북 콘센트 많은 곳", type: "fact", terms: ["콘센트", "노트북", "충전"] },
  { q: "주차 편한 대형 카페", type: "fact", terms: ["주차"] },
  { q: "강아지 데려갈 수 있는 카페", type: "fact", terms: ["강아지", "반려", "애견", "펫"] },
  { q: "크루아상 맛집", type: "fact", terms: ["크루아상", "크로와상"] },
  { q: "책 읽기 좋은 조용한 카페", type: "fact", terms: ["책", "독서", "북카페", "서재"] },
  { q: "산미 있는 스페셜티 원두", type: "fact", terms: ["산미", "스페셜티", "싱글", "에티오피아", "게이샤"] },
  { q: "빈티지 인테리어 감성 카페", type: "fact", terms: ["빈티지", "인테리어", "감성", "레트로"] },
  { q: "테라스 있는 카페", type: "fact", terms: ["테라스", "야외", "정원", "마당"] },
  { q: "말차 라떼 맛있는 곳", type: "fact", terms: ["말차", "마차", "그린티", "녹차"] },
  { q: "소금빵 맛있는 베이커리", type: "fact", terms: ["소금빵", "소금 빵", "시오"] },
  { q: "핸드드립 전문점", type: "fact", terms: ["핸드드립", "드립", "브루잉", "푸어오버"] },
  { q: "혼자 가기 좋은 조용한 카페", type: "fact", terms: ["혼자", "혼카", "조용"] },
  // ── 상호: 이름 검색은 그 카페가 1위여야 한다
  { q: "블루보틀", type: "name", contains: "블루보틀" },
  { q: "프릳츠", type: "name", contains: "프릳츠" },
  { q: "센터커피", type: "name", contains: "센터" },
  // ── 무의미: 억지로 결과를 만들면 안 된다
  { q: "asdfqwerzxcv", type: "none", max: 2 },
  { q: "ㅁㄴㅇㄹㅎ", type: "none", max: 2 },
  { q: "부산 해운대 카페", type: "none", max: 24, coverage: true },
];

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");

async function search(q) {
  const u = `${BASE}/api/search?q=${encodeURIComponent(q)}&nocache=1`;
  const r = await fetch(u, { headers: { "x-internal-check": "1" } }).then((x) => x.json()).catch((e) => ({ ok: false, error: String(e) }));
  return r;
}

/** 상위 K건 각각이 기준을 만족하는지 → hit 비율(0~1). 결정론. */
function grade(g, res) {
  const top = (res.results || []).slice(0, K);
  if (g.type === "none") {
    if (g.coverage) return { score: res.coverageNote ? 1 : 0, note: res.coverageNote ? "미서비스 안내 표시" : "안내 없음" };
    const n = res.count ?? top.length;
    return { score: n <= g.max ? 1 : 0, note: `결과 ${n}건(허용 ${g.max})` };
  }
  if (g.type === "name") {
    const first = top[0];
    const ok = first && norm(first.name).includes(norm(g.contains));
    return { score: ok ? 1 : 0, note: ok ? `1위 ${first.name}` : `1위 ${first ? first.name : "없음"}` };
  }
  if (!top.length) return { score: 0, note: "결과 없음" };
  if (g.type === "area") {
    const hit = top.filter((r) => g.expect.some((e) => norm(r.area) === norm(e))).length;
    return { score: hit / top.length, note: `${hit}/${top.length} 지역일치` };
  }
  return null; // fact는 DB 원본 대조가 필요 → gradeFact에서 처리
}

// ⚠️ fact 채점은 반드시 **DB 원본**으로 한다. 검색이 스스로 붙인 reasons("리뷰에 'X' 언급")로 채점하면
//   검색이 자기 답을 자기가 채점하는 순환이 된다(첫 버전이 그래서 93%로 부풀었다 — 실제 체감과 정반대).
//   조회는 id 기준 단건 + 리뷰는 SQL 안에서 잘라 받는다(큰 컬럼 통째 전송 금지).
async function gradeFact(g, res, sql) {
  const top = (res.results || []).slice(0, K);
  if (!top.length) return { score: 0, note: "결과 없음" };
  const ids = top.map((r) => String(r.id));
  const rows = await sql`
    SELECT id, lower(COALESCE(name,'') || ' ' || COALESCE(synth_identity,'') || ' ' || COALESCE(signature,'') || ' '
      || COALESCE(note,'') || ' ' || COALESCE(vibe,'') || ' ' || COALESCE(uses,'') || ' ' || COALESCE(beans,'') || ' '
      || COALESCE(jsonb_path_query_array(synth_reviews, '$[*].quote')::text,'')) AS blob
    FROM cafes WHERE id = ANY(${ids})`;
  const blobById = new Map(rows.map((r) => [String(r.id), norm(r.blob)]));
  const hit = top.filter((r) => {
    const blob = blobById.get(String(r.id)) || "";
    return g.terms.some((t) => blob.includes(norm(t)));
  }).length;
  return { score: hit / top.length, note: `${hit}/${top.length} 실제 보유` };
}

// 🗺️ 지역 미지정 질의의 '동네 체감' — 서울에서 검색했는데 연천·여주·강화가 1위로 오면 사실상 쓸모없다.
//   수도권 핵심부(서울 전역 + 경기 주요시 + 인천 시내) 비율로 잰다. 지역어가 없는 질의에만 적용.
const CORE_GYEONGGI = ["성남시", "고양시", "수원시", "용인시", "부천시", "안양시", "광명시", "하남시", "구리시", "과천시", "남양주시", "김포시", "의정부시", "시흥시", "안산시", "군포시", "의왕시"];
const isCore = (area) => {
  const a = String(area || "");
  if (a.endsWith("구") && !a.startsWith("인천")) return true;            // 서울 자치구
  if (a.startsWith("인천") && !/강화|옹진/.test(a)) return true;          // 인천 시내
  return CORE_GYEONGGI.includes(a);
};

export async function runEval(sql) {
  const rows = [];
  const coreRates = [];
  for (const g of GOLDEN) {
    const res = await search(g.q);
    const r = grade(g, res) ?? (await gradeFact(g, res, sql));
    // 지역어 없는 질의만 '동네 체감' 집계(area 유형은 이미 지역이 명시돼 있음)
    if (g.type === "fact") {
      const top = (res.results || []).slice(0, K);
      if (top.length) coreRates.push(top.filter((x) => isCore(x.area)).length / top.length);
    }
    rows.push({ q: g.q, type: g.type, score: r.score, note: r.note, mode: res.mode || "-", count: res.count ?? 0 });
  }
  const byType = {};
  for (const r of rows) { (byType[r.type] ||= []).push(r.score); }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  return {
    rows, total: avg(rows.map((r) => r.score)),
    byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, avg(v)])),
    coreRate: avg(coreRates),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import("node:fs");
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
  const { neon } = await import("@neondatabase/serverless");
  const out = await runEval(neon(process.env.DATABASE_URL));
  if (AS_JSON) { console.log(JSON.stringify(out)); process.exit(0); }
  console.log("═".repeat(74));
  console.log(`🔎 검색 품질 계측 — ${BASE}`);
  console.log("═".repeat(74));
  for (const r of out.rows) {
    const bar = r.score >= 0.8 ? "🟢" : r.score >= 0.4 ? "🟡" : "🔴";
    console.log(` ${bar} ${String(Math.round(r.score * 100)).padStart(3)}%  ${r.type.padEnd(5)} ${r.q.padEnd(26)} ${r.mode.padEnd(9)} ${r.note}`);
  }
  console.log("─".repeat(74));
  for (const [k, v] of Object.entries(out.byType)) console.log(`  ${k.padEnd(6)} ${Math.round(v * 100)}%`);
  console.log(`  지역어 없는 질의의 수도권 핵심부 비율  ${Math.round(out.coreRate * 100)}%  (낮으면 외곽이 상위를 차지 = 체감 최악)`);
  console.log(`\n  종합 ${Math.round(out.total * 100)}%`);
}
