import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const title = "[개발] 발굴 좌표전용 dedup 과잉차단 — lib/discover.ts:456 이름검증 없이 44~55m 근접만으로 신규카페 skip";
const detail = `coordination#334(성장본부 협업요청) 조사 결과. 08-24 발굴타겟팅 6개 지역(과천·광명·군포·오산·동대문구·양천구) 표본: 발견 246~354건 대비 삽입 0~1건(전환율 0~0.4%). 원인 조사(Explore agent, 읽기전용): web/lib/discover.ts:456 dedup 로직이 "byName 정확일치" 외에 "좌표 근접(|lat차|<0.0005 && |lng차|<0.0005, 약 위도55m×경도44m)"만으로 이름 유사도 검증 없이 기존 카페와 동일 판정→insert skip. 검증: 기존 DB 카페 최근접거리 실측(강남·마포·성동·송파 등 밀집구 포함 1900여곳) 중앙값 75~94m·하위10%조차 52~61m로 dedup박스 경계(44~55m)에 바짝 붙어있는데도, 그 박스 안에 실제 공존하는 서로 다른 카페 쌍이 조사 6개 지역+4개 밀집구 전부에서 0건 — 상권 밀도상 비정상적으로 낮아, 이 좌표전용 dedup이 장기간 "같은 건물/인접 신규카페"를 이름 무관하게 차단해온 정황. 코드 456행 주변 주석(461-463)이 이미 인스타그램 백필에서 "브랜드 토큰 겹침 검증 없이는 채택 안 함"(decisions#780 재발방지)을 명시했음에도, 정작 삽입 게이트 자체엔 이름검증이 없는 비일관.
권장조치: (1) 456행 좌표매칭 조건에 이름 부분일치/브랜드토큰겹침 검증 추가 — 좌표만 근접하고 이름이 무관하면 skip 대신 insert 허용. (2) discoverRegion 반환값(found/inserted/skipped/oob)을 discovery_state에 영구 컬럼으로 저장해 재현가능한 진단 확보. (3) 6개 지역 한정 A/B 재실행으로 inserted 반등 검증.
기조실장 의견: 승인 권고. 근거: (a)수치가 6개 지역 전부 균일하게 0~0.4%로 저조하고 dedup박스 내 카페공존 0건이라는 이상패턴은 "타겟 반복→로컬풀 소진" 단일가설로 설명 안 됨(과천 등 인구희소 지역서만 소진 가능하나 동대문·양천 등 고밀도 지역도 동일 저조). (b)코드 변경 범위가 dedup 조건 1곳 한정으로 작고, 이미 동일 유형 리스크(좌표오매칭)에 대한 완화 패턴(브랜드토큰겹침)이 인접 코드(instagram enrichment)에 이미 존재해 재사용 가능 — 구현난이도 낮음. (c)영향: 신규 발굴 전환율 회복은 발굴풀 확대 없이 즉시 파이프라인 처리량 개선 효과. 리스크: 이름검증 기준을 너무 느슨히 하면 반대로 중복삽입(같은 카페 재등록) 위험 — dev_task 구현 시 반드시 브랜드토큰 부분일치 임계값을 quality-redteam 기준과 정합시키고, 배포 후 1주 모니터링(신규 지역 중복률) 권고.`;

const rows = await sql`
  INSERT INTO decisions (title, detail, team, severity, tier, action_type, action_params, status, recommendation)
  VALUES (${title}, ${detail}, '개발팀(성장본부 협업)', 'MED', 'L3', 'dev_task', ${JSON.stringify({file: "web/lib/discover.ts", line: 456, coordination_id: 334})}, 'pending', '승인 권고 — dedup 조건 1곳 한정 수정, 낮은 리스크·높은 기대효과. 배포 후 1주 신규지역 중복률 모니터링 조건부')
  RETURNING id, title, tier, status
`;
console.log(JSON.stringify(rows, null, 1));
