"use client";
import { useEffect, useState } from "react";

export default function Unsubscribe() {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const email = p.get("e") || "", token = p.get("t") || "";
    if (!email || !token) { setState("err"); return; }
    fetch("/api/newsletter-optout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, token }) })
      .then((r) => r.json()).then((d) => setState(d.ok ? "ok" : "err")).catch(() => setState("err"));
  }, []);
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018] flex items-center justify-center p-6" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="bg-[#fdfaf4] rounded-2xl p-10 text-center max-w-md border border-[#ece0cd]">
        <div className="text-4xl mb-4">☕</div>
        {state === "idle" && <p className="text-[#524234]">처리 중…</p>}
        {state === "ok" && (<>
          <h1 className="text-2xl font-bold mb-3">수신거부 완료</h1>
          <p className="text-[#524234] leading-relaxed">앞으로 주간 뉴스레터를 보내지 않습니다. 그동안 함께해 주셔서 고맙습니다.<br />다시 받고 싶으시면 고객센터(dongnecoffeenote@gmail.com)로 알려주세요.</p>
        </>)}
        {state === "err" && (<>
          <h1 className="text-2xl font-bold mb-3">링크를 확인해 주세요</h1>
          <p className="text-[#524234] leading-relaxed">수신거부 링크가 올바르지 않거나 만료됐어요. 메일의 링크를 다시 눌러주시거나 dongnecoffeenote@gmail.com로 알려주세요.</p>
        </>)}
        <a href="/" className="inline-block mt-6 text-[#7a5122] underline text-sm">홈으로 →</a>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
