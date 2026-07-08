"use client";
import { useState, useEffect, useCallback } from "react";
import BackLink from "../../BackLink";

// 🎛️ 기준 관제 — 흩어진 하드코딩 임계값을 무배포로 조정. 값만 저장하며 실제 공개상태는 파이프라인이 반영.
//   grade.floor·geo.box 변경은 저장 전 영향 미리보기 + 대량변동 시 재확인 게이트(대량비공개 방지).

type Item = {
  key: string; category: string; label: string; unit: string;
  value: number; default_value: number; min_value: number; max_value: number;
  updated_by: string | null; updated_at: string | null; isDefault: boolean;
  tier: "L3" | "L2"; // ⚖️ DoA: L3=대량영향(CEO 확인) · L2=소영향(기조실장 전결·바로 적용)
};
type Hist = { id: number; key: string; old_value: number; new_value: number; changed_by: string; changed_at: string; impact_note: string | null };
type Preview = { kind: string; wouldUnpublish: number; changed: number; note: string; samples: string[] };
// 📚 리스트 사전
type ListView = { key: string; category: string; label: string; consumer: string; base: string[]; effective: string[]; added: string[]; removed: string[]; isDefault: boolean };
type ListHist = { id: number; key: string; item: string | null; action: string; actor: string; note: string | null; at: string };

const card: React.CSSProperties = { background: "#fff", border: "1px solid #ddc9a8", borderRadius: 12, padding: "12px 14px", minWidth: 0 };
const sub: React.CSSProperties = { fontSize: 10.5, color: "#8a7a5c", fontWeight: 600 };
const CAT_ICON: Record<string, string> = { 등급: "🏅", 지리: "🗺️", 검색: "🔎", 노출: "✨", 오염: "🛡️", 성향축: "🎭", 맛축: "☕", 용도: "🪑", 운영신호: "🏷️", 검색개념: "💡", 오염리스트: "🛡️", 정체성: "🔖" };

export default function CriteriaPage() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [history, setHistory] = useState<Hist[]>([]);
  const [threshold, setThreshold] = useState(20);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Record<string, Preview>>({});
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  // 📚 리스트 사전 상태
  const [lists, setLists] = useState<ListView[]>([]);
  const [listCats, setListCats] = useState<string[]>([]);
  const [listHistory, setListHistory] = useState<ListHist[]>([]);
  const [newItem, setNewItem] = useState<Record<string, string>>({});

  const loadLists = useCallback(async (p: string) => {
    try {
      const d = await fetch("/api/admin/criteria-lists", { headers: { "x-admin-password": p }, cache: "no-store" }).then((r) => r.json());
      if (d.ok) { setLists(d.lists); setListCats(d.categories); setListHistory(d.history); }
    } catch { /* 리스트 로드 실패는 숫자기준 화면을 막지 않음 */ }
  }, []);

  const load = useCallback(async (p: string, silent = false) => {
    if (!silent) setLoading(true);
    setErr("");
    try {
      const d = await fetch("/api/admin/criteria", { headers: { "x-admin-password": p }, cache: "no-store" }).then((r) => r.json());
      if (d.ok) {
        setItems(d.items); setCategories(d.categories); setHistory(d.history); setThreshold(d.blastThreshold ?? 20);
        setAuthed(true); localStorage.setItem("adm_pw", p);
        const dr: Record<string, string> = {}; for (const it of d.items) dr[it.key] = String(it.value); setDraft(dr);
        await loadLists(p);
      } else if (!silent) setErr("비밀번호 확인");
    } catch { if (!silent) setErr("불러오기 실패"); }
    setLoading(false);
  }, [loadLists]);

  const listAction = async (key: string, action: string, item?: string) => {
    setBusy(key + (item ?? "")); setErr("");
    try {
      const d = await fetch("/api/admin/criteria-lists", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" },
        body: JSON.stringify({ action, key, item }) }).then((r) => r.json());
      if (d.ok) { if (action === "add") setNewItem((s) => ({ ...s, [key]: "" })); await loadLists(pw); }
      else setErr(d.error || "적용 실패");
    } catch { setErr("적용 실패"); }
    setBusy("");
  };

  useEffect(() => { const p = localStorage.getItem("adm_pw"); if (p) { setPw(p); load(p); } }, [load]);

  // 공개상태 블라스트 미리보기가 없는(랭킹/노출/오염 게이트) 기준 — '영향 미리보기' 버튼 숨김. 반영은 합성·재판정 파이프라인.
  const isRankOnly = (k: string) => k.startsWith("search.") || k.startsWith("exposure.") || k.startsWith("contamination.");

  const doPreview = async (it: Item) => {
    const value = Number(draft[it.key]);
    if (!Number.isFinite(value)) { setErr("숫자를 입력하세요"); return; }
    setBusy(it.key); setErr("");
    try {
      const d = await fetch("/api/admin/criteria", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", key: it.key, value }) }).then((r) => r.json());
      if (d.ok) setPreview((p) => ({ ...p, [it.key]: d.preview })); else setErr(d.error || "미리보기 실패");
    } catch { setErr("미리보기 실패"); }
    setBusy("");
  };

  const save = async (it: Item, confirm = false) => {
    const value = Number(draft[it.key]);
    if (!Number.isFinite(value)) { setErr("숫자를 입력하세요"); return; }
    // ⚖️ DoA L3 확인 게이트 — 대량영향(등급바닥·좌표박스)은 공개상태를 흔들 수 있어 CEO 확인 하에만 저장.
    //   (아래 서버 차단기(대량변동 409)와 이중 방어. 소영향 L2는 바로 적용.)
    if (it.tier === "L3" && !window.confirm(`⚠️ 대량영향(L3) 기준입니다 — 공개상태가 흔들릴 수 있습니다.\n\n[${it.label}] ${it.value} → ${value}\n\nCEO 확인 하에 변경하시겠습니까? (대량변동 시 추가 재확인이 뜹니다)`)) return;
    setBusy(it.key); setErr("");
    try {
      const d = await fetch("/api/admin/criteria", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", key: it.key, value, confirm }) }).then((r) => r.json());
      if (d.ok) { setPreview((p) => { const n = { ...p }; delete n[it.key]; return n; }); await load(pw, true); }
      else if (d.needConfirm) { setPreview((p) => ({ ...p, [it.key]: d.preview })); setErr(d.error || "재확인 필요"); }
      else setErr(d.error || "저장 실패");
    } catch { setErr("저장 실패"); }
    setBusy("");
  };

  const revert = async (it: Item) => {
    setBusy(it.key); setErr("");
    try {
      const d = await fetch("/api/admin/criteria", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revert", key: it.key }) }).then((r) => r.json());
      if (d.ok) { setPreview((p) => { const n = { ...p }; delete n[it.key]; return n; }); await load(pw, true); } else setErr(d.error || "되돌리기 실패");
    } catch { setErr("되돌리기 실패"); }
    setBusy("");
  };

  return (
    <main style={{ minHeight: "100vh", background: "#efe7d8", color: "#2b2018", fontFamily: "'Gowun Batang',serif", padding: 12, maxWidth: 720, margin: "0 auto", paddingTop: "calc(12px + env(safe-area-inset-top))" }}>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box}input{font-family:inherit}`}</style>
      <BackLink to="/admin" label="대시보드" className="text-stone-500 mb-2" />

      <div style={{ background: "#2b2018", color: "#e8b87a", borderRadius: 14, padding: "14px 16px" }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>🎛️ 기준 관제</div>
        <div style={{ fontSize: 11, color: "#cbb38c" }}>비즈니스 임계값 단일출처 · 무배포 조정 · 안전폴백</div>
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
          ⚠️ 이 화면은 <b>기준값만</b> 저장합니다. 실제 카페 공개상태는 바꾸지 않으며, 반영은 합성·재판정 파이프라인이 담당합니다.
          등급·좌표 기준은 저장 전 영향 미리보기가 뜨고, 공개카페 {threshold}곳 초과가 흔들리면 재확인이 필요합니다.
          <br />⚖️ <b>DoA</b>: <span style={{ color: "#b03a3a", fontWeight: 700 }}>L3 CEO 확인</span>=등급바닥·좌표박스(대량영향) · <span style={{ color: "#3f7a4f", fontWeight: 700 }}>L2 전결</span>=검색가중치·오염임계·노출상한(소영향·바로 적용). 소유=품질본부, 관장=기획조정실장.
        </div>

        {categories.map((cat) => (
          <div key={cat} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#9c6b3f", borderBottom: "1px solid #e8b87a", paddingBottom: 4, marginBottom: 8 }}>{CAT_ICON[cat] ?? "•"} {cat}</div>
            {items.filter((i) => i.category === cat).map((it) => {
              const pv = preview[it.key];
              const changed = draft[it.key] !== undefined && Number(draft[it.key]) !== it.value;
              const needConfirm = !!pv && pv.wouldUnpublish > threshold;
              return (
                <div key={it.key} style={{ ...card, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{it.label}</div>
                    <div style={{ display: "flex", gap: 5, alignItems: "baseline", whiteSpace: "nowrap" }}>
                      {!it.isDefault && <span style={{ fontSize: 10, color: "#b5731f", fontWeight: 700 }}>조정됨</span>}
                      <span title={it.tier === "L3" ? "대량영향 — CEO 확인 게이트(공개상태 흔들림)" : "소영향 — 기조실장 전결(바로 적용)"}
                        style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 20, color: "#fff", background: it.tier === "L3" ? "#b03a3a" : "#3f7a4f" }}>
                        {it.tier === "L3" ? "L3 CEO 확인" : "L2 전결"}
                      </span>
                    </div>
                  </div>
                  <div style={{ ...sub, marginTop: 2, fontFamily: "monospace" }}>{it.key}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <input type="number" value={draft[it.key] ?? ""} step="any" min={it.min_value} max={it.max_value}
                      onChange={(e) => setDraft((d) => ({ ...d, [it.key]: e.target.value }))}
                      style={{ width: 100, padding: "7px 9px", border: `1px solid ${changed ? "#c98a3c" : "#d8c4a4"}`, borderRadius: 8, fontSize: 15, fontVariantNumeric: "tabular-nums" }} />
                    <span style={sub}>{it.unit}</span>
                    <span style={sub}>기본값 {it.default_value} · 범위 {it.min_value}~{it.max_value}</span>
                  </div>
                  {(it.updated_by || it.updated_at) && (
                    <div style={{ ...sub, marginTop: 4 }}>최근변경: {it.updated_by ?? "—"} · {it.updated_at ? new Date(it.updated_at).toLocaleString("ko-KR") : "—"}</div>
                  )}

                  {pv && (
                    <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 9, fontSize: 12, background: needConfirm ? "#fff5e6" : "#f3ead8", border: needConfirm ? "2px solid #e8b046" : "1px solid #e6d8bf" }}>
                      <div style={{ fontWeight: 700, color: needConfirm ? "#b03a1e" : "#7a5a2c" }}>{needConfirm ? "🚨 대량변동 주의" : "미리보기"} — {pv.note}</div>
                      {pv.samples.length > 0 && <div style={{ ...sub, marginTop: 3 }}>예: {pv.samples.join(", ")}{pv.wouldUnpublish > pv.samples.length ? " …" : ""}</div>}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
                    {!isRankOnly(it.key) && changed && (
                      <button disabled={busy === it.key} onClick={() => doPreview(it)}
                        style={{ padding: "8px 12px", background: "#6a468c", color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 700 }}>영향 미리보기</button>
                    )}
                    {changed && (
                      <button disabled={busy === it.key} onClick={() => save(it, needConfirm)}
                        style={{ padding: "8px 12px", background: needConfirm ? "#b03a1e" : "#2b2018", color: "#f4ece0", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 700 }}>
                        {busy === it.key ? "…" : needConfirm ? "재확인하고 저장" : "저장"}
                      </button>
                    )}
                    {!it.isDefault && (
                      <button disabled={busy === it.key} onClick={() => revert(it)}
                        style={{ padding: "8px 12px", background: "#fff", color: "#9c6b3f", border: "1px solid #d8c4a4", borderRadius: 8, fontSize: 12.5, fontWeight: 700 }}>기본값으로 되돌리기</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* 📚 리스트 사전 — 성향축·맛·용도·검색개념·오염리스트 등 하드코딩 키워드 사전을 무배포 편집 */}
        <div style={{ marginTop: 22, background: "#2b2018", color: "#e8b87a", borderRadius: 14, padding: "12px 15px" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>📚 리스트 사전</div>
          <div style={{ fontSize: 11, color: "#cbb38c", lineHeight: 1.5 }}>
            소비자 출력을 형성하는 키워드 사전(성향점수·맛좌표·검색개념·오염게이트)을 무배포로 편집. 하드코딩=폴백 진실원본, DB=오버라이드.
            <br />⚖️ <b>DoA</b>: <span style={{ color: "#8fd0a0", fontWeight: 700 }}>L2 전결</span>(기조실장) — 항목 편집이며 카페 공개상태는 직접 바꾸지 않음(반영은 합성/검색 파이프라인). 소유=품질본부.
          </div>
        </div>

        {listCats.map((cat) => (
          <div key={cat} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#9c6b3f", borderBottom: "1px solid #e8b87a", paddingBottom: 4, marginBottom: 8 }}>{CAT_ICON[cat] ?? "•"} {cat}</div>
            {lists.filter((l) => l.category === cat).map((l) => {
              const addedSet = new Set(l.added);
              return (
                <div key={l.key} style={{ ...card, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{l.label}</div>
                    <div style={{ display: "flex", gap: 5, alignItems: "baseline", whiteSpace: "nowrap" }}>
                      {!l.isDefault && <span style={{ fontSize: 10, color: "#b5731f", fontWeight: 700 }}>편집됨</span>}
                      <span title="소영향 — 기조실장 전결(바로 적용)" style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 20, color: "#fff", background: "#3f7a4f" }}>L2 전결</span>
                    </div>
                  </div>
                  <div style={{ ...sub, marginTop: 2, fontFamily: "monospace" }}>{l.key} · {l.consumer} · {l.effective.length}개</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                    {l.effective.map((it) => {
                      const isAdded = addedSet.has(it);
                      return (
                        <span key={it} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "3px 4px 3px 9px", borderRadius: 20,
                          background: isAdded ? "#eaf6ee" : "#f3ead8", border: `1px solid ${isAdded ? "#b6dcc2" : "#e6d8bf"}` }}>
                          {it}{isAdded && <span style={{ fontSize: 9, color: "#3f7a4f", fontWeight: 700 }}>추가</span>}
                          <button disabled={busy === l.key + it} onClick={() => listAction(l.key, "remove", it)} title="제거"
                            style={{ border: "none", background: "transparent", color: "#b03a3a", fontWeight: 700, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 2px" }}>×</button>
                        </span>
                      );
                    })}
                  </div>
                  {l.removed.length > 0 && (
                    <div style={{ ...sub, marginTop: 6 }}>숨김(기본에서 제거): {l.removed.map((it) => (
                      <button key={it} disabled={busy === l.key + it} onClick={() => listAction(l.key, "revert", it)} title="되돌리기(다시 포함)"
                        style={{ border: "1px dashed #d8c4a4", background: "#faf4e8", color: "#9c6b3f", borderRadius: 12, fontSize: 11, padding: "1px 7px", margin: "0 3px 3px 0", cursor: "pointer", textDecoration: "line-through" }}>{it} ↩</button>
                    ))}</div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
                    <input value={newItem[l.key] ?? ""} placeholder="새 키워드 추가" maxLength={40}
                      onChange={(e) => setNewItem((s) => ({ ...s, [l.key]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter" && (newItem[l.key] ?? "").trim()) listAction(l.key, "add", newItem[l.key].trim()); }}
                      style={{ flex: "1 1 140px", minWidth: 120, padding: "7px 9px", border: "1px solid #d8c4a4", borderRadius: 8, fontSize: 14 }} />
                    <button disabled={!(newItem[l.key] ?? "").trim() || busy === l.key + (newItem[l.key] ?? "").trim()} onClick={() => listAction(l.key, "add", (newItem[l.key] ?? "").trim())}
                      style={{ padding: "8px 12px", background: "#2b2018", color: "#f4ece0", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 700 }}>추가</button>
                    {!l.isDefault && (
                      <button disabled={busy === l.key} onClick={() => { if (window.confirm(`[${l.label}] 사전을 기본값으로 되돌립니다(모든 편집 취소).`)) listAction(l.key, "revert_all"); }}
                        style={{ padding: "8px 12px", background: "#fff", color: "#9c6b3f", border: "1px solid #d8c4a4", borderRadius: 8, fontSize: 12.5, fontWeight: 700 }}>기본값 복원</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {listHistory.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#9c6b3f", borderBottom: "1px solid #e8b87a", paddingBottom: 4, marginBottom: 8 }}>🕘 리스트 편집 이력</div>
            <div style={card}>
              {listHistory.map((h) => (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: "1px solid #f0e6d2", fontSize: 12 }}>
                  <div><span style={{ fontFamily: "monospace", color: "#8a5e30" }}>{h.key}</span> <b style={{ color: h.action.startsWith("revert") ? "#3f7a4f" : h.action === "remove" ? "#b03a3a" : "#b5731f" }}>{h.action}</b>{h.item ? <> · {h.item}</> : null}</div>
                  <div style={{ ...sub, whiteSpace: "nowrap" }}>{h.actor} · {new Date(h.at).toLocaleString("ko-KR")}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#9c6b3f", borderBottom: "1px solid #e8b87a", paddingBottom: 4, marginBottom: 8 }}>🕘 최근 변경(숫자 기준)</div>
          {history.length === 0 ? <div style={sub}>아직 변경 이력이 없습니다.</div> : (
            <div style={card}>
              {history.map((h) => (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: "1px solid #f0e6d2", fontSize: 12 }}>
                  <div><span style={{ fontFamily: "monospace", color: "#8a5e30" }}>{h.key}</span> <b>{h.old_value}</b> → <b style={{ color: "#b5731f" }}>{h.new_value}</b>{h.impact_note ? <span style={sub}> · {h.impact_note}</span> : null}</div>
                  <div style={{ ...sub, whiteSpace: "nowrap" }}>{h.changed_by} · {new Date(h.changed_at).toLocaleString("ko-KR")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>)}
    </main>
  );
}
