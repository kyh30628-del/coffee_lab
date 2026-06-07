import BackLink from "../BackLink";
export const metadata = { title: "쇼케이스 스타일 샘플" };

const CSS = `
@keyframes ken{0%{transform:scale(1.04)}100%{transform:scale(1.14) translate(-2%,-3%)}}
@keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes shine{0%{transform:translateX(-130%)}55%,100%{transform:translateX(260%)}}
@keyframes spot{0%{background-position:0 0;opacity:.5}100%{background-position:60% 50%;opacity:.95}}
@keyframes glow{0%,100%{text-shadow:0 0 12px rgba(232,184,122,.3)}50%{text-shadow:0 0 26px rgba(232,184,122,.8)}}
@keyframes bounce{0%,100%{transform:translateX(0)}50%{transform:translateX(5px)}}
@keyframes barT{from{transform:translateY(-100%)}to{transform:translateY(0)}}
@keyframes barB{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes word{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes pan{0%{transform:scale(1.2) translateX(4%)}100%{transform:scale(1.2) translateX(-4%)}}
@keyframes pop{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
.sc-b{position:relative;width:100%;height:220px;overflow:hidden}
.sc-scene{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:100px}
.sc-lab{position:absolute;top:12px;left:13px;font-size:9px;font-weight:700;letter-spacing:1px;padding:4px 10px;border-radius:99px;z-index:5}
.sc-chip{font-size:10px;padding:3px 9px;border-radius:99px}
.sc-row{display:flex;gap:5px;margin-top:10px;flex-wrap:wrap}
/* 1 매거진 */
.s1 .bg{position:absolute;inset:0;background:radial-gradient(120% 90% at 70% 25%,#c79a62,#7a5230 50%,#3a2516);animation:ken 11s ease-in-out infinite alternate}
.s1 .gr{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.9),transparent 50%)}
.s1 .sc-lab{background:#e8b87a;color:#2b2018;overflow:hidden}
.s1 .sc-lab i{position:absolute;inset:0;background:linear-gradient(105deg,transparent 32%,rgba(255,255,255,.8) 50%,transparent 68%);animation:shine 3.6s ease-in-out infinite}
.s1 .ct{position:absolute;left:15px;right:15px;bottom:14px;color:#fff}
.s1 .tg{font-size:11px;color:#f3d9a8;margin-bottom:4px;animation:up .6s .1s both}
.s1 .hd{font-size:24px;font-weight:900;line-height:1.1;text-shadow:0 2px 14px rgba(0,0,0,.6);animation:up .65s .25s both}
.s1 .sc-chip{background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.3)}
/* 2 네온 */
.s2 .bg{position:absolute;inset:0;background:#14100c}
.s2 .sp{position:absolute;inset:0;background:radial-gradient(46% 56% at 32% 32%,rgba(232,184,122,.6),transparent 70%);animation:spot 6s ease-in-out infinite alternate}
.s2 .sc-lab{color:#e8b87a;border:1px solid rgba(232,184,122,.6)}
.s2 .ct{position:absolute;left:16px;right:16px;bottom:15px;color:#fff}
.s2 .tg{font-size:11px;color:#e8b87a;margin-bottom:4px}
.s2 .hd{font-size:24px;font-weight:900;line-height:1.1;animation:glow 2.6s ease-in-out infinite}
.s2 .cta{display:inline-block;margin-top:10px;font-size:11px;font-weight:700;color:#14100c;background:#e8b87a;padding:6px 13px;border-radius:99px;animation:bounce 1.6s ease-in-out infinite}
/* 3 시네마틱 */
.s3 .bg{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 35%,#6b4e34,#241608);animation:pan 12s ease-in-out infinite alternate}
.s3 .vig{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 40%,transparent 48%,rgba(0,0,0,.8));z-index:2}
.s3 .gr{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.9),transparent 55%);z-index:2}
.s3 .bar{position:absolute;left:0;right:0;height:26px;background:#000;z-index:3}
.s3 .bar.t{top:0;animation:barT 1s ease-out both}.s3 .bar.b{bottom:0;animation:barB 1s ease-out both}
.s3 .sc-lab{background:#e8b87a;color:#2b2018}
.s3 .lab2{position:absolute;top:36px;left:14px;z-index:4;font-size:8.5px;letter-spacing:3px;color:#fff;opacity:.75}
.s3 .ct{position:absolute;left:16px;right:16px;bottom:36px;z-index:4;color:#fff}
.s3 .tg{font-size:10px;letter-spacing:1px;color:#d9c4a0;margin-bottom:5px}
.s3 .hd{font-size:22px;font-weight:900;line-height:1.15}
.s3 .hd .w{display:inline-block;animation:word .5s both}
.s3 .hd .w:nth-child(1){animation-delay:1.1s}.s3 .hd .w:nth-child(2){animation-delay:1.25s}.s3 .hd .w:nth-child(3){animation-delay:1.4s}
.s3 .sc-chip{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.3)}
/* 4 미니멀 화이트 */
.s4 .bg{position:absolute;inset:0;background:linear-gradient(160deg,#fbf7f0,#efe6d6)}
.s4 .ph{position:absolute;right:-8px;bottom:-12px;font-size:130px;opacity:.13}
.s4 .sc-lab{background:#2b2018;color:#f4ece0}
.s4 .ct{position:absolute;left:16px;right:16px;bottom:16px;color:#2b2018}
.s4 .tg{font-size:10px;letter-spacing:2px;color:#9c6b3f;margin-bottom:6px;text-transform:uppercase;animation:up .6s .1s both}
.s4 .hd{font-family:Georgia,serif;font-size:24px;font-weight:700;line-height:1.12;color:#2b2018;animation:up .65s .25s both}
.s4 .ln{height:1px;width:44px;background:#c0a070;margin-top:10px}
/* 5 볼드 팝 */
.s5 .bg{position:absolute;inset:0;background:linear-gradient(135deg,#f0a04b,#e2632a 60%,#c0392b)}
.s5 .ph{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);font-size:104px;animation:pop .7s .2s both;filter:drop-shadow(0 6px 14px rgba(0,0,0,.3))}
.s5 .gr{position:absolute;inset:0;background:linear-gradient(to top,rgba(120,30,10,.8),transparent 55%)}
.s5 .sc-lab{background:#fff;color:#c0392b}
.s5 .ct{position:absolute;left:15px;right:15px;bottom:15px;color:#fff}
.s5 .tg{font-size:11px;font-weight:700;color:#ffe2cc;margin-bottom:3px}
.s5 .hd{font-size:25px;font-weight:900;line-height:1.05;text-shadow:0 2px 10px rgba(0,0,0,.35);animation:up .6s .2s both}
.s5 .sc-chip{background:rgba(255,255,255,.28);color:#fff;border:1px solid rgba(255,255,255,.5)}
`;

const Card = ({ n, title, sub, children }: { n: string; title: string; sub: string; children: React.ReactNode }) => (
  <div>
    <div className="mb-2"><span className="text-[#2b2018] font-bold">{n}. {title}</span> <span className="text-[12px] text-[#8a7458]">· {sub}</span></div>
    <div className="rounded-2xl overflow-hidden shadow-lg bg-[#fdfaf4]">{children}</div>
  </div>
);

export default function ShowcaseStyles() {
  return (
    <main className="min-h-screen bg-[#e7ded0]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="max-w-md mx-auto px-5 py-8">
        <BackLink to="/" label="홈" className="text-[#9c6b3f] mb-3" />
        <h1 className="text-2xl font-bold text-[#2b2018] mb-1">쇼케이스 스타일 5종</h1>
        <p className="text-[13px] text-[#6b5a48] mb-6">강동구 카페로 만든 샘플. 새로고침하면 애니메이션이 처음부터 재생됩니다.</p>
        <div className="space-y-7">

          <Card n="①" title="프리미엄 매거진" sub="애크로매틱 커피 · 줌·샤인">
            <div className="sc-b s1"><div className="bg" /><div className="sc-scene">☕</div><div className="gr" />
              <span className="sc-lab">🎀 사장님 쇼케이스<i /></span>
              <div className="ct"><div className="tg">강동에서 직접 볶는 싱글 오리진</div><div className="hd">오늘 볶은 원두,<br />정직한 한 잔</div>
                <div className="sc-row"><span className="sc-chip">직접 로스팅</span><span className="sc-chip">싱글오리진</span></div></div></div>
            <div className="p-3"><div className="font-bold text-[15px]">애크로매틱 커피</div><div className="text-[11px] text-[#9c6b3f]">강동구 · 로스터리</div></div>
          </Card>

          <Card n="②" title="네온 스포트라이트" sub="스윗솔트 · 글로우·CTA">
            <div className="sc-b s2"><div className="bg" /><div className="sp" /><div className="sc-scene" style={{ opacity: .5 }}>🍰</div>
              <span className="sc-lab">🎀 사장님 쇼케이스</span>
              <div className="ct"><div className="tg">디저트와 커피의 완벽한 페어링</div><div className="hd">달콤함이<br />머무는 시간</div>
                <div className="cta">지금 가보기 →</div></div></div>
            <div className="p-3"><div className="font-bold text-[15px]">스윗솔트</div><div className="text-[11px] text-[#9c6b3f]">강동구 · 디저트 카페</div></div>
          </Card>

          <Card n="③" title="시네마틱 필름" sub="메모러블모먼트 · 레터박스·단어 등장">
            <div className="sc-b s3"><div className="bg" /><div className="sc-scene">🎞️</div><div className="vig" /><div className="gr" />
              <div className="bar t" /><div className="bar b" />
              <span className="sc-lab">🎀 사장님 쇼케이스</span><div className="lab2">DONGNE · MOMENT</div>
              <div className="ct"><div className="tg">기억에 남는 공간</div><div className="hd"><span className="w">오늘</span> <span className="w">이곳에서</span> <span className="w">한 잔</span></div>
                <div className="sc-row"><span className="sc-chip">분위기</span><span className="sc-chip">데이트</span></div></div></div>
            <div className="p-3"><div className="font-bold text-[15px]">메모러블모먼트</div><div className="text-[11px] text-[#9c6b3f]">강동구 · 무드 카페</div></div>
          </Card>

          <Card n="④" title="미니멀 화이트" sub="더 화이트 라운지 · 밝고 여백">
            <div className="sc-b s4"><div className="bg" /><div className="ph">🤍</div>
              <span className="sc-lab">🎀 사장님 쇼케이스</span>
              <div className="ct"><div className="tg">A quiet white lounge</div><div className="hd">여백이 있는<br />조용한 라운지</div><div className="ln" /></div></div>
            <div className="p-3"><div className="font-bold text-[15px]">더 화이트 라운지</div><div className="text-[11px] text-[#9c6b3f]">강동구 · 작업·조용</div></div>
          </Card>

          <Card n="⑤" title="볼드 팝" sub="블랑제리11-17 · 밝고 경쾌">
            <div className="sc-b s5"><div className="bg" /><div className="ph">🥐</div><div className="gr" />
              <span className="sc-lab">🎀 사장님 쇼케이스</span>
              <div className="ct"><div className="tg">매일 아침 갓 구운 빵</div><div className="hd">향이 번지는<br />아침의 베이커리</div>
                <div className="sc-row"><span className="sc-chip">갓구운빵</span><span className="sc-chip">아침</span></div></div></div>
            <div className="p-3"><div className="font-bold text-[15px]">블랑제리11-17</div><div className="text-[11px] text-[#9c6b3f]">강동구 · 베이커리 카페</div></div>
          </Card>

        </div>
        <p className="text-[12px] text-[#8a7458] mt-8 text-center">마음에 드는 번호를 알려주시면 사장님 등록에 ‘템플릿 선택’으로 붙여드려요.</p>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
