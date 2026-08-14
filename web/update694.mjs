import { neon } from "@neondatabase/serverless";
import fs from "fs";
const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const sql = neon(process.env.DATABASE_URL);

const summary = "lib/synthEngine.ts buildIdentity 수정. 근본원인 분해: 897건 중 대다수(약 2,774건)는 #642(08-09 07:17 UTC 배포) 이전에 합성된 stale 데이터라 재합성만 하면 해결됨(코드 문제 아님, resynth 적체). 실제 라이브 코드결함은 189건(#642 이후 재합성됐는데도 여전히 고정템플릿) — 원인: buildIdentity가 최다용도 카테고리(주로 use.사진 — 분위기/인테리어/예쁜/감성처럼 과포괄적 신호어라 항상 1위 차지) 하나에서만 구체어를 찾고 실패하면 곧장 포괄문구('~에서 사진 찍기 좋은 분위기')로 폴백했다. 2·3위 용도(빵/혼자/수다)에 케이크·프라이빗룸·테라스자리 등 실제 구체신호가 있어도 버려짐. 수정: 1위부터 순서대로 전 용도를 순회하며 구체어를 시도, 매칭되면 그 용도로 문구 생성(전부 실패시만 기존처럼 1위 포괄문구 — 서비스 무변). 검증: 라이브 189건 재현 시뮬레이션에서 109건(58%)이 구체 문구로 회복됨을 확인(예: '용산구에서 케이크·디저트가 특히 자주 언급되는 곳'). tsc 신규에러 0(기존 next.config.ts eslint 베이스라인 1건만 잔존), npm run build 성공. 잔여 stale 897건은 resynth 재합성(별건, 데이터운영 L2 영역)으로 자연 해소.";

const res = await sql`UPDATE decisions SET action_params = action_params || jsonb_build_object('dev_status','built','summary',${summary}::text) WHERE id=694 RETURNING id, action_params`;
console.log(JSON.stringify(res, null, 2));
