"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import BackLink from "../../BackLink";

// 지역소개 포스터 — "데이터 리포트 카드" 컨셉. 다른 3종(캐러셀·카페·카피)의 골드/센터정렬/더블프레임과 달리
// 이 타입은 슬레이트-올리브 악센트 + 좌측정렬 마스트헤드 + 도트그리드 배경 + 단선 사각프레임으로 차별화한다.
// 구/동 단위로 검증등급 상위 카페 3~5곳(이름+한줄 하이라이트)을 소개하는 인스타 포스터(1080×1080).
// 특정 카페 단독홍보가 아니라 "지역 전체 큐레이션" 톤을 유지한다 — "이 동네엔 이런 검증된 곳들이 있다".
// 카페 수·리뷰 수 같은 숫자 통계는 하단 3분할 스탯 스트립으로. 카페명·하이라이트는 전부 DB 실측(cafes) 기반 — 지어내지 않는다.

const CREAM = "#F7F1E6";
const ESPRESSO = "#2B2018";
const SLATE = "#5B6B54";
const SLATE_SOFT = "#7C8A72";
const SUBTEXT = "#6B5A48";
const MUTED = "#8A7A68";
const RULE = "rgba(91,107,84,0.35)";
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

// 도트그리드 텍스처 — 다른 3종의 비네트+원두자국 배경과 다른 "리포트/지도" 무드.
function drawDotGrid(ctx: Ctx, W: number, H: number) {
  ctx.save();
  ctx.fillStyle = "rgba(91,107,84,0.16)";
  const gap = 34;
  for (let y = gap; y < H - gap; y += gap) {
    for (let x = gap; x < W - gap; x += gap) {
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// 라운드 더블프레임 대신 단선 사각 프레임 + 좌상단 탭.
function drawFrame(ctx: Ctx, W: number, H: number) {
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  drawDotGrid(ctx, W, H);

  const m = 46;
  ctx.lineWidth = 3;
  ctx.strokeStyle = ESPRESSO;
  ctx.strokeRect(m, m, W - m * 2, H - m * 2);
}

// 좌상단 탭 — 라벨 텍스트 폭에 맞춰 배경을 그려 잘림을 방지한다.
function drawLabelTab(ctx: Ctx, m: number, label: string) {
  const font = `700 22px ${FONT}`;
  const ls = 4;
  ctx.font = font;
  const textW = ctx.measureText(label).width + ls * label.length;
  const padX = 22;
  const h = 56;
  const w = textW + padX * 2;
  ctx.fillStyle = ESPRESSO;
  ctx.fillRect(m, m, w, h);
  txt(ctx, label, m + padX, m + h * 0.64, font, CREAM, { ls });
}

// 가운데 덤벨형 대신 좌측 기준 전체폭 룰.
function drawFullRule(ctx: Ctx, x: number, y: number, w: number) {
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
}

function ellipsize(ctx: Ctx, text: string, maxWidth: number, font: string): string {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

// 카페 하나의 소개 행 — 큰 인덱스 번호(좌) + 이름·하이라이트(우), 전부 좌측정렬 리스트업 스타일.
function drawCafeRow(ctx: Ctx, left: number, right: number, rowTop: number, rowH: number, index: number, cafe: TopCafe) {
  const ord = `${index + 1}`.padStart(2, "0");
  txt(ctx, ord, left, rowTop + rowH * 0.62, `700 46px ${FONT}`, SLATE_SOFT);

  const textX = left + 84;
  const maxW = right - textX;
  const nameSize = rowH >= 150 ? 46 : rowH >= 115 ? 40 : 35;
  const nameFont = fitFont(ctx, cafe.name, maxW, nameSize);
  const nameY = cafe.highlight ? rowTop + rowH * 0.44 : rowTop + rowH * 0.56;
  txt(ctx, cafe.name, textX, nameY, nameFont, ESPRESSO);

  if (cafe.highlight) {
    const hlSize = rowH >= 150 ? 25 : rowH >= 115 ? 23 : 21;
    const hlFont = `400 ${hlSize}px ${FONT}`;
    txt(ctx, ellipsize(ctx, cafe.highlight, maxW, hlFont), textX, rowTop + rowH * 0.72, hlFont, SUBTEXT);
  }
}

// 하단 3분할 스탯 스트립 — 다른 3종의 알약형 배지와 다른 사각 그리드형.
function drawStatStrip(ctx: Ctx, left: number, right: number, top: number, h: number, stats: AreaStats) {
  const cells: [string, string][] = [
    [String(stats.cafeCount), "카페"],
    [String(stats.verifiedCount), "검증등급"],
    [String(stats.verifiedReviews), "검증 후기"],
  ];
  const w = right - left;
  const cellW = w / cells.length;

  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(left, top, w, h);
  for (let i = 1; i < cells.length; i++) {
    ctx.beginPath();
    ctx.moveTo(left + cellW * i, top);
    ctx.lineTo(left + cellW * i, top + h);
    ctx.stroke();
  }

  cells.forEach(([value, label], i) => {
    const cx = left + cellW * i + cellW / 2;
    txt(ctx, value, cx, top + h * 0.52, `700 44px ${FONT}`, ESPRESSO, { align: "center" });
    txt(ctx, label, cx, top + h * 0.82, `400 22px ${FONT}`, MUTED, { align: "center" });
  });
}

function drawAreaPoster(ctx: Ctx, stats: AreaStats) {
  const W = SIZE, H = SIZE;
  const m = 46;
  const left = m + 34;
  const right = W - m - 34;
  drawFrame(ctx, W, H);
  drawLabelTab(ctx, m, "AREA REPORT");

  const nameFont = fitFont(ctx, stats.area, right - left, 92);
  txt(ctx, stats.area, left, H * 0.225, nameFont, ESPRESSO);
  txt(ctx, "이 동네, 검증된 카페들", left, H * 0.27, `400 30px ${FONT}`, SUBTEXT);

  drawFullRule(ctx, left, H * 0.31, right - left);

  const cafes = stats.topCafes.slice(0, 5);
  const listTop = H * 0.34;
  const listBottom = H * 0.735;
  const rowH = (listBottom - listTop) / Math.max(1, cafes.length);
  cafes.forEach((cafe, i) => {
    const rowTop = listTop + rowH * i;
    drawCafeRow(ctx, left, right, rowTop, rowH, i, cafe);
    if (i < cafes.length - 1) drawFullRule(ctx, left, rowTop + rowH, right - left);
  });

  drawStatStrip(ctx, left, right, H * 0.76, 88, stats);

  txt(ctx, "특정 카페 홍보 아님 · 검증 데이터 기반 지역 큐레이션", left, H * 0.882, `400 21px ${FONT}`, MUTED);
  drawFullRule(ctx, left, H * 0.9, right - left);
  txt(ctx, "dongnecoffeenote.com", left, H * 0.935, `700 36px ${FONT}`, ESPRESSO);
  txt(ctx, "동네 커피 노트", right, H * 0.935, `400 24px ${FONT}`, SLATE, { align: "right" });
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
        <div className="text-[#5b6b54] text-xs tracking-[0.3em] uppercase mb-2">Area Report</div>
        <h1 className="text-3xl font-bold mb-1">지역소개 포스터</h1>
        <p className="text-[13px] text-[#8a7458] mb-6 leading-relaxed">
          구/동 단위로 검증등급 상위 카페 3~5곳을 이름·한줄 하이라이트로 소개하는 지역 큐레이션 포스터예요. 특정
          카페 단독홍보가 아닌 &ldquo;이 동네엔 이런 검증된 곳들이 있다&rdquo; 톤을 유지해요. 하이라이트는 실제
          검증 후기에서 뽑은 특징이고, 숫자 통계는 하단 리포트 스트립으로만 표기해요.
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

        <p className="text-[11px] text-[#8a7458] leading-relaxed">
          ※ 카페명·하이라이트·카페 수·검증 후기 수는 전부 검증(옥석) 데이터베이스 실측값이에요. 지어낸 카페명·후기는
          쓰지 않아요. 공개 카페가 5곳 이상인 지역만 목록에 나타나요.
        </p>
      </div>
    </main>
  );
}
