"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import BackLink from "../../BackLink";

// 홍보카피 포스터 — "야간 에디토리얼 포스터" 컨셉. 다른 3종(캐러셀·카페·지역)이 전부 크림 배경+더블프레임인 것과
// 달리 이 타입만 다크(에스프레소) 배경에 골드 코너브래킷 프레임·좌측정렬 타이포로 차별화한다.
// 카피는 확정 4종에 스토리텔링/후킹 질문/통계 인용형을 더해 6종으로 다양화 — 문장 뼈대 자체가 서로 다르다.
// "[지역명]" 자리는 대표님이 자유 입력(텍스트, DB 지역 목록 제한 없음)으로 치환해 실시간 반영한다.
// 특정 카페명은 어떤 프리셋에도 등장하지 않는다 — 지역정보(구/동 단위)만 허용. DB 조회 없는 순수 UI/카피 렌더링.

const INK = "#F7F1E6";
const NIGHT_TOP = "#2E2116";
const NIGHT_BOTTOM = "#1B140D";
const GOLD = "#C98A3F";
const GOLD_SOFT = "#E8B87A";
const SUB_INK = "rgba(247,241,230,0.72)";
const FAINT_INK = "rgba(247,241,230,0.55)";
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
  {
    key: "story",
    label: "스토리텔링",
    eyebrow: "후기 15개 읽고 갔는데, 사장님이 쓴 거였다면",
    headline: ["[지역명] 카페, 이제", "가짜 후기에 속지 마세요"],
    sub: ["한 번 속아본 사람들이", "다음엔 여기서 먼저 확인해요"],
  },
  {
    key: "hook",
    label: "후킹 질문형",
    eyebrow: "이 후기, 진짜 가본 사람이 쓴 게 맞을까?",
    headline: ["[지역명] 카페 후기,", "의심 없이 볼 수 있다면"],
    sub: ["방문이 확인된 후기만", "가려서 보여드릴게요"],
  },
  {
    key: "stat",
    label: "통계 인용형",
    eyebrow: "카페 후기 상당수는 광고·대필이라는 걸 아세요?",
    headline: ["[지역명]에서 진짜 후기만", "가려낸 카페 목록"],
    sub: ["옆가게·동명 오염 없는", "방문 검증 데이터로 확인하세요"],
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

// 다크 배경 + 상단 웜글로우 — 크림 배경 3종과 정반대 톤으로 이 타입만의 정체성을 만든다.
function drawNightBackground(ctx: Ctx, W: number, H: number) {
  const cx = W / 2;
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, NIGHT_TOP);
  bg.addColorStop(1, NIGHT_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(cx, H * 0.22, 40, cx, H * 0.22, W * 0.78);
  glow.addColorStop(0, "rgba(201,138,63,0.24)");
  glow.addColorStop(1, "rgba(201,138,63,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
}

// 더블 라운드 프레임 대신 네 모서리 골드 브래킷 — 사진 프레이밍 마크처럼 가볍게.
function drawCornerBrackets(ctx: Ctx, W: number, H: number) {
  const m = 56;
  const L = 68;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.lineCap = "square";
  const corners: [number, number, number, number][] = [
    [m, m, 1, 1],
    [W - m, m, -1, 1],
    [m, H - m, 1, -1],
    [W - m, H - m, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y + L * dy);
    ctx.lineTo(x, y);
    ctx.lineTo(x + L * dx, y);
    ctx.stroke();
  }
}

// 헤드라인 뒤편의 커다란 희미한 인용부호 — 에디토리얼 포스터 무드.
function drawQuoteMark(ctx: Ctx, x: number, y: number, size: number) {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(201,138,63,0.16)";
  ctx.font = `700 ${size}px Georgia, ${FONT}`;
  ctx.fillText("“", x, y);
  ctx.restore();
}

// 좌측정렬 골드 룰 + 다이아몬드 마커 — 다른 3종의 가운데 덤벨형 디바이더와 다른 모양.
function drawRule(ctx: Ctx, x: number, y: number, w: number) {
  ctx.strokeStyle = "rgba(201,138,63,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();
}

// 우상단의 작은 단색 핀 스탬프 — 지도 큐레이션 모티프는 유지하되 단순한 실루엣으로 축소.
function drawStampPin(ctx: Ctx, cx: number, cy: number, r: number) {
  const tipY = cy + r * 2.1;
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.bezierCurveTo(cx - r * 0.55, cy + r * 1.1, cx - r, cy + r * 0.45, cx - r, cy);
  ctx.arc(cx, cy, r, Math.PI, 0, false);
  ctx.bezierCurveTo(cx + r, cy + r * 0.45, cx + r * 0.55, cy + r * 1.1, cx, tipY);
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function resolveLines(lines: string[], region: string): string[] {
  const filled = (region.trim() || DEFAULT_REGION).slice(0, 20);
  return lines.map((l) => l.split(REGION_TOKEN).join(filled));
}

function drawCopyPoster(ctx: Ctx, preset: CopyPreset, region: string) {
  const W = SIZE, H = SIZE;
  const LEFT = W * 0.12;
  const MAX_W = W - LEFT * 2;

  drawNightBackground(ctx, W, H);
  drawCornerBrackets(ctx, W, H);
  drawStampPin(ctx, W * 0.885, H * 0.115, W * 0.026);

  const headline = resolveLines(preset.headline, region);
  const sub = resolveLines(preset.sub, region);

  drawQuoteMark(ctx, LEFT - 10, H * 0.36, 170);

  txt(ctx, preset.eyebrow, LEFT, H * 0.21, `700 24px ${FONT}`, GOLD_SOFT, { align: "left", ls: 2 });

  const headlineFont = fitFontLines(ctx, headline, MAX_W, headline.length > 1 ? 64 : 74);
  const headlineTop = H * 0.365;
  const headlineGap = H * 0.095;
  headline.forEach((line, i) =>
    txt(ctx, line, LEFT, headlineTop + headlineGap * i, headlineFont, i === headline.length - 1 ? GOLD_SOFT : INK, {
      align: "left",
    }),
  );

  const ruleY = headlineTop + headlineGap * (headline.length - 1) + H * 0.075;
  drawRule(ctx, LEFT, ruleY, W * 0.2);

  const subFont = fitFontLines(ctx, sub, MAX_W, 31, "400");
  const subTop = ruleY + H * 0.07;
  const subGap = H * 0.055;
  sub.forEach((line, i) => txt(ctx, line, LEFT, subTop + subGap * i, subFont, SUB_INK, { align: "left" }));

  txt(ctx, "dongnecoffeenote.com", W / 2, H * 0.915, `700 42px ${FONT}`, GOLD_SOFT);
  txt(ctx, "@dongnecoffeenote", W / 2, H * 0.955, `400 25px ${FONT}`, FAINT_INK);
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
        <BackLink to="/poster" label="포스터" className="text-[#7a5122] mb-4" />
        <div className="text-[#7a5122] text-xs tracking-[0.3em] uppercase mb-2">Caption Studio</div>
        <h1 className="text-3xl font-bold mb-1">홍보카피 포스터</h1>
        <p className="text-[13px] text-[#665036] mb-6 leading-relaxed">
          확정된 인스타 홍보카피 {PRESETS.length}종 중 하나를 골라 &ldquo;{REGION_TOKEN}&rdquo; 자리에 원하는
          지역명을 자유롭게 입력하면 실시간 미리보기에 바로 반영돼요. 통합 추천안·공감형·취향/결·짧고임팩트에
          스토리텔링·후킹 질문·통계 인용형을 더해 문장 뼈대 자체가 서로 달라요. DB 지역 목록에 제한되지 않아 어떤
          지역명이든 입력할 수 있어요.
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
          <div className="rounded-xl overflow-hidden shadow-lg border border-[#2b2018] max-w-[440px] mx-auto">
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

        <p className="text-[11px] text-[#665036] leading-relaxed">
          ※ 다른 포스터 타입과 달리 다크 배경·골드 코너브래킷의 에디토리얼 톤으로 차별화했어요. DB 조회 없이
          브라우저에서만 렌더링되고, 어떤 프리셋에도 특정 카페명은 등장하지 않아요(지역명만 자유 입력). 지역명은 자유
          입력이라 어떤 텍스트를 넣어도 실제 존재 여부와 무관하게 렌더링됩니다 — 게시 전 직접 확인해 주세요.
        </p>
      </div>
    </main>
  );
}
