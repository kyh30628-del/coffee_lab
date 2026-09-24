#!/usr/bin/env node
// 👤 사장님 본인 글·검색결과 짜깁기 픽스처(2026-09-24) — 정확도 표본(5건+ 구간)에서 실제 노출되던 글 기반.
//   영문 계정명(SWEET_CHOU·BIBBIA CAFE·mimiheon_)은 한글 상호 대조를 빠져나갔다 → 카페 인스타 계정과 대조.
//   실행: node --import tsx scripts/fixtures-selfsource.mjs
const { collectAndSynthesize } = await import("../lib/collectOrchestrator.ts");
const { verifyReview } = await import("../lib/reviewQuality.ts");
const SELF = /사장님·공식 계정 글/;
const run = (name, area, item, handles) => {
  const r = collectAndSynthesize(name, area, [{ source: "blog", texts: [item] }], { address: "", selfHandles: handles });
  const ev = [...(r.allEvidence ?? []), ...(r.evidenceReviews ?? [])];
  const reasons = JSON.stringify(r.quality?.rejectReasons ?? {});
  return { self: SELF.test(reasons), shown: ev.length };
};
// [상호, 지역어, 글, 인스타 핸들, 사장님 글로 걸러져야 하나, 출처]
const CASES = [
  ["스윗슈", ["고양시", "신원동"], { title: "스윗슈의 케이크", text: "스윗슈의 케이크 신원동카페 신원동케이크 신원동디저트 방문해주세요", desc: "스윗슈의 케이크 신원동카페 신원동케이크", link: "https://blog.naver.com/sweetchou/1", source: "SWEET_CHOU" }, ["sweet_chou"], true, "id19483 영문 계정명"],
  ["비비아", ["평택시", "팽성읍"], { title: "비비아 시그니쳐 메뉴", text: "비비아 도넛 쉐이크 라떼 글레이즈 도넛 세트 비비아 카페에 어서오세요", desc: "비비아 도넛 쉐이크", link: "https://blog.naver.com/bibbiacafe/2", source: "BIBBIA CAFE" }, ["bibbia_cafe"], true, "id39418 영문 계정명+cafe"],
  ["미미헌브레드", ["강서구", "방화동"], { title: "강서구케이크맛집 미미헌브레드 무화과", text: "강서구 미미헌브레드에서 케이크를 주문하신다면 꼭 드셔보세요", desc: "미미헌브레드 무화과 케이크", link: "https://blog.naver.com/mimiheon_/3", source: "mimiheon_님의 블로그" }, ["mimiheon.bread"], true, "id5534 블로그 아이디"],
  // ── 보호: 손님 블로그 ──
  ["스윗슈", ["고양시", "신원동"], { title: "[신원동] 스윗슈 생각나서 또 다녀옴", text: "스윗슈 빵집은 왜 다 맛있는지 신원동 또 다녀왔어요", desc: "스윗슈 빵집 또 다녀옴", link: "https://blog.naver.com/starland77/4", source: "별이나라" }, ["sweet_chou"], false, "손님 블로그"],
  ["코코스랩", ["미추홀구", "도화동"], { title: "도화동 코코스랩 카페 내돈내산 후기", text: "도화동 코코스랩 카페 라떼 맛있어요 재방문", desc: "코코스랩 카페 후기", link: "https://blog.naver.com/cafelover/5", source: "cafe lover" }, ["cocoslab_cafe"], false, "블로거명에 cafe(일반어)만 겹침"],
];
let pass = 0; const fail = [];
for (const [name, area, item, handles, want, src] of CASES) {
  const r = run(name, area, item, handles);
  const ok = want ? (r.self || r.shown === 0) : !r.self; // 제외 기대: 노출에서 빠지면 통과(다른 규칙이 먼저 잡아도 됨) · 보호: 사장님 글로 오판하지 않을 것
  if (ok) pass++; else fail.push(`  ✗ ${src}: 기대 ${want ? "노출 제외" : "사장님 글 아님"} · 실제 self=${r.self} shown=${r.shown}`);
}
// 검색결과 짜깁기(규칙 파일)
const SEO = [
  ["☕ 여유로운 시간을 보내기 좋은 곳, 공주 카페다래", "공주 카페 추천이나 탄천면 카페 찾고 있었다면 한 번 방문해보셔도 좋을 것 같아요 출처:google검색", "카페다래", "전화번호-업종편", true],
  ["☕ 카페다래 – 공주 브런치·카페·디저트 전문공간", "공주에서 여유로운 카페 시간을 보내고 싶은 분들에게 추천", "카페다래", "전국 맛집/카페 소개", true],
  ["공주 카페다래 브런치 후기", "구글 지도 보고 찾아갔는데 브런치가 맛있었어요 라떼도 고소", "카페다래", "여행자", false],
];
for (const [title, body, name, srcName, want] of SEO) {
  const r = verifyReview({ title, body, name, srcName, areaTerms: ["공주시"], source: "blog" });
  const hit = r.verdict === "rejected" && /검색결과 짜깁기/.test(r.reasons.join(" "));
  if (hit === want) pass++; else fail.push(`  ✗ 짜깁기(${srcName}): 기대 ${want ? "차단" : "통과"} · 실제 ${hit ? "차단" : "통과"}`);
}
console.log(`사장님 글·짜깁기 픽스처: ${pass}/${CASES.length + SEO.length} 통과`);
if (fail.length) { console.log(fail.join("\n")); process.exit(1); }
console.log("✅ 영문 계정명·블로그 아이디로 사장님 글 제외 · 손님 블로그·일반어 겹침 보호 · 구글검색 짜깁기 차단");
