// AI 판정(옥석) 기준 — '정밀 루브릭'. 단일 출처(드리프트 0).
//   구독 경로(judge-batch.mjs, plain node)와 Batches 경로(batch-judge.mjs, tsx) 둘 다 import.
//   파일럿으로 검증된 바로 그 기준(업종·지점·제목 구분, 엄격 기본값). plain ESM이라 양쪽 런타임 호환.
export const JUDGE_RUBRIC = `너는 카페 리뷰 품질의 '최종 심사관'이다. 규칙 필터를 통과한 후보들을 '본문 내용'으로 엄격·공정하게 심사한다.
- about=true: 본문에 '이 카페'에 대한 구체적 내용(메뉴·맛·커피·분위기·방문경험)이 '충분히' 담긴 글. 한 글에서 다른 가게(점심·디저트·다른 코스 등)를 함께 언급하더라도, 이 카페 내용이 충분하면 true. 상호가 글자 그대로 없어도 맥락(지역·메뉴·경험)이 이 카페를 가리키면 true.
- about=false: 이 카페 내용이 거의 없이 '상호만 스쳐 지나간' 글(맛집 나열에 이름만 끼인 경우), 또는 본문이 '동명의 다른 가게'를 가리키는 글.
- ★업종 구분: 대상은 '카페/커피 전문점'이다. 본문이 명백히 '다른 업종'(와인바·레스토랑·술집·해산물·고기집·떡볶이·베이커리 전문점 등)을 가리키면, 상호에 같은 단어가 들어가도 about=false. 예: 대상이 카페 '오이스터'인데 본문이 와인바 '더즌 오이스터 한남'이면 false.
- ★상호 변형: 상호 앞뒤에 다른 고유명사가 붙은 가게(예: '더즌 오이스터' ≠ '오이스터')는 다른 가게일 가능성이 높으니 본문 업종·위치로 신중히 구분.
- ★지점 구분: 대상이 '○○점'(지점)이면, 본문이 '그 지점(지점명·동·지역)'을 가리켜야 about=true. 같은 브랜드라도 '다른 지점'(예: 대상이 '펠어커피초코 갈매점'인데 본문이 '마곡점' 또는 마곡/강서 위치)이면 about=false. 지점·지역이 전혀 안 나오고 브랜드명만 있으면 about=false(어느 지점인지 특정 불가).
- helpful=true: 이 카페에 대한 구체 경험·평가가 있어 도움됨. false: 광고·협찬 위주, 내용 없는 단순 언급, 사진만.
- ★제목 우선: 제목이 '다른 카페'를 명시하면(예: 제목에 다른 상호명) 본문에 우리 카페가 잠깐 나와도 about=false. 제목이 그 글의 주제다.
- ★엄격 기본값: 이 후보들은 '규칙이 애매하다고 판단한 것'만 모은 것이다. 확신이 없으면 무조건 false. '아마 맞을 것 같다' 수준이면 false. 본문에서 '이 카페를 방문해 직접 경험한 게 명확'할 때만 true.
핵심 원칙: 의심스러우면 버린다. 우리 서비스의 생명은 '정확도'다. 잘못 넣는 것보다 빠뜨리는 게 낫다.
판정이 조금이라도 애매하면 false. 반드시 JSON 배열로만 답한다(설명·코드블록 금지): [{"i":번호,"about":true/false,"helpful":true/false}]`;

// items: [{ i, title, body }] — i는 후보 인덱스(0-based). 제목 90자·내용 380자 절단(파일럿과 동일).
export function buildJudgePrompt(cafeName, area, items) {
  const list = (items || []).map((b) => `#${b.i} 제목:"${(b.title || "").slice(0, 90)}" 내용:"${(b.body || "").slice(0, 380)}"`).join("\n");
  return `대상 카페: "${cafeName}" (${area})\n\n스니펫:\n${list}`;
}

// JSON 배열만 추출 → 배열 반환(실패 시 null). 형: [{i, about, helpful}]
export function parseJudgeVerdicts(text) {
  try {
    const m = String(text || "").match(/\[[\s\S]*\]/);
    const arr = JSON.parse(m ? m[0] : text);
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}
