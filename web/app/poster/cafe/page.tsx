"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import BackLink from "../../BackLink";

// 카페소개 포스터 — 특정 검증등급 카페 1곳을 소개하는 인스타 포스터(1080×1080).
// 이틀에 1회 게시 주기에 맞춰 검증등급 카페를 순환 추천하되, 대표님이 검색으로 직접 골라 바꿀 수 있다.
// 카페명·태그라인(synth_identity)·하이라이트·후기 발췌는 전부 DB 실측(synth_reviews 등) 기반 — 지어내지 않는다.
// 사진은 자동 수집하지 않는다 — 대표님이 직접촬영본/무료라이선스 사진을 업로드했을 때만 '포토형'에 쓰인다.
// 반복 노출 시 협찬 오인을 막기 위해 두 템플릿 모두 "제휴·협찬 아님" 문구를 항상 표기한다.

const CREAM = "#F7F1E6";
const ESPRESSO = "#2B2018";
const BROWN = "#6B4A2E";
const CARAMEL = "#A9682F";
const GOLD = "#C98A3F";
const GOLD_TEXT = "#E8B87A";
const BROWN_SOFT = "#9C6B3F";
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

function txt(ctx: Ctx, str: string, x: number, y: number, font: string, color: string, ls = 0) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.font = font;
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${ls}px`;
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
  cx: number,
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
  lines.forEach((line, i) => txt(ctx, line, cx, startY + i * lineHeight, font, color));
  return lines.length;
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

function drawFrame(ctx: Ctx, W: number, H: number) {
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
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
  ctx.strokeStyle = "rgba(201,138,63,0.55)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = CREAM;
  ctx.fill();
}

function drawGradePill(ctx: Ctx, cx: number, cy: number, label: string) {
  const font = `700 26px ${FONT}`;
  ctx.font = font;
  const label2 = `✓ ${label} 등급`;
  const tw = ctx.measureText(label2).width;
  const padX = 26;
  const h = 50;
  const w = tw + padX * 2;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2);
  else ctx.rect(x, y, w, h);
  ctx.fillStyle = ESPRESSO;
  ctx.fill();
  txt(ctx, label2, cx, cy + 9, font, GOLD_TEXT);
}

function drawChipsRow(ctx: Ctx, cx: number, cy: number, chips: { emoji: string; label: string }[]) {
  if (!chips.length) return;
  const font = `400 26px ${FONT}`;
  ctx.font = font;
  const padX = 20;
  const gap = 14;
  const h = 44;
  const labels = chips.map((c) => `${c.emoji} ${c.label}`);
  const widths = labels.map((l) => ctx.measureText(l).width + padX * 2);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
  let x = cx - total / 2;
  for (let i = 0; i < chips.length; i++) {
    const w = widths[i];
    const y = cy - h / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2);
    else ctx.rect(x, y, w, h);
    ctx.fillStyle = "rgba(201,138,63,0.14)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(201,138,63,0.55)";
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = font;
    ctx.fillStyle = ESPRESSO;
    ctx.fillText(labels[i], x + w / 2, cy + 1);
    ctx.textBaseline = "alphabetic";
    x += w + gap;
  }
}

function drawQuoteCard(ctx: Ctx, cx: number, top: number, w: number, h: number, quote: string) {
  const x = cx - w / 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, top, w, h, 20);
  else ctx.rect(x, top, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(201,138,63,0.35)";
  ctx.stroke();
  txt(ctx, "“ 검증 후기 중", cx, top + 42, `700 24px ${FONT}`, BROWN_SOFT, 2);
  drawWrappedFixed(ctx, quote, cx, top + 86, w - 70, `400 32px ${FONT}`, ESPRESSO, 40, 3);
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

// ── 카드형(2안) — 사진 없이 텍스트·지도핀 모티프 중심 ──
function drawCardTemplate(ctx: Ctx, cafe: CafeDetail) {
  const W = SIZE, H = SIZE, cx = W / 2;
  drawFrame(ctx, W, H);

  txt(ctx, "오늘의 카페 소개", cx, H * 0.085, `700 26px ${FONT}`, BROWN_SOFT, 6);
  drawGradePill(ctx, cx, H * 0.145, cafe.synthGrade || "검증");

  const nameFont = fitFont(ctx, cafe.name, 900, 60);
  txt(ctx, cafe.name, cx, H * 0.235, nameFont, ESPRESSO);
  const areaLine = [cafe.area, `검증 후기 ${cafe.reviewCount}건`].filter(Boolean).join(" · ");
  txt(ctx, areaLine, cx, H * 0.285, `400 30px ${FONT}`, SUBTEXT);

  drawDivider(ctx, cx, H * 0.325);

  const tagline = taglineOf(cafe.identity);
  if (tagline) drawWrappedFixed(ctx, tagline, cx, H * 0.385, 880, `400 34px ${FONT}`, ESPRESSO, 44, 2);

  if (cafe.highlights.length) drawChipsRow(ctx, cx, H * 0.5, cafe.highlights);

  if (cafe.quote) drawQuoteCard(ctx, cx, H * 0.555, 880, 200, cafe.quote);

  txt(ctx, "제휴·협찬 아님 · 검증 후기 기반 객관적 소개", cx, H * 0.8, `400 24px ${FONT}`, MUTED);
  drawDivider(ctx, cx, H * 0.838);
  txt(ctx, "dongnecoffeenote.com", cx, H * 0.888, `700 40px ${FONT}`, ESPRESSO);
  txt(ctx, "@dongnecoffeenote", cx, H * 0.93, `400 26px ${FONT}`, BROWN);
}

// ── 포토형(3안) — 상단 사진 히어로 + 하단 정보 패널. 사진은 대표님이 직접 업로드했을 때만 사용 ──
function drawPhotoTemplate(ctx: Ctx, cafe: CafeDetail, photo: HTMLImageElement | null) {
  const W = SIZE, H = SIZE, cx = W / 2;
  const m = 42;
  drawFrame(ctx, W, H);

  const heroTop = m + 12;
  const heroH = H * 0.52;
  if (photo) {
    drawCoverImage(ctx, photo, m + 12, heroTop, W - (m + 12) * 2, heroH);
    const grad = ctx.createLinearGradient(0, heroTop + heroH - 140, 0, heroTop + heroH);
    grad.addColorStop(0, "rgba(43,32,24,0)");
    grad.addColorStop(1, "rgba(43,32,24,0.55)");
    ctx.fillStyle = grad;
    ctx.fillRect(m + 12, heroTop + heroH - 140, W - (m + 12) * 2, 140);
  } else {
    const grad = ctx.createLinearGradient(0, heroTop, 0, heroTop + heroH);
    grad.addColorStop(0, "#4A3320");
    grad.addColorStop(1, ESPRESSO);
    ctx.fillStyle = grad;
    ctx.fillRect(m + 12, heroTop, W - (m + 12) * 2, heroH);
    drawPin(ctx, cx, heroTop + heroH * 0.42, 78);
    txt(ctx, "사진 없이 소개 중", cx, heroTop + heroH * 0.86, `400 26px ${FONT}`, "rgba(247,241,230,0.75)");
  }
  drawGradePill(ctx, cx, heroTop + 46, cafe.synthGrade || "검증");

  let y = heroTop + heroH + 62;
  const nameFont = fitFont(ctx, cafe.name, 900, 52);
  txt(ctx, cafe.name, cx, y, nameFont, ESPRESSO);
  y += 42;
  const areaLine = [cafe.area, `검증 후기 ${cafe.reviewCount}건`].filter(Boolean).join(" · ");
  txt(ctx, areaLine, cx, y, `400 27px ${FONT}`, SUBTEXT);
  y += 46;

  const tagline = taglineOf(cafe.identity);
  if (tagline) {
    const lines = drawWrappedFixed(ctx, tagline, cx, y, 880, `400 29px ${FONT}`, ESPRESSO, 38, 1);
    y += lines * 38 + 14;
  }
  if (cafe.quote) {
    drawQuoteCard(ctx, cx, y, 880, 150, cafe.quote);
    y += 150 + 30;
  }

  txt(ctx, "제휴·협찬 아님 · 검증 후기 기반 객관적 소개", cx, H * 0.93, `400 22px ${FONT}`, MUTED);
  txt(ctx, "dongnecoffeenote.com", cx, H * 0.965, `700 30px ${FONT}`, ESPRESSO);
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
        <div className="text-[#9c6b3f] text-xs tracking-[0.3em] uppercase mb-2">Cafe Spotlight</div>
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
