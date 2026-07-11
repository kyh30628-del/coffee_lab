"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import BackLink from "../../BackLink";

// 홍보카피 포스터 — 최근 확정된 인스타 홍보카피 4종(통합 추천안·공감형 강조·취향/결 강조·짧고임팩트)을
// 프리셋으로 제공하고, 캡션 속 "[지역명]" 자리를 대표님이 자유 입력(텍스트, DB 지역 목록 제한 없음)으로
// 치환해 실시간 미리보기에 반영한다. DB 조회 없는 순수 UI/카피 렌더링 — poster/carousel·poster/area와
// 동일한 브랜드 톤(크림/에스프레소/골드, Gowun Batang, 1080x1080, 더블프레임)을 그대로 재사용한다.

const CREAM = "#F7F1E6";
const ESPRESSO = "#2B2018";
const BROWN = "#6B4A2E";
const CARAMEL = "#A9682F";
const GOLD = "#C98A3F";
const BROWN_SOFT = "#9C6B3F";
const SUBTEXT = "#6B5A48";
const FONT = '"Gowun Batang", AppleMyungjo, "Noto Serif KR", serif';
const SIZE = 1080;
const REGION_TOKEN = "[지역명]";
const DEFAULT_REGION = "우리 동네";

type Ctx = CanvasRenderingContext2D;

type CopyPreset = {
  key: string;
  label: string;
  eyebrow: string;
  headline: string[]; // [지역명] 토큰 포함 가능
  sub: string[];
};

const PRESETS: CopyPreset[] = [
  {
    key: "integrated",
    label: "통합 추천안",
    eyebrow: "별점도 광고도 아닌, 진짜 후기",
    headline: ["[지역명], 진짜 가본 사람만", "남긴 카페 후기"],
    sub: ["광고·옆가게·동명 오염 없는", "방문 검증 후기로 고른 카페"],
  },
  {
    key: "empathy",
    label: "공감형 강조",
    eyebrow: "이런 후기, 믿어도 될까 늘 불안했다면",
    headline: ["[지역명] 카페 후기,", "이제 의심하지 마세요"],
    sub: ["진짜 방문한 사람의 후기만", "골라서 보여드려요"],
  },
  {
    key: "taste",
    label: "취향/결 강조",
    eyebrow: "숫자보다 결이 맞는 카페",
    headline: ["[지역명]에서 내 취향에", "꼭 맞는 카페 찾기"],
    sub: ["별점이 아니라", "결이 맞는 카페를 찾아보세요"],
  },
  {
    key: "short",
    label: "짧고임팩트",
    eyebrow: "가짜 후기 0",
    headline: ["[지역명], 진짜 카페만"],
    sub: ["진짜 방문 후기만 보여드립니다"],
  },
];

function setLS(ctx: Ctx, v: number) {
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${v}px`;
}

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

// 여러 줄 중 가장 넓은 줄이 maxWidth 안에 들어올 때까지 폰트 크기를 함께 줄인다(자유입력 지역명 대응).
function fitFontLines(ctx: Ctx, lines: string[], maxWidth: number, baseSize: number, weight = "700"): string {
  let size = baseSize;
  for (;;) {
    const font = `${weight} ${size}px ${FONT}`;
    ctx.font = font;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest <= maxWidth || size <= 26) return font;
    size -= 2;
  }
}

function drawStain(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(201,165,116,0.18)";
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

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

// 지도 핀(물방울) + 커피콩 — 서비스 핵심 모티프(캐러셀 슬라이드1과 동일 톤).
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

function resolveLines(lines: string[], region: string): string[] {
  const filled = (region.trim() || DEFAULT_REGION).slice(0, 20);
  return lines.map((l) => l.split(REGION_TOKEN).join(filled));
}

function drawCopyPoster(ctx: Ctx, preset: CopyPreset, region: string) {
  const W = SIZE, H = SIZE, cx = W / 2;
  drawBackground(ctx, W, H);

  const headline = resolveLines(preset.headline, region);
  const sub = resolveLines(preset.sub, region);

  const pinCy = H * 0.185;
  drawPin(ctx, cx, pinCy, W * 0.055);

  txt(ctx, preset.eyebrow, cx, H * 0.29, `700 27px ${FONT}`, BROWN_SOFT, { ls: 5 });

  const headlineFont = fitFontLines(ctx, headline, W * 0.82, headline.length > 1 ? 68 : 78);
  const headlineTop = H * 0.42;
  const headlineGap = H * 0.095;
  headline.forEach((line, i) => {
    txt(ctx, line, cx, headlineTop + headlineGap * i, headlineFont, i === headline.length - 1 ? CARAMEL : ESPRESSO);
  });

  const dividerY = headlineTop + headlineGap * (headline.length - 1) + H * 0.075;
  drawDivider(ctx, cx, dividerY);

  const subFont = fitFontLines(ctx, sub, W * 0.78, 34, "400");
  const subTop = dividerY + H * 0.075;
  const subGap = H * 0.06;
  sub.forEach((line, i) => {
    txt(ctx, line, cx, subTop + subGap * i, subFont, SUBTEXT);
  });

  drawDivider(ctx, cx, H * 0.86);
  txt(ctx, "dongnecoffeenote.com", cx, H * 0.915, `700 44px ${FONT}`, ESPRESSO);
  txt(ctx, "@dongnecoffeenote", cx, H * 0.955, `400 26px ${FONT}`, BROWN);
}

export default function PosterCopyPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [presetKey, setPresetKey] = useState(PRESETS[0].key);
  const [region, setRegion] = useState("");
  const [fontsReady, setFontsReady] = useState(false);

  const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0];

  useEffect(() => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) {
      Promise.all([fonts.load('700 80px "Gowun Batang"'), fonts.load('400 34px "Gowun Batang"')])
        .then(() => fonts.ready)
        .then(() => setFontsReady(true))
        .catch(() => setFontsReady(true));
    } else setFontsReady(true);
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCopyPoster(ctx, preset, region);
  }, [preset, region]);

  useEffect(() => {
    render();
  }, [render, fontsReady]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dongnecoffeenote-copy-${preset.key}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
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
      <div className="max-w-4xl mx-auto px-6 py-10">
        <BackLink to="/poster" label="포스터" className="text-[#9c6b3f] mb-4" />
        <div className="text-[#9c6b3f] text-xs tracking-[0.3em] uppercase mb-2">Caption Studio</div>
        <h1 className="text-3xl font-bold mb-1">홍보카피 포스터</h1>
        <p className="text-[13px] text-[#8a7458] mb-6 leading-relaxed">
          최근 확정된 인스타 홍보카피 4종 중 하나를 골라 &ldquo;{REGION_TOKEN}&rdquo; 자리에 원하는 지역명을
          자유롭게 입력하면 실시간 미리보기에 바로 반영돼요. DB 지역 목록에 제한되지 않아 어떤 지역명이든 입력할 수
          있어요.
        </p>

        <section className="bg-white/60 border border-[#e6dcc8] rounded-xl p-4 mb-5">
          <div className="text-[13px] font-bold mb-2">1. 카피 버전 선택</div>
          <select
            value={presetKey}
            onChange={(e) => setPresetKey(e.target.value)}
            className="w-full border border-[#d8c6ac] rounded-lg px-3 py-2 text-[14px] bg-white mb-4"
          >
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>

          <div className="text-[13px] font-bold mb-2">2. 지역명 입력</div>
          <input
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder={`예: 성수동, 망원동, 판교 (비워두면 "${DEFAULT_REGION}")`}
            maxLength={20}
            className="w-full border border-[#d8c6ac] rounded-lg px-3 py-2 text-[14px] bg-white"
          />
        </section>

        <section className="mb-5">
          <div className="text-[13px] font-bold mb-2">3. 미리보기 · 다운로드</div>
          <div className="rounded-xl overflow-hidden shadow-lg border border-[#e0d3bd] bg-[#F7F1E6] max-w-[440px] mx-auto">
            <canvas
              ref={canvasRef}
              width={SIZE}
              height={SIZE}
              aria-label="홍보카피 포스터 미리보기"
              className="block w-full h-auto"
            />
          </div>
          <button
            onClick={download}
            className="mt-4 w-full max-w-[440px] mx-auto block bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 font-bold active:scale-[0.99] transition"
          >
            ⬇ PNG 저장
          </button>
        </section>

        <p className="text-[11px] text-[#a8927a] leading-relaxed">
          ※ 4종 모두 서비스 브랜드 톤(크림·에스프레소·골드·Gowun Batang·더블프레임)을 그대로 따르고, DB 조회 없이
          브라우저에서만 렌더링돼요. 지역명은 자유 입력이라 어떤 텍스트를 넣어도 실제 존재 여부와 무관하게
          렌더링됩니다 — 게시 전 직접 확인해 주세요.
        </p>
      </div>
    </main>
  );
}
