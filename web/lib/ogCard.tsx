import { ImageResponse } from "next/og";

// 공용 OG 카드(1200×630) — 공유 시 뜨는 브랜드 미리보기 이미지. Gowun Batang(한글) 로드.
export const OG_SIZE = { width: 1200, height: 630 };
const FONT_URL = "https://cdn.jsdelivr.net/npm/@fontsource/gowun-batang@5.2.5/files/gowun-batang-korean-700-normal.woff";
let fontCache: ArrayBuffer | null = null;
async function getFont(): Promise<ArrayBuffer | null> {
  if (fontCache) return fontCache;
  try { const r = await fetch(FONT_URL); if (r.ok) fontCache = await r.arrayBuffer(); } catch {}
  return fontCache;
}

export async function ogCard(opts: { kicker?: string; title: string; subtitle?: string; badge?: string; traits?: string[]; footer?: string }) {
  const font = await getFont();
  const { kicker = "☕ 동네 커피 노트", title, subtitle, badge, traits = [], footer = "진짜 후기로 검증한 우리 동네 카페 · dongnecoffeenote.com" } = opts;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "linear-gradient(135deg,#3a2a1c 0%,#241a12 60%,#1a120c 100%)", color: "#f4ece0", padding: "64px 72px", fontFamily: "Gowun" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 30, letterSpacing: 4, color: "#e8b87a" }}>{kicker}</div>
          {badge ? <div style={{ fontSize: 26, fontWeight: 700, color: "#241a12", background: "#e8b87a", padding: "8px 22px", borderRadius: 999 }}>{badge}</div> : <div />}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 78, fontWeight: 700, lineHeight: 1.15, letterSpacing: -1 }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 34, color: "#cbb89f", marginTop: 22, lineHeight: 1.4 }}>{subtitle}</div> : null}
          {traits.length > 0 && (
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              {traits.map((t) => (
                <div key={t} style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#f4ece0", background: "rgba(244,236,224,0.12)", border: "2px solid #6b5540", padding: "7px 18px", borderRadius: 999 }}>{t}</div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 4, background: "#e8b87a" }} />
          <div style={{ fontSize: 25, color: "#a8927a" }}>{footer}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: font ? [{ name: "Gowun", data: font, weight: 700 as const, style: "normal" as const }] : [] }
  );
}
