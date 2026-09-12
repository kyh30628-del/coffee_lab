"use client";
import { useEffect, useRef } from "react";

export default function HandwrittenNote({ text, replayKey }: { text: string; replayKey?: string | number }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: number | undefined;
    let started = false;

    const write = () => {
      if (started) return;
      started = true;
      el.innerHTML = "";
      const pen = document.createElement("span");
      pen.className = "cn-pen";
      pen.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 7l3 3"/></svg>';
      const spans = [...text].map((ch) => {
        const s = document.createElement("span");
        s.className = "c";
        s.textContent = ch === " " ? "\u00a0" : ch;
        s.style.setProperty("--o", (0.78 + Math.random() * 0.22).toFixed(2));
        el.appendChild(s);
        return s;
      });
      el.appendChild(pen);
      if (reduce) { spans.forEach((s) => s.classList.add("on")); return; }

      let i = 0;
      pen.classList.add("on");
      const step = () => {
        if (i >= spans.length) { timer = window.setTimeout(() => pen.classList.remove("on"), 300); return; }
        const s = spans[i++];
        s.classList.add("on");
        const r = s.getBoundingClientRect(), p = el.getBoundingClientRect();
        pen.style.left = `${r.right - p.left}px`;
        pen.style.top = `${r.top - p.top + r.height * 0.6}px`;
        const ch = s.textContent || "";
        const d = ch === "." || ch === "," ? 260 : ch === "\u00a0" ? 70 : 45 + Math.random() * 60;
        timer = window.setTimeout(step, d);
      };
      step();
    };

    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && write()), { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); if (timer) window.clearTimeout(timer); };
  }, [text, replayKey]);

  return <p ref={ref} className="cn-quote cn-hand" aria-label={text} />;
}
