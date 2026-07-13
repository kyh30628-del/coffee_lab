// 공유 문구(카카오톡 등) — 등급을 후킹포인트로 쓴 유도 문구. 카페 상세·MY PIN 공유가 공유.
export function shareHookText(grade?: string | null, identity?: string | null): string {
  const g = grade === "검증" ? "검증등급" : grade === "참고" ? "참고등급" : "등급";
  const detail = identity ? ` — ${identity}` : "";
  return `친구도 이 카페 ${g} 봤으면${detail}`.slice(0, 80);
}
