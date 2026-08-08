// 🏪 지점 인용문 판별 — "○○점" 카페 상세에서 **다른 지점 후기가 대표 6건을 차지하는 것**을 막는 표시용 규칙.
//
// 배경(2026-08-08, CEO 선택안 C): 지점 오염은 데이터를 지우기엔 애매하다. 같은 글이 두 지점을 함께
//   다루는 경우가 흔하고(그건 정상 후기다), 잘못 지우면 되돌리기 어렵다. 반면 **화면에서 뒤로 미는 것**은
//   무해하고 즉시 되돌릴 수 있다. 그래서 삭제 대신 노출 순서만 조정한다.
//
// ⚠️ 비용 원칙: 이 판정은 **추가 DB 조회를 절대 하지 않는다.** 형제 지점 목록을 알려면 전체 카페를 훑어야
//   하므로(센티넬이 하는 일) 요청마다 그럴 수 없다. 대신 이미 가진 '카페 이름' 하나만으로 판정한다 —
//   인용문에 **우리 지점이 아닌 다른 지점 표기**가 있고 **우리 지점 표기는 없으면** 다른 지점 글로 본다.

const BRANCH_SUFFIX_RE = /^(.+?)\s*([가-힣A-Za-z0-9.]{1,14}(?:본점|지점|직영점|가맹점|점|1st|2nd|3rd|호점))$/;
const BRANCH_MARKER_RE = /(본점|지점|직영점|가맹점|점|1st|2nd|3rd|호점)$/;
// 인용문 안의 '지점·동네 표기' 후보. ⚠️ 실측 교정: 오염 인용문은 "운양**점**"이 아니라 "운양**동**"으로
//   나온다(#7628 쉐프부랑제 사우점에 섞인 글 = "김포시 운양동, 모담공원 근처 …쉐프부랑제 방문기").
//   지점 접미사만 찾으면 정작 실제 오염을 못 잡으므로 동(洞)·역(驛) 표기까지 본다.
const PLACE_RE = /([가-힣A-Za-z0-9]{2,10}(?:본점|지점|직영점|가맹점|호점|점|동|역))/g;

export type BranchId = { suffix: string; token: string; mine: string[] } | null;

/**
 * 카페 이름에서 자기 지점 표기를 뽑는다. 지점명이 없는 개인 카페면 null →
 * **이 규칙은 '○○점' 형태의 지점 카페에만 적용된다**(개인 카페는 전혀 영향 없음).
 * dong을 함께 넘기면 자기 동네 표기도 '우리 것'으로 인정해 오탐을 줄인다(추가 조회 없음 — 이미 있는 값).
 */
export function ownBranch(name: string, dong?: string | null): BranchId {
  const m = String(name || "").trim().match(BRANCH_SUFFIX_RE);
  if (!m) return null;
  const suffix = m[2].trim();
  const token = suffix.replace(BRANCH_MARKER_RE, "").trim();
  // 토큰이 비거나(본점 등 마커뿐) 1글자면 변별력이 없어 규칙을 쓰지 않는다(오탐 방지).
  if (token.length < 2) return null;
  const mine = [suffix, token];
  const d = String(dong || "").trim();
  if (d.length >= 2) { mine.push(d, d.replace(/[동읍면리가]$/, "")); }
  return { suffix, token, mine: mine.filter((x) => x.length >= 2) };
}

/**
 * 이 인용문이 '다른 지점 글'로 보이는가.
 *   true = 다른 지점·동네 표기가 있고 우리 지점/동네 표기는 없음 → 대표 6건에서 뒤로 민다(삭제 아님).
 * 우리 지점이 함께 언급되면(두 지점을 같이 다룬 글) 정상으로 본다 — 센티넬 치유기와 같은 보수 기준.
 */
export function isOtherBranchQuote(quote: string, own: BranchId): boolean {
  if (!own) return false;
  const q = String(quote || "");
  if (!q) return false;
  if (own.mine.some((t) => q.includes(t))) return false; // 우리 지점·동네 언급 → 보존
  PLACE_RE.lastIndex = 0;
  for (const m of q.matchAll(PLACE_RE)) {
    const other = m[1];
    const otherToken = other.replace(BRANCH_MARKER_RE, "").replace(/[동역]$/, "").trim();
    if (otherToken.length < 2) continue;                        // 변별력 없는 표기
    if (own.mine.some((t) => t.includes(otherToken) || otherToken.includes(t))) continue; // 우리 것의 변형
    return true;
  }
  return false;
}
