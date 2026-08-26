// 📣 서비스 공지 정의 — **지역이 추가될 때마다 여기 한 항목만 추가하면 된다.** (2026-08-25 CEO 지시)
//
// 왜 데이터로 뺐나: 강원 공지를 컴포넌트에 하드코딩했더니, 다음 지역(충청·경상 등)을 열 때
//   또 컴포넌트를 뜯어야 한다. 공지는 앞으로 계속 생길 일이라 **양식**으로 만들어 둔다.
//   새 지역을 열면 아래 배열에 항목 하나 추가 → 끝. 화면 코드는 건드리지 않는다.
//
// ⚠️ 날짜 3개를 반드시 함께 정한다(하나라도 빠지면 거짓 공지가 남는다):
//   from     : 이때부터 띄운다
//   pastFrom : 이때부터 **완료형** 문구로 자동 전환("추가됩니다" → "추가되었습니다")
//   until    : 이때부터 아예 안 띄운다(다 알린 공지를 계속 띄울 이유가 없다)
//   사람이 지우는 걸 잊어도 스스로 정리되게 코드에 날짜를 박는다.
//
// ⚠️ id는 절대 재사용하지 않는다. localStorage 키(dcn_notice_<id>)가 '다시 보지 않기' 기록이라,
//   같은 id를 재활용하면 예전에 끈 사람에게 새 공지가 영영 안 뜬다.

export type Notice = {
  id: string;
  from: number; pastFrom: number; until: number;
  emoji: string;
  title: string; titlePast: string;
  body: string; bodyPast: string;      // 굵게 강조할 앞부분은 highlight로 분리
  highlight?: string;                  // 본문 앞에 붙는 강조 문구(예: "8월 31일까지")
  sub: string; subPast: string;
  cta: string; ctaPast: string;
  /** 버튼을 누르면 갈 곳. 비우면 그냥 닫힌다.
   *  ⚠️ 지역 공지는 반드시 채운다 — "새로 열렸다"고 알려놓고 랜딩으로 떨구면 사용자가 직접 찾아가야 한다. */
  ctaHref?: string;
};

const KST = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, -9, 0, 0); // KST 자정

// ⚠️ 이 배열은 이제 **폴백**이다(2026-08-25). 진실 원본은 DB `notices` 테이블이고
//   관리자 화면(/admin)에서 무배포로 만들고 고친다. DB가 죽어도 서비스 공지가 사라지지 않게
//   여기 값을 남겨 둔다 — criteria의 DEFAULTS와 같은 원칙이다.
export const NOTICES: Notice[] = [
  {
    id: "gangwon-2026-08",
    from: KST(2026, 8, 25), pastFrom: KST(2026, 9, 1), until: KST(2026, 9, 16),
    emoji: "🏔️",
    title: "강원 지역이 새로 열렸어요",
    titlePast: "강원 지역이 모두 열렸어요",
    highlight: "8월 31일까지",
    body: "강원 지역 전역이 순차적으로 추가됩니다.",
    bodyPast: "강원 지역 전역이 순차적으로 추가되었습니다.",
    sub: "춘천·원주부터 공개 중이고, 후기 검증을 마친 곳만 차례로 올라와요.",
    subPast: "춘천·원주를 시작으로 강원 전역이 올라왔어요. 후기 검증을 마친 곳만 담았습니다.",
    cta: "둘러보기",
    ctaPast: "강원 카페 보러가기",
    ctaHref: "/?sido=강원&tab=map", // 알린 지역의 지도로 바로 데려간다
  },
];

/** 지금 띄울 공지 하나. 겹치면 나중에 시작한 것(최신)을 쓴다. */
export function activeNotice(now = Date.now()): Notice | null {
  const live = NOTICES.filter((n) => now >= n.from && now < n.until);
  if (!live.length) return null;
  return live.sort((a, b) => b.from - a.from)[0];
}

export const isPast = (n: Notice, now = Date.now()) => now >= n.pastFrom;
