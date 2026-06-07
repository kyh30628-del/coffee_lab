// raw 캐시 예열: raw 없는 카페만 수집해 raw_reviews를 채운다(네이버 쿼터 효율).
// 한 번 채우면 이후 재합성·판정은 재호출 없이 재사용. 쿼터 소진 시 자동 중단(보존).
// 매일 자정 직후 실행 → 네이버 일일 쿼터 안에서 점진적으로 전 카페 raw 확보.
// 환경변수: APP_URL, ADMIN_PASSWORD (scripts/.judge.env 재사용)

const APP_URL = process.env.APP_URL || "https://coffee-lab-product-builder.vercel.app";
const PW = process.env.ADMIN_PASSWORD || "";
const MAX_BATCHES = Number(process.env.WARMUP_MAX_BATCHES || 60); // 안전 상한(60×50=3000)

async function batch() {
  const r = await fetch(`${APP_URL}/api/cafe-batch-synth`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": PW },
    body: JSON.stringify({ limit: 50, mode: "populate" }),
  });
  if (!r.ok) throw new Error(`batch ${r.status}`);
  return r.json();
}

async function main() {
  if (!PW) { console.error("ADMIN_PASSWORD 미설정"); process.exit(1); }
  let totalDone = 0;
  for (let i = 1; i <= MAX_BATCHES; i++) {
    const d = await batch();
    if (!d.ok) { console.error("batch 실패:", d.error); break; }
    if (d.processed === 0) { console.log(`완료: 더 채울 카페 없음(raw NULL 0).`); break; }
    totalDone += d.success;
    console.log(`[batch ${i}] 처리 ${d.processed} · 신규수집 ${d.success} · 보존(쿼터) ${d.skipped} · raw남음 ${d.remainingNull}`);
    // 전부 보존(=네이버 쿼터 소진)이면 오늘은 중단 — 내일 자정에 이어서
    if (d.skipped >= d.processed && d.success === 0) { console.log("네이버 쿼터 소진 → 오늘 예열 중단(내일 이어서)."); break; }
    if (d.remainingNull === 0) { console.log("raw 캐시 100% 완료."); break; }
    await new Promise((x) => setTimeout(x, 800));
  }
  console.log(`\n예열 종료: 이번 실행 신규수집 ${totalDone}곳.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
