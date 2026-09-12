"use client";
import type React from "react";
import HandwrittenNote from "./HandwrittenNote";

export type Cafe = {
  id: number; name: string; area: string; address: string;
  lat: number; lng: number; hours: string; phone: string;
  rating: number; rating_count: number; roasts_own: boolean;
  beans: string; signature: string; uses: string; vibe: string;
  note: string; price_hint: string; source: string;
};

const USE_LABEL: Record<string, string> = {
  작업: "작업하기", 혼자: "혼자 조용히", 수다: "수다 떨기", 빵: "빵·디저트", 단골: "단골 하기 좋은",
};

export default function NoteCard({ cafe, replayKey }: { cafe: Cafe; replayKey: string }) {
  const tags = (cafe.uses ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const mapUrl = `https://map.kakao.com/link/map/${encodeURIComponent(cafe.name)},${cafe.lat},${cafe.lng}`;
  const toUrl = `https://map.kakao.com/link/to/${encodeURIComponent(cafe.name)},${cafe.lat},${cafe.lng}`;

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    e.currentTarget.style.setProperty("--ry", `${x * 6}deg`);
    e.currentTarget.style.setProperty("--rx", `${-y * 6}deg`);
  };
  const onLeave = (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.style.setProperty("--ry", "0deg");
    e.currentTarget.style.setProperty("--rx", "0deg");
  };

  return (
    <article className="cn-paper" onPointerMove={onMove} onPointerLeave={onLeave}>
      {cafe.roasts_own && <span className="cn-stamp cn-hand">직접 로스팅</span>}
      <div className="cn-area">{cafe.area}</div>
      <h3>{cafe.name}</h3>

      {cafe.note
        ? <HandwrittenNote text={cafe.note} replayKey={replayKey} />
        : <p className="cn-quote cn-hand" style={{ opacity: .5 }}>아직 노트를 적지 못한 곳.</p>}

      <dl>
        {cafe.beans && <><dt>원두</dt><dd>{cafe.beans}</dd></>}
        {cafe.signature && <><dt>대표</dt><dd>{cafe.signature}{cafe.price_hint ? ` · ${cafe.price_hint}` : ""}</dd></>}
        {cafe.hours && <><dt>영업</dt><dd>{cafe.hours}</dd></>}
        {cafe.vibe && <><dt>분위기</dt><dd>{cafe.vibe}</dd></>}
      </dl>

      {tags.length > 0 && (
        <div className="cn-tags">{tags.map((t) => <span key={t}>{USE_LABEL[t] ?? t}</span>)}</div>
      )}

      <div className="cn-acts">
        <a href={toUrl} target="_blank" rel="noreferrer">지도·길찾기</a>
        {cafe.phone
          ? <a href={`tel:${cafe.phone.replace(/[^0-9+]/g, "")}`}>전화</a>
          : <a href={mapUrl} target="_blank" rel="noreferrer">지도 보기</a>}
      </div>
    </article>
  );
}
