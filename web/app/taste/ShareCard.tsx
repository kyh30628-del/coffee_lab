"use client";
import { useEffect, useRef, useState } from "react";

type Top = {
  origin: string; process: string; flavors: string[];
  acidity: number; body: number; sweetness: number; cup_total: number;
} | undefined;
type Pref = { acidity: number; body: number; sweetness: number };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function ShareCard({ pref, top }: { pref: Pref; top: Top }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = 800, H = 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#f5efe6"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#92400e"; ctx.fillRect(0, 0, W, 12);

    ctx.textAlign = "left";
    ctx.fillStyle = "#a16207"; ctx.font = "600 22px sans-serif";
    ctx.fillText("BEANMARK · MY COFFEE TASTE", 64, 100);
    ctx.fillStyle = "#1c1917"; ctx.font = "bold 60px sans-serif";
    ctx.fillText("나의 커피 취향", 64, 176);

    const axes: [string, number][] = [["산미", pref.acidity], ["바디", pref.body], ["단맛", pref.sweetness]];
    let y = 270;
    axes.forEach(([label, val]) => {
      ctx.fillStyle = "#57534e"; ctx.font = "500 30px sans-serif"; ctx.textAlign = "left";
      ctx.fillText(label, 64, y);
      ctx.fillStyle = "#92400e"; ctx.textAlign = "right";
      ctx.fillText(String(Math.round(val * 100)), 736, y);
      ctx.fillStyle = "#e7e0d4"; roundRect(ctx, 64, y + 18, 672, 16, 8); ctx.fill();
      ctx.fillStyle = "#b45309"; roundRect(ctx, 64, y + 18, Math.max(16, 672 * val), 16, 8); ctx.fill();
      y += 96;
    });

    ctx.strokeStyle = "#d6cdbf"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(64, y + 8); ctx.lineTo(736, y + 8); ctx.stroke();
    y += 70;

    if (top) {
      ctx.textAlign = "left";
      ctx.fillStyle = "#a16207"; ctx.font = "600 22px sans-serif";
      ctx.fillText("나에게 맞는 원두", 64, y);
      ctx.fillStyle = "#1c1917"; ctx.font = "bold 56px sans-serif";
      ctx.fillText(top.origin, 64, y + 66);
      ctx.fillStyle = "#78716c"; ctx.font = "400 26px sans-serif";
      ctx.fillText(`${top.process} · 큐핑 ${top.cup_total}점`, 64, y + 112);
      ctx.fillStyle = "#92400e"; ctx.font = "500 26px sans-serif";
      ctx.fillText((top.flavors || []).slice(0, 4).join("   ·   "), 64, y + 164);
    }

    ctx.fillStyle = "#a8a29e"; ctx.font = "400 20px sans-serif"; ctx.textAlign = "left";
    ctx.fillText("CQI 큐핑 데이터 기반 추천 · beanmark", 64, H - 48);
  }, [open, pref, top]);

  const download = () => {
    const c = ref.current;
    if (!c) return;
    const a = document.createElement("a");
    a.download = "my-coffee-taste.png";
    a.href = c.toDataURL("image/png");
    a.click();
  };

  return (
    <div className="mb-6">
      <button onClick={() => setOpen((v) => !v)}
        className="text-xs px-3 py-1.5 rounded-full bg-white border border-amber-300 text-amber-800 hover:border-amber-500 transition-colors">
        {open ? "카드 닫기" : "취향 카드 만들기 🖼️"}
      </button>
      {open && (
        <div className="mt-4 bg-white rounded-2xl p-4 border border-stone-200/70 shadow-sm">
          <canvas ref={ref} width={800} height={1000}
            className="w-full max-w-[320px] mx-auto block rounded-lg border border-stone-200" />
          <button onClick={download}
            className="mt-4 w-full bg-amber-800 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-amber-900 transition-colors">
            이미지 저장
          </button>
          <p className="text-[11px] text-stone-400 text-center mt-2">저장한 이미지를 SNS·메신저에 공유해 보세요.</p>
        </div>
      )}
    </div>
  );
}
