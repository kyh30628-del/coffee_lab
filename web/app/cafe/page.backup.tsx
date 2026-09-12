"use client";
import { useEffect, useMemo, useState } from "react";
import NoteCard, { type Cafe } from "./NoteCard";
import "./note.css";

const USES = [
  { key: "", label: "전체" },
  { key: "작업", label: "작업하기" },
  { key: "혼자", label: "혼자 조용히" },
  { key: "수다", label: "수다 떨기" },
  { key: "빵", label: "빵·디저트" },
];

export default function CafePage() {
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [use, setUse] = useState("");
  const [view, setView] = useState<"list" | "area">("list");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/cafes")
      .then((r) => r.json())
      .then((d) => { setCafes(d.cafes ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (use ? cafes.filter((c) => (c.uses ?? "").split(",").map((s) => s.trim()).includes(use)) : cafes),
    [cafes, use]
  );

  const byArea = useMemo(() => {
    const m = new Map<string, Cafe[]>();
    filtered.forEach((c) => { const k = c.area || "기타"; m.set(k, [...(m.get(k) ?? []), c]); });
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const replayKey = `${use}-${view}`;

  return (
    <main className="cn-root min-h-screen">
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Nanum+Pen+Script&display=swap" rel="stylesheet" />
      <div className="max-w-5xl mx-auto px-6 py-14">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold leading-tight">강동, 커피 아는 사람의 동네 노트</h1>
            <p className="mt-3 text-lg" style={{ color: "var(--ink-soft)" }}>
              별점 대신 직접 마시고 적었습니다. 오늘 뭐 하러 나가세요?
            </p>
          </div>
          <div className="cn-seg" role="group" aria-label="보기 방식">
            <button aria-pressed={view === "list"} onClick={() => setView("list")}>목록</button>
            <button aria-pressed={view === "area"} onClick={() => setView("area")}>동네별</button>
          </div>
        </header>

        <div className="flex flex-wrap gap-2.5 mb-8" role="group" aria-label="용도 선택">
          {USES.map((u) => (
            <button key={u.key} className="cn-chip" aria-pressed={use === u.key} onClick={() => setUse(u.key)}>
              {u.label}
            </button>
          ))}
        </div>

        {loading && <p style={{ color: "var(--ink-soft)" }}>노트를 펼치는 중…</p>}
        {!loading && filtered.length === 0 && (
          <p style={{ color: "var(--ink-soft)" }}>이 용도로 적어 둔 카페가 아직 없어요. 다른 용도를 골라 보세요.</p>
        )}

        {!loading && view === "list" && (
          <div className="cn-grid">
            {filtered.map((c) => <NoteCard key={c.id} cafe={c} replayKey={replayKey} />)}
          </div>
        )}

        {!loading && view === "area" && byArea.map(([area, list]) => (
          <section key={area}>
            <div className="cn-areahead">
              <strong>{area}</strong>
              <span className="cn-hand">{list.length}곳 적어 둠</span>
            </div>
            <div className="cn-grid">
              {list.map((c) => <NoteCard key={c.id} cafe={c} replayKey={replayKey} />)}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
