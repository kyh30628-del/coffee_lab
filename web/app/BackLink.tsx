"use client";
import { useRouter } from "next/navigation";

// 직관적 뒤로가기: 이전 페이지가 있으면 뒤로, 없으면(직접 진입) 홈으로.
export default function BackLink({ label = "뒤로", to, className = "" }: { label?: string; to?: string; className?: string }) {
  const router = useRouter();
  const onClick = () => {
    if (to) router.push(to);
    else if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };
  return (
    <button onClick={onClick} aria-label="뒤로 가기" className={`inline-flex items-center gap-1 text-sm font-medium opacity-90 hover:opacity-100 ${className}`}>
      <span className="text-lg leading-none">←</span>
      <span>{label}</span>
    </button>
  );
}
