"use client";
import { useCallback, useEffect, useRef } from "react";
import BackLink from "../BackLink";

// 인스타 공용계정용 홍보 포스터 아트보드.
// 캔버스로 1080×1080(피드)·1080×1350(세로)을 픽셀 그대로 그려, 화면에서 바로 스크린샷하거나
// 'PNG 저장' 버튼으로 원본 해상도 그대로 내려받아 업로드할 수 있다.
// 디자인 톤은 서비스 정체성과 통일 — 크림 배경·에스프레소 브라운·골드 포인트·지도 핀 모티프·Gowun Batang.

// ── 브랜드 팔레트 ──
const CREAM = "#F7F1E6";
const CREAM_DEEP = "#E7D6BC";
const ESPRESSO = "#2B2018";
const BROWN = "#6B4A2E";
const CARAMEL = "#A9682F";
const GOLD = "#C98A3F";
const BROWN_SOFT = "#9C6B3F";
const SUBTEXT = "#6B5A48";
const FONT = '"Gowun Batang", AppleMyungjo, "Noto Serif KR", serif';

// 지도 핀(물방울) + 그 안의 커피콩 — 서비스 핵심 모티프.
function drawPin(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const tipY = cy + r * 2.35;

  // 지면 그림자(핀이 떠 있는 느낌)
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#4a3421";
  ctx.beginPath();
  ctx.ellipse(cx, tipY + r * 0.22, r * 0.62, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 핀 몸통(물방울)
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

  // 골드 얇은 테두리
  ctx.lineWidth = Math.max(2, r * 0.03);
  ctx.strokeStyle = "rgba(201,138,63,0.55)";
  ctx.stroke();

  // 안쪽 크림 원(구멍)
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.54, 0, Math.PI * 2);
  ctx.fillStyle = CREAM;
  ctx.fill();

  // 커피콩
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.32);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.3, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fillStyle = ESPRESSO;
  ctx.fill();
  // 콩 가운데 갈라진 선
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
function drawRadar(ctx: CanvasRenderingContext2D, cx: number, cy: number, base: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(201,165,116,0.28)";
  ctx.lineWidth = 2;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, base * i, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 미세한 위치 점 몇 개
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
function drawStain(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(201,165,116,0.18)";
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawPoster(canvas: HTMLCanvasElement | null, W: number, H: number) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2;

  // 배경 크림 + 중앙이 밝은 은은한 비네트
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(cx, H * 0.3, 40, cx, H * 0.34, W * 0.95);
  vg.addColorStop(0, "rgba(255,251,242,0.7)");
  vg.addColorStop(1, "rgba(206,183,150,0.16)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // 옅은 원두 자국 두 개(질감)
  drawStain(ctx, W * 0.92, H * 0.08, W * 0.14);
  drawStain(ctx, W * 0.06, H * 0.94, W * 0.11);

  // 뒤편 레이더 동심원(핀 뒤 중심)
  const pinCy = H * 0.285;
  drawRadar(ctx, cx, pinCy, W * 0.075);

  // 액자(더블 프레임) — 포스터 완성도
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

  // 상단 아이브로우(브랜드 결)
  ctx.fillStyle = BROWN_SOFT;
  ctx.font = `700 30px ${FONT}`;
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "7px";
  ctx.fillText("별점도 광고도 아닌, 진짜 후기", cx, H * 0.115);
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";

  // 지도 핀 모티프
  drawPin(ctx, cx, pinCy, W * 0.088);

  // 헤드라인(강조 1) — 2줄
  ctx.fillStyle = ESPRESSO;
  ctx.font = `700 58px ${FONT}`;
  ctx.fillText("진짜 방문한 사람만 남긴 후기,", cx, H * 0.55);

  ctx.fillStyle = CARAMEL;
  ctx.font = `700 82px ${FONT}`;
  ctx.fillText("우리 동네 카페", cx, H * 0.635);

  // 서브카피
  ctx.fillStyle = SUBTEXT;
  ctx.font = `400 34px ${FONT}`;
  ctx.fillText("서울·수도권 카페를 리뷰로 검증한 큐레이션", cx, H * 0.715);

  // 구분선(가운데 작은 골드 라인 + 점)
  const dy = H * 0.785;
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

  // 도메인 · 핸들
  ctx.fillStyle = ESPRESSO;
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText("dongnecoffeenote.com", cx, H * 0.85);

  ctx.fillStyle = BROWN;
  ctx.font = `400 28px ${FONT}`;
  ctx.fillText("@dongnecoffeenote", cx, H * 0.9);
}

type Board = { key: string; w: number; h: number; label: string; note: string };
const BOARDS: Board[] = [
  { key: "feed", w: 1080, h: 1080, label: "피드 정방형", note: "1080 × 1080" },
  { key: "story", w: 1080, h: 1350, label: "세로형(옵션)", note: "1080 × 1350" },
];

export default function PosterPage() {
  const refs = useRef<Record<string, HTMLCanvasElement | null>>({});

  const renderAll = useCallback(() => {
    for (const b of BOARDS) drawPoster(refs.current[b.key], b.w, b.h);
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

  const download = (b: Board) => {
    const canvas = refs.current[b.key];
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dongnecoffeenote-poster-${b.w}x${b.h}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-4xl mx-auto px-6 py-10">
        <BackLink to="/" label="홈" className="text-[#9c6b3f] mb-4" />
        <div className="text-[#9c6b3f] text-xs tracking-[0.3em] uppercase mb-2">Instagram Poster</div>
        <h1 className="text-3xl font-bold mb-1">인스타 홍보 포스터</h1>
        <p className="text-[13px] text-[#8a7458] mb-8 leading-relaxed">
          아래 아트보드를 그대로 스크린샷하거나 <b>PNG 저장</b> 버튼으로 원본 해상도(1080px) 그대로 내려받아 인스타에 바로 올리세요.
          <br className="hidden sm:block" />
          정방형은 피드, 세로형은 스토리·릴스 표지에 적합합니다.
        </p>

        <div className="grid gap-10 sm:grid-cols-2 items-start">
          {BOARDS.map((b) => (
            <div key={b.key} className="flex flex-col items-center">
              <div className="w-full flex items-baseline justify-between mb-3">
                <span className="text-[15px] font-bold">{b.label}</span>
                <span className="text-[12px] text-[#8a7458]">{b.note}</span>
              </div>
              <div className="rounded-xl overflow-hidden shadow-lg border border-[#e0d3bd] bg-[#F7F1E6]">
                <canvas
                  ref={(el) => {
                    refs.current[b.key] = el;
                  }}
                  width={b.w}
                  height={b.h}
                  aria-label={`${b.label} 포스터 미리보기`}
                  className="block w-full h-auto"
                />
              </div>
              <button
                onClick={() => download(b)}
                className="mt-4 w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 font-bold active:scale-[0.99] transition"
              >
                ⬇ PNG 저장 ({b.w}×{b.h})
              </button>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-[#a8927a] mt-10 leading-relaxed">
          ※ 캔버스로 서비스 브랜드 톤(크림·에스프레소·골드·지도 핀·Gowun Batang)에 맞춰 그렸습니다. 글꼴이 로딩된 뒤 자동으로 다시 렌더됩니다.
        </p>
      </div>
    </main>
  );
}
