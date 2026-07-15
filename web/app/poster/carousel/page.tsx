"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import BackLink from "../../BackLink";

// 인스타 공용계정용 홍보 캐러셀(5장) 아트보드.
// 각 장을 캔버스로 1080×1080(피드 정방형) 픽셀 그대로 그려, 화면에서 스와이프하며 한 장씩 스크린샷하거나
// 'PNG 저장'으로 원본 해상도 그대로 내려받아 업로드할 수 있다.
// 디자인 톤은 서비스 정체성과 통일 — 크림 배경·에스프레소 브라운·골드 포인트·지도 핀 모티프·Gowun Batang.
// 슬라이드 구성: 1 메인 훅 · 2 문제 제기 · 3 우리의 해법 · 4 핵심 기능 · 5 방문 유도(CTA).

// ── 브랜드 팔레트 ──
const CREAM = "#F7F1E6";
const ESPRESSO = "#2B2018";
const BROWN = "#6B4A2E";
const CARAMEL = "#A9682F";
const GOLD = "#C98A3F";
const BROWN_SOFT = "#9C6B3F";
const SUBTEXT = "#6B5A48";
const MUTED = "#8A7A68";
const RED = "#B5482F";
const FONT = '"Gowun Batang", AppleMyungjo, "Noto Serif KR", serif';

type Ctx = CanvasRenderingContext2D;

function setLS(ctx: Ctx, v: number) {
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${v}px`;
}

// 가운데 정렬 텍스트 한 줄.
function txt(
  ctx: Ctx,
  str: string,
  x: number,
  y: number,
  font: string,
  color: string,
  opts: { align?: CanvasTextAlign; ls?: number } = {},
) {
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.font = font;
  setLS(ctx, opts.ls ?? 0);
  ctx.fillText(str, x, y);
  setLS(ctx, 0);
}

// 지도 핀(물방울) + 그 안의 커피콩 — 서비스 핵심 모티프.
function drawPin(ctx: Ctx, cx: number, cy: number, r: number) {
  const tipY = cy + r * 2.35;

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#4a3421";
  ctx.beginPath();
  ctx.ellipse(cx, tipY + r * 0.22, r * 0.62, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const grad = ctx.createLinearGradient(cx, cy - r, cx, tipY);
  grad.addColorStop(0, "#4A3320");
  grad.addColorStop(1, ESPRESSO);
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.bezierCurveTo(cx - r * 0.55, cy + r * 1.1, cx - r, cy + r * 0.45, cx - r, cy);
  ctx.arc(cx, cy, r, Math.PI, 0, false);
  ctx.bezierCurveTo(cx + r, cy + r * 0.45, cx + r * 0.55, cy + r * 1.1, cx, tipY);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.lineWidth = Math.max(2, r * 0.03);
  ctx.strokeStyle = "rgba(201,138,63,0.55)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.54, 0, Math.PI * 2);
  ctx.fillStyle = CREAM;
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.32);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.3, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fillStyle = ESPRESSO;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.38);
  ctx.bezierCurveTo(r * 0.22, -r * 0.14, -r * 0.22, r * 0.14, 0, r * 0.38);
  ctx.lineWidth = Math.max(2, r * 0.045);
  ctx.strokeStyle = CREAM;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

// 배경 뒤편의 은은한 지도/레이더 동심원 — 위치 검증 큐레이션 느낌.
function drawRadar(ctx: Ctx, cx: number, cy: number, base: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(201,165,116,0.28)";
  ctx.lineWidth = 2;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, base * i, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(169,104,47,0.32)";
  const dots: [number, number][] = [
    [cx - base * 2.6, cy - base * 0.6],
    [cx + base * 2.3, cy + base * 1.1],
    [cx - base * 1.4, cy + base * 2.4],
    [cx + base * 1.1, cy - base * 2.2],
  ];
  for (const [dx, dy] of dots) {
    ctx.beginPath();
    ctx.arc(dx, dy, base * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 원두 자국(coffee ring stain) — 구석에 아주 옅게, 따뜻한 질감.
function drawStain(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(201,165,116,0.18)";
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// 가운데 골드 구분선(작은 라인 + 점) — 슬라이드 공용.
function drawDivider(ctx: Ctx, cx: number, dy: number) {
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 130, dy);
  ctx.lineTo(cx - 18, dy);
  ctx.moveTo(cx + 18, dy);
  ctx.lineTo(cx + 130, dy);
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(cx, dy, 5, 0, Math.PI * 2);
  ctx.fill();
}

// 크림 배경 + 비네트 + 원두 자국 + 더블 프레임 — 모든 슬라이드 공통 바탕.
function drawBackground(ctx: Ctx, W: number, H: number) {
  const cx = W / 2;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(cx, H * 0.3, 40, cx, H * 0.34, W * 0.95);
  vg.addColorStop(0, "rgba(255,251,242,0.7)");
  vg.addColorStop(1, "rgba(206,183,150,0.16)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  drawStain(ctx, W * 0.92, H * 0.08, W * 0.14);
  drawStain(ctx, W * 0.06, H * 0.94, W * 0.11);

  const m = 42;
  if (typeof ctx.roundRect === "function") {
    ctx.lineWidth = 4;
    ctx.strokeStyle = ESPRESSO;
    ctx.beginPath();
    ctx.roundRect(m, m, W - m * 2, H - m * 2, 34);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(201,138,63,0.6)";
    ctx.beginPath();
    ctx.roundRect(m + 12, m + 12, W - (m + 12) * 2, H - (m + 12) * 2, 26);
    ctx.stroke();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
}

// 골드 체크 배지 + 좌측정렬 텍스트 한 줄(해법 슬라이드).
function drawCheckItem(ctx: Ctx, W: number, cy: number, label: string) {
  const r = 26;
  const bx = W * 0.16;
  ctx.beginPath();
  ctx.arc(bx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(bx - r * 0.42, cy);
  ctx.lineTo(bx - r * 0.06, cy + r * 0.4);
  ctx.lineTo(bx + r * 0.5, cy - r * 0.42);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `400 38px ${FONT}`;
  ctx.fillStyle = ESPRESSO;
  ctx.fillText(label, bx + r + 28, cy);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
}

// 오염된 가짜 후기 칩(X 배지 + 취소선 텍스트) — 문제 제기 슬라이드.
function drawFakeChip(ctx: Ctx, cx: number, cy: number, w: number, h: number, label: string) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, h / 2);
  else ctx.rect(x, y, w, h);
  ctx.fillStyle = "rgba(107,74,46,0.06)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(107,74,46,0.22)";
  ctx.stroke();

  const bx = x + h * 0.55;
  const s = h * 0.17;
  ctx.strokeStyle = RED;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bx - s, cy - s);
  ctx.lineTo(bx + s, cy + s);
  ctx.moveTo(bx + s, cy - s);
  ctx.lineTo(bx - s, cy + s);
  ctx.stroke();

  const tx = x + h * 1.02;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `400 30px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(label, tx, cy);
  const tw = ctx.measureText(label).width;
  ctx.strokeStyle = "rgba(138,122,104,0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tx, cy + 1);
  ctx.lineTo(tx + tw, cy + 1);
  ctx.stroke();

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
}

// ── 기능 아이콘(골드 배지 안, 심플 라인/실루엣) ──
function iconPin(ctx: Ctx, cx: number, cy: number, s: number) {
  ctx.fillStyle = CARAMEL;
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.15, s * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.32, cy + s * 0.02);
  ctx.lineTo(cx + s * 0.32, cy + s * 0.02);
  ctx.lineTo(cx, cy + s * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.15, s * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = CREAM;
  ctx.fill();
}
function iconSearch(ctx: Ctx, cx: number, cy: number, s: number) {
  ctx.strokeStyle = CARAMEL;
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx - s * 0.12, cy - s * 0.12, s * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.2, cy + s * 0.2);
  ctx.lineTo(cx + s * 0.58, cy + s * 0.58);
  ctx.stroke();
}
function iconHeart(ctx: Ctx, cx: number, cy: number, s: number) {
  ctx.fillStyle = CARAMEL;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.5);
  ctx.bezierCurveTo(cx - s * 0.95, cy - s * 0.12, cx - s * 0.42, cy - s * 0.78, cx, cy - s * 0.22);
  ctx.bezierCurveTo(cx + s * 0.42, cy - s * 0.78, cx + s * 0.95, cy - s * 0.12, cx, cy + s * 0.5);
  ctx.closePath();
  ctx.fill();
}

// 기능 행: 골드 배지 아이콘 + 제목 + 한줄 설명(좌측정렬).
function drawFeatureRow(
  ctx: Ctx,
  W: number,
  cy: number,
  icon: (ctx: Ctx, cx: number, cy: number, s: number) => void,
  title: string,
  sub: string,
) {
  const bx = W * 0.18;
  const r = 56;
  ctx.beginPath();
  ctx.arc(bx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(201,138,63,0.12)";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(201,138,63,0.55)";
  ctx.stroke();
  icon(ctx, bx, cy, r * 0.62);

  const tx = bx + r + 40;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 42px ${FONT}`;
  ctx.fillStyle = ESPRESSO;
  ctx.fillText(title, tx, cy - 4);
  ctx.font = `400 30px ${FONT}`;
  ctx.fillStyle = SUBTEXT;
  ctx.fillText(sub, tx, cy + 38);
  ctx.textAlign = "center";
}

// ── 슬라이드 5장 ──
// 1. 메인 훅
function drawSlide1(ctx: Ctx, W: number, H: number) {
  drawBackground(ctx, W, H);
  const cx = W / 2;
  const pinCy = H * 0.285;
  drawRadar(ctx, cx, pinCy, W * 0.075);
  txt(ctx, "별점도 광고도 아닌, 진짜 후기", cx, H * 0.115, `700 30px ${FONT}`, BROWN_SOFT, { ls: 7 });
  drawPin(ctx, cx, pinCy, W * 0.088);
  txt(ctx, "진짜 방문한 사람만 남긴 후기,", cx, H * 0.55, `700 58px ${FONT}`, ESPRESSO);
  txt(ctx, "우리 동네 카페", cx, H * 0.635, `700 82px ${FONT}`, CARAMEL);
  txt(ctx, "서울·수도권 카페를 리뷰로 검증한 큐레이션", cx, H * 0.715, `400 34px ${FONT}`, SUBTEXT);
  drawDivider(ctx, cx, H * 0.785);
  txt(ctx, "dongnecoffeenote.com", cx, H * 0.85, `700 44px ${FONT}`, ESPRESSO);
  txt(ctx, "@dongnecoffeenote", cx, H * 0.9, `400 28px ${FONT}`, BROWN);
}

// 2. 문제 제기
function drawSlide2(ctx: Ctx, W: number, H: number) {
  drawBackground(ctx, W, H);
  const cx = W / 2;
  txt(ctx, "이런 후기, 믿을 수 있나요?", cx, H * 0.135, `700 30px ${FONT}`, BROWN_SOFT, { ls: 6 });
  txt(ctx, "광고·옆가게·동명에 오염된", cx, H * 0.265, `700 52px ${FONT}`, ESPRESSO);
  txt(ctx, "가짜 후기에 지쳤다면", cx, H * 0.355, `700 74px ${FONT}`, CARAMEL);

  const w = W * 0.72;
  const h = 96;
  drawFakeChip(ctx, cx, H * 0.5, w, h, "사장님이 직접 쓴 광고 후기");
  drawFakeChip(ctx, cx, H * 0.62, w, h, "옆 가게 후기가 뒤섞임");
  drawFakeChip(ctx, cx, H * 0.74, w, h, "이름만 같은 카페 후기 오염");

  txt(ctx, "— 그래서, 우리가 걸러냅니다", cx, H * 0.875, `400 32px ${FONT}`, SUBTEXT);
}

// 3. 우리의 해법
function drawSlide3(ctx: Ctx, W: number, H: number) {
  drawBackground(ctx, W, H);
  const cx = W / 2;
  txt(ctx, "우리의 해법", cx, H * 0.135, `700 30px ${FONT}`, BROWN_SOFT, { ls: 8 });
  txt(ctx, "진짜 방문 검증 후기만", cx, H * 0.27, `700 60px ${FONT}`, ESPRESSO);
  txt(ctx, "골라서 보여드립니다", cx, H * 0.365, `700 74px ${FONT}`, CARAMEL);

  drawCheckItem(ctx, W, H * 0.53, "방문이 확인된 후기만 큐레이션");
  drawCheckItem(ctx, W, H * 0.64, "광고·협찬·별점장사 걸러냄");
  drawCheckItem(ctx, W, H * 0.75, "옆가게·동명 오염 0");

  txt(ctx, "옥석을 가린 후기만 남깁니다.", cx, H * 0.875, `400 32px ${FONT}`, SUBTEXT);
}

// 4. 핵심 기능
function drawSlide4(ctx: Ctx, W: number, H: number) {
  drawBackground(ctx, W, H);
  const cx = W / 2;
  txt(ctx, "이렇게 쓰세요", cx, H * 0.135, `700 30px ${FONT}`, BROWN_SOFT, { ls: 8 });
  txt(ctx, "필요한 기능만, 깔끔하게", cx, H * 0.255, `700 60px ${FONT}`, ESPRESSO);

  drawFeatureRow(ctx, W, H * 0.45, iconPin, "지도·검색", "동네에서 검증된 카페를 지도로");
  drawFeatureRow(ctx, W, H * 0.6, iconSearch, "카페 상세", "옥석 가린 방문 후기 모아보기");
  drawFeatureRow(ctx, W, H * 0.75, iconHeart, "내 카페 추억", "무가입으로 남기는 나만의 기록");

  drawDivider(ctx, cx, H * 0.86);
  txt(ctx, "dongnecoffeenote.com", cx, H * 0.915, `700 36px ${FONT}`, ESPRESSO);
}

// 5. 방문 유도(CTA)
function drawSlide5(ctx: Ctx, W: number, H: number) {
  drawBackground(ctx, W, H);
  const cx = W / 2;
  const pinCy = H * 0.3;
  drawRadar(ctx, cx, pinCy, W * 0.07);
  txt(ctx, "지금, 우리 동네부터", cx, H * 0.115, `700 30px ${FONT}`, BROWN_SOFT, { ls: 7 });
  drawPin(ctx, cx, pinCy, W * 0.082);
  txt(ctx, "무료로 둘러보세요", cx, H * 0.615, `700 80px ${FONT}`, CARAMEL);
  txt(ctx, "가입 없이 지금 바로 시작", cx, H * 0.69, `400 34px ${FONT}`, SUBTEXT);
  drawDivider(ctx, cx, H * 0.755);
  txt(ctx, "dongnecoffeenote.com", cx, H * 0.83, `700 50px ${FONT}`, ESPRESSO);
  txt(ctx, "@dongnecoffeenote", cx, H * 0.895, `400 30px ${FONT}`, BROWN);
}

type Slide = { key: string; label: string; draw: (ctx: Ctx, W: number, H: number) => void };
const SLIDES: Slide[] = [
  { key: "hook", label: "메인 훅", draw: drawSlide1 },
  { key: "problem", label: "문제 제기", draw: drawSlide2 },
  { key: "solution", label: "우리의 해법", draw: drawSlide3 },
  { key: "features", label: "핵심 기능", draw: drawSlide4 },
  { key: "cta", label: "방문 유도", draw: drawSlide5 },
];
const SIZE = 1080;

export default function PosterCarouselPage() {
  const refs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  const renderAll = useCallback(() => {
    for (const s of SLIDES) {
      const canvas = refs.current[s.key];
      if (!canvas) continue;
      const ctx = canvas.getContext("2d");
      if (ctx) s.draw(ctx, SIZE, SIZE);
    }
  }, []);

  useEffect(() => {
    renderAll(); // 폰트 로딩 전 시스템 명조체로 즉시 1차 렌더
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) {
      Promise.all([fonts.load('700 80px "Gowun Batang"'), fonts.load('400 40px "Gowun Batang"')])
        .then(() => fonts.ready)
        .then(renderAll)
        .catch(() => {});
    }
  }, [renderAll]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setActive(Math.max(0, Math.min(SLIDES.length - 1, i)));
  };

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  const download = (s: Slide, idx: number) => {
    const canvas = refs.current[s.key];
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dongnecoffeenote-${idx + 1}-${s.key}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const downloadAll = () => {
    SLIDES.forEach((s, i) => window.setTimeout(() => download(s, i), i * 350));
  };

  return (
    <main
      className="min-h-screen bg-[#f4ece0] text-[#2b2018]"
      style={{
        fontFamily: "'Gowun Batang', serif",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* 캐러셀 가로 스크롤바 숨김 */}
      <style>{`.poster-carousel::-webkit-scrollbar{display:none}`}</style>
      <div className="max-w-4xl mx-auto px-6 py-10">
        <BackLink to="/poster" label="포스터" className="text-[#9c6b3f] mb-4" />
        <div className="text-[#9c6b3f] text-xs tracking-[0.3em] uppercase mb-2">Instagram Carousel</div>
        <h1 className="text-3xl font-bold mb-1">인스타 홍보 캐러셀 (5장)</h1>
        <p className="text-[13px] text-[#8a7458] mb-6 leading-relaxed">
          아래에서 좌우로 <b>스와이프</b>하며 한 장씩 확인하고, 그 화면을 그대로 스크린샷하거나 <b>PNG 저장</b>으로
          원본 해상도(1080×1080) 그대로 내려받아 인스타 캐러셀로 올리세요.
          <br className="hidden sm:block" />
          1 메인 훅 · 2 문제 제기 · 3 우리의 해법 · 4 핵심 기능 · 5 방문 유도 순서입니다.
        </p>

        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="poster-carousel flex overflow-x-auto snap-x snap-mandatory scroll-smooth gap-6 pb-2"
          style={{ scrollbarWidth: "none" }}
        >
          {SLIDES.map((s, i) => (
            <section key={s.key} className="snap-center shrink-0 w-full sm:w-[440px] flex flex-col">
              <div className="w-full flex items-baseline justify-between mb-3">
                <span className="text-[15px] font-bold">
                  {i + 1}. {s.label}
                </span>
                <span className="text-[12px] text-[#8a7458]">1080 × 1080</span>
              </div>
              <div className="rounded-xl overflow-hidden shadow-lg border border-[#e0d3bd] bg-[#F7F1E6]">
                <canvas
                  ref={(el) => {
                    refs.current[s.key] = el;
                  }}
                  width={SIZE}
                  height={SIZE}
                  aria-label={`${i + 1}번 ${s.label} 슬라이드 미리보기`}
                  className="block w-full h-auto"
                />
              </div>
              <button
                onClick={() => download(s, i)}
                className="mt-4 w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 font-bold active:scale-[0.99] transition"
              >
                ⬇ 이 장 PNG 저장
              </button>
            </section>
          ))}
        </div>

        {/* 진행 점(도트) — 탭하면 해당 장으로 이동 */}
        <div className="flex justify-center gap-2 mt-6">
          {SLIDES.map((s, i) => (
            <button
              key={s.key}
              onClick={() => goTo(i)}
              aria-label={`${i + 1}번 슬라이드로 이동`}
              className={`h-2.5 rounded-full transition-all ${
                i === active ? "w-6 bg-[#a9682f]" : "w-2.5 bg-[#d8c6ac]"
              }`}
            />
          ))}
        </div>

        <button
          onClick={downloadAll}
          className="mt-6 w-full sm:w-auto sm:px-8 mx-auto block border border-[#c0a883] text-[#6b4a2e] rounded-xl py-3 px-4 font-bold active:scale-[0.99] transition"
        >
          ⬇ 5장 모두 저장
        </button>

        <p className="text-[11px] text-[#8a7458] mt-10 leading-relaxed">
          ※ 캔버스로 서비스 브랜드 톤(크림·에스프레소·골드·지도 핀·Gowun Batang)에 맞춰 그렸습니다. 글꼴이 로딩된 뒤
          자동으로 다시 렌더됩니다. 모바일에서는 한 화면에 한 장씩 꽉 차게 표시되어 그대로 캡처하기 좋습니다.
        </p>
      </div>
    </main>
  );
}
