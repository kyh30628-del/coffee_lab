// 🏛️ 조직도 단일 출처 — /admin/org(운영 관제)와 /admin/lounge(전사 라운지)가 함께 쓴다.
//   ⚠️ 2벌 복사 금지(드리프트 방지 — 잡맵 4번 어긋난 전례). 조직 변경은 여기 한 곳만 고친다.
//   j = agent_runs의 job 키(성과 조인용). api/deploy 등 자체 실행기록이 없으면 j 생략(null).
export type Worker = { k: string; n: string; t: string; j?: string };
export type Team = { n: string; s?: string; w: Worker[] };
export type Division = { n: string; c: string; note?: string; teams: Team[] };
export type Org = { ceo: string; chief: string; secretary: string; divisions: Division[] };

export const ORG: Org = {
  ceo: "CEO (대표이사)",
  chief: "🎩 기획조정실장 (2인자·브레인·종합)",
  secretary: "🗂️ 비서실장 (일정·일지·원칙)",
  // w: 가동 멤버 — 🧠배치(LLM 에이전트)·⚙️상시(결정론 크론)·🌐실시간(API)·🚀배포. 결정론 크론도 팀 소속이다.
  divisions: [
    { n: "🎯 기획조정실 직할", c: "#8a6d3b", note: "기조실장 직속", teams: [
      { n: "자율진단 감사실", s: "전 서비스 자율 헬스 감사 — 결정론이 못 잡는 새 유형 발굴·결재상신, 기조실장이 직접 감시", w: [
        { k: "🧠", n: "자율진단 에이전트(self-audit)", t: "01·08·17시 + 이벤트5분", j: "self-audit-agent" }, { k: "⚙️", n: "cron-selfaudit", t: "6시간마다(결정론)", j: "cron-selfaudit" }, { k: "🌐", n: "audit-watch", t: "5분(이벤트 점화)", j: "audit-watch" }] },
      { n: "개발 실행 유닛", s: "'개발팀'이라는 팀이 아니라 공유 실행 엔진 — 어느 본부도 코드를 안 짜므로, 각 본부가 요청한 코드·데이터 변경을 CEO 승인 후 안전하게(브랜치→검증→배포) 실행. 소유·책임은 요청 본부", w: [
        { k: "🧠", n: "개발 실행 에이전트(dev-agent)", t: "5분(승인건 병렬 구현)", j: "dev-agent" }, { k: "🚀", n: "배포 워커(dev-deploy)", t: "2분(CEO 배포확정건)", j: "dev-deploy" }] }] },
    { n: "🟦 품질본부", c: "#3a6ea5", teams: [
      { n: "데이터정합성팀", s: "수도권·area·중복·필드 무결성 스캔·자동치유", w: [
        { k: "🧠", n: "정합성 에이전트", t: "매일", j: "integrity-agent" }, { k: "⚙️", n: "cron-sentinel", t: "매일 00시", j: "cron-sentinel" }, { k: "⚙️", n: "orchestrator-heal", t: "2시간마다", j: "orchestrator-heal" }] },
      { n: "리뷰품질팀", s: "옥석 검증규칙(동명비카페·주소·오염) 발굴·적용", w: [
        { k: "🧠", n: "룰갭 에이전트", t: "매일", j: "rulegap-agent" }, { k: "⚙️", n: "cron-rulegap", t: "매일 01:30", j: "cron-rulegap" }, { k: "🌐", n: "reviewQuality(verifyReview)", t: "실시간(합성마다)" }] },
      { n: "검증심사팀", s: "검증 등급 자격 적대검증·15점검 + 비즈니스 기준 관제·검증", w: [
        { k: "🧠", n: "품질레드팀 에이전트", t: "매일", j: "quality-redteam-agent" }, { k: "⚙️", n: "cron-verify", t: "매일 06시", j: "cron-verify" }, { k: "⚙️", n: "기준 검증 에이전트(criteria-verify)", t: "매일 07:50·19:50(결정론)", j: "cron-criteria-verify" }] },
      { n: "심층판정팀", s: "AI판정·그라운딩 — 경계 리뷰 의미판정·환각차단", w: [
        { k: "🧠", n: "심층판정 에이전트(로컬·무료)", t: "격일", j: "deep-judge-agent" }] }] },
    { n: "🟩 성장본부", c: "#3f7a4f", teams: [
      { n: "발굴전략팀", s: "수요·공급갭 추론 → 발굴 타겟 적재", w: [
        { k: "🧠", n: "발굴 에이전트", t: "매일", j: "demand-grow-agent" }, { k: "⚙️", n: "cron-grow", t: "2시간마다", j: "cron-grow" }, { k: "⚙️", n: "cron-demand", t: "매일 17시", j: "cron-demand" }, { k: "⚙️", n: "cron-discover-categories", t: "월 1회(1일 05시)", j: "cron-discover-categories" }] },
      { n: "콘텐츠·SEO팀", s: "롱테일 SEO 발행 (보류)", w: [
        { k: "⚙️", n: "cron-newsletter", t: "주간(보류)", j: "cron-newsletter" }] }] },
    { n: "🟧 운영본부", c: "#b06a2e", teams: [
      { n: "생애주기팀", s: "폐업 다중증거 조사·평판 신선도", w: [
        { k: "🧠", n: "폐업 에이전트", t: "매일", j: "closure-agent" }, { k: "⚙️", n: "cron-closure", t: "6시간마다(1·7·13·19)", j: "cron-closure" }, { k: "⚙️", n: "cron-enrich", t: "3시간마다", j: "cron-enrich" }] },
      { n: "합성·데이터팀", s: "합성·임베딩·자가치유 (결정론)", w: [
        { k: "⚙️", n: "cron-synth", t: "매시간", j: "cron-synth" }, { k: "⚙️", n: "cron-embed", t: "매시간", j: "cron-embed" }, { k: "⚙️", n: "cron-resynth", t: "주간(월)", j: "cron-resynth" }, { k: "⚙️", n: "cron-snapshot", t: "주간(일)", j: "cron-snapshot" }] }] },
    { n: "🟪 경험본부 ★", c: "#2a7a72", note: "소비자 최전선", teams: [
      { n: "검색품질팀", s: "실제 질의로 검색·추천 품질 검증", w: [
        { k: "🧠", n: "검색품질 에이전트", t: "매일", j: "search-quality-agent" }, { k: "🌐", n: "api/search", t: "실시간(매 요청)" }] },
      { n: "추천·피드팀", s: "취향 6축 매칭·피드 품질 감시", w: [
        { k: "🌐", n: "api/momentum·cafeProfile", t: "실시간(매 요청)" }] }] },
    { n: "🟥 영업본부", c: "#b03a3a", teams: [
      { n: "마케팅팀 (B2C)", s: "무료 소비자 유입·바이럴 연구·기획", w: [
        { k: "🧠", n: "마케팅 에이전트", t: "격일(17시)", j: "marketing-agent" }] },
      { n: "사장님영업팀 (B2B)", s: "유료 구독 전환 연구·아웃리치", w: [
        { k: "🧠", n: "B2B영업 에이전트", t: "격일(17시)", j: "b2b-sales-agent" }] }] },
    { n: "🟫 전략기획본부", c: "#7a5a2a", note: "격일", teams: [
      { n: "전략기획팀", s: "시장조사·벤치마킹·약점보완·예측", w: [
        { k: "🧠", n: "전략 에이전트", t: "격일", j: "strategy-agent" }] }] },
    { n: "🏛️ 경영지원본부", c: "#6a468c", note: "격일", teams: [
      { n: "인사팀", s: "주간 평가·스코어카드·MVP·문화", w: [{ k: "🧠", n: "평가 에이전트", t: "격일", j: "evaluation" }] },
      { n: "법무팀", s: "약관·구독토큰·PII·AI OFF 감사", w: [{ k: "🧠", n: "법무 에이전트", t: "격일", j: "team-legal-agent" }] },
      { n: "재무팀", s: "과금0·쿼터·크레딧·토큰 실측 감시", w: [{ k: "🧠", n: "재무 에이전트", t: "격일", j: "team-finance-agent" }] },
      { n: "경영지원팀", s: "가동률 관제 + 협업 코디네이션 주관", w: [{ k: "🧠", n: "경영지원 에이전트", t: "격일", j: "team-ops-support-agent" }, { k: "⚙️", n: "cron-coord-consumer", t: "매시 :15(협업 자동종결)", j: "cron-coord-consumer" }, { k: "⚙️", n: "cron-issues", t: "10분(RM 이슈)", j: "cron-issues" }] },
      { n: "리스크매니지먼트팀", s: "직·간접 리스크 발굴·조율", w: [{ k: "🧠", n: "리스크 에이전트", t: "격일", j: "risk-mgmt-agent" }] }] },
  ],
};

// 가동 멤버 의미·역할 — 카드 클릭 시 팝업 설명
export const MEMBER_INFO: Record<string, string> = {
  "자율진단 에이전트(self-audit)": "기조실장 직할. 매 사이클 전 서비스를 스스로 진단해 결정론·메트릭이 못 잡는 *새 유형* 문제를 발굴. 못 푸는 건 기조실장→CEO 결재로 상신. 변화 없으면 ≤3턴 종료(값쌈). 기조실장이 매일 작동·사각 감시.",
  "개발 실행 에이전트(dev-agent)": "'개발팀'은 조직도상 팀이 아니라 이 공유 실행 엔진이다. 각 본부(경험·영업·품질·운영 등)가 자기 도메인 버그·기능을 발견해 코드 변경을 요청하면, 어느 본부도 코드를 직접 짜지 않으므로 여기로 모인다. CEO 승인(무조건 게이트) 후에만 전용 워크트리에서 병렬로 구현→타입체크·빌드 검증→배포대기. 소유·책임은 요청 본부에 남고, 실행만 대행. 데이터 조작(L2 자동)과 달리 코드 변경은 파급이 커서 CEO 게이트.",
  "정합성 에이전트": "데이터 정합성 담당. 좌표 박스·area=주소 일치·중복·필드 무결성을 매일 점검하고, 안전·가역한 건 자동 치유한다.",
  "룰갭 에이전트": "데이터를 보고 새 오염 패턴을 발굴해 검증 규칙(reviewQuality)을 보완. 사전은 자동, 로직 변경은 CEO 승인.",
  "품질레드팀 에이전트": "검증 카페를 적대적으로 재검증. 옥석 자격 미달·오염을 색출해 비공개/강등을 제안(L3).",
  "심층판정 에이전트(로컬·무료)": "규칙이 애매한 '경계' 리뷰를 AI가 의미판정·그라운딩. 로컬 Claude Code(구독·과금0)로 격일 실행.",
  "발굴 에이전트": "수요·공급 갭을 추론해 발굴 타겟 지역을 큐에 적재. 전수가 아닌 '다양성' 큐레이션.",
  "폐업 에이전트": "다중 증거로 폐업 의심을 보수적으로 조사(자동삭제 금지·미발견≠폐업). 평판 신선도도 점검.",
  "검색품질 에이전트": "실제 질의로 검색·추천 품질을 검증. 옥석 상위노출·카페명 1위 고정·빈결과 방지.",
  "마케팅 에이전트": "무료 소비자 유입·바이럴 연구·기획(B2C). 과장 금지, 발행은 CEO 승인.",
  "B2B영업 에이전트": "유료 구독 전환 연구·사장님 아웃리치 퍼널(B2B). 발송은 CEO 승인.",
  "전략 에이전트": "시장조사·경쟁 벤치마킹·약점 진단·발전 방향·예측. 방향 결정은 CEO(격일).",
  "평가 에이전트": "주간 조직 평가·스코어카드(소비자경험 최상 가중)·MVP·개선과제.",
  "법무 에이전트": "약관·구독토큰 안전선·PII·AI OFF·외부 API 약관 감사.",
  "재무 에이전트": "과금0 유지·콘솔키 크레딧·네이버/Google 쿼터·토큰 실측 감시.",
  "경영지원 에이전트": "에이전트·크론 가동률 관제 + 본부·팀 간 협업 코디네이션 주관.",
  "리스크 에이전트": "의존성·법·신뢰·사업·기술 리스크를 적극 발굴·등급화하고 해결주체 본부를 지정.",
  "cron-sentinel": "데이터 정합성 파수꾼. 매일 전 축을 스캔해 안전한 건 자동치유하고 잔여는 경보. 사장님이 발견하기 전에 먼저.",
  "orchestrator-heal": "2시간마다 파이프라인을 자가치유(area·박스밖·중복 등 가역 교정).",
  "cron-rulegap": "학습된 오염 사전을 매일 자동 반영(로직 변경은 승인 대상).",
  "reviewQuality(verifyReview)": "합성할 때마다 실시간으로 옥석을 거르는 결정론 규칙 엔진(동명비카페·주소·오염·이름정제).",
  "cron-verify": "매일 검증 카페의 15종 무결성을 점검.",
  "기준 검증 에이전트(criteria-verify)": "비즈니스 기준(criteria) 관제의 파수꾼. 하루 2회 결정론으로 ①각 기준이 코드에 실제 참조되는지(dead-knob 재발 감지) ②DB값의 범위·시드 드리프트 ③등급바닥·좌표박스의 실효과를 검사. dead-knob·범위이탈은 관제탑에 빨강 표면화(품질본부 자동배정), 실효과 어긋남은 노랑 추적. 기준 소유=품질본부, 관장=기획조정실장(L2). LLM·토큰 0.",
  "cron-grow": "2시간마다 발굴 큐를 소비해 신규 카페를 수집.",
  "cron-demand": "매일 검색 로그에서 수요갭·핫지역을 분석.",
  "cron-newsletter": "주간 뉴스레터 발행(현재 보류).",
  "cron-closure": "6시간마다 폐업 의심을 재확인. 보수적 — 자동삭제 안 하고 다중증거·검토대기만.",
  "cron-enrich": "3시간마다 카페 평판 신선도·하락을 감지.",
  "cron-synth": "매시간 미합성 신규 카페를 옥석 합성(규칙 기반·무료).",
  "cron-embed": "매시간 검색용 임베딩을 생성(Google).",
  "cron-resynth": "주간 전체 카페를 재합성해 최신 규칙을 반영.",
  "cron-snapshot": "주간 핵심 지표를 스냅샷으로 보존.",
  "api/search": "매 요청 검색 서빙. 카페명 직접매칭을 1위로 고정 + 시맨틱(임베딩).",
  "api/momentum·cafeProfile": "매 요청 추천·카페 상세 서빙. 취향 6축 매칭·강약(언급률 percentile)·하이라이트.",
};

// 잡 키 → {본부, 팀, 직원명, 아이콘} 역인덱스(성과 조인·롤업용)
export type JobMeta = { division: string; team: string; name: string; k: string; t: string };
export const JOB_TO_MEMBER: Record<string, JobMeta> = (() => {
  const m: Record<string, JobMeta> = {};
  for (const d of ORG.divisions) for (const t of d.teams) for (const w of t.w) if (w.j) m[w.j] = { division: d.n, team: t.n, name: w.n, k: w.k, t: w.t };
  return m;
})();
