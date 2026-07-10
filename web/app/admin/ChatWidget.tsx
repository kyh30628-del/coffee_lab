"use client";
import { useState, useEffect, useRef } from "react";

// 💬 관제 챗봇 — 관제탑(/admin/org)·관리자 대시보드(/admin) 공용. 플로팅 아이콘 → 모달.
//   claude -p(구독) 경유 답을 폴링. 24h 기록. (원래 /admin/org 전용이었으나 공용 컴포넌트로 분리)
export function md2html(md: string) {
  const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t: string) => esc(t).replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#9c6b3f;text-decoration:underline">$1</a>').replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
  const lines = String(md || "").split("\n");
  let html = "", inTable = false, inList = false;
  const close = () => { if (inList) { html += "</ul>"; inList = false; } if (inTable) { html += "</table>"; inTable = false; } };
  for (const ln of lines) {
    if (/^\s*\|(.+)\|\s*$/.test(ln)) {
      const cells = ln.trim().slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      if (!inTable) { close(); html += "<table>"; inTable = true; }
      html += "<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>"; continue;
    }
    if (inTable) { html += "</table>"; inTable = false; }
    if (/^#{1,4}\s/.test(ln)) { close(); const lvl = Math.min(4, ln.match(/^#+/)![0].length); html += `<h${lvl}>${inline(ln.replace(/^#+\s/, ""))}</h${lvl}>`; }
    else if (/^[-*]\s/.test(ln)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(ln.replace(/^[-*]\s/, ""))}</li>`; }
    else if (/^---+\s*$/.test(ln)) { close(); html += "<hr>"; }
    else if (ln.trim() === "") { close(); }
    else { close(); html += `<p>${inline(ln)}</p>`; }
  }
  close(); return html;
}

// 🕒 말풍선 시각 표시 — 클라이언트 로컬시간을 KST 기준 "HH:MM"으로 포맷. 서버 이력의 t(created_at 기준 HH:MM)도 같은 포맷.
function fmtTime(d: Date = new Date()) {
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
}

// 중단 가능한 대기 — AbortController.signal이 abort되면 즉시 resolve(폴링 루프가 다음 반복에서 빠져나가게).
function abortableSleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const onAbort = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// 추천 질문 칩(탭별) — 클릭 시 입력창에 문구만 채운다(자동 전송 X). 첫 사용 진입장벽↓.
// 일반(region) 탭 전용 추천칩 6개 — 모두 결정론 즉답 가능(지역 집계·카페명 검색·지식).
//   작업지시(chat) 탭은 칩을 노출하지 않는다(렌더 자체를 제거).
const SUGGEST: Record<"region", string[]> = {
  region: ["성수동", "강남구", "블루보틀", "서비스가 뭐야?", "MY PIN이 뭐야?", "구독은 어떻게 해?"],
};

export function ChatWidget({ pw }: { pw: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "region">("chat");
  // 두 탭 완전 독립: 각 탭이 별도의 입력·대화이력·로딩 상태를 가져 서로 섞이지 않음(전환해도 각자 컨텍스트 유지)
  // time: 전송/수신 시각(KST "HH:MM"). 과거 로컬 이력 등 값이 없으면 렌더에서 조용히 생략(에러 없음).
  const [chatMsgs, setChatMsgs] = useState<{ role: string; content: string; time?: string }[]>([]);
  const [regionMsgs, setRegionMsgs] = useState<{ role: string; content: string; time?: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [regionInput, setRegionInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [regionLoading, setRegionLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [unread, setUnread] = useState(0);
  // 🗂 대화기록(읽기전용) — chat_archive 열람 패널. 세션 목록 → 검색 → 선택 시 해당 날짜 전문.
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveQ, setArchiveQ] = useState("");
  const [archiveSessions, setArchiveSessions] = useState<{ date: string; count: number; title: string }[]>([]);
  const [archiveDate, setArchiveDate] = useState<string | null>(null);
  const [archiveMsgs, setArchiveMsgs] = useState<{ question: string; answer: string; t: string }[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const regionAbortRef = useRef<AbortController | null>(null);
  const chatStartRef = useRef<number | null>(null);
  const regionStartRef = useRef<number | null>(null);
  const chatMsgCountRef = useRef<number | null>(null); // 서버 이력 기준 마지막으로 알던 메시지 수(새 응답 감지용)
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);
  // 현재 활성 탭의 파생 값(렌더·공통 핸들러용)
  const msgs = mode === "region" ? regionMsgs : chatMsgs;
  const input = mode === "region" ? regionInput : chatInput;
  const loading = mode === "region" ? regionLoading : chatLoading;
  const setInput = mode === "region" ? setRegionInput : setChatInput;
  const filteredMsgs = search.trim() ? msgs.filter((m) => m.content.toLowerCase().includes(search.trim().toLowerCase())) : msgs;
  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [open, msgs, loading]);
  useEffect(() => { if (open) setUnread(0); }, [open]);
  // 🔒 모달 오픈 중 배경 스크롤 락 — iOS Safari는 overflow:hidden만으론 배경이 밀림(rubber-band 전파).
  //   body를 position:fixed로 고정해 스크롤 자체를 원천 차단, 닫히면 원래 스크롤 위치로 복원.
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width, overflow: body.style.overflow };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);
  // ⏱ 응답 생성 경과 시간 — 탭별 시작시각(ref)에서 계산해, 탭 전환 후 돌아와도 경과가 끊기지 않음.
  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const startRef = mode === "region" ? regionStartRef : chatStartRef;
    const tick = () => setElapsed(startRef.current ? Math.floor((Date.now() - startRef.current) / 1000) : 0);
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [loading, mode]);
  // 🔔 새 응답 도착 알림 — 모달이 닫혀있거나(다른 탭/최소화 등으로) 탭이 백그라운드일 때만 배지+브라우저 알림.
  const notifyNewAnswer = (content: string) => {
    setUnread((n) => n + 1);
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try { new Notification("💬 관제 챗봇 응답 도착", { body: content.replace(/[#*`\[\]]/g, "").slice(0, 140) }); } catch {}
    }
  };
  const pushChatMsg = (msg: { role: string; content: string }) => {
    setChatMsgs((m) => { const next = [...m, { ...msg, time: fmtTime() }]; chatMsgCountRef.current = next.length; return next; });
  };
  const loadHistory = () =>
    fetch("/api/admin/chat", { headers: { "x-admin-password": pw }, cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (d.ok && d.history) {
        const m: any[] = [];
        for (const h of d.history) { m.push({ role: "user", content: h.question, time: h.t }); if (h.answer) m.push({ role: "assistant", content: h.answer, time: h.t }); }
        const prevCount = chatMsgCountRef.current;
        if (prevCount !== null && m.length > prevCount) {
          const newAnswers = m.slice(prevCount).filter((x) => x.role === "assistant");
          const hidden = typeof document !== "undefined" && document.hidden;
          if (newAnswers.length && (hidden || !openRef.current)) notifyNewAnswer(newAnswers[newAnswers.length - 1].content);
        }
        chatMsgCountRef.current = m.length;
        setChatMsgs(m);
      }
    }).catch(() => {});
  useEffect(() => { if (pw) loadHistory(); }, [pw]);
  useEffect(() => { if (open && pw) loadHistory(); }, [open, pw]);
  // 🔄 자율실행 진행보고(dev-report)가 챗에 계속 쌓이므로, pw 인증된 동안은 모달이 닫혀있어도(다른 탭/백그라운드)
  //   15초마다 새로고침해 새 응답을 감지·알림한다(작업지시 탭 이력만 갱신).
  useEffect(() => {
    if (!pw) return;
    const t = setInterval(() => { if (!chatLoading) loadHistory(); }, 15000);
    return () => clearInterval(t);
  }, [pw, chatLoading]);
  const send = async () => {
    const q = chatInput.trim(); if (!q || chatLoading) return;
    const ac = new AbortController();
    chatAbortRef.current = ac;
    chatStartRef.current = Date.now();
    setChatInput(""); pushChatMsg({ role: "user", content: q }); setChatLoading(true);
    try {
      const r = await fetch("/api/admin/chat", { method: "POST", headers: { "x-admin-password": pw, "Content-Type": "application/json" }, body: JSON.stringify({ message: q, history: chatMsgs.slice(-8) }), signal: ac.signal }).then((x) => x.json());
      if (!r.ok) { pushChatMsg({ role: "assistant", content: "⚠️ " + (r.error || "오류") }); setChatLoading(false); chatAbortRef.current = null; chatStartRef.current = null; return; }
      await abortableSleep(1000, ac.signal); // 결정론 즉답은 ~1초 내 완료
      // 폴링 인내: 답변이 늦어도(심층조회 등) 놓치지 않게 넉넉히 대기. 폴 1회 실패는 트랜션트로 무시(네트워크 오류 오표시 방지).
      //   sonnet 전환으로 보통 ~1분 내, 드물게 심층조회로 2~3분 → 최대 ~4분까지 기다린다. 중지 버튼으로 언제든 즉시 취소 가능.
      let landed = false;
      for (let i = 0; i < 160 && !ac.signal.aborted; i++) {
        try {
          const p = await fetch(`/api/admin/chat?id=${r.id}`, { headers: { "x-admin-password": pw }, cache: "no-store", signal: ac.signal }).then((x) => x.json());
          if (p.ok && p.status === "done") {
            const content = p.answer || "⚠️ 빈 응답 — 잠시 후 다시 시도해 주세요.";
            pushChatMsg({ role: "assistant", content });
            if (typeof document !== "undefined" && (document.hidden || !openRef.current)) notifyNewAnswer(content);
            landed = true; break;
          }
        } catch { if (ac.signal.aborted) break; /* 폴 1회 실패는 무시 — 다음 폴에서 재시도(잠깐의 네트워크 흔들림으로 대화가 끊기지 않게) */ }
        await abortableSleep(1500, ac.signal);
      }
      if (ac.signal.aborted) pushChatMsg({ role: "assistant", content: "⏹ 응답 생성을 중단했습니다." });
      else if (!landed) pushChatMsg({ role: "assistant", content: "⏱ 응답이 평소보다 늦네요 — 잠시 후 위 대화 새로고침으로 확인되거나, 다시 보내 주세요. (로컬 워커/맥 가동 여부도 점검)" });
    } catch {
      if (ac.signal.aborted) pushChatMsg({ role: "assistant", content: "⏹ 응답 생성을 중단했습니다." });
      else pushChatMsg({ role: "assistant", content: "⚠️ 네트워크 오류" });
    }
    setChatLoading(false); chatAbortRef.current = null; chatStartRef.current = null;
  };
  const pushRegionMsg = (msg: { role: string; content: string }) => {
    setRegionMsgs((m) => [...m, { ...msg, time: fmtTime() }]);
  };
  const sendRegion = async () => {
    const q = regionInput.trim(); if (!q || regionLoading) return;
    const ac = new AbortController();
    regionAbortRef.current = ac;
    regionStartRef.current = Date.now();
    setRegionInput(""); pushRegionMsg({ role: "user", content: `🗺️ ${q}` }); setRegionLoading(true);
    try {
      const r = await fetch(`/api/admin/chat?region=${encodeURIComponent(q)}`, { headers: { "x-admin-password": pw }, cache: "no-store", signal: ac.signal }).then((x) => x.json());
      if (!r.ok) pushRegionMsg({ role: "assistant", content: "⚠️ " + (r.error || "오류") });
      else if (r.kind === "knowledge") {
        // 📚 서비스/조직/관제/라운지 등 지식 질문 — 서버가 결정론으로 답을 돌려줌.
        pushRegionMsg({ role: "assistant", content: r.answer });
      } else {
        // 지역(동/구) 집계 + 카페명 검색을 함께 노출. 둘 다 없으면 안내.
        const parts: string[] = [];
        if (r.total > 0)
          parts.push(`**${q}** 지역\n\n- 발행(공개): **${r.pub}곳** (검증 ${r.verified} · 참고 ${r.ref})\n- 비공개/후보: ${r.unpub}곳 · 전체 등록 ${r.total}곳${r.last_pub ? `\n- 최종 발행: ${String(r.last_pub).slice(0, 10).replace(/-/g, ".")}` : ""}${r.names?.length ? `\n\n**대표 카페**: ${r.names.join(" · ")}` : ""}\n\n[🗺️ 지도에서 ${r.dong || r.gu || q} 보기](/?region=${encodeURIComponent(r.gu || q)}${r.clat && r.clng ? `&clat=${r.clat}&clng=${r.clng}&cz=${r.cz || 14}` : ""})`);
        if (r.cafes?.length)
          parts.push(`**'${q}' 카페 검색** (${r.cafes.length}곳)\n${r.cafes.map((c: any) => `- [${c.name}](/c/${c.id}) — ${[c.area, c.dong].filter(Boolean).join(" ")}${c.grade ? ` · ${c.grade}` : ""}`).join("\n")}`);
        if (!parts.length)
          parts.push(`**${q}** — 매칭되는 발행 카페가 없어요. 동은 '성수동', 구/시는 '강남구'·'수원시', 카페는 이름 일부로 검색해 보세요. 서비스·조직·관제·라운지 같은 질문에도 답해요.`);
        pushRegionMsg({ role: "assistant", content: parts.join("\n\n") });
      }
    } catch {
      if (ac.signal.aborted) pushRegionMsg({ role: "assistant", content: "⏹ 조회를 중단했습니다." });
      else pushRegionMsg({ role: "assistant", content: "⚠️ 네트워크 오류" });
    }
    setRegionLoading(false); regionAbortRef.current = null; regionStartRef.current = null;
  };
  const stop = () => { (mode === "region" ? regionAbortRef : chatAbortRef).current?.abort(); };
  const clearHistory = async () => {
    if (loading || !confirm("24시간 대화기록을 모두 삭제할까요?")) return;
    // 활성 탭의 이력만 삭제(격리). 작업지시 탭은 서버 24h 이력도 함께 비움, 일반(지역) 탭은 로컬 이력만.
    if (mode === "region") { setRegionMsgs([]); return; }
    try { await fetch("/api/admin/chat", { method: "DELETE", headers: { "x-admin-password": pw } }); } catch {}
    setChatMsgs([]); chatMsgCountRef.current = 0;
  };
  // 🗂 대화기록(읽기전용) — 별도 저장소(chat_archive) 조회. 기존 chat_queue 흐름과 완전히 분리.
  const loadArchiveSessions = (q: string) => {
    setArchiveLoading(true);
    fetch(`/api/admin/chat-archive${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`, { headers: { "x-admin-password": pw }, cache: "no-store" })
      .then((r) => r.json()).then((d) => { if (d.ok) setArchiveSessions(d.sessions || []); })
      .catch(() => {}).finally(() => setArchiveLoading(false));
  };
  const loadArchiveDetail = (date: string, q: string) => {
    setArchiveLoading(true);
    const qs = new URLSearchParams({ date, ...(q.trim() ? { q: q.trim() } : {}) });
    fetch(`/api/admin/chat-archive?${qs}`, { headers: { "x-admin-password": pw }, cache: "no-store" })
      .then((r) => r.json()).then((d) => { if (d.ok) setArchiveMsgs(d.messages || []); })
      .catch(() => {}).finally(() => setArchiveLoading(false));
  };
  const openArchive = () => { setArchiveOpen(true); setArchiveDate(null); setArchiveQ(""); setArchiveSessions([]); loadArchiveSessions(""); };
  useEffect(() => {
    if (!archiveOpen) return;
    const t = setTimeout(() => (archiveDate ? loadArchiveDetail(archiveDate, archiveQ) : loadArchiveSessions(archiveQ)), 250); // 검색어 debounce
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveQ, archiveDate]);
  const openChat = () => {
    setOpen(true);
    // 알림 권한은 실제 사용자 제스처(모달 열기) 시점에 요청 — 로드 즉시 요청하는 방해 패턴 지양.
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  };
  return (
    <>
      <div style={{ position: "fixed", bottom: "calc(18px + env(safe-area-inset-bottom))", right: "calc(18px + env(safe-area-inset-right))", zIndex: 50 }}>
        <button onClick={openChat} aria-label="관제 챗봇 열기" style={{ width: 54, height: 54, borderRadius: 27, background: "#2b2018", color: "#e8b87a", border: "2px solid #c98a3c", fontSize: 24, boxShadow: "0 3px 12px rgba(0,0,0,0.3)", cursor: "pointer" }}>💬</button>
        {unread > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#c0392b", color: "#fff", borderRadius: 10, fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, padding: "0 3px", border: "1px solid #f7f1e4", display: "flex", alignItems: "center", justifyContent: "center" }}>{unread > 9 ? "9+" : unread}</span>}
      </div>
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end", overscrollBehavior: "contain" }} onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#f7f1e4", borderRadius: "16px 16px 0 0", maxWidth: 640, width: "100%", margin: "0 auto", height: "86vh", display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#2b2018", color: "#e8b87a", padding: "12px 16px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ fontSize: 15 }}>💬 관제 챗봇</b>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span onClick={openArchive} title="대화기록(과거 세션 열람·검색)" style={{ cursor: "pointer", fontSize: 16 }}>🗂</span>
                <span onClick={clearHistory} title="24h 대화기록 삭제" style={{ cursor: "pointer", fontSize: 17 }}>🗑</span>
                <span onClick={() => setOpen(false)} style={{ cursor: "pointer", fontSize: 18 }}>✕</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, padding: "8px 12px 0" }}>
              {(["chat", "region"] as const).map((mo) => (
                <button key={mo} onClick={() => setMode(mo)} style={{ flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "1px solid " + (mode === mo ? "#c98a3c" : "#e0d2b8"), background: mode === mo ? "#2b2018" : "#fff", color: mode === mo ? "#e8b87a" : "#8a7a5c" }}>{mo === "chat" ? "🛠️ 작업지시" : "💬 일반"}</button>
              ))}
            </div>
            <div style={{ padding: "8px 12px 0" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 대화 검색…" style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px solid #e0d2b8", fontSize: 12.5, background: "#fff", boxSizing: "border-box" }} />
            </div>
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: 12 }}>
              {msgs.length === 0 && (mode === "chat"
                ? <div style={{ color: "#9c8a6c", fontSize: 13, lineHeight: 1.7 }}>상태를 묻거나 <b>작업을 지시</b>하세요.<br />질문: "발행 몇 개야?" · "결재 대기 뭐 있어?"<br />지시: "관제탑 상단에 발행 수 배지 추가해줘" · "지도 팝업 여백 줄여줘"<br /><span style={{ fontSize: 11.5, color: "#b0a081" }}>안전한 코드 변경은 자율로 구현·검증·배포하고, 데이터 변경·모호한 건은 되물어봅니다.</span></div>
                : <div style={{ color: "#9c8a6c", fontSize: 13, lineHeight: 1.7 }}>동/구 이름·<b>카페 이름</b>이나 <b>서비스·조직·관제</b> 질문에 <b>즉시</b> 답해요(LLM 안 씀·빠름).<br />예: "성수동" · "강남구" · "블루보틀" · "서비스가 뭐야?" · "관제탑이 뭐야?"</div>)}
              {msgs.length > 0 && search.trim() && filteredMsgs.length === 0 && <div style={{ color: "#9c8a6c", fontSize: 13 }}>검색 결과 없음</div>}
              {filteredMsgs.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", margin: "6px 0" }}>
                  <div className={m.role === "assistant" ? "ex" : ""} style={{ maxWidth: "88%", padding: "9px 12px", borderRadius: 13, fontSize: 14.5, lineHeight: 1.6, whiteSpace: m.role === "user" ? "pre-wrap" : "normal", wordBreak: "break-word", background: m.role === "user" ? "#c98a3c" : "#fff", color: m.role === "user" ? "#fff" : "#2b2018", border: m.role === "user" ? "none" : "1px solid #e6d8bf" }}>{m.role === "assistant" ? <div dangerouslySetInnerHTML={{ __html: md2html(m.content) }} /> : m.content}</div>
                  {m.time && <span style={{ fontSize: 10.5, color: "#a89878", margin: "2px 4px 0" }}>{m.time}</span>}
                </div>
              ))}
              {loading && (
                <div style={{ color: "#9c8a6c", fontSize: 13, margin: "6px 0", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span>{mode === "region" ? "🗺️ 집계 중…" : "💭 접수됨 · 처리 중… (상태질문은 즉답, 지시는 착수까지 잠깐)"}</span>
                  <span style={{ color: "#b0a081", fontVariantNumeric: "tabular-nums" }}>· {elapsed}초 응답 중</span>
                </div>
              )}
            </div>
            {mode === "region" && (
              <div style={{ display: "flex", gap: 6, padding: "8px 10px 0", flexWrap: "wrap", borderTop: "1px solid #e6d8bf" }}>
                {SUGGEST.region.map((s) => (
                  <button key={s} onClick={() => setInput(s)} disabled={loading} title="클릭하면 입력창에 채워져요" style={{ padding: "5px 11px", borderRadius: 14, fontSize: 12.5, fontWeight: 600, cursor: loading ? "default" : "pointer", border: "1px solid #ddc9a8", background: "#fff", color: "#8a6b3f", opacity: loading ? 0.5 : 1 }}>{s}</button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 7, padding: "8px 10px calc(10px + env(safe-area-inset-bottom))" }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !loading) (mode === "region" ? sendRegion() : send()); }} placeholder={mode === "region" ? "동/구 또는 카페 이름 (예: 성수동, 블루보틀)" : "질문…"} disabled={loading} style={{ flex: 1, minWidth: 0, padding: "11px 13px", borderRadius: 10, border: "1px solid #ddc9a8", fontSize: 16 }} />
              <button onClick={() => (loading ? stop() : (mode === "region" ? sendRegion() : send()))} style={{ padding: "0 18px", background: loading ? "#7a2e22" : "#2b2018", color: loading ? "#f2d9c9" : "#e8b87a", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15, flexShrink: 0, cursor: "pointer" }}>{loading ? "⏹ 중지" : "전송"}</button>
            </div>
          </div>
        </div>
      )}
      {archiveOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 110, display: "flex", flexDirection: "column", justifyContent: "flex-end", overscrollBehavior: "contain" }} onClick={() => setArchiveOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#f7f1e4", borderRadius: "16px 16px 0 0", maxWidth: 640, width: "100%", margin: "0 auto", height: "86vh", display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#2b2018", color: "#e8b87a", padding: "12px 16px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {archiveDate && <span onClick={() => setArchiveDate(null)} title="세션 목록으로" style={{ cursor: "pointer", fontSize: 16 }}>←</span>}
                <b style={{ fontSize: 15 }}>🗂 대화기록{archiveDate ? ` · ${archiveDate}` : ""}</b>
              </div>
              <span onClick={() => setArchiveOpen(false)} style={{ cursor: "pointer", fontSize: 18 }}>✕</span>
            </div>
            <div style={{ padding: "8px 12px 0" }}>
              <input value={archiveQ} onChange={(e) => setArchiveQ(e.target.value)} placeholder="🔍 과거 대화 검색…" style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px solid #e0d2b8", fontSize: 12.5, background: "#fff", boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: 12 }}>
              {archiveLoading && <div style={{ color: "#9c8a6c", fontSize: 13 }}>불러오는 중…</div>}
              {!archiveLoading && !archiveDate && archiveSessions.length === 0 && (
                <div style={{ color: "#9c8a6c", fontSize: 13, lineHeight: 1.7 }}>{archiveQ.trim() ? "검색 결과 없음" : "24시간이 지난 과거 대화가 여기 자동 보관됩니다(읽기전용)."}</div>
              )}
              {!archiveDate && archiveSessions.map((s) => (
                <div key={s.date} onClick={() => setArchiveDate(s.date)} style={{ padding: "10px 12px", marginBottom: 6, borderRadius: 10, background: "#fff", border: "1px solid #e6d8bf", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <b style={{ fontSize: 13.5, color: "#2b2018" }}>{s.date}</b>
                    <span style={{ fontSize: 11.5, color: "#a89878" }}>{s.count}건</span>
                  </div>
                  {s.title && <div style={{ fontSize: 12.5, color: "#8a7a5c", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>}
                </div>
              ))}
              {archiveDate && !archiveLoading && archiveMsgs.length === 0 && <div style={{ color: "#9c8a6c", fontSize: 13 }}>{archiveQ.trim() ? "검색 결과 없음" : "기록 없음"}</div>}
              {archiveDate && archiveMsgs.map((m, i) => (
                <div key={i} style={{ margin: "10px 0" }}>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ maxWidth: "88%", padding: "9px 12px", borderRadius: 13, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#c98a3c", color: "#fff" }}>{m.question}</div>
                  </div>
                  {m.answer && (
                    <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 4 }}>
                      <div className="ex" style={{ maxWidth: "88%", padding: "9px 12px", borderRadius: 13, fontSize: 14, lineHeight: 1.6, background: "#fff", color: "#2b2018", border: "1px solid #e6d8bf" }}><div dangerouslySetInnerHTML={{ __html: md2html(m.answer) }} /></div>
                    </div>
                  )}
                  {m.t && <div style={{ fontSize: 10.5, color: "#a89878", textAlign: "right", margin: "2px 4px 0" }}>{m.t}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
