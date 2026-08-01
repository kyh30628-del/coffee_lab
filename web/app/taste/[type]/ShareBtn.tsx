"use client";
import { useState } from "react";
import { trackShare } from "../../trackShareClient";

export default function ShareBtn({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `나의 커피 취향은 '${name}' ☕ — 동네 커피 노트에서 테스트해봐!`;
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) { await (navigator as any).share({ title: "동네 커피 노트 — 내 커피 취향", text, url }); trackShare({ channel: "web", source: "취향결과" }); }
      else { await navigator.clipboard.writeText(`${text}\n${url}`); trackShare({ channel: "clipboard", source: "취향결과" }); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch { /* 취소 */ }
  };
  return (
    <button onClick={share} className="w-full bg-[#e8b87a] text-[#2b2018] rounded-xl py-3.5 font-bold mb-2.5">
      {copied ? "✓ 복사됐어요 — 붙여넣어 공유!" : "🔗 내 취향 결과 공유하기"}
    </button>
  );
}
