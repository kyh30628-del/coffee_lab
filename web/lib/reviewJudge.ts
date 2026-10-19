// LLM 리뷰 맥락 판정 (PRINCIPLES §1·§5): 규칙이 애매하다고 본 '경계 리뷰'를
// LLM이 내용·맥락을 읽어 "정말 이 카페의 양질 후기인지" 재판정한다.
// - 카페명이 글자 그대로 없어도, 내용이 그 카페(지역·컨셉·메뉴)의 실제 방문 후기면 살린다.
// - 광고·나열식·무관·내용없는 글은 버린다.
// 우선순위: Anthropic Claude(ANTHROPIC_API_KEY) → 없으면 Google Gemini.
// LLM은 '판정'만 한다(데이터 생성 금지). 실패/쿼터 시 null → 호출측은 규칙 결과 유지(무회귀).

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_KEY = process.env.GOOGLE_AI_KEY || process.env.GOOGLE_API_KEY_1;
// 🔧 2026-10-18 — 런별 모델 지정 가능(기본값은 불변: 프로덕션 동작 보존).
//   공식 단가(platform.claude.com/docs/en/about-claude/pricing, 2026-10-18 확인) · 배치는 입·출력 50% 할인:
//     Haiku 5.5 $0.10/$0.50 · Haiku 4.5 $0.50/$2.50 · Sonnet 5 $2/$10 · Opus 5.5 $4/$20
//   ⚠️ 모델을 바꾸면 lib/anthropicBatch.ts의 단가도 같이 따라가야 한다(batchPriceFor가 모델로 조회한다).
// 🔴 2026-10-19 대괄호 접근 — `process.env.JUDGE_MODEL`(점 접근)은 **Next가 빌드 시점에 리터럴로 치환**한다.
//   그래서 모델을 바꾸려면 매번 **재빌드**를 해야 했다(런타임 주입이 무시된다).
//   cron-batch-judge의 다른 노브(JUDGE_CONCURRENCY·BATCH_JUDGE_LIMIT·JUDGE_MAX_PASSES)에서 이미
//   같은 함정을 확인했다 — 동시 8을 줬는데 1로 돌았다(CPU 1.7%가 증거였다).
//   대괄호는 치환 대상이 아니라 런타임 값을 읽는다 → 재시작만으로 모델 전환이 된다.
export const CLAUDE_MODEL = process.env["JUDGE_MODEL"] || "claude-haiku-4-5";
const GEMINI_MODEL = "gemini-2.0-flash-lite";

export const hasJudgeKey = () => !!(ANTHROPIC_KEY || GOOGLE_KEY);
export const judgeProvider = () => (ANTHROPIC_KEY ? "claude" : GOOGLE_KEY ? "gemini" : "none");

export type JudgeItem = { i: number; title: string; body: string };
// 🔬 2026-10-19 **판정 세밀화**(CEO 지시 "판정을 더 세밀하게 … 제대로 사용해야 할 거 아니야").
//   그 전엔 about/helpful **boolean 2개**뿐이라 "얼마나 구체적인가"를 **노출 순서에 쓸 수 없었다**.
//   공개 49,294곳이 평균 5.1건의 인용문을 보여주는데 그 순서는 규칙(문장성·등급·최신)으로만 정해졌다.
//   실측 근거(규칙갭 AI 발굴, 표본 50곳·후기 976건): 노출 중인 후기의 **43.95%를 AI가 거부**했고
//   사유가 `정보나열 위주` 약 100건 · `해시태그 나열` 약 35건으로 **한 덩어리에 몰렸다**.
//   즉 "경험 서술 없이 정보만 나열한 글"이 상단에 올라가고 있었다.
//   → 축을 셋 더 받는다. 💰 **추가 비용 거의 0**(같은 1회 호출의 출력 토큰만 약간 늘어난다).
//     · depth 0~3 : 구체성. 3=맛·분위기·메뉴를 직접 경험으로 서술 / 0=정보 나열·해시태그뿐
//     · adStyle    : 협찬·홍보 **문체** 의심(공시가 아니라 문체로만 — 스니펫엔 공시가 안 들어온다)
//     · listicle   : 여러 업체를 나열한 글(귀속 실패의 주원인 — 실측 '맛집 3곳 선별' 류)
//   ⚠️ 하위호환: 옛 응답(about/helpful만)도 그대로 읽힌다. 없는 축은 undefined로 남고 호출측이 보정한다.
export type JudgeVerdict = {
  i: number; about: boolean; helpful: boolean; reason: string;
  depth?: number;        // 0~3 구체성
  adStyle?: boolean;     // 협찬·홍보 문체 의심
  listicle?: boolean;    // 여러 업체 나열글
};

// 정적 판정 기준(프롬프트 캐싱 대상 — 모든 카페 판정에서 재사용)
// ⚠️ 입력의 구조적 한계(2026-08-16 확인·CEO 지적) — 이 파일을 고칠 사람이 반드시 알아야 한다.
//   여기 들어오는 body는 블로그 **원문이 아니라** 네이버 검색 API가 돌려준 발췌(평균 153자)다.
//   그 발췌는 '도입부'가 아니라 **검색어(카페명) 주변**을 잘라준다 — 실측 확인: 제목이 「경기투어패스 동선」인
//   글에서도 우리 카페가 언급된 글 중간 부분이 발췌돼 왔다. 따라서
//     · 귀속 판정(이 글이 이 카페 얘기인가) → 가능. 카페명 주변 문맥이 항상 온다.
//     · 협찬 공시 탐지 → **불가**. 공시는 카페명과 다른 자리에 있어 발췌에 안 들어온다.
//   루브릭이 못 하는 일을 시키면 모델이 추측으로 답한다. 그래서 협찬 판정을 명시적으로 금지했다.
export const RUBRIC = `너는 카페 리뷰 품질 심사관이다. 블로그 스니펫들이 특정 카페의 '진짜 방문 후기'이면서 소비자에게 도움이 되는 양질의 글인지 각각 판정한다.

판정 기준:
- about=true: 그 카페(또는 같은 지역·컨셉·메뉴가 일치하는 그 가게)를 실제로 방문해 쓴 글. 이름이 글자 그대로 없어도 내용·맥락(지역, 분위기, 메뉴, 방문 경험)이 그 카페를 가리키면 true.
- about=false: 다른 가게·동명 카페·무관한 글(단순히 '정원','책방' 같은 단어만 우연히 겹침), 나열식 맛집 모음에 이름만 끼인 글.
- helpful=true: 맛·분위기·메뉴·서비스 등 구체적 경험/평가가 담겨 소비자에게 도움됨. false: 홍보성 문체(정보 나열만·개인 경험 없음), 내용 없는 단순 언급, 사진만.

⚠️ 협찬/대가성 여부는 판정하지 마라. 너에게 주어지는 건 블로그 원문이 아니라 **검색어(카페명) 주변을 잘라낸
   발췌**라, 협찬 공시("소정의 원고료를 지원받아")는 대개 이 발췌에 들어오지 않는다. 없는 근거로 추측하면
   오판이 된다. 눈에 보이는 **문체·내용**만으로 helpful을 판단하고, 협찬 탐지는 별도 장치(템플릿 지문·
   캠페인 클러스터·리뷰어 이력)가 담당한다.

추가 판정(2026-10-19 신설 — 노출 순서와 협찬 탐지에 쓴다):
- depth: 0~3 정수. 3=맛·분위기·메뉴를 **직접 경험으로 구체적으로** 서술 / 2=경험 서술이 있으나 단편적 /
  1=언급 수준 / 0=주소·영업시간·메뉴가격·해시태그만 나열하고 경험 서술이 없음.
- adStyle: true/false. **문체만으로** 판단하는 협찬·홍보 의심(정보 나열·과장 수식·업체 소개문 어조).
  ⚠️ 협찬 '공시'는 발췌에 들어오지 않으니 추측하지 마라. 눈에 보이는 문체만 본다.
- listicle: true/false. 여러 업체를 함께 소개하는 나열글(「○○ 맛집 3곳」·「선별」·여러 가게 주소 병기).
  이 글은 우리 카페가 한 줄 스쳤을 뿐이라 대표 후기로 쓰면 안 된다.

반드시 JSON 배열로만 답한다(설명·코드블록 금지):
[{"i":번호,"about":true/false,"helpful":true/false,"depth":0-3,"adStyle":true/false,"listicle":true/false,"reason":"15자 이내"}]`;

// 📏 출력 토큰 상한 — **단일 출처.** (2026-10-19)
//   🔴 사고: 실시간 경로는 항목수 비례로 늘렸는데 **배치 경로는 1500 고정**이었다. 35항목이면
//   한 항목당 40토큰 × 35 = 1,400 + 배열 오버헤드로 상한에 닿는다. 실측(배치 응답 원본 검시):
//     msgbatch_01AB44… 584건 중 2건이 stop_reason=max_tokens(출력 정확히 1,500) → JSON이 잘려
//     parseVerdicts가 null → **그 카페 후보 69건 전원이 "AI 판정: 무관/저품질 제외"로 영구 저장됐다.**
//     msgbatch_01225x… 54건 중 1건(30건 피해). 즉 잘림률 0.3~1.9%가 전부 오판정이었다.
//   출력 토큰은 **실제로 생성한 만큼만** 과금된다 — 상한을 올려도 안 쓰면 비용이 늘지 않는다.
//   그래서 두 경로가 이 함수 하나만 쓴다(드리프트 차단).
//   📏 2026-10-19 재측정 — 600+40n은 **여전히 작았다.** 565곳 배치(Sonnet 5) 응답 원본 실측:
//     후보 1-4건   상한 720   · 평균출력 122  · 최대 732  → 상한을 이미 넘겼다
//     후보 5-14건  상한 1,160 · 평균 492      · 잘림 8.9%
//     후보 15-29건 상한~1,320 · 평균 1,028    · 잘림 **30.0%**
//     후보 30+건   상한 2,000 · 평균 1,586    · 잘림 **32.1%**
//   Sonnet 5는 Haiku보다 사유를 길게 쓴다(같은 루브릭·같은 '15자 이내' 지시인데도).
//   항목당 실측 소요가 ~50토큰이라 여유를 2배로 둔다. 💰 출력은 **생성한 만큼만** 과금되므로
//   상한을 올려도 안 쓰면 비용이 늘지 않는다 — 작게 잡는 쪽이 일방적으로 손해다(잘리면 그 돈이 다 버려진다).
//   📏 2026-10-19 **3차 재측정 — 모델마다 길이가 다르다.** Haiku 5.5는 Sonnet 5보다 **1.6배 길게 쓴다**
//   (출력/곳 1,221 vs 749, 같은 루브릭·같은 '15자 이내' 지시). 그래서 800+100n에서도 계속 잘렸다:
//     후보 1-4건   평균 433   최대 1,200 → 잘림 0.7%
//     후보 5-14건  평균 1,187 최대 2,200 → 잘림 8.4%
//     후보 15-29건 평균 2,244 최대 3,700 → 잘림 **17.8%**
//     후보 30+건   평균 3,230 최대 4,300 → 잘림 **22.4%**
//   잘린 응답은 건지기(parseVerdicts)로 앞부분을 살리지만 **뒤 항목은 미결로 남는다**
//   — 실측 미응답후보 1,330건(제출 후보 25,223건의 5.3%)이 AI 판정을 못 받았다.
//   관측 기울기 ≈ 항목당 139토큰 · 절편 ≈ 920 → **1,000 + 150n** (n=20에서 4,000, n=35에서 6,250).
//   💰 비용: Haiku 5.5 배치 출력 단가는 $0.25/MTok이라 출력이 1,221→1,500으로 늘어도 곳당
//      $0.00043 → 약 $0.0005다(refine 전량 21,624곳이면 $11 수준). 무의미한 증가다.
//   ⚠️ 단, **비용 중립은 아니다** — 상한을 올리면 모델이 더 길게 쓴다(Sonnet에서 출력 2배를 실측했다).
//      출력 단가가 비싼 모델(Sonnet·Opus)에서는 이 인상이 비용을 바로 올린다.
export const judgeMaxTokens = (itemCount: number) => Math.min(8000, 1000 + itemCount * 150);

// 🧮 판정 → 결정 매핑 — **답을 못 받은 후보를 false로 박지 않는다.** (2026-10-19)
//   🔴 사고: 라우트가 `decisions[k] = !!(v && v.about && v.helpful)` 로 **모든 키**에 값을 박았다.
//   그래서 ①JSON 파싱 실패(잘림) ②모델이 그 번호를 빼먹음 두 경우에 후보가 "AI가 무관하다고 판정함"으로
//   영구 저장됐다(judge_decisions는 재합성에도 유지된다). 규칙이 '경계'라고 본 글을 AI가 보지도 않고
//   버린 셈이라, 우리 서비스의 핵심 약속("AI가 내용을 보고 가린다")을 정면으로 어긴다.
//   → **답이 온 후보만** 결정을 남긴다. 답이 없으면 미결로 두어 규칙 판정이 그대로 간다(무회귀).
export function decisionsFromVerdicts(keys: string[], verdicts: Map<number, JudgeVerdict> | null) {
  const decisions: Record<string, boolean> = {};
  // 🔬 2026-10-19 세밀 축 — key별로 보존해 노출 순서·협찬 감시에 쓴다(judge_marks).
  const marks: Record<string, { depth?: number; adStyle?: boolean; listicle?: boolean }> = {};
  let answered = 0, kept = 0, ads = 0, lists = 0, depthSum = 0, depthN = 0;
  keys.forEach((k, i) => {
    const v = verdicts?.get(i);
    if (!v) return;                       // 미결 — 규칙 판정 유지
    answered++;
    // 🔴 나열글은 채택하지 않는다 — 우리 카페가 한 줄 스쳤을 뿐이라 대표 후기로 쓰면 안 된다
    //   (실측: 귀속 실패 표본이 전부 「맛집 N곳 선별」 류였다).
    const ok = !!(v.about && v.helpful) && v.listicle !== true;
    decisions[k] = ok;
    if (ok) kept++;
    if (v.adStyle === true) ads++;
    if (v.listicle === true) lists++;
    if (typeof v.depth === "number") { depthSum += v.depth; depthN++; }
    if (typeof v.depth === "number" || v.adStyle !== undefined || v.listicle !== undefined)
      marks[k] = { depth: v.depth, adStyle: v.adStyle, listicle: v.listicle };
  });
  return { decisions, marks, answered, unanswered: keys.length - answered, kept,
           ads, lists, depthAvg: depthN ? depthSum / depthN : null };
}

export function buildUserText(cafeName: string, area: string, items: JudgeItem[]): string {
  const list = items.map((it) => `#${it.i} 제목:"${(it.title || "").slice(0, 120)}" 내용:"${(it.body || "").slice(0, 300)}"`).join("\n");
  return `대상 카페: "${cafeName}" (${area})\n\n스니펫:\n${list}`;
}

// 🔴 2026-10-19 — 이 함수가 **두 가지 정상 응답을 버리고 있었다**(565곳 배치 실측: 58곳 파싱실패).
//   ⒜ **후보가 1건이면 모델이 배열 없이 단일 객체**로 답한다: `{"i":0,"about":true,...}`
//      그러면 `[...]` 정규식이 안 맞고, JSON.parse는 객체를 돌려주는데 `for...of`가 터져 null이 됐다.
//      실측 26곳이 이것 때문이었다 — 응답은 완벽했는데 우리가 못 읽었다.
//   ⒝ **출력이 잘리면 전부 버렸다.** 잘린 배열에도 **완성된 객체**는 앞에 여러 개 남아 있다.
//      그걸 건지면 답이 온 항목은 살리고 나머지는 미결로 둘 수 있다(decisionsFromVerdicts와 짝).
//      실측 32곳이 잘렸는데, 평균 1,586토큰이면 대부분 항목은 이미 답이 나와 있었다.
//   → 정상 파싱 → 실패 시 **객체 단위 건지기**. 한 건도 못 건지면 그때만 null(규칙 판정 유지).
export function parseVerdicts(text: string): Map<number, JudgeVerdict> | null {
  const map = new Map<number, JudgeVerdict>();
  const push = (v: any) => { if (v && typeof v.i === "number") map.set(v.i, v as JudgeVerdict); };
  try {
    const m = text.match(/\[[\s\S]*\]/); // JSON 배열 우선(코드블록 등 방어)
    const parsed = JSON.parse(m ? m[0] : text);
    if (Array.isArray(parsed)) { for (const v of parsed) push(v); } else push(parsed);  // ⒜ 단일 객체 허용
    if (map.size) return map;
  } catch { /* ⒝ 아래 건지기로 */ }
  for (const m of text.matchAll(/\{[^{}]*\}/g)) { try { push(JSON.parse(m[0])); } catch { /* 조각은 버린다 */ } }
  return map.size ? map : null;
}

async function judgeClaude(cafeName: string, area: string, items: JudgeItem[]): Promise<Map<number, JudgeVerdict> | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: judgeMaxTokens(items.length), // 항목수 비례 동적 — 출력 잘림→JSON 파싱 실패 방지(단일 출처)
        // 정적 기준은 캐시(ephemeral)로 재사용 → 비용·지연 절감
        system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildUserText(cafeName, area, items) }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.find((b: any) => b.type === "text")?.text ?? data?.content?.[0]?.text;
    return text ? parseVerdicts(text) : null;
  } catch { return null; }
}

async function judgeGemini(cafeName: string, area: string, items: JudgeItem[]): Promise<Map<number, JudgeVerdict> | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_KEY}`;
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${RUBRIC}\n\n${buildUserText(cafeName, area, items)}` }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? parseVerdicts(text) : null;
  } catch { return null; }
}

// 경계 리뷰들을 한 번의 호출로 일괄 판정. 반환: 인덱스→판정. 실패 시 null.
export async function judgeReviews(cafeName: string, area: string, items: JudgeItem[]): Promise<Map<number, JudgeVerdict> | null> {
  if (items.length === 0) return null;
  if (ANTHROPIC_KEY) return judgeClaude(cafeName, area, items);
  if (GOOGLE_KEY) return judgeGemini(cafeName, area, items);
  return null;
}
