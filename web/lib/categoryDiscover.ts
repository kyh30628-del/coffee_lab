// 카테고리 자동 발굴(LLM) — 월 1회. 검증 리뷰 샘플을 Haiku가 읽고 '아직 없는 특징 카테고리'를 제안.
// ⚠️ 제안만 — 실제 추가는 사람이 검토 후(해자 보호). 콘솔키(ANTHROPIC_API_KEY)만, 구독토큰 안 씀.
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-haiku-4-5";

export const CURRENT_CATEGORIES = [
  "통창·창밖 뷰", "루프탑·테라스", "정원·자연 속", "강·바다 뷰", "넓고 탁 트인 공간", "주차 편함",
  "수제·당일 베이킹", "커피가 맛있는", "디저트 맛집", "브런치 좋은", "조용·차분한", "감성·사진 맛집",
  "아늑·따뜻한", "작업·노트북", "친절한 응대", "가성비 좋은", "웨이팅·인기", "데이트·기념일",
  "반려동물 동반", "늦게까지·심야", "차·티 전문", "비건·건강한", "책·북카페", "전시·작품",
  "단체·모임룸", "노키즈존", "빈티지·레트로", "한옥·전통", "식물·플랜테리어", "와인·주류",
  "시그니처 음료", "원두 판매·로스터리", "키즈·놀이공간",
];

export type CategoryCandidate = { label: string; keywords: string[]; sampleCount?: number };

const SYS = `너는 카페 큐레이션 서비스의 '카테고리 설계자'다. 소비자가 카페를 고를 때 중요한 '구체적 특징'을 리뷰에서 찾는다.
규칙:
- 이미 있는 카테고리와 겹치면 절대 제안하지 마라.
- 일반어(맛있다·좋다·예쁘다·분위기)나 메타정보(영업시간·주소·전화)는 카테고리가 아니다.
- '소비자가 카페 선택에 실제로 쓸, 구체적이고 변별력 있는 특징'만(예: 베이글 전문, 셀프 로스팅 클래스, 오마카세 디저트, 키즈존, 통유리 채광 등).
- 리뷰 스니펫에 '실제로 여러 번 나오는' 것만. 추측 금지.
- 키워드는 한국어 '긍정·구체 phrase'로(맨 명사 금지 — 지명/부정문 오탐 방지). 예: "베이글이 맛", "직접 로스팅 클래스".
JSON 배열로만 답한다(설명 금지): [{"label":"짧은 한글 라벨","keywords":["phrase1","phrase2", ...5~8개]}]`;

export async function proposeCategories(quotes: string[]): Promise<CategoryCandidate[] | null> {
  if (!KEY) return null; // 콘솔키 없으면 발굴 비활성(구독토큰 폴백 없음)
  const sample = quotes.filter(Boolean).slice(0, 400).map((q, i) => `${i + 1}. ${q.slice(0, 120)}`).join("\n");
  const user = `[이미 있는 카테고리(제외 대상)]\n${CURRENT_CATEGORIES.join(", ")}\n\n[카페 리뷰 스니펫]\n${sample}\n\n위 목록에 '없는' 새 특징 카테고리를 최대 8개 제안.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: SYS, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.find((b: any) => b.type === "text")?.text ?? "";
    const m = text.match(/\[[\s\S]*\]/);
    const arr = JSON.parse(m ? m[0] : text) as CategoryCandidate[];
    return Array.isArray(arr) ? arr.filter((c) => c?.label && Array.isArray(c.keywords) && c.keywords.length).slice(0, 8) : [];
  } catch { return null; }
}
