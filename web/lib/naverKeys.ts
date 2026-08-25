// 🔑 네이버 API 키 풀 — **수집량의 진짜 천장은 키 개수다.**
//
// 실측(2026-08-25): 네이버 검색 API 일일 한도 25,000은 **애플리케이션(Client ID)당**이고,
//   local·blog·cafearticle이 그 한도를 **공유**한다(소진 시 세 API 모두 `{count/quota=25000/25000}`).
//   우리는 키가 1개라 하루 25,000이 절대 천장이었다. 그날 실제 배분:
//     발굴(discover-sweep + cron-grow) ~18,700 + 후기수집 ~6,300 = 25,000 소진.
//   그 결과 강원 2,103곳을 발굴하고도 후기는 205곳(10%)만 모았다. 코드로는 더 못 뚫는다.
//
// 👉 해법은 **애플리케이션 추가 등록**이다(네이버 개발자센터는 계정당 여러 앱 허용).
//   키를 N개 두면 한도가 N×25,000이 된다. 이 파일은 그 준비다 —
//   .env에 NAVER_CLIENT_ID_2/SECRET_2, _3… 를 넣기만 하면 즉시 늘어난다(코드 수정 불필요).
//
// ⚠️ 로테이션 원칙: 라운드로빈이 아니라 **소진된 키만 건너뛴다**. 라운드로빈은 모든 키를 고르게
//   태워 전부 동시에 소진시키고, 그러면 남은 여유가 있는데도 전 채널이 멈춘다.
//   한 키를 끝까지 쓰고 429가 나면 다음 키로 넘어가는 게 가용시간을 가장 길게 만든다.

type Key = { id: string; secret: string; label: string };

function loadKeys(): Key[] {
  const out: Key[] = [];
  if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
    out.push({ id: process.env.NAVER_CLIENT_ID, secret: process.env.NAVER_CLIENT_SECRET, label: "key1" });
  }
  for (let i = 2; i <= 10; i++) {
    const id = process.env[`NAVER_CLIENT_ID_${i}`], secret = process.env[`NAVER_CLIENT_SECRET_${i}`];
    if (id && secret) out.push({ id, secret, label: `key${i}` });
  }
  return out;
}

const KEYS = loadKeys();
export const NAVER_KEY_COUNT = KEYS.length;

// 소진 표시: 키별 마지막 429 시각. KST 자정에 리셋되므로 '오늘 안에만' 유효하게 본다.
const exhausted = new Map<string, number>();
const kstDay = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
let curDay = kstDay();

function live(): Key[] {
  if (kstDay() !== curDay) { exhausted.clear(); curDay = kstDay(); } // 자정 넘어가면 전부 되살린다
  return KEYS.filter((k) => !exhausted.has(k.label));
}

/** 지금 쓸 키의 헤더. 전부 소진이면 null — 호출부는 조용히 중단해야 한다(빈 결과로 오해 금지). */
export function naverHeaders(): { headers: Record<string, string>; label: string } | null {
  const k = live()[0];
  if (!k) return null;
  return { headers: { "X-Naver-Client-Id": k.id, "X-Naver-Client-Secret": k.secret }, label: k.label };
}

/** 429를 받은 키를 오늘치 소진 처리. 다음 키가 남아 있으면 true(호출부가 재시도해도 됨). */
export function markKeyExhausted(label: string): boolean {
  exhausted.set(label, Date.now());
  return live().length > 0;
}

export function naverKeyStatus(): { total: number; live: number; exhausted: string[] } {
  return { total: KEYS.length, live: live().length, exhausted: [...exhausted.keys()] };
}
