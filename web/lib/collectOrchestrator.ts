// 수집 오케스트레이터 (PRINCIPLES §1·§2·§3·§4·§7)
// 모든 수집 글을 '리뷰 품질 검증 엔진'에 통과시켜 옥석을 가린 뒤에만 합성·집계·노출한다.
import { verifyReview, coreTokens, isNonCafeFnbCategory, COFFEE_SUBSTANCE, type QualityVerdict, type SourceKind } from "./reviewQuality";
import { extractRid, looseDate, type ReviewerCafeStat } from "./reviewerProfiles";
import { isAdTemplateQuote } from "./adTemplate";
import { synthesize, type Review, type SynthResult } from "./synthEngine";
import { computeCharScores } from "./charScore";
import { getCriterionSync } from "./criteria"; // 등급 바닥 임계값 단일출처(캐시 프라임은 synthAndStore 등 진입점이 함)
import type { WebSnippet } from "./webSearchCollector";

export type RawSource = {
  source: "google" | "blog" | "youtube" | "diningcode" | "tripadvisor" | "instagram" | "etc";
  texts: WebSnippet[];
};

// 출처별 합성 가중(검증 통과분에만 적용). 블로그 직접후기 > 영상 > 일반.
const SRC_WEIGHT: Record<RawSource["source"], number> = {
  google: 1.0, blog: 1.2, youtube: 1.1, diningcode: 1.1, tripadvisor: 1.0, instagram: 0.8, etc: 0.7,
};
const SRC_KIND: Record<RawSource["source"], SourceKind> = {
  google: "google", blog: "blog", youtube: "youtube", diningcode: "etc", tripadvisor: "etc", instagram: "etc", etc: "etc",
};

// 카드에 보여줄 근거 리뷰 + 신뢰 근거(투명성)
export type EvidenceReview = {
  quote: string; link?: string; source?: string; date?: string;
  trust?: QualityVerdict; score?: number; why?: string[];
};

export type QualityStats = {
  raw: number; verified: number; reference: number; rejected: number; duplicates: number;
  rejectReasons: Record<string, number>; // 탈락 사유별 건수 (투명성)
};

export type BorderlineItem = { key: string; title?: string; body: string; text?: string };

export type CollectResult = {
  synth: SynthResult;
  reviewerStats: Map<string, ReviewerCafeStat>; // 👤 계정별 통계(1단계 수집, #699) — 판정 무영향
  collected: number;          // = 검증 통과 고유 리뷰 수 (신뢰 헤드라인 숫자)
  grade: "검증" | "참고" | "후보";
  charScores: Record<string, number>;
  perSource: { source: string; raw: number; kept: number }[];
  evidenceReviews: EvidenceReview[];   // 상위 6건 (기본 표시용)
  allEvidence: EvidenceReview[];        // 옥석 전체 (전체보기용)
  reviewDates: string[];
  borderline: BorderlineItem[]; // 카페명 불명확하나 후기 맥락 있음 → LLM 재판정 대상(경계)
  auditItems: BorderlineItem[]; // 규칙상 on-topic 전체 → Sonnet 최종 심사 대상
  quality: QualityStats;
};

// 표시 인용문에서 개인정보(전화·이메일) 마스킹 — 원문에 연락처가 섞여 들어와도 노출 금지
// PII 마스킹 — 전화·이메일·소셜핸들 제거(개인정보 표시 금지, PRINCIPLES §2). export: 사후 세척에도 사용.
export function maskPII(s: string): string {
  return (s || "")
    // 이메일·소셜핸들(@토큰) 통째 제거 — TLD 없는 핸들(gâteau@soye)도 포함
    .replace(/\S*@\S+/g, "")
    // 휴대폰
    .replace(/01[0-9][-\s.]?\d{3,4}[-\s.]?\d{4}/g, "010-****-****")
    // 안심(가상)번호 대역(050x, 예: 0505/0506/0507/0508) — 마지막 그룹이 3~4자리로 들쭉날쭉해 일반 유선 패턴에 안 걸림
    .replace(/\b050[0-9][-\s.]?\d{3,4}[-\s.]?\d{3,4}\b/g, "0507-****-****")
    // 유선(지역번호 02-/0XX-)
    .replace(/\b0(2|[3-6][0-9])[-\s.]?\d{3,4}[-\s.]?\d{4}\b/g, "***-****-****")
    // 일반 분리형 전화(주소 뒤 등)
    .replace(/\b\d{2,4}[-\s.]\d{3,4}[-\s.]\d{4}\b/g, "***-****-****")
    .replace(/\s{2,}/g, " ").trim();
}
const COFFEE_TERMS = /커피|카페|라떼|아메리카노|원두|로스팅|에스프레소|디저트|케이크|베이커리|빵|브런치|분위기|인테리어|메뉴|음료|핸드드립|드립|콜드브루|바리스타|좌석|자리|맛있|고소|산미|크림|디카페인|플랫화이트|감성|예쁘|아늑|향/;
// 표시 인용문: '이 카페·커피' 관련 문장을 우선 골라 1줄로. 다른 가게(점심·디저트 등)를 함께 적은
// 글이어도 카페 내용이 담긴 문장이 보이게 → 멀티 언급 글도 의미 있게 활용.
export function toQuote(text: string, name = "", maxLen = 90): string {
  const masked = maskPII(text.trim());
  const sentences = masked.split(/(?<=[.!?。…])\s+|\n+|\s{2,}/).map((s) => s.trim()).filter((s) => s.length >= 5);
  if (sentences.length <= 1) return masked.length <= maxLen ? masked : masked.slice(0, maxLen) + "…";
  const namePart = name.replace(/\s+/g, "").slice(0, 4);
  // 카페 내용(4) > 이름(2). 시·문학·게임 등 비카페 문장은 회피(-6) — 이름이 시 제목('비에도 지지않고')인
  //   카페에서 진짜 후기가 시 구절을 인용해도, 대표 인용은 '카페 내용 문장'이 뜨도록.
  const OFFTOPIC_SENT = /(미야자와|겐지|그림책|바람에도\s*지지|폭풍에도\s*지지|더위에도\s*지지|눈에도\s*지지|독후감|책추천|시\s*한\s*편|문학|독서모임|월드컵|게임\s*이벤트)/;
  const score = (s: string) => (COFFEE_TERMS.test(s) ? 4 : 0) + (namePart && s.replace(/\s+/g, "").includes(namePart) ? 2 : 0) - (OFFTOPIC_SENT.test(s) ? 6 : 0);
  let best = sentences[0], bestSc = score(sentences[0]);
  for (const s of sentences) { const sc = score(s); if (sc > bestSc) { best = s; bestSc = sc; } }
  return best.length <= maxLen ? best : best.slice(0, maxLen) + "…";
}
const dedupeKey = (s: string) => s.toLowerCase().replace(/\s+/g, "").slice(0, 60);

export function collectAndSynthesize(name: string, area: string[], sources: RawSource[], opts?: { whitelist?: Set<string>; decisions?: Record<string, boolean>; address?: string; naverCategory?: string; excludeLinks?: Set<string> }): CollectResult {
  const whitelist = opts?.whitelist;
  const verifiedReviews: Review[] = [];   // 합성 입력(검증, 출처가중 반영)
  const perSource: { source: string; raw: number; kept: number }[] = [];
  const evidence: EvidenceReview[] = [];
  const verifiedTexts: string[] = [];      // char_scores 계산용
  const reviewDates: string[] = [];        // 리뷰 주기 분석용(검증·참고 게시일 YYYY.MM.DD)
  const borderline: BorderlineItem[] = []; // LLM 재판정 대상(경계)
  const auditItems: BorderlineItem[] = []; // Sonnet 최종 심사 대상(규칙상 on-topic 전체)
  const seen = new Set<string>();
  const reviewerStats = new Map<string, ReviewerCafeStat>(); // 👤 #699 1단계 — 판정 무영향, 적재용
  const seenLinks = new Set<string>();     // 같은 글(URL) 중복 수집 제거용
  const stats: QualityStats = { raw: 0, verified: 0, reference: 0, rejected: 0, duplicates: 0, rejectReasons: {} };
  // 블로그 URL 정규화(프로토콜·m.·쿼리·해시·끝슬래시 무시) → 같은 글 1회만
  const linkKeyOf = (u?: string) => (u ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^m\./, "").replace(/[#?].*$/, "").replace(/\/+$/, "");

  for (const src of sources) {
    const weight = SRC_WEIGHT[src.source];
    const kind = SRC_KIND[src.source];
    let kept = 0;

    for (const t of src.texts) {
      // 같은 글이 다른 검색어로 여러 번 수집되는 것 제거(같은 URL = 같은 후기 1건)
      const lk = linkKeyOf(t.link);
      // 다른 카페로 이미 확정 귀속된 근거(리스티클/형제지점 교차오염, cross_cafe_link_exclusions) — 표시뿐
      // 아니라 등급판정 카운트에서도 제외(coordination#291, decisions#628: 카운트 로직이 매칭 품질을 안 보던 결함).
      // ⚠️ 원본(비정규화) link로 저장돼있음(storeResult의 dropExcluded와 동일 비교 기준) — lk가 아닌 t.link로 대조.
      if (t.link && opts?.excludeLinks?.has(t.link)) continue;
      if (lk && seenLinks.has(lk)) { stats.duplicates++; continue; }
      if (lk) seenLinks.add(lk);
      const key = dedupeKey(t.text);
      if (seen.has(key)) { stats.duplicates++; continue; }   // 교차 출처 중복(스니펫 동일)
      seen.add(key);
      stats.raw++;   // 고유 글만 '전체'로 집계 → 전체 = 노이즈 + 옥석 (정확히 맞음)

      const rule = verifyReview({ title: t.title, body: t.desc ?? t.text, name, areaTerms: area, addr: opts?.address, link: t.link, naverCategory: opts?.naverCategory, source: kind });

      // 규칙상 on-topic(검증·참고 또는 경계)은 Sonnet 최종 심사 후보로 노출
      // ⚠️ text도 함께 보존(#683): 표시 대표문(evidence.quote)은 toQuote(t.text, …)로 뽑히는데
      //   힐러들이 재감사 시 toQuote(desc)를 쓰면 desc가 text와 달라(제목 프리픽스 등) 다른 문장을
      //   고를 수 있다 — "화면에 보이는 오염 문장"과 "힐러가 재심사하는 문장"이 어긋나 제거가 안 걸림(id7840 실증).
      if (rule.verdict !== "rejected" || rule.borderline) auditItems.push({ key, title: t.title, body: t.desc ?? t.text, text: t.text });
      if (rule.borderline) borderline.push({ key, title: t.title, body: t.desc ?? t.text, text: t.text });

      // 효과 판정 우선순위: 광고·하드 구조거절 = 절대(판정·whitelist로 못 살림) > decisions(과거 AI 심사) > whitelist > 규칙.
      //   ⚠️ 하드 구조거절(동명 비카페·필라테스·글루드·OFFTOPIC·SEO·인물직함 등 borderline 아닌 reject)은 광고처럼 *규칙 절대 우선*.
      //   (스테일 "유지" 결정이 구조적 오염을 덮어 검증 카페가 정화 안 되던 버그 차단 — 2026-06-28)
      const isAd = !!rule.signals?.sponsored;
      // 👤 리뷰어 프로필 수집(#699 1단계) — 판정에 영향 없음. 네이버 블로그 링크(97%)만 계정 추출.
      {
        const rid = extractRid(t.link);
        if (rid) {
          const cur = reviewerStats.get(rid) ?? { accepted: 0, rejectedAd: 0, firstDt: null, lastDt: null };
          if (isAd) cur.rejectedAd++;
          const dt = looseDate((t as any).date);
          if (dt && (!cur.firstDt || dt < cur.firstDt)) cur.firstDt = dt;
          if (dt && (!cur.lastDt || dt > cur.lastDt)) cur.lastDt = dt;
          reviewerStats.set(rid, cur);
        }
      }
      const hardReject = rule.verdict === "rejected" && !rule.borderline; // 경계 아닌 구조적 하드 거절
      let verdict = rule.verdict;
      let reasons = rule.reasons;
      let score = rule.score;
      if (isAd) { verdict = "rejected"; reasons = ["광고·협찬 — 자동 제외(판정보다 우선)"]; score = 0; }
      else if (hardReject) { /* 규칙 하드 거절 — 과거 결정·whitelist로 못 살림(규칙 절대 우선) */ }
      else if (opts?.decisions && key in opts.decisions) {
        if (opts.decisions[key]) { verdict = rule.verdict === "verified" ? "verified" : "reference"; reasons = ["✨ AI 검증: 실제 후기"]; score = 80; }
        else { verdict = "rejected"; reasons = ["AI 판정: 무관/저품질 제외"]; score = 0; }
      } else if (whitelist?.has(key)) { verdict = "verified"; reasons = ["✨ AI 검증: 실제 후기"]; score = 75; }

      if (verdict === "rejected") {
        stats.rejected++;
        const r = reasons[0] ?? "기타";
        stats.rejectReasons[r] = (stats.rejectReasons[r] ?? 0) + 1;
        continue;
      }
      if (verdict === "verified") stats.verified++; else stats.reference++;
      { const rid = extractRid(t.link); if (rid) { const cur = reviewerStats.get(rid)!; if (cur) cur.accepted++; } } // 👤 #699
      kept++;

      // 합성 입력: verified 정가중, reference 절반가중. 출처가중도 반영.
      // trust도 함께 실어보낸다 — synthEngine의 운영신호(ops) 스캔이 reference(약한 매칭)를 제외하는 근거(#894).
      const reps = verdict === "verified" ? Math.max(1, Math.round(weight)) : 1;
      for (let i = 0; i < reps; i++) verifiedReviews.push({ text: t.text, time: t.time, trust: verdict === "verified" ? "verified" : "reference" });
      verifiedTexts.push(t.text);
      // "1990.01.01"은 네이버가 발행일 파싱 실패 시 보내는 무음 기본값(캐시된 raw_reviews에도 남아있을 수 있음) — 날짜없음 취급.
      const dateOk = !!t.date && t.date !== "1990.01.01" && /^\d{4}\.\d{2}\.\d{2}$/.test(t.date);
      if (dateOk) reviewDates.push(t.date as string);

      if (t.link || src.source === "google") {
        evidence.push({
          quote: toQuote(t.text, name), link: t.link, source: t.source, date: dateOk ? t.date : undefined,
          trust: verdict, score, why: reasons.slice(0, 3),
        });
      }
    }
    perSource.push({ source: src.source, raw: src.texts.length, kept });
  }

  // 신뢰 헤드라인 숫자 = 노이즈 제거 후 '주제가 맞는 진짜 리뷰' 수(검증+참고).
  // rejected(동명·모음언급·무관·내용없음)만 버린 뒤 남은 옥석. 표시 카운트는 이 기준(검증+참고 동등).
  const trustCount = stats.verified + stats.reference;
  // 🎯 등급판정 전용 가중 카운트(decisions#628) — verified(제목=이 카페 주제)와 reference(본문에만 스친
  //   약한 매칭)는 '이 카페가 맞다'는 확신이 다른데, 여태 grade.floor.verified(30) 비교엔 trustCount를
  //   동등 가중으로 썼다. 이름이 랜드마크·일반명사와 겹치는 카페(id16913 '숲이 있는' ↔ 북서울꿈의숲)는
  //   reference가 raw 볼륨만으로 30건을 채워 진짜 관련 리뷰가 3건뿐인데도 '검증' 등급을 받았다(레드팀 08-06
  //   확인: verified=3/reference=26, reference 26건 전부 카페와 무관한 공원·전시·맛집 스침). reference는
  //   '참고' floor 도달까진 그대로 인정하되(원래 참고=본문언급이라도 살리자는 취지), '검증' floor는 절반
  //   가중만 인정해 약한매칭 대량으로 못 채우게 한다 — SRC_WEIGHT(위)와 같은 급의 알고리즘 상수라 criteria
  //   DB로 안 빼고 코드 상수로 둔다(grade.floor.*처럼 공개상태 대량변동을 부르는 값이 아니라 그 값의 산정
  //   방식 보정이며, 조정 시 재합성이 필요해 무배포 즉시효과 대상이 아님).
  const REFERENCE_GRADE_WEIGHT = 0.5;
  const gradeCount = stats.verified + stats.reference * REFERENCE_GRADE_WEIGHT;
  // 공개 floor = 검증리뷰 3건 (2026-06-30, CEO "검증된 리뷰 3건 이상"). trustCount는 옥석(verified+reference)만 —
  //   가비지·노이즈(rejected: 동명·무관·광고·SEO·nameAsWord)는 카운트 안 됨. 진짜 검증 리뷰 3건+ 있으면 참고(공개).
  //   얇아도 *진짜* 카페는 살리되 1~2건은 너무 얇아 보류. 오염/비카페는 coherence·카테고리 게이트가 별도로 막음.
  //   임계값은 DB 기준(criteria) 단일출처 — 폴백=현재값(검증30/참고3). 동기 조회(캐시 프라임은 synthAndStore 등 진입점).
  let grade: "검증" | "참고" | "후보" =
    gradeCount >= getCriterionSync("grade.floor.verified") ? "검증"
    : trustCount >= getCriterionSync("grade.floor.reference") ? "참고"
    : "후보";

  // 🍽️ [룰갭 P66, coord#265/decisions#539] F&B 대분류이나 카페 아닌 업종(레스토랑·양식·일식 등)인데 수집된
  //   옥석 리뷰 전량에 커피 실질언급이 0건이면 검증등급을 참고등급으로 하향(비공개 아님 — 그대로 노출, CEO 승인#539).
  if (grade === "검증" && isNonCafeFnbCategory(opts?.naverCategory) && verifiedTexts.length > 0
      && !verifiedTexts.some((t) => COFFEE_SUBSTANCE.test(t))) {
    grade = "참고";
  }

  // 근거 리뷰: 복합 랭크(정확도 score + 신뢰등급 + 최신성)로 '가장 정확하고 가장 최신' 순. 최대 6개.
  const nowT = Date.now();
  const parseYmd = (d?: string): number | null => {
    if (!d) return null;
    const m = String(d).match(/(\d{4})[.\-/년\s]+(\d{1,2})(?:[.\-/월\s]+(\d{1,2}))?/);
    if (!m) return null;
    const t = new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 15).getTime();
    return isNaN(t) ? null : t;
  };
  // 🔴 2026-08-28 수리(CEO 지시: "최신의 오염 없이 검증된 리뷰를 노출"):
  //   기존 최대 30점은 이름포함(+35)·검증(+20)에 눌려, **3년 전 글이 올해 글을 이겼다.**
  //   실측: 더 최신 검증후기가 있는데 표시엔 옛 것만 남은 카페 8,243곳.
  //   → 최근 1년은 확실히 위로(60점), 그 뒤로 완만히 감소. 오염 방어(이름포함·검증)는 그대로 두고
  //     **같은 자격이면 최신이 이기게** 만든다(품질 기준을 낮추는 게 아니다).
  const recency = (d?: string): number => {
    const t = parseYmd(d); if (t == null) return 8;   // 날짜 없음 = 중립(옛글로 단정 안 함)
    const months = (nowT - t) / 2.63e9;
    if (months <= 12) return 60 - months * 1.0;        // 최근 1년: 60~48
    return Math.max(0, 48 - (months - 12) * 1.6);      // 그 이후 완만히 소멸(약 4년)
  };
  // 인용문에 '이 카페명'이 실제로 들어간 근거를 최우선(+35) — 리스트형 글에서 옆 가게 인용이 대표로 뜨는 것 방지.
  //   (삭제가 아니라 재정렬 — 진짜 후기는 보존하되, 카페를 직접 가리키는 인용을 top-6에 올림)
  const coreToks = coreTokens(name, area).map((t) => t.replace(/\s/g, "").toLowerCase());
  const nameNorm = name.replace(/\s/g, "").toLowerCase();
  const quoteHasName = (q?: string): boolean => {
    if (!q) return false;
    const n = q.replace(/\s/g, "").toLowerCase();
    return coreToks.length ? coreToks.some((t) => n.includes(t)) : n.includes(nameNorm);
  };
  const rank = (e: EvidenceReview): number =>
    (typeof e.score === "number" ? e.score : 50) +
    (e.trust === "verified" ? 20 : e.trust === "reference" ? 0 : -15) +
    recency(e.date) +
    (quoteHasName(e.quote) ? 35 : 0);
  evidence.sort((a, b) => rank(b) - rank(a));
  // 표시 근거는 같은 링크 1건만 — 중복 글 노출 방지 안전장치(상위 6개 선택 전 dedup)
  const evSeen = new Set<string>();
  const evDedup = evidence.filter((e) => {
    const k = (e.link ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^m\./, "").replace(/[#?].*$/, "").replace(/\/+$/, "");
    if (!k) return true;
    if (evSeen.has(k)) return false;
    evSeen.add(k); return true;
  });
  // 유튜브는 카페당 '정확히 1건'만 — 가장 우선인 유튜브 1개를 끝자리에 예약, 나머지 5칸은 블로그/구글.
  // (있으면 1개 보장, 2개 이상이면 1개로 제한, 없으면 6칸 모두 글로 채움.)
  const isYt = (e: EvidenceReview) => /youtu\.?be/.test(e.link ?? "");
  const bestYt = evDedup.find(isYt);
  const nonYt = evDedup.filter((e) => !isYt(e));
  // [rulegap #625] 표시 근거는 같은 블로거(source=bloggername) 최대 2건 — 단일 블로거(사업자 자체 계정 추정)가
  //   top-6를 지배하는 것 방지. 같은 링크 dedup과 동일 사상: 삭제 아님, 밀린 포스팅은 allEvidence(전체보기)엔 그대로 유지.
  const blogCap = new Map<string, number>();
  const pickDiverse = (list: EvidenceReview[], limit: number): EvidenceReview[] => {
    const out: EvidenceReview[] = [];
    for (const e of list) {
      if (out.length >= limit) break;
      const src = (e.source ?? "").trim();
      if (src) {
        const n = blogCap.get(src) ?? 0;
        if (n >= 2) continue;
        blogCap.set(src, n + 1);
      }
      out.push(e);
    }
    return out;
  };
  // 🏷️ 저장 top6 선정에서도 광고 대행 템플릿을 뒤로 민다(2026-08-16, CEO 지시 A).
  //   소비자 상세는 전체 풀을 exposureOrder로 재정렬해 이미 막히지만, **SEO 페이지·목록 카드는
  //   저장된 top6(synth_reviews)의 quote를 그대로 쓴다** — 거기까지 막으려면 선정 시점에도 걸러야 한다.
  //   ⚠️ 제거가 아니라 후순위: 정보카드밖에 없는 카페는 여전히 그것으로 6칸을 채운다(빈 화면 방지).
  const deprioritizeAd = (list: EvidenceReview[]): EvidenceReview[] => {
    const real = list.filter((e) => !isAdTemplateQuote(e.quote));
    const ad = list.filter((e) => isAdTemplateQuote(e.quote));
    return [...real, ...ad];
  };
  let topEvidence = bestYt ? [...pickDiverse(deprioritizeAd(nonYt), 5), bestYt] : pickDiverse(deprioritizeAd(nonYt), 6);
  // 옥석 전체(노이즈 제거 후 verified+reference 전부) — 전체보기용
  const allEvidence = evDedup;

  const synth = synthesize(name, verifiedReviews, area, opts?.naverCategory);
  synth.grade = grade;
  synth.reviewCount = trustCount;
  const charScores = computeCharScores(verifiedTexts, name);

  return { synth, collected: trustCount, grade, charScores, perSource, evidenceReviews: topEvidence, allEvidence, reviewDates, borderline, auditItems, quality: stats, reviewerStats };
}
