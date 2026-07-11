"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import BackLink from "../../BackLink";

// 지역소개 포스터 — 구/동 단위로 검증등급 상위 카페 3~5곳(이름+한줄 하이라이트)을 소개하는 인스타 포스터(1080×1080).
// 특정 카페 단독홍보가 아니라 "지역 전체 큐레이션" 톤을 유지한다 — "이 동네엔 이런 검증된 곳들이 있다".
// 카페 수·리뷰 수 같은 숫자 통계는 하단 작은 배지로 축소. 카페명·하이라이트는 전부 DB 실측(cafes) 기반 — 지어내지 않는다.

const CREAM = "#F7F1E6";
const ESPRESSO = "#2B2018";
const BROWN = "#6B4A2E";
const GOLD = "#C98A3F";
const BROWN_SOFT = "#9C6B3F";
const SUBTEXT = "#6B5A48";
const MUTED = "#8A7A68";
const FONT = '"Gowun Batang", AppleMyungjo, "Noto Serif KR", serif';
const SIZE = 1080;

type Ctx = CanvasRenderingContext2D;
type TopCafe = { name: string; highlight: string | null };
type AreaStats = {
  area: string;
  cafeCount: number;
  verifiedCount: number;
  verifiedReviews: number;
  topCafes: TopCafe[];
};
type AreaHit = { area: string; n: number };

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

function ellipsize(ctx: Ctx, text: string, maxWidth: number, font: string): string {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

// 카페 하나의 소개 행 — 번호·이름·(있으면) 후기 기반 한줄 하이라이트. rowH에 비례해 배치하므로 3~5곳 모두 자연스럽다.
function drawCafeRow(ctx: Ctx, cx: number, rowTop: number, rowH: number, index: number, cafe: TopCafe) {
  const ord = `0${index + 1}`;
  txt(ctx, ord, cx, rowTop + rowH * 0.22, `700 22px ${FONT}`, GOLD, 5);

  const nameSize = rowH >= 150 ? 50 : rowH >= 115 ? 44 : 38;
  const nameFont = fitFont(ctx, cafe.name, 820, nameSize);
  const nameY = cafe.highlight ? rowTop + rowH * 0.52 : rowTop + rowH * 0.58;
  txt(ctx, cafe.name, cx, nameY, nameFont, ESPRESSO);

  if (cafe.highlight) {
    const hlSize = rowH >= 150 ? 27 : rowH >= 115 ? 25 : 23;
    const hlFont = `400 ${hlSize}px ${FONT}`;
    txt(ctx, ellipsize(ctx, cafe.highlight, 820, hlFont), cx, rowTop + rowH * 0.8, hlFont, SUBTEXT);
  }
}

function drawRowRule(ctx: Ctx, cx: number, y: number) {
  ctx.strokeStyle = "rgba(201,138,63,0.22)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 150, y);
  ctx.lineTo(cx + 150, y);
  ctx.stroke();
}

// 숫자 통계는 더 이상 주인공이 아니라 하단의 작은 보조 배지 하나로 축소.
function drawStatBadge(ctx: Ctx, cx: number, cy: number, stats: AreaStats) {
  const font = `400 24px ${FONT}`;
  ctx.font = font;
  const label = `카페 ${stats.cafeCount}곳 · 검증등급 ${stats.verifiedCount}곳 · 검증 후기 ${stats.verifiedReviews}건`;
  const tw = ctx.measureText(label).width;
  const padX = 26;
  const h = 46;
  const w = tw + padX * 2;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2);
  else ctx.rect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(201,138,63,0.45)";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = SUBTEXT;
  ctx.font = font;
  ctx.fillText(label, cx, cy + 1);
  ctx.textBaseline = "alphabetic";
}

function drawAreaPoster(ctx: Ctx, stats: AreaStats) {
  const W = SIZE, H = SIZE, cx = W / 2;
  drawFrame(ctx, W, H);

  txt(ctx, "지역 큐레이션", cx, H * 0.095, `700 26px ${FONT}`, BROWN_SOFT, 8);

  const nameFont = fitFont(ctx, stats.area, 900, 90);
  txt(ctx, stats.area, cx, H * 0.19, nameFont, ESPRESSO);
  txt(ctx, "이 동네, 검증된 카페들", cx, H * 0.245, `400 32px ${FONT}`, SUBTEXT);

  drawDivider(ctx, cx, H * 0.29);

  const cafes = stats.topCafes.slice(0, 5);
  const listTop = H * 0.335;
  const listBottom = H * 0.775;
  const rowH = (listBottom - listTop) / Math.max(1, cafes.length);
  cafes.forEach((cafe, i) => {
    const rowTop = listTop + rowH * i;
    drawCafeRow(ctx, cx, rowTop, rowH, i, cafe);
    if (i < cafes.length - 1) drawRowRule(ctx, cx, rowTop + rowH);
  });

  drawStatBadge(ctx, cx, H * 0.815, stats);

  txt(ctx, "특정 카페 홍보 아님 · 검증 데이터 기반 지역 큐레이션", cx, H * 0.865, `400 22px ${FONT}`, MUTED);
  drawDivider(ctx, cx, H * 0.9);
  txt(ctx, "dongnecoffeenote.com", cx, H * 0.945, `700 42px ${FONT}`, ESPRESSO);
  txt(ctx, "동네 커피 노트", cx, H * 0.98, `400 24px ${FONT}`, BROWN);
}

export default function AreaPosterPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [areas, setAreas] = useState<AreaHit[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [stats, setStats] = useState<AreaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  const fetchStats = useCallback(async (area: string) => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/poster-area?area=${encodeURIComponent(area)}`);
      const j = await r.json();
      if (j.ok && j.stats) setStats(j.stats);
      else setErr(j.error || "지역 정보를 불러오지 못했어요");
    } catch {
      setErr("일시적 오류 — 잠시 후 다시 시도해 주세요");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/poster-area");
        const j = await r.json();
        if (j.ok) {
          const list: AreaHit[] = j.areas ?? [];
          setAreas(list);
          if (list.length) {
            setSelectedArea(list[0].area);
            await fetchStats(list[0].area);
            return;
          }
          setErr("소개할 만한 지역 데이터가 아직 없어요");
        } else setErr(j.error || "지역 목록을 불러오지 못했어요");
      } catch {
        setErr("일시적 오류 — 잠시 후 다시 시도해 주세요");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) {
      Promise.all([fonts.load('700 100px "Gowun Batang"'), fonts.load('400 32px "Gowun Batang"')])
        .then(() => fonts.ready)
        .then(() => setFontsReady(true))
        .catch(() => setFontsReady(true));
    } else setFontsReady(true);
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stats) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawAreaPoster(ctx, stats);
  }, [stats]);

  useEffect(() => {
    render();
  }, [render, fontsReady]);

  const onSelect = (area: string) => {
    setSelectedArea(area);
    fetchStats(area);
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || !stats) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dongnecoffeenote-area-${stats.area}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const filteredAreas = filter.trim()
    ? areas.filter((a) => a.area.includes(filter.trim()))
    : areas;

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
        <div className="text-[#9c6b3f] text-xs tracking-[0.3em] uppercase mb-2">Area Spotlight</div>
        <h1 className="text-3xl font-bold mb-1">지역소개 포스터</h1>
        <p className="text-[13px] text-[#8a7458] mb-6 leading-relaxed">
          구/동 단위로 검증등급 상위 카페 3~5곳을 이름·한줄 하이라이트로 소개하는 지역 큐레이션 포스터예요. 특정
          카페 단독홍보가 아닌 &ldquo;이 동네엔 이런 검증된 곳들이 있다&rdquo; 톤을 유지해요. 하이라이트는 실제
          검증 후기에서 뽑은 특징이고, 숫자 통계는 하단 작은 배지로만 표기해요.
        </p>

        {/* 지역 선택 */}
        <section className="bg-white/60 border border-[#e6dcc8] rounded-xl p-4 mb-5">
          <div className="text-[13px] font-bold mb-2">1. 지역 선택</div>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="지역명으로 좁혀보기 (예: 마포)"
              className="flex-1 min-w-0 border border-[#d8c6ac] rounded-lg px-3 py-2 text-[14px] bg-white"
            />
          </div>
          <select
            value={selectedArea ?? ""}
            onChange={(e) => onSelect(e.target.value)}
            disabled={!filteredAreas.length}
            className="w-full border border-[#d8c6ac] rounded-lg px-3 py-2 text-[14px] bg-white mb-2 disabled:opacity-50"
          >
            {filteredAreas.length === 0 && <option value="">일치하는 지역 없음</option>}
            {filteredAreas.map((a) => (
              <option key={a.area} value={a.area}>
                {a.area} ({a.n}곳)
              </option>
            ))}
          </select>
          {loading && <div className="text-[12.5px] text-[#8a7458]">불러오는 중…</div>}
          {err && <div className="text-[12.5px] text-[#b5482f]">{err}</div>}
          {stats && !loading && (
            <div className="text-[13px] text-[#5a4632]">
              선택됨: <b>{stats.area}</b> · 카페 {stats.cafeCount}곳 · 검증 후기 {stats.verifiedReviews}건
            </div>
          )}
        </section>

        {/* 미리보기 */}
        <section className="mb-5">
          <div className="text-[13px] font-bold mb-2">2. 미리보기 · 다운로드</div>
          <div className="rounded-xl overflow-hidden shadow-lg border border-[#e0d3bd] bg-[#F7F1E6] max-w-[440px] mx-auto">
            <canvas
              ref={canvasRef}
              width={SIZE}
              height={SIZE}
              aria-label="지역소개 포스터 미리보기"
              className="block w-full h-auto"
            />
          </div>
          <button
            onClick={download}
            disabled={!stats}
            className="mt-4 w-full max-w-[440px] mx-auto block bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 font-bold active:scale-[0.99] transition disabled:opacity-40"
          >
            ⬇ PNG 저장
          </button>
        </section>

        <p className="text-[11px] text-[#a8927a] leading-relaxed">
          ※ 카페명·하이라이트·카페 수·검증 후기 수는 전부 검증(옥석) 데이터베이스 실측값이에요. 지어낸 카페명·후기는
          쓰지 않아요. 공개 카페가 5곳 이상인 지역만 목록에 나타나요.
        </p>
      </div>
    </main>
  );
}
