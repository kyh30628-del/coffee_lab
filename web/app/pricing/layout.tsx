// "use client" 페이지는 metadata를 export할 수 없어, canonical 전용 얇은 layout을 둔다.
//   없으면 루트 layout의 canonical("/")을 물려받아 이 페이지가 홈으로 잘못 정규화된다(2026-08-21).
export const metadata = { alternates: { canonical: "/pricing" } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
