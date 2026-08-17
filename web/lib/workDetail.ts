// 💻 카공(작업) 세부 신호 추출 — "작업하기 좋음"이라는 뭉뚱그린 축을 실제 질문 단위로 쪼갠다.
//
// 왜 만드나(2026-08-17, CEO 지시): 실측상 테마 수요 상위 8개 중 7개가 work(카공)인데,
//   우리가 가진 축은 "작업·공부" 하나뿐이었다. 정작 카공족이 묻는 건 **콘센트·와이파이·자리·시간제한**이다.
//   기존 후기 텍스트에서 규칙으로 뽑으므로 LLM 비용 0, 추가 DB 조회 0(이미 읽어온 인용문만 본다).
//
// 🔴 설계의 핵심은 '부정 처리'다.
//   실측: "콘센트없음", "콘센트가 하나도 없어서 오래 있을 곳은 아니에요" 같은 문장이 흔하다.
//   부정을 못 읽으면 **사실과 정반대**를 말하게 된다 — 우리 서비스에서 가장 해선 안 되는 실패다.
//   그래서 긍정/부정을 따로 세고, 화면에는 **양쪽 다** 근거 건수와 함께 내보낸다.
//   "없다"는 정보도 카공족에겐 똑같이 중요한 답이라, 숨기지 않는 게 오히려 해자다.

export type WorkSignal = {
  key: string;
  label: string;      // 긍정일 때 표시할 말
  negLabel: string;   // 부정일 때 표시할 말
  emoji: string;
  yes: number;        // 긍정 언급 건수
  no: number;         // 부정 언급 건수
};

const RULES: { key: string; label: string; negLabel: string; emoji: string; re: RegExp }[] = [
  { key: "outlet", label: "콘센트 있음", negLabel: "콘센트 없다는 언급", emoji: "🔌", re: /콘센트|코드\s?꽂|충전\s?(가능|되)/g },
  { key: "wifi", label: "와이파이 됨", negLabel: "와이파이 아쉽다는 언급", emoji: "📶", re: /와이파이|와이파|wi-?fi/gi },
  { key: "desk", label: "작업하기 좋은 자리", negLabel: "자리가 좁다는 언급", emoji: "🪑", re: /넓은\s?테이블|테이블이\s?(넓|커)|책상|1인석|바\s?자리|바테이블/g },
];

// 시간 제한은 그 자체가 '주의'라 긍정 축이 될 수 없다 — 따로 센다.
const TIME_LIMIT = /시간\s?제한|이용\s?제한|[0-9]\s?시간\s?(이용|까지|만)|눈치\s?(보|주)/g;

// 부정어 — 키워드 **뒤 12자** 안에서 찾는다. "콘센트없음"처럼 붙여 쓰는 경우가 많아 공백을 요구하지 않는다.
//   ⚠️ '없' 하나로 판정하면 "부족함 없이"류를 반대로 읽는다 → '없이'는 제외한다.
//   ⚠️ '눈치'는 반드시 **뒤에도** 봐야 한다 — "노트북 눈치 보여서"가 긍정으로 잡히던 버그(구현 중 실측 발견).
const NEG_AFTER = /없(?!이)|부족|적어|적고|안\s?되|안\s?돼|모자|막혀|불가|아쉽|느[리려림]|안\s?잡|눈치|금지|제한/;
// 🔁 부정의 부정 — "콘센트 부족함 없이 넉넉해요"를 부정으로 읽던 버그(픽스처가 잡음).
//   부정어가 다시 부정되면 오히려 긍정이다. NEG보다 **먼저** 판정해야 한다.
const POS_OVERRIDE = /부족\S{0,2}\s?없|부족하지\s?않|없지\s?않|모자라지\s?않|아쉽지\s?않|불편\S{0,2}\s?없|끊기지\s?않/;
// 키워드 **앞 8자**의 부정도 본다: "노트북 눈치", "콘센트 찾기 어려운"
const NEG_BEFORE = /눈치|어려운|어렵|힘든/;

function judge(text: string, re: RegExp): { yes: number; no: number } {
  let yes = 0, no = 0;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 12);
    const before = text.slice(Math.max(0, m.index - 8), m.index);
    if (POS_OVERRIDE.test(after)) yes++;                        // 부정의 부정 = 긍정(먼저 본다)
    else if (NEG_AFTER.test(after) || NEG_BEFORE.test(before)) no++;
    else yes++;
    if (m[0].length === 0) re.lastIndex++; // 무한루프 방지
  }
  return { yes, no };
}

/**
 * 인용문 배열에서 카공 세부 신호를 센다.
 * @returns 근거 1건 이상인 신호. 표시할 때 반드시 근거 건수를 함께 노출할 것(단정 금지).
 */
export function extractWorkSignals(quotes: string[]): { signals: WorkSignal[]; timeLimit: number } {
  const acc = new Map<string, WorkSignal>();
  let timeLimit = 0;
  for (const q of quotes) {
    const t = String(q || "");
    if (!t) continue;
    for (const r of RULES) {
      const { yes, no } = judge(t, r.re);
      if (!yes && !no) continue;
      const cur = acc.get(r.key) ?? { key: r.key, label: r.label, negLabel: r.negLabel, emoji: r.emoji, yes: 0, no: 0 };
      // 한 후기에서 같은 말을 여러 번 해도 **후기 1건**으로 센다(수다스러운 글 1개가 근거를 부풀리지 않게).
      if (yes > no) cur.yes++; else cur.no++;
      acc.set(r.key, cur);
    }
    const tl = judge(t, TIME_LIMIT);
    if (tl.yes + tl.no > 0) timeLimit++;
  }
  const signals = [...acc.values()]
    // 시설 사실(콘센트·와이파이·자리)은 취향 축과 달리 **후기 1건의 명시적 진술도 근거**가 된다.
    //   대신 절대 단정하지 않는다 — 화면에 항상 '후기 N건'을 함께 적어 강도를 사용자가 판단하게 한다.
    //   실측 배경: 우리 원문은 네이버 스니펫(약 153자)이라 시설 언급 자체가 드물다(콘센트 311곳/13,517곳).
    //   2건을 요구하면 표시 가능 카페가 1%대로 떨어져 기능이 사실상 죽는다.
    .filter((s) => Math.max(s.yes, s.no) >= 1)
    .sort((a, b) => Math.max(b.yes, b.no) - Math.max(a.yes, a.no));
  return { signals, timeLimit };
}
