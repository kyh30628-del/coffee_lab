"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import BackLink from "../../BackLink";

// 카페소개 포스터 — "매거진 인터뷰 카드" 컨셉. 다른 3종(캐러셀·지역·카피)의 골드/슬레이트 악센트·중앙정렬 알약형
// 배지와 달리 이 타입은 러스트(테라코타) 악센트 + 대각선 리본 배지 + 좌측정렬 헤드라인 + 크롭마크 프레임 +
// 인용구 뒤 대형 워터마크 따옴표로 차별화한다.
// 특정 검증등급 카페 1곳을 소개하는 인스타 포스터(1080×1080). 이틀에 1회 게시 주기에 맞춰 검증등급 카페를
// 순환 추천하되, 대표님이 검색으로 직접 골라 바꿀 수 있다.
// 카페명·태그라인(synth_identity)·하이라이트·후기 발췌는 전부 DB 실측(synth_reviews 등) 기반 — 지어내지 않는다.
// 사진은 자동 수집하지 않는다 — 대표님이 직접촬영본/무료라이선스 사진을 업로드했을 때만 '포토형'에 쓰인다.
// 반복 노출 시 협찬 오인을 막기 위해 두 템플릿 모두 "제휴·협찬 아님" 문구를 항상 표기한다.

const CREAM = "#F7F1E6";
const ESPRESSO = "#2B2018";
const RUST = "#A64B2A";
const RUST_SOFT = "#D98B62";
const SUBTEXT = "#6B5A48";
const MUTED = "#8A7A68";
const FONT = '"Gowun Batang", AppleMyungjo, "Noto Serif KR", serif';
const SIZE = 1080;

type Ctx = CanvasRenderingContext2D;
type CafeDetail = {
  id: number;
  name: string;
  area: string | null;
  synthGrade: string | null;
  identity: string | null;
  reviewCount: number;
  highlights: { label: string; emoji: string }[];
  quote: string | null;
};
type SearchHit = { id: number; name: string; area: string | null };

function txt(
  ctx: Ctx,
  str: string,
  x: number,
  y: number,
  font: string,
  color: string,
  opts: { align?: CanvasTextAlign; ls?: number } = {},
) {
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.font = font;
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${opts.ls ?? 0}px`;
  ctx.fillText(str, x, y);
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = "0px";
}

function fitFont(ctx: Ctx, text: string, maxWidth: number, baseSize: number, weight = "700"): string {
  let size = baseSize;
  let font = `${weight} ${size}px ${FONT}`;
  ctx.font = font;
  while (ctx.measureText(text).width > maxWidth && size > 30) {
    size -= 2;
    font = `${weight} ${size}px ${FONT}`;
    ctx.font = font;
  }
  return font;
}

function wrapLines(ctx: Ctx, text: string, maxWidth: number, font: string): string[] {
  ctx.font = font;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(test).width > maxWidth) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawWrappedFixed(
  ctx: Ctx,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  font: string,
  color: string,
  lineHeight: number,
  maxLines: number,
) {
  let lines = wrapLines(ctx, text, maxWidth, font);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    ctx.font = font;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  lines.forEach((line, i) => txt(ctx, line, x, startY + i * lineHeight, font, color));
  return lines.length;
}

// 크롭마크(카메라 프레이밍 표시) — 다른 3종의 연속 프레임과 달리 모서리에서 살짝 띄운 짧은 표시선.
function drawCropMarks(ctx: Ctx, W: number, H: number, m: number) {
  const L = 26, gap = 14;
  ctx.strokeStyle = RUST;
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
    ctx.moveTo(x - gap * dx, y);
    ctx.lineTo(x - gap * dx - L * dx, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - gap * dy);
    ctx.lineTo(x, y - gap * dy - L * dy);
    ctx.stroke();
  }
}

function drawFrame(ctx: Ctx, W: number, H: number) {
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const vg = ctx.createRadialGradient(cx, H * 0.28, 40, cx, H * 0.3, W * 0.9);
  vg.addColorStop(0, "rgba(255,247,238,0.6)");
  vg.addColorStop(1, "rgba(196,120,90,0.14)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const m = 40;
  ctx.lineWidth = 2;
  ctx.strokeStyle = ESPRESSO;
  ctx.strokeRect(m, m, W - m * 2, H - m * 2);
  drawCropMarks(ctx, W, H, m);
}

// 좌측 기준 짧은 러스트 룰 — 다른 3종의 가운데 덤벨형·전체폭형과 다른 형태.
function drawRule(ctx: Ctx, x: number, y: number, w: number) {
  ctx.strokeStyle = RUST;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
}

function drawPin(ctx: Ctx, cx: number, cy: number, r: number) {
  const tipY = cy + r * 2.2;
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
  ctx.strokeStyle = "rgba(166,75,42,0.55)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = CREAM;
  ctx.fill();
}

// 대각선 리본 배지 — 다른 3종의 중앙정렬 알약형 등급 배지와 다른, 코너를 가로지르는 리본 형태.
// 캔버스 원점(0,0)이 아니라 코너 안쪽의 피벗점을 기준으로 회전시켜 텍스트가 캔버스 밖으로 밀려나지 않게 한다.
function drawGradeRibbon(ctx: Ctx, label: string) {
  const text = `✓ ${label} 등급`;
  const font = `700 24px ${FONT}`;
  ctx.font = font;
  const w = Math.max(230, ctx.measureText(text).width + 60);
  const h = 48;
  const pivotX = 100, pivotY = 100;
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = RUST;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = CREAM;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 2);
  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawChipsRow(ctx: Ctx, left: number, cy: number, chips: { emoji: string; label: string }[]) {
  if (!chips.length) return;
  const font = `400 26px ${FONT}`;
  ctx.font = font;
  const padX = 20;
  const gap = 14;
  const h = 44;
  let x = left;
  for (const c of chips) {
    const label = `${c.emoji} ${c.label}`;
    const w = ctx.measureText(label).width + padX * 2;
    const y = cy - h / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2);
    else ctx.rect(x, y, w, h);
    ctx.fillStyle = "rgba(166,75,42,0.12)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(166,75,42,0.5)";
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = font;
    ctx.fillStyle = ESPRESSO;
    ctx.fillText(label, x + w / 2, cy + 1);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    x += w + gap;
  }
}

// 인용구 카드 — 뒤편에 대형 워터마크 따옴표를 깔아 매거진 풀쿼트 느낌을 낸다.
function drawQuoteCard(ctx: Ctx, x: number, top: number, w: number, h: number, quote: string) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, top, w, h, 4);
  else ctx.rect(x, top, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(166,75,42,0.4)";
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, h);
  ctx.clip();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(166,75,42,0.15)";
  ctx.font = `700 150px Georgia, ${FONT}`;
  ctx.fillText("“", x + 8, top + 110);
  ctx.restore();

  txt(ctx, "검증 후기 중", x + 32, top + 42, `700 24px ${FONT}`, RUST_SOFT, { ls: 2 });
  drawWrappedFixed(ctx, quote, x + 32, top + 86, w - 64, `400 32px ${FONT}`, ESPRESSO, 40, 3);
}

function drawCoverImage(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height;
  const r = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ir > r) {
    sh = img.height;
    sw = sh * r;
    sx = (img.width - sw) / 2;
  } else {
    sw = img.width;
    sh = sw / r;
    sy = (img.height - sh) / 2;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

const IDENTITY_SEGMENTS_SHOWN = 2;
function taglineOf(identity: string | null): string | null {
  if (!identity) return null;
  const segs = identity.split("·").map((s) => s.trim()).filter(Boolean);
  return segs.slice(0, IDENTITY_SEGMENTS_SHOWN).join(" · ") || identity;
}

// ── 카드형(2안) — 사진 없이 텍스트·좌측정렬 헤드라인 중심 ──
function drawCardTemplate(ctx: Ctx, cafe: CafeDetail) {
  const W = SIZE, H = SIZE;
  const left = 40 + 46;
  const right = W - 40 - 46;
  drawFrame(ctx, W, H);
  drawGradeRibbon(ctx, cafe.synthGrade || "검증");

  txt(ctx, "오늘의 카페 소개", left, H * 0.195, `700 24px ${FONT}`, RUST_SOFT, { ls: 4 });

  const nameFont = fitFont(ctx, cafe.name, right - left, 64);
  txt(ctx, cafe.name, left, H * 0.265, nameFont, ESPRESSO);
  const areaLine = [cafe.area, `검증 후기 ${cafe.reviewCount}건`].filter(Boolean).join(" · ");
  txt(ctx, areaLine, left, H * 0.31, `400 28px ${FONT}`, SUBTEXT);

  drawRule(ctx, left, H * 0.348, W * 0.2);

  const tagline = taglineOf(cafe.identity);
  let y = H * 0.38;
  if (tagline) {
    const lines = drawWrappedFixed(ctx, tagline, left, y, right - left, `400 34px ${FONT}`, ESPRESSO, 44, 2);
    y += lines * 44 + 20;
  }

  if (cafe.highlights.length) {
    drawChipsRow(ctx, left, y, cafe.highlights);
    y += 60;
  }

  if (cafe.quote) drawQuoteCard(ctx, left, y, right - left, 190, cafe.quote);

  txt(ctx, "제휴·협찬 아님 · 검증 후기 기반 객관적 소개", left, H * 0.86, `400 22px ${FONT}`, MUTED);
  drawRule(ctx, left, H * 0.888, right - left);
  txt(ctx, "dongnecoffeenote.com", left, H * 0.93, `700 38px ${FONT}`, ESPRESSO);
  txt(ctx, "@dongnecoffeenote", right, H * 0.93, `400 24px ${FONT}`, RUST_SOFT, { align: "right" });
}

// ── 포토형(3안) — 상단 사진 히어로 + 하단 좌측정렬 정보 패널. 사진은 대표님이 직접 업로드했을 때만 사용 ──
function drawPhotoTemplate(ctx: Ctx, cafe: CafeDetail, photo: HTMLImageElement | null) {
  const W = SIZE, H = SIZE;
  const m = 40;
  const left = m + 46;
  const right = W - m - 46;
  drawFrame(ctx, W, H);

  const heroTop = m + 14;
  const heroH = H * 0.5;
  if (photo) {
    drawCoverImage(ctx, photo, m + 14, heroTop, W - (m + 14) * 2, heroH);
    const grad = ctx.createLinearGradient(0, heroTop + heroH - 140, 0, heroTop + heroH);
    grad.addColorStop(0, "rgba(43,32,24,0)");
    grad.addColorStop(1, "rgba(43,32,24,0.55)");
    ctx.fillStyle = grad;
    ctx.fillRect(m + 14, heroTop + heroH - 140, W - (m + 14) * 2, 140);
  } else {
    const grad = ctx.createLinearGradient(0, heroTop, 0, heroTop + heroH);
    grad.addColorStop(0, "#4A3320");
    grad.addColorStop(1, ESPRESSO);
    ctx.fillStyle = grad;
    ctx.fillRect(m + 14, heroTop, W - (m + 14) * 2, heroH);
    drawPin(ctx, W / 2, heroTop + heroH * 0.42, 78);
    txt(ctx, "사진 없이 소개 중", W / 2, heroTop + heroH * 0.86, `400 26px ${FONT}`, "rgba(247,241,230,0.75)", {
      align: "center",
    });
  }
  drawGradeRibbon(ctx, cafe.synthGrade || "검증");

  let y = heroTop + heroH + 64;
  const nameFont = fitFont(ctx, cafe.name, right - left, 52);
  txt(ctx, cafe.name, left, y, nameFont, ESPRESSO);
  y += 40;
  const areaLine = [cafe.area, `검증 후기 ${cafe.reviewCount}건`].filter(Boolean).join(" · ");
  txt(ctx, areaLine, left, y, `400 26px ${FONT}`, SUBTEXT);
  y += 44;

  const tagline = taglineOf(cafe.identity);
  if (tagline) {
    const lines = drawWrappedFixed(ctx, tagline, left, y, right - left, `400 28px ${FONT}`, ESPRESSO, 36, 1);
    y += lines * 36 + 16;
  }
  if (cafe.quote) {
    drawQuoteCard(ctx, left, y, right - left, 150, cafe.quote);
    y += 150 + 28;
  }

  txt(ctx, "제휴·협찬 아님 · 검증 후기 기반 객관적 소개", left, H * 0.955, `400 21px ${FONT}`, MUTED);
  txt(ctx, "dongnecoffeenote.com", right, H * 0.955, `700 28px ${FONT}`, ESPRESSO, { align: "right" });
}

type Template = "card" | "photo";

export default function CafePosterPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cafe, setCafe] = useState<CafeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [template, setTemplate] = useState<Template>("card");
  const [photoImg, setPhotoImg] = useState<HTMLImageElement | null>(null);
  const photoUrlRef = useRef<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  const fetchDetail = useCallback(async (id: number) => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/poster-cafe?id=${id}`);
      const j = await r.json();
      if (j.ok && j.cafe) {
        setCafe(j.cafe);
        setQuery("");
        setResults([]);
      } else setErr(j.error || "카페 정보를 불러오지 못했어요");
    } catch {
      setErr("일시적 오류 — 잠시 후 다시 시도해 주세요");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecommended = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/poster-cafe?mode=rotate");
      const j = await r.json();
      if (j.ok && j.cafe) await fetchDetail(j.cafe.id);
      else {
        setErr("추천할 검증등급 카페가 없어요");
        setLoading(false);
      }
    } catch {
      setErr("일시적 오류 — 잠시 후 다시 시도해 주세요");
      setLoading(false);
    }
  }, [fetchDetail]);

  useEffect(() => {
    loadRecommended();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/poster-cafe?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (j.ok) setResults(j.cafes ?? []);
      } catch {
        // 검색 실패는 조용히 무시(다음 입력에서 재시도)
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) {
      Promise.all([fonts.load('700 60px "Gowun Batang"'), fonts.load('400 32px "Gowun Batang"')])
        .then(() => fonts.ready)
        .then(() => setFontsReady(true))
        .catch(() => setFontsReady(true));
    } else setFontsReady(true);
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cafe) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (template === "card") drawCardTemplate(ctx, cafe);
    else drawPhotoTemplate(ctx, cafe, photoImg);
  }, [cafe, template, photoImg]);

  useEffect(() => {
    render();
  }, [render, fontsReady]);

  const onPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const url = URL.createObjectURL(file);
    photoUrlRef.current = url;
    const img = new Image();
    img.onload = () => setPhotoImg(img);
    img.src = url;
  };

  const clearPhoto = () => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = null;
    setPhotoImg(null);
  };

  useEffect(() => {
    return () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    };
  }, []);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || !cafe) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dongnecoffeenote-cafe-${cafe.id}-${template}.png`;
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
        <div className="text-[#a64b2a] text-xs tracking-[0.3em] uppercase mb-2">Cafe Spotlight</div>
        <h1 className="text-3xl font-bold mb-1">카페소개 포스터</h1>
        <p className="text-[13px] text-[#8a7458] mb-6 leading-relaxed">
          검증등급 카페 1곳을 소개하는 인스타 포스터예요. 이틀에 1회 주기로 카페를 자동 추천하지만, 아래 검색으로
          직접 골라 바꿀 수 있어요. 카페명·태그라인·후기 발췌는 모두 실제 검증 데이터 기준이에요.
        </p>

        {/* 카페 선택 */}
        <section className="bg-white/60 border border-[#e6dcc8] rounded-xl p-4 mb-5">
          <div className="text-[13px] font-bold mb-2">1. 카페 선택</div>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="카페명으로 검색 (검증등급만)"
              className="flex-1 min-w-0 border border-[#d8c6ac] rounded-lg px-3 py-2 text-[14px] bg-white"
            />
            <button
              onClick={loadRecommended}
              className="shrink-0 border border-[#c0a883] text-[#6b4a2e] rounded-lg px-3 py-2 text-[13px] font-bold active:scale-[0.98] transition"
            >
              🔁 오늘의 추천
            </button>
          </div>
          {results.length > 0 && (
            <ul className="border border-[#e6dcc8] rounded-lg divide-y divide-[#eee2cc] overflow-hidden mb-2 bg-white">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => fetchDetail(r.id)}
                    className="w-full text-left px-3 py-2 text-[13.5px] hover:bg-[#f7f1e6] flex items-baseline gap-2"
                  >
                    <span className="font-bold">{r.name}</span>
                    <span className="text-[11px] text-[#9c8a6c]">{r.area}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {loading && <div className="text-[12.5px] text-[#8a7458]">불러오는 중…</div>}
          {err && <div className="text-[12.5px] text-[#b5482f]">{err}</div>}
          {cafe && !loading && (
            <div className="text-[13px] text-[#5a4632]">
              선택됨: <b>{cafe.name}</b> · {cafe.area} · 검증 후기 {cafe.reviewCount}건
            </div>
          )}
        </section>

        {/* 템플릿 선택 */}
        <section className="bg-white/60 border border-[#e6dcc8] rounded-xl p-4 mb-5">
          <div className="text-[13px] font-bold mb-2">2. 템플릿 선택</div>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setTemplate("card")}
              className={`flex-1 rounded-lg py-2 text-[13.5px] font-bold border transition ${
                template === "card" ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "border-[#d8c6ac] text-[#6b4a2e]"
              }`}
            >
              카드형(2안)
            </button>
            <button
              onClick={() => setTemplate("photo")}
              className={`flex-1 rounded-lg py-2 text-[13.5px] font-bold border transition ${
                template === "photo" ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "border-[#d8c6ac] text-[#6b4a2e]"
              }`}
            >
              포토형(3안)
            </button>
          </div>
          {template === "photo" && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="border border-[#c0a883] text-[#6b4a2e] rounded-lg px-3 py-2 text-[12.5px] font-bold cursor-pointer active:scale-[0.98] transition">
                📷 사진 업로드
                <input type="file" accept="image/*" onChange={onPhotoChange} className="hidden" />
              </label>
              {photoImg && (
                <button onClick={clearPhoto} className="text-[12.5px] text-[#b5482f] underline">
                  사진 제거
                </button>
              )}
              <span className="text-[11px] text-[#a8927a] basis-full">
                ※ 직접 촬영한 사진 또는 무료 라이선스 사진만 올려주세요. 네이버·타인 인스타 사진은 도용이라 사용
                금지예요. 사진을 올리지 않으면 지도 핀 모티프로 대체돼요.
              </span>
            </div>
          )}
        </section>

        {/* 미리보기 */}
        <section className="mb-5">
          <div className="text-[13px] font-bold mb-2">3. 미리보기 · 다운로드</div>
          <div className="rounded-xl overflow-hidden shadow-lg border border-[#e0d3bd] bg-[#F7F1E6] max-w-[440px] mx-auto">
            <canvas
              ref={canvasRef}
              width={SIZE}
              height={SIZE}
              aria-label="카페소개 포스터 미리보기"
              className="block w-full h-auto"
            />
          </div>
          <button
            onClick={download}
            disabled={!cafe}
            className="mt-4 w-full max-w-[440px] mx-auto block bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 font-bold active:scale-[0.99] transition disabled:opacity-40"
          >
            ⬇ PNG 저장
          </button>
        </section>

        <p className="text-[11px] text-[#a8927a] leading-relaxed">
          ※ 카페명·태그라인·후기 발췌는 검증(옥석) 데이터베이스 실측값이에요. 같은 카페를 반복 소개할 수 있어
          두 템플릿 모두 &ldquo;제휴·협찬 아님&rdquo; 문구를 항상 표기합니다.
        </p>
      </div>
    </main>
  );
}
