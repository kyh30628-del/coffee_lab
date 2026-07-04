// 쇼케이스 배너 10종 템플릿 — 데모 페이지·카페 상세·사장님 미리보기 공용.
// 각 스타일은 사진(있으면 배경) 위에 고유한 오버레이·타이포·악센트·애니메이션을 입힌다.
import type { ReactNode } from "react";

export const SHOWCASE_TEMPLATES = [
  { id: 1, name: "프리미엄 매거진", desc: "줌·골드 샤인 · 고급 정통" },
  { id: 2, name: "네온 스포트라이트", desc: "글로우·CTA · 트렌디 핫플" },
  { id: 3, name: "시네마틱 필름", desc: "레터박스·단어 등장 · 영화 감성" },
  { id: 4, name: "미니멀 화이트", desc: "여백·세리프 · 밝고 우아" },
  { id: 5, name: "볼드 팝", desc: "선명·경쾌 · 베이커리/디저트" },
  { id: 6, name: "빈티지 크라프트", desc: "세피아·스탬프 · 레트로 감성" },
  { id: 7, name: "모던 스위스", desc: "그리드·악센트바 · 디자이너 무드" },
  { id: 8, name: "내추럴 그린", desc: "식물·어스톤 · 자연 친화" },
  { id: 9, name: "다크 럭셔리", desc: "블랙·골드 세리프 · 럭셔리" },
  { id: 10, name: "파스텔 드림", desc: "파스텔·몽글 · 사랑스러운" },
];

export const SHOWCASE_CSS = `
.scb{position:relative;width:100%;overflow:hidden}
.scb .scbg,.scb .scimg{position:absolute;inset:0;width:100%;height:100%}
.scb .scimg{object-fit:cover}
.scb .scbg,.scb .scimg{animation:scDrift 15s ease-in-out infinite alternate}
.scb .lab{position:absolute;top:13px;left:14px;z-index:6;font-size:9px;font-weight:700;letter-spacing:1px;padding:4px 10px;border-radius:99px;display:inline-flex;align-items:center;overflow:hidden;animation:scLabIn .55s cubic-bezier(.2,.9,.3,1.3) both}
.scb .ct{position:absolute;left:18px;right:18px;bottom:16px;z-index:5}
.scb .tg{font-size:11.5px;margin-bottom:5px;animation:scUp .6s .12s both}
.scb .hd{font-weight:900;line-height:1.12;white-space:pre-line;animation:scRise .7s .24s both}
.scb .row{display:flex;gap:5px;margin-top:11px;flex-wrap:wrap}
.scb .row .chip{animation:scUp .5s both}
.scb .row .chip:nth-child(1){animation-delay:.42s}.scb .row .chip:nth-child(2){animation-delay:.52s}.scb .row .chip:nth-child(3){animation-delay:.62s}
.scb .cta{animation:scUp .5s .45s both,scBounce 1.6s 1s ease-in-out infinite}
.scb .ln,.scb .est{animation:scUp .5s .5s both}
.scb .chip{font-size:10px;padding:3px 9px;border-radius:99px}
@keyframes scKen{0%{transform:scale(1.04)}100%{transform:scale(1.14) translate(-2%,-3%)}}
@keyframes scUp{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
@keyframes scShine{0%{transform:translateX(-130%)}55%,100%{transform:translateX(260%)}}
@keyframes scSpot{0%{opacity:.5;transform:translate(0,0)}100%{opacity:.95;transform:translate(10%,8%)}}
@keyframes scGlow{0%,100%{text-shadow:0 0 12px rgba(232,184,122,.3)}50%{text-shadow:0 0 26px rgba(232,184,122,.85)}}
@keyframes scBounce{0%,100%{transform:translateX(0)}50%{transform:translateX(5px)}}
@keyframes scBarT{from{transform:translateY(-100%)}to{transform:translateY(0)}}
@keyframes scBarB{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes scWord{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:translateY(0)}}
@keyframes scPan{0%{transform:scale(1.2) translateX(4%)}100%{transform:scale(1.2) translateX(-4%)}}
@keyframes scPop{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
@keyframes scSway{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@keyframes scBar{from{width:0}to{width:46px}}
@keyframes scStamp{0%{transform:scale(1.6) rotate(-14deg);opacity:0}70%{transform:scale(.94) rotate(-7deg);opacity:1}100%{transform:scale(1) rotate(-7deg)}}
@keyframes scSpace{from{letter-spacing:8px;opacity:0}to{letter-spacing:1px;opacity:1}}
@keyframes scFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes scHue{0%{filter:hue-rotate(0)}100%{filter:hue-rotate(18deg)}}
@keyframes scLab{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}
@keyframes scDrift{0%{transform:scale(1.04)}100%{transform:scale(1.09) translate(-1.5%,-2%)}}
@keyframes scLabIn{0%{opacity:0;transform:scale(.55) translateY(-7px)}100%{opacity:1;transform:scale(1) translateY(0)}}
@keyframes scRise{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}

/* 1 매거진 */
.sc1 .scbg{background:radial-gradient(120% 90% at 70% 25%,#c79a62,#7a5230 50%,#3a2516)}
.sc1 .scbg,.sc1 .scimg{animation:scKen 11s ease-in-out infinite alternate}
.sc1 .ov{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.9),transparent 50%)}
.sc1 .lab{background:#e8b87a;color:#2b2018;animation:scLabIn .55s cubic-bezier(.2,.9,.3,1.3) both,scLab 3s 1s ease-in-out infinite}
.sc1 .lab i{position:absolute;inset:0;background:linear-gradient(105deg,transparent 32%,rgba(255,255,255,.8) 50%,transparent 68%);animation:scShine 3.6s ease-in-out infinite}
.sc1 .ct{color:#fff}.sc1 .tg{color:#f3d9a8;animation:scUp .6s .1s both}
.sc1 .hd{font-size:25px;text-shadow:0 2px 14px rgba(0,0,0,.6);animation:scUp .65s .25s both}
.sc1 .chip{background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.3)}

/* 2 네온 */
.sc2 .scbg{background:#14100c}.sc2 .scimg{opacity:.5}
.sc2 .ov{position:absolute;inset:0;background:radial-gradient(46% 56% at 32% 32%,rgba(232,184,122,.6),transparent 70%);animation:scSpot 6s ease-in-out infinite alternate}
.sc2 .ov2{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.85),transparent 55%)}
.sc2 .lab{color:#e8b87a;border:1px solid rgba(232,184,122,.6)}
.sc2 .ct{color:#fff}.sc2 .tg{color:#e8b87a}
.sc2 .hd{font-size:25px;animation:scRise .7s .24s both,scGlow 2.6s 1.1s ease-in-out infinite}
.sc2 .cta{display:inline-block;margin-top:11px;font-size:11px;font-weight:700;color:#14100c;background:#e8b87a;padding:6px 14px;border-radius:99px}

/* 3 시네마틱 */
.sc3 .scbg{background:radial-gradient(120% 90% at 50% 35%,#6b4e34,#241608)}
.sc3 .scbg,.sc3 .scimg{animation:scPan 12s ease-in-out infinite alternate}
.sc3 .vig{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 40%,transparent 48%,rgba(0,0,0,.8));z-index:2}
.sc3 .ov{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.9),transparent 55%);z-index:2}
.sc3 .bar{position:absolute;left:0;right:0;height:26px;background:#000;z-index:3}
.sc3 .bar.t{top:0;animation:scBarT 1s ease-out both}.sc3 .bar.b{bottom:0;animation:scBarB 1s ease-out both}
.sc3 .lab{background:#e8b87a;color:#2b2018;top:34px}
.sc3 .ct{color:#fff;bottom:36px}.sc3 .tg{letter-spacing:1px;color:#d9c4a0}
.sc3 .hd{font-size:22px;animation:none}.sc3 .hd .w{display:inline-block;animation:scWord .5s both}
.sc3 .hd .w:nth-child(1){animation-delay:1.1s}.sc3 .hd .w:nth-child(2){animation-delay:1.25s}.sc3 .hd .w:nth-child(3){animation-delay:1.4s}.sc3 .hd .w:nth-child(4){animation-delay:1.55s}
.sc3 .chip{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.3)}

/* 4 미니멀 화이트 */
.sc4 .scbg{background:linear-gradient(160deg,#fbf7f0,#efe6d6)}.sc4 .scimg{opacity:.92}
.sc4 .ov{position:absolute;inset:0;background:linear-gradient(to top,rgba(253,250,244,.96),rgba(253,250,244,.2) 55%)}
.sc4 .lab{background:#2b2018;color:#f4ece0}
.sc4 .ct{color:#2b2018}.sc4 .tg{letter-spacing:2px;color:#9c6b3f;text-transform:uppercase;font-size:10px;animation:scUp .6s .1s both}
.sc4 .hd{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:24px;color:#2b2018;animation:scUp .65s .25s both}
.sc4 .ln{height:1px;width:46px;background:#c0a070;margin-top:10px;animation:scBar 1s .5s both}
.sc4 .chip{background:#2b2018;color:#f4ece0}

/* 5 볼드 팝 */
.sc5 .scbg{background:linear-gradient(135deg,#f0a04b,#e2632a 60%,#c0392b)}.sc5 .scimg{mix-blend-mode:multiply;opacity:.85}
.sc5 .ov{position:absolute;inset:0;background:linear-gradient(to top,rgba(120,30,10,.8),transparent 55%)}
.sc5 .lab{background:#fff;color:#c0392b}
.sc5 .ct{color:#fff}.sc5 .tg{font-weight:700;color:#ffe2cc}
.sc5 .hd{font-size:26px;line-height:1.05;text-shadow:0 2px 10px rgba(0,0,0,.35);animation:scUp .6s .2s both}
.sc5 .chip{background:rgba(255,255,255,.28);color:#fff;border:1px solid rgba(255,255,255,.5)}

/* 6 빈티지 크라프트 */
.sc6 .scbg{background:#cbb487}.sc6 .scimg{filter:sepia(.55) contrast(.95);opacity:.85}
.sc6 .ov{position:absolute;inset:0;background:linear-gradient(to top,rgba(70,52,30,.85),rgba(70,52,30,.15) 60%);box-shadow:inset 0 0 0 2px rgba(70,52,30,.5),inset 0 0 0 5px rgba(70,52,30,.0)}
.sc6 .fr{position:absolute;inset:8px;border:1.5px dashed rgba(245,235,210,.7);z-index:4;pointer-events:none}
.sc6 .lab{background:transparent;border:1.5px solid #f5ebd2;color:#f5ebd2;transform:rotate(-7deg);animation:scStamp 1s .2s both;letter-spacing:2px}
.sc6 .ct{color:#f5ebd2}.sc6 .tg{font-family:Georgia,serif;font-style:italic;color:#e8d6b0}
.sc6 .hd{font-family:Georgia,'Times New Roman',serif;font-size:23px;letter-spacing:.5px}
.sc6 .est{font-size:9px;letter-spacing:3px;color:#d9c4a0;margin-top:8px}
.sc6 .chip{background:rgba(245,235,210,.18);color:#f5ebd2;border:1px solid rgba(245,235,210,.5)}

/* 7 모던 스위스 */
.sc7 .scbg{background:#ece9e2}.sc7 .scimg{filter:grayscale(.2)}
.sc7 .ov{position:absolute;inset:0;background:linear-gradient(to top,rgba(20,20,20,.7),transparent 55%)}
.sc7 .blk{position:absolute;left:0;bottom:0;width:7px;top:0;background:#e2401f;z-index:4;animation:scBarT 1.4s cubic-bezier(.2,.8,.2,1) both}
.sc7 .num{position:absolute;top:14px;right:16px;z-index:5;font-family:Arial,sans-serif;font-size:30px;font-weight:900;color:rgba(255,255,255,.85)}
.sc7 .lab{background:#e2401f;color:#fff;border-radius:0}
.sc7 .ct{color:#fff;left:22px}.sc7 .tg{font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:2px;font-size:10px;color:#ffb9a8}
.sc7 .hd{font-family:Arial,'Helvetica Neue',sans-serif;font-size:25px;letter-spacing:-.5px;animation:scUp .5s .2s both}
.sc7 .chip{background:#fff;color:#1a1a1a;border-radius:0}

/* 8 내추럴 그린 */
.sc8 .scbg{background:linear-gradient(150deg,#3f5d3a,#6b7b4a 60%,#94895a)}.sc8 .scimg{opacity:.7}
.sc8 .ov{position:absolute;inset:0;background:linear-gradient(to top,rgba(28,40,24,.88),transparent 58%)}
.sc8 .leaf{position:absolute;z-index:4;font-size:34px;opacity:.55;transform-origin:top center;animation:scSway 5s ease-in-out infinite}
.sc8 .leaf.a{top:-4px;right:14px}.sc8 .leaf.b{top:30px;left:10px;font-size:24px;animation-delay:1s}
.sc8 .lab{background:#dfe8c8;color:#3f5d3a}
.sc8 .ct{color:#f3f1e2}.sc8 .tg{color:#cdd9a8;font-style:italic;font-family:Georgia,serif}
.sc8 .hd{font-family:Georgia,serif;font-size:24px;animation:scUp .65s .2s both}
.sc8 .chip{background:rgba(223,232,200,.2);color:#f3f1e2;border:1px solid rgba(223,232,200,.5)}

/* 9 다크 럭셔리 */
.sc9 .scbg{background:radial-gradient(120% 100% at 50% 0%,#241d16,#0c0a08)}.sc9 .scimg{opacity:.45;filter:saturate(.8)}
.sc9 .ov{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.92),transparent 60%)}
.sc9 .fr{position:absolute;inset:10px;border:1px solid rgba(212,175,110,.55);z-index:4;pointer-events:none}
.sc9 .spk{position:absolute;z-index:5;color:#e9cf8f;font-size:12px;animation:scGlow 2.4s ease-in-out infinite}
.sc9 .spk.a{top:18px;right:24px}.sc9 .spk.b{bottom:64px;left:30px;font-size:9px;animation-delay:1.2s}
.sc9 .lab{background:transparent;border:1px solid #d4af6e;color:#e9cf8f;letter-spacing:2px}
.sc9 .ct{color:#f4ecd9}.sc9 .tg{color:#d4af6e;letter-spacing:3px;text-transform:uppercase;font-size:9.5px}
.sc9 .hd{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:25px;color:#f4ecd9;animation:scSpace 1.1s .2s both}
.sc9 .chip{background:transparent;color:#e9cf8f;border:1px solid rgba(212,175,110,.6)}

/* 10 파스텔 드림 */
.sc10 .scbg{background:linear-gradient(135deg,#ffd9e6,#e7d6ff 50%,#d6ecff);animation:scHue 7s ease-in-out infinite alternate}.sc10 .scimg{opacity:.6}
.sc10 .ov{position:absolute;inset:0;background:linear-gradient(to top,rgba(90,60,110,.55),transparent 60%)}
.sc10 .heart{position:absolute;z-index:4;font-size:18px;opacity:.8;animation:scFloat 3.5s ease-in-out infinite}
.sc10 .heart.a{top:16px;right:18px}.sc10 .heart.b{top:52px;right:44px;font-size:13px;animation-delay:1.3s}
.sc10 .lab{background:#fff;color:#b46aa0}
.sc10 .ct{color:#fff}.sc10 .tg{color:#ffe6f3;font-weight:700}
.sc10 .hd{font-size:24px;text-shadow:0 2px 12px rgba(120,60,120,.4);animation:scPop .7s .2s both}
.sc10 .chip{background:rgba(255,255,255,.35);color:#fff;border:1px solid rgba(255,255,255,.6)}

/* 강점 벡터 히어로(사진 없을 때) — 비트맵 이모지 대신 SVG라 어떤 해상도에서도 선명 */
.scb .scHero{position:absolute;inset:0;z-index:1;pointer-events:none;color:#fff}
.scb .scHero span{position:absolute;display:block}
.scb .scHero svg{width:100%;height:100%;display:block}
.scb .scHeroMain{top:13%;left:50%;transform:translateX(-50%);width:33%;max-width:130px;opacity:.9;filter:drop-shadow(0 8px 22px rgba(0,0,0,.32));animation:scFloat 5.5s ease-in-out infinite}
.scb .scHeroSub{opacity:.13;filter:drop-shadow(0 3px 8px rgba(0,0,0,.2))}
.scb .scHeroSub.a{top:15%;left:8%;width:15%;max-width:50px;animation:scFloat 6.5s .6s ease-in-out infinite}
.scb .scHeroSub.b{top:27%;right:8%;width:12%;max-width:42px;animation:scFloat 7.5s 1.1s ease-in-out infinite}
.scb .scGrain{position:absolute;inset:0;opacity:.09;background-image:radial-gradient(rgba(255,255,255,.7) 1px,transparent 1.5px);background-size:15px 15px}
.sc4 .scHero,.sc7 .scHero{color:#2b2018}.sc4 .scGrain,.sc7 .scGrain{opacity:.05;background-image:radial-gradient(rgba(60,40,30,.5) 1px,transparent 1.5px)}
.sc10 .scHero{color:#9161a8}.sc9 .scHero{color:#d8b978}
.scb .chip .chIcon{display:inline-block;width:11px;height:11px;vertical-align:-1.5px;margin-right:4px;opacity:.9}
.scb .chip .chIcon svg{width:100%;height:100%}
`;

type Props = {
  style?: number; headline: string; tagline?: string; points?: string[];
  photo?: string | null; cta?: string; height?: string; scene?: string;
};

// 강점 텍스트 → 프리미엄 벡터 아이콘 키(비트맵 이모지는 확대 시 흐려짐 → SVG로 선명하게).
const STRENGTH_META: [RegExp, string][] = [
  [/사진|포토|스냅|인생샷|화보/, "camera"],
  [/무드|분위기|감성|아늑|힙|예쁜|예쁘|이색/, "sparkle"],
  [/넓|공간|홀|좌석|자리|룸|대형|층|웅장|규모/, "space"],
  [/디저트|달콤|케이크|빵|베이커|쿠키|타르트|스콘|마카롱|휘낭|구움/, "cake"],
  [/커피|원두|로스팅|에스프레소|라떼|드립|스페셜티|핸드드립|바리스타/, "coffee"],
  [/조용|고요|혼자|집중|힐링|편안|고즈넉|아늑/, "leaf"],
  [/뷰|전망|풍경|바다|강|호수|리버|오션|산/, "view"],
  [/루프탑|테라스|정원|야외|가든|마당|자연|플랜트/, "leaf"],
  [/아이|키즈|반려|애견|강아지|펫/, "paw"],
  [/야경|밤|늦게|심야|무드등/, "moon"],
];
const strengthKey = (t: string) => { for (const [re, k] of STRENGTH_META) if (re.test(t || "")) return k; return "coffee"; };

const ICON_PATHS: Record<string, ReactNode> = {
  camera: (<><path d="M4 8.2h3l1.4-2.3h7.2L17 8.2h3a1 1 0 011 1v8.6a1 1 0 01-1 1H4a1 1 0 01-1-1V9.2a1 1 0 011-1z"/><circle cx="12" cy="13.2" r="3.5"/></>),
  sparkle: (<><path d="M12 3.4c.45 3.7 1.9 5.15 5.6 5.6-3.7.45-5.15 1.9-5.6 5.6-.45-3.7-1.9-5.15-5.6-5.6 3.7-.45 5.15-1.9 5.6-5.6z"/><path d="M18.4 15c.18 1.5.72 2.02 2.2 2.2-1.48.18-2.02.72-2.2 2.2-.18-1.48-.72-2.02-2.2-2.2 1.48-.18 2.02-.72 2.2-2.2z"/></>),
  space: (<><path d="M6 12V8.6A2.6 2.6 0 018.6 6h6.8A2.6 2.6 0 0118 8.6V12"/><path d="M4.6 12A1.6 1.6 0 016.2 13.6V16.2h11.6V13.6A1.6 1.6 0 0119.4 12a1.6 1.6 0 011.6 1.6V19.4H3v-5.8A1.6 1.6 0 014.6 12z"/><path d="M7.2 19.4v1.4M16.8 19.4v1.4"/></>),
  cake: (<><path d="M4.6 20v-5.4a2 2 0 012-2h10.8a2 2 0 012 2V20z"/><path d="M4.6 16.4c1.35 1.35 2.75 1.35 3.8 0s2.45-1.35 3.5 0 2.55 1.35 3.9 0"/><path d="M12 12.6V9.4"/><circle cx="12" cy="7.6" r="1.05"/></>),
  coffee: (<><path d="M5.4 8.6h10.9V14a4.5 4.5 0 01-4.5 4.5H9.9A4.5 4.5 0 015.4 14z"/><path d="M16.3 9.7H18a2.4 2.4 0 010 4.8h-1.7"/><path d="M8.5 3.4c-.55.9-.55 1.6 0 2.5M11.5 3.4c-.55.9-.55 1.6 0 2.5"/></>),
  leaf: (<><path d="M5 19C4.2 11.2 10.6 5 20 5.2c.15 9.2-6.1 14.8-15 13.8z"/><path d="M5.2 19c2.7-5.5 6.5-8.6 11.4-10"/></>),
  view: (<><path d="M3 18.4l5.6-8 3.4 4.4 2.6-3.6L21 18.4z"/><circle cx="7.4" cy="7" r="1.8"/></>),
  moon: (<path d="M20.5 14.4A8 8 0 019.6 3.5a8 8 0 1010.9 10.9z"/>),
  paw: (<><ellipse cx="8" cy="9.2" rx="1.3" ry="1.8"/><ellipse cx="12" cy="7.8" rx="1.3" ry="1.9"/><ellipse cx="16" cy="9.2" rx="1.3" ry="1.8"/><path d="M12 12.2c-2.4 0-4.3 1.7-4.3 3.6 0 1.5 1.2 2.3 2.5 1.9.85-.28 2.75-.28 3.6 0 1.3.4 2.5-.4 2.5-1.9 0-1.9-1.9-3.6-4.3-3.6z"/></>),
};
function StrengthIcon({ k, stroke = 1.6 }: { k: string; stroke?: number }) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{ICON_PATHS[k] ?? ICON_PATHS.coffee}</svg>);
}

export default function ShowcaseBanner({ style = 1, headline, tagline, points = [], photo, cta, height = "16rem" }: Props) {
  const cls = `sc${Math.min(Math.max(style, 1), 10)}`;
  // 사진 없을 때: 강점 기반 프리미엄 벡터 히어로(선명·무한 해상도). 대표 강점 크게 + 보조 강점 은은하게.
  const keys = (points.length ? points : [headline]).map(strengthKey);
  const heroKey = keys[0] || "coffee";
  const subKeys = Array.from(new Set(keys.slice(1))).filter((k) => k !== heroKey).slice(0, 2);
  return (
    <div className={`scb ${cls}`} style={{ height }}>
      {photo ? <img className="scimg" src={photo} alt="" /> : <div className="scbg" />}
      {!photo && (
        <div className="scHero" aria-hidden="true">
          <i className="scGrain" />
          <span className="scHeroMain"><StrengthIcon k={heroKey} stroke={1.15} /></span>
          {subKeys[0] && <span className="scHeroSub a"><StrengthIcon k={subKeys[0]} stroke={1.5} /></span>}
          {subKeys[1] && <span className="scHeroSub b"><StrengthIcon k={subKeys[1]} stroke={1.5} /></span>}
        </div>
      )}
      {style === 2 && <div className="ov2" />}
      <div className="ov" />
      {style === 3 && <div className="vig" />}
      {style === 3 && <><div className="bar t" /><div className="bar b" /></>}
      {style === 6 && <div className="fr" />}
      {style === 7 && <><div className="blk" /><div className="num">01</div></>}
      {style === 8 && <><span className="leaf a">🌿</span><span className="leaf b">🍃</span></>}
      {style === 9 && <><div className="fr" /><span className="spk a">✦</span><span className="spk b">✦</span></>}
      {style === 10 && <><span className="heart a">🤍</span><span className="heart b">✿</span></>}
      <span className="lab">🎀 사장님 쇼케이스{style === 1 && <i />}</span>
      <div className="ct">
        {tagline && <div className="tg">{tagline}</div>}
        <div className="hd">{style === 3 ? headline.split(" ").map((w, i) => <span key={i} className="w">{w}&nbsp;</span>) : headline}</div>
        {style === 2 && <div className="cta">{cta ?? "지금 가보기 →"}</div>}
        {style === 6 && <div className="est">EST · 강동</div>}
        {points.length > 0 && style !== 2 && (
          <div className="row">{points.map((pt, i) => <span key={i} className="chip"><i className="chIcon"><StrengthIcon k={strengthKey(pt)} stroke={2.1} /></i>{pt}</span>)}</div>
        )}
      </div>
    </div>
  );
}
