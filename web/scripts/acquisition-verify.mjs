// 🔍 매각 자료 검산 관문 — docs/ACQUISITION.md의 숫자가 **지금 실측과 같은지** 기계가 대조한다.
//   왜: 사람이 옮기면 어긋난다(실제로 한 번 어긋났다 — 후기 1,732,645 vs 1,950,728).
//   자료의 신뢰는 "다시 뽑을 수 있는가"이므로, 어긋나면 배포가 아니라 **자료를 고쳐야 한다**.
//   💰 비용: 집계 쿼리 4개 + 파일 읽기. 로컬 실행.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
const doc = readFileSync("../docs/ACQUISITION.md", "utf8");
const m = JSON.parse(execSync("node --import tsx scripts/acquisition-metrics.mjs --json", { encoding: "utf8", maxBuffer: 1 << 22 }));
const fmt = (v) => Number(v).toLocaleString();
// 문서에 **반드시 그 값으로** 적혀 있어야 하는 항목(정의가 흔들리지 않는 것만 고른다)
const MUST = [
  ["공개 카페", m.db.published], ["검증 등급", m.db.gradeverified ?? m.db.gradeVerified],
  ["참고 등급", m.db.gradereference ?? m.db.gradeReference], ["시군구", m.db.areas], ["동", m.db.dongs],
  ["원본 후기", m.db.rawreviews ?? m.db.rawReviews], ["화면 후기", m.db.shownreviews ?? m.db.shownReviews],
  ["격리", m.db.quarantined], ["원본 파기", m.db.publishedrawpurged ?? m.db.publishedRawPurged],
  ["판정 함수", m.code.judgeFunctions], ["규칙 상수", m.code.ruleConstants], ["거절 경로", m.code.rejectPaths],
  ["결재 참조", m.code.decisions], ["인용 카페", m.code.citedCafeIds], ["불변식 테스트", m.code.moatTests],
  ["러너", m.code.runners], ["launchd 템플릿", m.code.launchdTemplates],
  ["유료 결제", m.biz.payments], ["사장님 퍼널", m.biz.ownerfunnel ?? m.biz.ownerFunnel],
];
let bad = 0;
for (const [label, v] of MUST) {
  const s = fmt(v);
  if (!doc.includes(s)) { console.log(`🔴 ${label.padEnd(16)} 실측 ${s} 가 자료에 없다`); bad++; }
  else console.log(`✅ ${label.padEnd(16)} ${s}`);
}
console.log(bad ? `\n🔴 자료와 실측이 ${bad}건 어긋난다 — docs/ACQUISITION.md를 고칠 것(숫자는 acquisition-metrics 출력만 옮긴다).`
                : `\n✅ 자료 ${MUST.length}개 항목이 실측과 일치`);
process.exitCode = bad ? 1 : 0;
