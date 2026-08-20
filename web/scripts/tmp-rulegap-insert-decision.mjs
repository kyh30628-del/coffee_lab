import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const title = "[룰갭 신규] 카페+펜션/글램핑 겸업 — 숙박류 게이트가 '호텔' 명칭에만 한정돼 우회 (id18246 그라운드휴 등)";
const detail = "자세한 내용: agent-reports/rulegap-proposals-20260820-1214.md 제안1. 기존 P50/P58 HOTEL_LODGING_SIGNAL 게이트(lib/reviewQuality.ts:1352-1365)는 카페명에 '호텔' 또는 HOTEL_BRANDS 토큰 포함시에만 발동. 카페+펜션/글램핑/연수원 겸업 업체는 이름에 '호텔'이 없어 게이트를 완전히 우회, 숙박 체험 후기가 카페 실질맥락 없이 표시(참고~검증 등급)까지 통과. 확정 2곳: id18246 그라운드휴(가평군, 표시 6건 전부 워크숍/연수원/리조트 후기, 카페 맥락 0건), id3069 카페_백란_펜션(강북구, 47건 중 5건 펜션 겸업 맥락). 경계선(보류) 4곳: id7976 케이즈카페(검증등급, 비중 낮음), id11011·id13226·id16638(글램핑/캠핑 언급 애매). 제안 규칙: LODGING_NAMED = HOTEL_NAMED || /펜션|글램핑|리조트|연수원|풀빌라|콘도/.test(name); LODGING_SIGNAL 정규식(숙박·투숙·조식뷔페·수영장·1박·바베큐무한리필·단체워크숍 등) 매치 + !CAFE_CONTEXT 시 borderline reject(LLM 재판정, 기존 P50/P58과 동일 안전장치). 일반 카페(이름에 펜션/글램핑 등 없음)는 전혀 영향받지 않음.";

const rows = await sql`
  INSERT INTO decisions (title, detail, team, severity, tier, action_type, action_params, recommendation, status)
  VALUES (
    ${title.slice(0,110)},
    ${detail.slice(0,900)},
    '품질본부 룰갭발굴팀', 'LOW', 'L3', 'dev_task',
    ${JSON.stringify({ file: "lib/reviewQuality.ts", cafes: [18246, 3069], borderline_watch: [7976, 11011, 13226, 16638], pattern: "LODGING_NAMED_GATE" })}::jsonb,
    'lib/reviewQuality.ts 기존 HOTEL_LODGING_SIGNAL 게이트 발동조건 확장(LODGING_NAMED). 승인 시 dev-claim 파이프라인 자동 픽업하도록 action_type=dev_task로 등록.',
    'pending'
  )
  RETURNING id, title, status, tier, action_type
`;
console.log(JSON.stringify(rows, null, 1));
