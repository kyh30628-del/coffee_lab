#!/usr/bin/env node
// ⚠️ 위반 픽스처 — "이건 알고 가세요"(주의점) 오탐 방지. 배포 전 필수 통과.
//   실행: node --import tsx scripts/fixtures-cautions.mjs
//   여기 있는 문장들은 전부 **실제로 잡혔거나 잡힐 뻔한 함정**이다. 규칙을 고칠 때 이 파일을 먼저 돌린다.
const { extractCautions } = await import("../lib/cafeProfile.ts");
const pad = (n) => Array.from({ length: n }, () => "무난했어요.");
// extractCautions는 표본 6건 미만이면 판단하지 않으므로, 대상 문장 2건 + 채움 문장으로 표본을 만든다.
const run = (sent) => extractCautions([sent, sent, ...pad(6)]).map((c) => c.label);

const CASES = [
  // [문장, 기대 라벨(없으면 [])]
  ["주차 걱정 없이 편하게 다녀왔어요", []],
  ["주차가 불편하지 않았어요", []],
  ["웨이팅 없어서 바로 앉았어요", []],
  ["콘센트 걱정 없어요", []],
  ["아쉬움 없이 다 좋았습니다", []],
  ["시끄럽지 않아서 집중하기 좋았어요", []],
  ["자리가 부족하지 않아 여유로웠어요", []],
  ["주차장이 넓어서 편했어요", []],
  // 2026-09-14 실측에서 잡힌 오탐 2종 — 여기 박아둔다.
  ["여차하여 자리가 없으면 조별로 나누어 대화해야 해요", []],   // 가정문(실측: 테라로사 포스코센터점)
  ["사람이 너무 많거나 시끄러운 곳을 피해 조용한 데를 찾았어요", []], // 회피 서술(실측: 데바스테이트)
  // ── 진짜 주의점(반드시 잡혀야 함) ──
  ["주차가 불편해서 근처에 대고 걸어왔어요", ["주차 어려움"]],
  ["주차장이 좁아서 대기가 있었어요", ["주차 어려움"]],
  ["자리가 없어서 30분 기다렸습니다", ["좌석 부족"]],
  ["웨이팅이 길어서 한참 기다렸어요", ["웨이팅 있음"]],
  ["콘센트가 없어서 노트북 작업은 힘들어요", ["콘센트 부족"]],
  ["사람이 많아 시끄러웠어요", ["소음 있음"]],
  ["내부가 좁아서 답답했어요", ["공간 협소"]],
  ["계단이 많아서 유모차는 힘들어요", ["계단 있음"]],
  ["가격이 비싼 편이에요", ["가격대 높음"]],
  ["현금만 받아서 당황했어요", ["결제 제한"]],
  ["화장실이 밖에 있어요", ["화장실 외부"]],
];
let pass = 0, fail = [];
for (const [sent, want] of CASES) {
  const got = run(sent);
  const ok = want.length === 0 ? got.length === 0 : want.every((w) => got.includes(w));
  if (ok) pass++; else fail.push(`  ✗ "${sent}"\n      기대 ${JSON.stringify(want)} · 실제 ${JSON.stringify(got)}`);
}
console.log(`주의점 픽스처: ${pass}/${CASES.length} 통과`);
if (fail.length) { console.log(fail.join("\n")); process.exit(1); }
console.log("✅ 오탐 함정 8종 + 정탐 11종 모두 통과");
