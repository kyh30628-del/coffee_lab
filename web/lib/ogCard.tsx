import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import path from "path";
export const OG_SIZE = { width: 1200, height: 630 };
// 📓 2026-09-13 「한 권의 노트」 — OG도 종이 노트 한 장. 서체는 나눔손글씨 성실체(한글 전체 서브셋·힌팅 제거, data/fonts, 4.5MB — 희귀 음절 폴백이 없어 전체 포함)를
//   함수 번들에서 읽는다(next.config outputFileTracingIncludes). 파일이 없으면 이전 CDN 서체로 폴백해 OG가 깨지지 않는다.
const FONT_URL = "https://cdn.jsdelivr.net/npm/@fontsource/gowun-batang@5.2.5/files/gowun-batang-korean-700-normal.woff";
let fontCache: ArrayBuffer | null = null;
async function getFont(): Promise<ArrayBuffer | null> {
  if (fontCache) return fontCache;
  try { const b = await readFile(path.join(process.cwd(), "data", "fonts", "NanumSeongSirCe.ttf")); fontCache = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; return fontCache; } catch {}
  try { const r = await fetch(FONT_URL); if (r.ok) fontCache = await r.arrayBuffer(); } catch {}
  return fontCache;
}
const RULES = Array.from({ length: 13 }, (_, i) => 118 + i * 40);   // 줄노트: 40px 간격 13줄

export async function ogCard(opts: { kicker?: string; title: string; subtitle?: string; badge?: string; traits?: string[]; footer?: string }) {
  const font = await getFont();
  const { kicker = "☕ 동네 커피 노트", title, subtitle, badge, traits = [], footer = "진짜 후기로 검증한 우리 동네 카페 · dongnecoffeenote.com" } = opts;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", background: "#f7f0e4", color: "#17100b", fontFamily: "Hand", overflow: "hidden" }}>
        {/* 줄 + 붉은 여백선 */}
        {RULES.map((y) => <div key={y} style={{ position: "absolute", left: 0, right: 0, top: y, height: 2, background: "rgba(84,104,140,0.28)" }} />)}
        <div style={{ position: "absolute", left: 96, top: 0, bottom: 0, width: 3, background: "rgba(208,96,88,0.55)" }} />
        {/* 잔 자국 */}
        <div style={{ position: "absolute", right: -60, top: 300, width: 300, height: 300, borderRadius: 999, border: "14px solid rgba(120,74,40,0.16)" }} />
        <div style={{ position: "absolute", right: -52, top: 308, width: 284, height: 284, borderRadius: 999, border: "3px solid rgba(120,74,40,0.22)" }} />
        {/* 머리: 테이프 라벨 + 도장 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "44px 64px 0 124px" }}>
          <div style={{ display: "flex", fontSize: 30, color: "#2a1a10", background: "#e6d2a8", padding: "10px 26px", transform: "rotate(-1.5deg)", boxShadow: "0 2px 4px rgba(60,40,20,0.2)" }}>{kicker}</div>
          {badge ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 118, height: 118, borderRadius: 999, border: "7px solid #c0473e", color: "#c0473e", fontSize: 36, transform: "rotate(-12deg)", opacity: 0.9 }}>{badge}</div>
          ) : <div />}
        </div>
        {/* 본문: 제목은 줄 위에 */}
        <div style={{ display: "flex", flexDirection: "column", padding: "18px 64px 0 124px", flex: 1 }}>
          <div style={{ fontSize: 76, lineHeight: "80px", color: "#17100b", letterSpacing: -1 }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 34, lineHeight: "40px", color: "#4f3f31", marginTop: 16 }}>{subtitle}</div> : null}
          {traits.length > 0 && (
            <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
              {traits.map((t) => (
                <div key={t} style={{ display: "flex", fontSize: 27, color: "#17100b", background: "rgba(255,255,255,0.85)", border: "2px solid rgba(90,70,50,0.28)", padding: "6px 18px", borderRadius: 6 }}>{t}</div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 64px 40px 124px" }}>
          <div style={{ width: 44, height: 4, background: "#b9793b" }} />
          <div style={{ fontSize: 25, color: "#7d6e5f" }}>{footer}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: font ? [{ name: "Hand", data: font, weight: 400 as const, style: "normal" as const }] : [] }
  );
}
