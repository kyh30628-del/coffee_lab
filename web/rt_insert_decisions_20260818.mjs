import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const rows = [
  {
    title: "[레드팀 이월] id18295 어썸블리스(성동구 성수동1가) — 채용공고 스팸 잔존",
    detail: "12:19 사이클에서 proposals 파일로만 상신되고 decisions row 누락됨(자체 발견·정정). synth_reviews[5] '월급240만원 [어썸블리스] 마카롱,케이크 주문제작 (~채용시) 제과제빵사...' (cafe.naver.com/foodnjob/3078) — 카페 방문 후기 아닌 채용 게시글. synth_count=13(소량), coord#320 핸드오프 3건 중 유일 생존.",
    team: "품질본부(레드팀)",
    severity: "warn",
    action_type: "requeue_resynth",
    action_params: { reason: "채용공고 스팸 리뷰 혼입 — 재합성으로 배제 재선별", cafe_id: 18295, cafe_name: "어썸블리스" },
    tier: "L2",
    recommendation: "재합성 큐 등록"
  },
  {
    title: "[레드팀 신규] id1746 맨홀커피(영등포구) — synth_identity '루프탑' 허위(주소=지하1층)",
    detail: "address='서울특별시 영등포구 영신로 247 B동상가 지하1층', synth_identity='...루프탑이 있어 사진 찍기 좋은 분위기'. synth_reviews 5건 전수 확인 결과 루프탑/옥상 언급 0건(북카페·지하 감성 인테리어 후기뿐). 결 왜곡 — 재합성으로 근거없는 문구 재생성 필요.",
    team: "품질본부(레드팀)",
    severity: "warn",
    action_type: "requeue_resynth",
    action_params: { reason: "synth_identity 루프탑 허위 기재(지하1층 매장) — 재합성", cafe_id: 1746, cafe_name: "맨홀커피" },
    tier: "L2",
    recommendation: "재합성 큐 등록"
  },
  {
    title: "[레드팀 신규] id5557 로드트립(관악구 신림동) — synth_identity '루프탑' 허위(주소=지하1층 및 지상1층)",
    detail: "address='서울특별시 관악구 관천로12길 7 지하1층 및 지상1층'. synth_reviews 6건 전수 확인 루프탑/옥상 언급 0건(미국풍 인테리어 후기뿐).",
    team: "품질본부(레드팀)",
    severity: "warn",
    action_type: "requeue_resynth",
    action_params: { reason: "synth_identity 루프탑 허위 기재 — 재합성", cafe_id: 5557, cafe_name: "로드트립" },
    tier: "L2",
    recommendation: "재합성 큐 등록"
  },
  {
    title: "[레드팀 신규] id10537 블루레인라운지(종로구 이화동) — synth_identity '루프탑' 허위(주소=지하1층)",
    detail: "address='서울특별시 종로구 율곡로 228 지하1층'. synth_reviews 6건 중 1건이 명시적으로 '지하 블루레인라운지'라 서술. 루프탑/옥상 언급 0건.",
    team: "품질본부(레드팀)",
    severity: "warn",
    action_type: "requeue_resynth",
    action_params: { reason: "synth_identity 루프탑 허위 기재(지하 명시 리뷰 존재) — 재합성", cafe_id: 10537, cafe_name: "블루레인라운지" },
    tier: "L2",
    recommendation: "재합성 큐 등록"
  },
  {
    title: "[레드팀 신규] id14321 슬로우그라운드(의왕시) — synth_identity '루프탑' 허위(주소=지하1층 썬큰광장)",
    detail: "address='경기도 의왕시 백운로 588 지하 1층(썬큰광장)'. synth_reviews 6건 전수 확인 루프탑/옥상 언급 0건(가구쇼룸·베이커리·전시 후기뿐).",
    team: "품질본부(레드팀)",
    severity: "warn",
    action_type: "requeue_resynth",
    action_params: { reason: "synth_identity 루프탑 허위 기재 — 재합성", cafe_id: 14321, cafe_name: "슬로우그라운드" },
    tier: "L2",
    recommendation: "재합성 큐 등록"
  },
  {
    title: "[레드팀 신규] id8739 목수의딸카페(마포구 동교동) — synth_identity '루프탑' 허위(주소=지하1층)",
    detail: "address='서울특별시 마포구 와우산로38길 2 지하1층(공원길)'. synth_reviews 6건 전수 확인 루프탑/옥상 언급 0건(경의선숲길·테라스·애견동반 후기뿐, 테라스≠루프탑).",
    team: "품질본부(레드팀)",
    severity: "warn",
    action_type: "requeue_resynth",
    action_params: { reason: "synth_identity 루프탑 허위 기재 — 재합성", cafe_id: 8739, cafe_name: "목수의딸카페" },
    tier: "L2",
    recommendation: "재합성 큐 등록"
  }
];

for (const r of rows) {
  const res = await sql`
    INSERT INTO decisions (title, detail, team, severity, action_type, action_params, status, tier, recommendation)
    VALUES (${r.title}, ${r.detail}, ${r.team}, ${r.severity}, ${r.action_type}, ${JSON.stringify(r.action_params)}, 'pending', ${r.tier}, ${r.recommendation})
    RETURNING id, title
  `;
  console.log('inserted', res[0].id, res[0].title);
}
