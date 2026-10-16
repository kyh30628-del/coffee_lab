"use client";
import { useState } from "react";
import Link from "next/link";

// 📍 "내 위치에서 가까운 카페" — SEO 페이지(지역·상세)용 위치 진입점(2026-10-16, CEO 지시).
//
// 왜 여기에 있나(실측 근거):
//   위치 동의 요청이 홈·지도에만 있었다. 그런데 최근 14일 방문자 4,462명 중 **89.4%가 SEO 페이지만 보고 이탈**하고
//   홈·지도까지 오는 사람은 10.5%뿐이다. 그래서 동의자 155명 중 145명(94%)이 수도권에 쏠렸다
//   (공개 카페는 수도권 49%·지방 51%, 사람 조회는 66%·34%인데도). 지방 사람은 **물어본 적이 없었다.**
//   → 네이버에서 들어온 그 화면에서 바로 물어보고, 그 자리에서 결과를 보여준다(이동 없이).
//
// 설계 원칙:
//   · 자동으로 묻지 않는다 — 누를 때만. (홈과 동일 규칙: 사용자가 '내 위치'를 눌렀을 때만 동의→수집)
//   · 결과를 같은 화면에 펼친다 — 이탈 지점에서 한 번 더 볼 거리를 준다.
//   · 거부/실패해도 화면이 깨지지 않는다(안내만).
const CONSENT_VERSION = "v1";

type NearCafe = { id: number; name: string; area: string; dong: string | null; synth_grade: string | null; synth_count: number | null; synth_identity: string | null; km: number };

export default function NearMeButton({ className = "" }: { className?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [cafes, setCafes] = useState<NearCafe[]>([]);
  const [region, setRegion] = useState<string | null>(null);

  const run = () => {
    if (!navigator.geolocation) { setState("error"); setMsg("이 브라우저는 위치를 지원하지 않아요"); return; }
    setState("loading"); setMsg("위치 확인 중…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let anonId = "";
        try { anonId = localStorage.getItem("dcn_anon") || ""; } catch {}
        try {
          const r = await fetch(`/api/near?lat=${lat}&lng=${lng}`).then((x) => x.json());
          const list: NearCafe[] = r?.cafes ?? [];
          setCafes(list); setRegion(r?.region ?? null);
          // 동의 기록 — 좌표는 서버에서 약 500m 격자로 스냅해 저장(정밀 위치 비보관)
          if (anonId) {
            fetch("/api/consent", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ anonId, agreed: true, version: CONSENT_VERSION, region: r?.region ?? null, lat, lng }),
            }).catch(() => {});
          }
          setState("done");
          setMsg(list.length ? "" : "가까운 곳에 아직 등록된 카페가 없어요");
        } catch { setState("error"); setMsg("가까운 카페를 불러오지 못했어요"); }
      },
      (err) => { setState("error"); setMsg(err.code === 1 ? "위치 권한이 거부됐어요 (브라우저 설정에서 허용할 수 있어요)" : "위치를 가져오지 못했어요"); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
    );
  };

  return (
    <div className={className}>
      {state !== "done" && (
        <button
          onClick={run}
          disabled={state === "loading"}
          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-[14px] font-bold text-stone-800 hover:bg-stone-50 disabled:opacity-60"
        >
          📍 {state === "loading" ? "위치 확인 중…" : "내 위치에서 가까운 카페 보기"}
        </button>
      )}
      {msg && <p className="mt-2 text-center text-[12px] text-stone-600">{msg}</p>}
      {state === "done" && cafes.length > 0 && (
        <div className="rounded-xl border border-stone-300 bg-white p-3">
          <p className="mb-2 text-[13px] font-bold text-stone-800">📍 {region ?? "내 위치"} 근처</p>
          <ul className="space-y-1.5">
            {cafes.map((c) => (
              <li key={c.id}>
                <Link href={`/c/${c.id}`} className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50">
                  <span className="truncate text-[13.5px] font-semibold text-stone-800">{c.name}</span>
                  <span className="shrink-0 text-[11.5px] text-stone-600">
                    {c.km < 1 ? `${Math.round(c.km * 1000)}m` : `${c.km}km`}
                    {c.synth_grade === "검증" ? " · 검증" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
