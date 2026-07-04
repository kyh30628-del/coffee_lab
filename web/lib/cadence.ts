// 🕐 자율 조직 실행 케이던스 — 도메인 변화속도에 맞춘 설계(단일 출처, 관제탑 표시용).
//   ⚠️ 케이던스 변경 시(run-daily.sh·run-weekly.sh·vercel.json) 여기도 갱신. SCHEDULE.md와 일치 유지.
export type CadenceRow = { tier: string; freq: string; when: string; items: string; why: string };

export const CADENCE: CadenceRow[] = [
  { tier: "오염 방지 가드", freq: "3×/일", when: "08·12·17시", items: "정합성·룰갭·레드팀(LLM)", why: "오염 상시 발생 → 촘촘할수록 품질↑" },
  { tier: "오염 감지 크론", freq: "2×/일", when: "verify 9·21 · sentinel 3·15 · rulegap 4·16시", items: "cron-verify·sentinel·rulegap(결정론)", why: "결정론=API 토큰0 → 공짜로 촘촘히" },
  { tier: "자율진단·종합", freq: "2×/일", when: "08·17시", items: "self-audit·기획조정실장·비서실장", why: "넓은 스캔·CEO 보고" },
  { tier: "운영·성장·경험", freq: "1×/일", when: "폐업·발굴 08 · 검색품질 17", items: "closure·demand·search-quality", why: "도메인 일 단위 변화" },
  { tier: "마케팅·B2B", freq: "격일 번갈아", when: "17시 (짝수=마케팅 · 홀수=B2B)", items: "marketing·b2b-sales", why: "며칠 단위 연구, 하루새 안 바뀜" },
  { tier: "심층판정", freq: "격일", when: "짝수일 08·17시", items: "deep-judge", why: "무거운 판정 → 토큰 절약" },
  { tier: "거버넌스", freq: "주1×", when: "월요일", items: "법무·재무·운영·조직평가", why: "주 단위 변화" },
  { tier: "리스크·전략", freq: "주2×", when: "월·목", items: "risk-mgmt·strategy", why: "시장변화 커 주중 리프레시" },
  { tier: "파이프라인 크론", freq: "상시", when: "synth 매시·embed 매시·grow 2h·enrich 3h·heal 2h", items: "합성·임베딩·발굴·보강·자가치유", why: "데이터 흐름 상시 처리" },
];
