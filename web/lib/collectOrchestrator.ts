// 수집 오케스트레이터 (PRINCIPLES §1·§2·§3·§4·§7)
// 모든 수집 글을 '리뷰 품질 검증 엔진'에 통과시켜 옥석을 가린 뒤에만 합성·집계·노출한다.
import { verifyReview, coreTokens, type QualityVerdict, type SourceKind } from "./reviewQuality";
import { synthesize, type Review, type SynthResult } from "./synthEngine";
import { computeCharScores } from "./charScore";
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

export type BorderlineItem = { key: string; title?: string; body: string };

export type CollectResult = {
  synth: SynthResult;
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
    // 유선(지역번호 02-/0XX-)
    .replace(/\b0(2|[3-6][0-9])[-\s.]?\d{3,4}[-\s.]?\d{4}\b/g, "***-****-****")
    // 일반 분리형 전화(주소 뒤 등)
    .replace(/\b\d{2,4}[-\s.]\d{3,4}[-\s.]\d{4}\b/g, "***-****-****")
    .replace(/\s{2,}/g, " ").trim();
}
const COFFEE_TERMS = /커피|카페|라떼|아메리카노|원두|로스팅|에스프레소|디저트|케이크|베이커리|빵|브런치|분위기|인테리어|메뉴|음료|핸드드립|드립|콜드브루|바리스타|좌석|자리|맛있|고소|산미|크림|디카페인|플랫화이트|감성|예쁘|아늑|향/;
// 표시 인용문: '이 카페·커피' 관련 문장을 우선 골라 1줄로. 다른 가게(점심·디저트 등)를 함께 적은
// 글이어도 카페 내용이 담긴 문장이 보이게 → 멀티 언급 글도 의미 있게 활용.
function toQuote(text: string, name = "", maxLen = 90): string {
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

export function collectAndSynthesize(name: string, area: string[], sources: RawSource[], opts?: { whitelist?: Set<string>; decisions?: Record<string, boolean>; address?: string }): CollectResult {
  const whitelist = opts?.whitelist;
  const verifiedReviews: Review[] = [];   // 합성 입력(검증, 출처가중 반영)
  const perSource: { source: string; raw: number; kept: number }[] = [];
  const evidence: EvidenceReview[] = [];
  const verifiedTexts: string[] = [];      // char_scores 계산용
  const reviewDates: string[] = [];        // 리뷰 주기 분석용(검증·참고 게시일 YYYY.MM.DD)
  const borderline: BorderlineItem[] = []; // LLM 재판정 대상(경계)
  const auditItems: BorderlineItem[] = []; // Sonnet 최종 심사 대상(규칙상 on-topic 전체)
  const seen = new Set<string>();
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
      if (lk && seenLinks.has(lk)) { stats.duplicates++; continue; }
      if (lk) seenLinks.add(lk);
      const key = dedupeKey(t.text);
      if (seen.has(key)) { stats.duplicates++; continue; }   // 교차 출처 중복(스니펫 동일)
      seen.add(key);
      stats.raw++;   // 고유 글만 '전체'로 집계 → 전체 = 노이즈 + 옥석 (정확히 맞음)

      const rule = verifyReview({ title: t.title, body: t.desc ?? t.text, name, areaTerms: area, addr: opts?.address, source: kind });

      // 규칙상 on-topic(검증·참고 또는 경계)은 Sonnet 최종 심사 후보로 노출
      if (rule.verdict !== "rejected" || rule.borderline) auditItems.push({ key, title: t.title, body: t.desc ?? t.text });
      if (rule.borderline) borderline.push({ key, title: t.title, body: t.desc ?? t.text });

      // 효과 판정: decisions(Sonnet 최종 심사) > whitelist(보조) > 규칙
      //   단 '광고·협찬'(sponsored)은 판정결정·whitelist로도 못 살림 — 랜딩 약속(광고 자동 제외)은 절대 우선.
      const isAd = !!rule.signals?.sponsored;
      let verdict = rule.verdict;
      let reasons = rule.reasons;
      let score = rule.score;
      if (isAd) { verdict = "rejected"; reasons = ["광고·협찬 — 자동 제외(판정보다 우선)"]; score = 0; }
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
      kept++;

      // 합성 입력: verified 정가중, reference 절반가중. 출처가중도 반영.
      const reps = verdict === "verified" ? Math.max(1, Math.round(weight)) : 1;
      for (let i = 0; i < reps; i++) verifiedReviews.push({ text: t.text, time: t.time });
      verifiedTexts.push(t.text);
      if (t.date && /^\d{4}\.\d{2}\.\d{2}$/.test(t.date)) reviewDates.push(t.date);

      if (t.link || src.source === "google") {
        evidence.push({
          quote: toQuote(t.text, name), link: t.link, source: t.source, date: t.date,
          trust: verdict, score, why: reasons.slice(0, 3),
        });
      }
    }
    perSource.push({ source: src.source, raw: src.texts.length, kept });
  }

  // 신뢰 헤드라인 숫자 = 노이즈 제거 후 '주제가 맞는 진짜 리뷰' 수(검증+참고).
  // rejected(동명·모음언급·무관·내용없음)만 버린 뒤 남은 옥석. 등급도 이 기준.
  const trustCount = stats.verified + stats.reference;
  const grade: "검증" | "참고" | "후보" = trustCount >= 30 ? "검증" : trustCount >= 5 ? "참고" : "후보";

  // 근거 리뷰: 복합 랭크(정확도 score + 신뢰등급 + 최신성)로 '가장 정확하고 가장 최신' 순. 최대 6개.
  const nowT = Date.now();
  const parseYmd = (d?: string): number | null => {
    if (!d) return null;
    const m = String(d).match(/(\d{4})[.\-/년\s]+(\d{1,2})(?:[.\-/월\s]+(\d{1,2}))?/);
    if (!m) return null;
    const t = new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 15).getTime();
    return isNaN(t) ? null : t;
  };
  const recency = (d?: string): number => {
    const t = parseYmd(d); if (t == null) return 8;
    const months = (nowT - t) / 2.63e9;
    return months <= 1 ? 30 : Math.max(0, 30 - months * 1.3);
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
  let topEvidence = bestYt ? [...nonYt.slice(0, 5), bestYt] : nonYt.slice(0, 6);
  // 옥석 전체(노이즈 제거 후 verified+reference 전부) — 전체보기용
  const allEvidence = evDedup;

  const synth = synthesize(name, verifiedReviews);
  synth.grade = grade;
  synth.reviewCount = trustCount;
  const charScores = computeCharScores(verifiedTexts);

  return { synth, collected: trustCount, grade, charScores, perSource, evidenceReviews: topEvidence, allEvidence, reviewDates, borderline, auditItems, quality: stats };
}
