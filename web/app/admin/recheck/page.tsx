"use client";
import { useState, useEffect, useCallback } from "react";
import BackLink from "../../BackLink";

// ♻️ 정책 소급 재판정 큐 리뷰 — 하네스 L6(lib/recheckQueue.ts)가 쌓기만 하던 목록을
//   사람이 눈으로 보고 keep_excluded/republish/needs_look을 매기는 화면(2026-08-14 신설).
//   🔴 자동 재공개 없음 — republish도 이 화면에서 사람이 버튼을 눌러야만 실행된다.

type Item = {
  id: number; cafe_id: number; name: string; area: string; address: string;
  grade: string; count: number; reason: string; policy_ref: string | null; queued_at: string;
};
type Hist = { id: number; cafe_id: number; name: string; verdict: string; note: string | null; reviewed_by: string | null; reviewed_at: string };

const card: React.CSSProperties = { background: "#fff", border: "1px solid #ddc9a8", borderRadius: 12, padding: "12px 14px", minWidth: 0 };
const sub: React.CSSProperties = { fontSize: 10.5, color: "#8a7a5c", fontWeight: 600 };
const VERDICT_LABEL: Record<string, string> = { keep_excluded: "제외 유지", republish: "재공개", needs_look: "추가검토 필요" };
const VERDICT_COLOR: Record<string, string> = { keep_excluded: "#8a7355", republish: "#3f7a4f", needs_look: "#b5731f" };

export default function RecheckPage() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [open, setOpen] = useState<Item[]>([]);
  const [history, setHistory] = useState<Hist[]>([]);
  const [note, setNote] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: string, silent = false) => {
    if (!silent) setLoading(true);
    setErr("");
    try {
      const d = await fetch("/api/admin/recheck", { headers: { "x-admin-password": p }, cache: "no-store" }).then((r) => r.json());
      if (d.ok) { setOpen(d.open); setHistory(d.history); setAuthed(true); localStorage.setItem("adm_pw", p); }
      else if (!silent) setErr("비밀번호 확인");
    } catch { if (!silent) setErr("불러오기 실패"); }
    setLoading(false);
  }, []);

  useEffect(() => { const p = localStorage.getItem("adm_pw"); if (p) { setPw(p); load(p); } }, [load]);

  const resolve = async (it: Item, verdict: "keep_excluded" | "republish" | "needs_look") => {
    if (verdict === "republish" && !window.confirm(`[${it.name}] 지금 공개로 전환합니다.\n\n주소: ${it.address || "—"}\n사유: ${it.reason}\n\n육안 확인(오염·업종·소재지)을 마치셨나요? 확인 후 진행하세요.`)) return;
    setBusy(String(it.id)); setErr("");
    try {
      if (verdict === "republish") {
        const pub = await fetch("/api/admin/cafes", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" },
          body: JSON.stringify({ id: it.cafe_id, action: "publish", published: true }) }).then((r) => r.json());
        if (!pub.ok) { setErr("공개 전환 실패 — " + (pub.error || "")); setBusy(""); return; }
      }
      const d = await fetch("/api/admin/recheck", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id, verdict, note: note[it.id] ?? "" }) }).then((r) => r.json());
      if (d.ok) await load(pw, true); else setErr(d.error || "저장 실패");
    } catch { setErr("저장 실패"); }
    setBusy("");
  };

  return (
    <main style={{ minHeight: "100vh", background: "#efe7d8", color: "#2b2018", fontFamily: "'Gowun Batang',serif", padding: 12, maxWidth: 720, margin: "0 auto", paddingTop: "calc(12px + env(safe-area-inset-top))" }}>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box}input,textarea{font-family:inherit}`}</style>
      <BackLink to="/admin/org" label="조직 관제" className="text-stone-500 mb-2" />

      <div style={{ background: "#2b2018", color: "#e8b87a", borderRadius: 14, padding: "14px 16px" }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>♻️ 정책 소급 재판정 큐</div>
        <div style={{ fontSize: 11, color: "#cbb38c" }}>정책이 완화된 뒤에도 excluded로 갇힌 카페를 사람이 확인 · 자동 재공개 없음</div>
      </div>

      {!authed && (
        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>관리자 비밀번호</div>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(pw)}
            style={{ width: "100%", padding: 10, border: "1px solid #d8c4a4", borderRadius: 9, fontSize: 16 }} placeholder="비밀번호" />
          <button onClick={() => load(pw)} style={{ marginTop: 10, width: "100%", padding: 12, background: "#2b2018", color: "#f4ece0", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15 }}>{loading ? "불러오는 중…" : "열기"}</button>
          {err && <div style={{ color: "#b03a3a", fontSize: 12, marginTop: 8 }}>{err}</div>}
        </div>
      )}

      {authed && (<>
        {err && <div style={{ ...card, marginTop: 10, borderColor: "#e0b3b3", background: "#fbeeee", color: "#b03a3a", fontSize: 12.5 }}>{err}</div>}
        <div style={{ ...sub, marginTop: 10, lineHeight: 1.5 }}>
          미검토 <b>{open.length}</b>건. 제외 유지=변화 없음(그대로 비공개) · 재공개=이 화면에서 즉시 공개 전환(전 캐시 무효화 포함) ·
          추가검토=사람 판단 보류(다음 육안 확인까지 큐에 남김). 재공개 전 주소·오염 여부를 반드시 확인하세요.
        </div>

        <div style={{ marginTop: 12 }}>
          {open.length === 0 && <div style={{ ...card, textAlign: "center", color: "#8a7a5c", fontSize: 12.5 }}>미검토 항목이 없습니다.</div>}
          {open.map((it) => (
            <div key={it.id} style={{ ...card, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{it.name}</div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 20, color: "#fff", background: "#9c6b3f" }}>{it.grade ?? "—"} · {it.count ?? 0}건</span>
              </div>
              <div style={{ ...sub, marginTop: 3 }}>{it.area || "—"} · {it.address || "주소 없음"}</div>
              <div style={{ fontSize: 12, color: "#4a3a2a", marginTop: 6, lineHeight: 1.5 }}>{it.reason}</div>
              <div style={{ ...sub, marginTop: 4 }}>큐잉 {it.queued_at} · 정책참조 {it.policy_ref || "—"}</div>
              <a href={`https://map.naver.com/p/search/${encodeURIComponent(`${it.name} ${it.address || ""}`)}`} target="_blank" rel="noreferrer"
                style={{ display: "inline-block", marginTop: 6, fontSize: 11.5, fontWeight: 700, color: "#6a468c", textDecoration: "none" }}>네이버지도에서 확인 →</a>
              <textarea value={note[it.id] ?? ""} onChange={(e) => setNote((s) => ({ ...s, [it.id]: e.target.value }))} placeholder="메모(선택)" maxLength={300}
                style={{ width: "100%", marginTop: 8, padding: "7px 9px", border: "1px solid #d8c4a4", borderRadius: 8, fontSize: 13, minHeight: 40, resize: "vertical" }} />
              <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
                <button disabled={busy === String(it.id)} onClick={() => resolve(it, "keep_excluded")}
                  style={{ padding: "8px 12px", background: "#8a7355", color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 700 }}>제외 유지</button>
                <button disabled={busy === String(it.id)} onClick={() => resolve(it, "republish")}
                  style={{ padding: "8px 12px", background: "#3f7a4f", color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 700 }}>
                  {busy === String(it.id) ? "…" : "재공개(공개 전환)"}
                </button>
                <button disabled={busy === String(it.id)} onClick={() => resolve(it, "needs_look")}
                  style={{ padding: "8px 12px", background: "#fff", color: "#b5731f", border: "1px solid #d8c4a4", borderRadius: 8, fontSize: 12.5, fontWeight: 700 }}>추가검토 필요</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#9c6b3f", borderBottom: "1px solid #e8b87a", paddingBottom: 4, marginBottom: 8 }}>🕘 최근 검토완료</div>
          {history.length === 0 ? <div style={sub}>아직 검토 이력이 없습니다.</div> : (
            <div style={card}>
              {history.map((h) => (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: "1px solid #f0e6d2", fontSize: 12 }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{h.name}</span>{" "}
                    <b style={{ color: VERDICT_COLOR[h.verdict] ?? "#4a3a2a" }}>{VERDICT_LABEL[h.verdict] ?? h.verdict}</b>
                    {h.note ? <span style={sub}> · {h.note}</span> : null}
                  </div>
                  <div style={{ ...sub, whiteSpace: "nowrap" }}>{h.reviewed_by ?? "—"} · {h.reviewed_at}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>)}
    </main>
  );
}
