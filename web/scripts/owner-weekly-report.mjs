// ☕ 사장님 주간 당직 보고 — v3 카드형 자동화 (CEO 확정 2026-09-07)
//   전부 결정론 계산(LLM 0원)·로컬 실행(서버비 0)·Resend 발송.
//   대상: active 구독 카페. 구독 0이어도 OWNER_REPORT_PREVIEW(카페id)로 CEO 미리보기 발송(품질 상시 검수).
//   사용: node --import tsx scripts/owner-weekly-report.mjs [cafeId]  # id 주면 그 카페 1곳을 CEO에게
import { readFileSync } from "node:fs";
for (const l of readFileSync("./.env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const RESEND = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>";
const AXIS_KO = { mood: "감성", space: "공간", pet: "반려견", dessert: "디저트", bakery: "베이커리", quiet: "조용함", work: "카공", roast: "로스터리", view: "뷰", brunch: "브런치", terrace: "테라스" };

// ── 차트: 카드 전폭을 채운다(CEO 지시 "만들다 만 것처럼 하지 말 것") ──
function momBars(rows) { // rows: [{ym, n}] 최근 7개월
  const max = Math.max(...rows.map(r => r.n), 1);
  const peak = rows.reduce((a, b) => (b.n > a.n ? b : a));
  const tds = rows.map(r => {
    const h = Math.max(8, Math.round(88 * r.n / max));
    const col = r === peak ? "#c0392b" : "#d98e73";
    return `<td style="width:${(100 / rows.length).toFixed(2)}%;vertical-align:bottom;text-align:center;padding:0 4px">
      <div style="font-size:13px;font-weight:800;color:${r === peak ? "#c0392b" : "#6a5842"}">${r.n}</div>
      <div style="height:${h}px;background:${col};border-radius:5px 5px 0 0;margin-top:3px"></div>
      <div style="font-size:11px;color:#9c8a6c;margin-top:4px;border-top:2px solid #e5d8c2;padding-top:3px">${r.ym.slice(5)}월</div></td>`;
  }).join("");
  return `<table style="border-collapse:collapse;width:100%;margin:10px 0 2px"><tr>${tds}</tr></table>`;
}
function hbar(label, val, maxv, color, note = "") {
  const pct = Math.max(4, Math.round(100 * val / maxv));
  return `<div style="margin:10px 0">
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px"><b>${label}</b><span style="color:#8a7256;font-size:12px">${note}</span></div>
    <div style="background:#f0e6d2;border-radius:8px;height:20px;width:100%"><div style="width:${pct}%;height:20px;background:${color};border-radius:8px;color:#fff;font-size:12px;font-weight:800;line-height:20px;padding-left:8px;box-sizing:border-box">${val}</div></div></div>`;
}
const card = (bd, hb, icon, title, body) => `<div style="border:2px solid ${bd};border-radius:14px;margin:14px 0;overflow:hidden"><div style="background:${hb};padding:11px 16px;font-size:16px;font-weight:800">${icon} ${title}</div><div style="padding:12px 16px 14px">${body}</div></div>`;
const action = (t) => `<div style="background:#3d2b1f;color:#f5ead8;border-radius:10px;padding:11px 14px;font-size:13.5px;font-weight:700;margin-top:10px">✅ 이번 주 할 일 — ${t}</div>`;
const note = (t) => `<p style="font-size:12.5px;color:#8a7256;margin:8px 0 0">${t}</p>`;

async function buildReport(cafeId) {
  const [c] = await sql`SELECT id, name, area, dong, synth_grade, synth_count, area_rank, area_total, visitor_trip, char_scores FROM cafes WHERE id=${cafeId} AND published`;
  if (!c) return null;
  // ① 모멘텀(최근 7개월)
  const months = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); months.push(`${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`); }
  const mrows = await sql`SELECT substring(rd.d from 1 for 7) ym, count(*)::int n FROM cafes c2, jsonb_array_elements_text(c2.review_dates) rd(d) WHERE c2.id=${cafeId} GROUP BY 1`;
  const mm = months.map(ym => ({ ym, n: Number(mrows.find(r => r.ym === ym)?.n ?? 0) }));
  const peakIdx = mm.reduce((a, b, i) => (mm[i].n > mm[a].n ? i : a), 0);
  const recent2 = mm.slice(-2).reduce((s, r) => s + r.n, 0);
  const momentum = mm[peakIdx].n >= 5 && peakIdx < mm.length - 1 && recent2 < mm[peakIdx].n / 2 ? "drop" : recent2 > mm.slice(0, -2).reduce((s, r) => s + r.n, 0) / 3 ? "up" : "flat";
  // ② 시장 지도(같은 동, 후기 30+)
  const comp = await sql`SELECT name, char_scores FROM cafes WHERE published AND dong=${c.dong} AND id<>${cafeId} AND synth_count>=30 ORDER BY synth_count DESC LIMIT 3`;
  const myAxes = Object.entries(c.char_scores || {}).filter(([k, v]) => AXIS_KO[k] && Number(v) > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const myTop = myAxes[0];
  let rival = null;
  if (myTop) for (const r of comp) { const v = Number((r.char_scores || {})[myTop[0]] ?? 0); if (!rival || v > rival.v) rival = { name: r.name, v }; }
  // ③ 여행객 vs 지역 평균
  const [avg] = await sql`SELECT ROUND(AVG(visitor_trip)::numeric*100,1)::float t FROM cafes WHERE area=${c.area} AND published AND visitor_n>=20`;
  const myTrip = Math.round((c.visitor_trip || 0) * 1000) / 10;
  // ④ 감시(7일)
  const [wk] = await sql`SELECT count(*)::int n FROM cafes c2, jsonb_array_elements_text(c2.review_dates) rd(d) WHERE c2.id=${cafeId} AND rd.d >= to_char(now() - interval '7 days', 'YYYY.MM.DD')`;

  const cards = [];
  if (momentum === "drop") cards.push(card("#c0392b", "#fdecea", "⚡", "상승 동력이 꺾이는 신호가 잡혔습니다",
    `<div style="font-size:14px"><b>월별 새 후기 유입</b> — ${mm[peakIdx].ym.slice(5)}월 피크 이후 하락:</div>` + momBars(mm) +
    note(`피크(${mm[peakIdx].n}건) 대비 최근 두 달 합계가 ${recent2}건입니다. 바이럴이 식기 전 재점화가 가장 싼 마케팅입니다 — 피크 시기 후기들의 공통 소재를 다시 밀어주세요.`) +
    action("피크 시기 후기의 공통 소재로 짧은 SNS 콘텐츠 1개(검증된 소재 재점화)")));
  else cards.push(card(momentum === "up" ? "#3f7a4f" : "#b06a1e", momentum === "up" ? "#eef7ee" : "#faf3e3", momentum === "up" ? "📈" : "📊", momentum === "up" ? "후기 유입이 늘고 있습니다" : "후기 유입 흐름",
    momBars(mm) + note(momentum === "up" ? "상승 흐름입니다 — 지금 들어오는 손님의 후기 소재가 다음 성장의 씨앗입니다." : "완만한 흐름입니다. 새 소재(신메뉴·공간 변화) 노출이 유입 곡선을 깨웁니다.")));
  if (myTop) {
    const ratio = rival && rival.v > 0 ? (Number(myTop[1]) / rival.v).toFixed(1) : null;
    cards.push(card("#b06a1e", "#faf3e3", "🗺️", ratio && Number(ratio) >= 1.5 ? `'${AXIS_KO[myTop[0]]}' 시장은 사장님이 지배 중입니다` : `우리 동네 '${AXIS_KO[myTop[0]]}' 시장 구도`,
      hbar(`${c.name} — ${AXIS_KO[myTop[0]]} 지수`, Number(myTop[1]), Math.max(Number(myTop[1]), rival?.v || 1) * 1.05, "#b06a1e", "동네 1위") +
      (rival ? hbar(`${rival.name} (동일 시장 최접근 경쟁)`, rival.v, Math.max(Number(myTop[1]), rival.v) * 1.05, "#cdb894", ratio ? `${ratio}배 격차` : "") : "") +
      note(`손님 후기 언급량으로 계산한 실제 시장 지도입니다. 사장님의 검증된 강점 축: ${myAxes.map(([k, v]) => `${AXIS_KO[k]}(${v})`).join(" · ")}.`) +
      action(`강점 축(${myAxes.map(([k]) => AXIS_KO[k]).slice(0, 2).join("·")})을 홍보 전면에 — 이미 검증된 매력입니다`)));
  }
  if (avg?.t != null) {
    const gap = myTrip < avg.t - 1 ? "below" : myTrip > avg.t + 1 ? "above" : "avg";
    cards.push(card("#4a6fa5", "#edf2fa", "🧳", gap === "below" ? "여행객 손님 — 저평가된 성장 여백" : gap === "above" ? "여행객 손님을 평균 이상으로 잡고 있습니다" : "여행객 손님 비중 — 지역 평균 수준",
      hbar(`${c.name}`, myTrip, Math.max(myTrip, avg.t) * 1.3 || 1, gap === "below" ? "#c0392b" : "#4a6fa5", "%") +
      hbar(`${c.area} 평균`, avg.t, Math.max(myTrip, avg.t) * 1.3 || 1, "#cdb894", "%") +
      note(gap === "below" ? "매력 대비 관광 문맥 노출이 비어 있다는 신호입니다 — 나들이·코스 문맥의 사진과 글이 손대지 않은 성장 여백입니다." : gap === "above" ? "관광 수요를 잘 잡고 있습니다 — 주말 피크 운영(좌석 회전·시그니처 재고)이 매출 레버입니다." : "평균 수준입니다 — 나들이 문맥 노출을 늘리면 위로 뚫을 여지가 있습니다.") +
      (gap === "below" ? action("대표 사진을 나들이 문맥(외관·풍경·동반 장면)으로 교체") : "")));
  }
  const guard = `<div style="background:#f2f7f2;border:1px solid #cfe3cf;border-radius:10px;padding:10px 14px;font-size:12.5px;color:#3f7a4f;margin:14px 0">🔔 <b>당직 감시</b>: 이번 주 새 후기 <b>${wk.n}건</b> · 평판 이상/정보 오류 없음 ✅ · ${c.area} <b>${c.area_rank ?? "-"}위</b>/${c.area_total ?? "-"} · ${c.synth_grade} 등급(검증 후기 ${c.synth_count}건)</div>`;
  const oneLiner = momentum === "drop" ? `피크 대비 후기 유입이 절반 아래로 — 검증된 소재 재점화가 최우선입니다.` : myTop ? `'${AXIS_KO[myTop[0]]}' 시장을 지키면서 유입 곡선을 깨우는 한 주로.` : `평판·정보 이상 없음 — 안정 운영 구간입니다.`;
  const html = `<div style="font-family:system-ui,'Apple SD Gothic Neo',sans-serif;max-width:640px;color:#2b2018;line-height:1.55">
<div style="background:#3d2b1f;color:#f5ead8;padding:18px 20px;border-radius:14px">
<div style="font-size:11px;opacity:.75">동네 커피 노트 · 사장님 전용 · ${new Date().getMonth() + 1}월 ${Math.ceil(new Date().getDate() / 7)}주차</div>
<h2 style="margin:4px 0 6px">☕ ${c.name} 주간 당직 보고</h2>
<div style="background:#5a4232;border-radius:8px;padding:9px 12px;font-size:13.5px">📌 <b>이번 주 결론 한 줄</b>: ${oneLiner}</div></div>
${cards.join("")}${guard}
<p style="font-size:10.5px;color:#a99">분석: 검증 후기 ${c.synth_count}건의 시계열·언급 축·방문객 구성 × ${c.dong ?? c.area} 경쟁 카페 동일 지표 교차 (광고·가짜 후기 제외) · 다음 보고: 월요일 아침</p></div>`;
  return { html, name: c.name };
}

const argId = Number(process.argv[2] || 0);
const targets = [];
if (argId) targets.push({ cafe_id: argId, email: "kyh30628@gmail.com", preview: true });
else {
  const subs = await sql`SELECT s.cafe_id, COALESCE(sr.email, 'kyh30628@gmail.com') email FROM subscriptions s LEFT JOIN sub_requests sr ON sr.cafe_id = s.cafe_id WHERE s.status='active'`.catch(() => []);
  for (const s of subs) targets.push({ cafe_id: s.cafe_id, email: s.email, preview: false });
  const pv = Number(process.env.OWNER_REPORT_PREVIEW || 8118); // 구독 0이어도 CEO 미리보기 1부(품질 상시 검수)
  if (!targets.length && pv) targets.push({ cafe_id: pv, email: "kyh30628@gmail.com", preview: true });
}
let sent = 0;
for (const t of targets) {
  const r = await buildReport(t.cafe_id);
  if (!r) continue;
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [t.email], subject: `${t.preview ? "[미리보기] " : ""}☕ ${r.name} 주간 당직 보고`, html: r.html }) });
  sent++;
}
console.log(`발송 ${sent}건 (대상 ${targets.length})`);
try { const { recordRun } = await import("../lib/agentLog.ts"); await recordRun("owner-weekly", true, `주간 당직 보고 발송 ${sent}건`, sent); } catch {}
