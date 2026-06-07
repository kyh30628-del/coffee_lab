"use client";
import { ReactNode } from "react";

function Item({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="text-xl shrink-0 w-7 text-center leading-7">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-[13.5px] text-[#2b2018] mb-0.5">{title}</div>
        <div className="text-[12.5px] text-[#52402e] leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
const B = ({ children }: { children: ReactNode }) => <b className="text-[#6f4a25]">{children}</b>;

export default function GuideModal({ type, onClose }: { type: "consumer" | "owner"; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[5500]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:w-[440px] sm:h-fit bg-[#fdfaf4] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: "90dvh" }}>
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-[#ece0cd] flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-[0.18em] uppercase text-[#9c6b3f]">{type === "consumer" ? "For Visitors" : "For Owners"}</div>
            <h2 className="text-lg font-bold text-[#2b2018] mt-0.5">{type === "consumer" ? "이렇게 쓰면 돼요 ☕" : "사장님 사용 가이드 🏪"}</h2>
          </div>
          <button onClick={onClose} className="text-3xl text-[#9c6b3f] leading-none px-1 -mt-1">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ WebkitOverflowScrolling: "touch" }}>
          {type === "consumer" ? (
            <>
              <div className="bg-[#2b2018] text-[#f4ece0] rounded-xl px-4 py-3 text-[12.5px] leading-relaxed">
                별점·광고는 믿기 어렵죠. 수천 개 후기에서 <B><span className="text-[#e8b87a]">광고·가짜·무관·동명·나열식</span></B> 글을 걸러내고,
                규칙 엔진과 <b className="text-[#e8b87a]">Claude AI</b>가 <b className="text-[#e8b87a]">진짜 방문 후기</b>만 가려낸 가이드예요.
              </div>
              <Item icon="🏠" title="홈 — 동네별 추천">우리 동네를 고르면 그 동네판이 떠요. <B>📈 요즘 뜨는 카페 · 🏆 리뷰 많은 Top3 · 🔥 스페셜티</B> 코너가 있고, 제목 옆 <B>↕ 정렬 기준</B>이 표시됩니다.</Item>
              <Item icon="📍" title="내 위치로 보기"><B>'내 위치'</B> 버튼을 누르면(동의 후) 가장 가까운 동네 카페를 자동으로 보여줘요. 위치는 대략적 지역만 쓰고 저장 안 해요.</Item>
              <Item icon="💭" title="느낌으로 검색">🔍 버튼에 <B>"비 오는 날 혼자 조용히"</B>처럼 떠오르는 느낌을 적으면, AI가 의도를 읽고 맞는 카페를 찾아줘요.</Item>
              <Item icon="🗺" title="지도 — 결로 거르기">지역과 <B>결(조용·작업·디저트·로스팅…)</B>을 고르면 핀과 목록이 바뀌고, 고른 결이 강한 순으로 정렬돼요.</Item>
              <Item icon="📋" title="카페 상세 — 근거가 보여요">"공개 글 N건 검증 → 노이즈 제거 → <B>옥석 K건</B>" 통계와 <B>근거 후기</B>(원문·▶영상 링크)를 직접 볼 수 있어요.</Item>
              <Item icon="🏷️" title="배지 읽는 법"><B>검증</B>(후기 30+)·<B>참고</B>(5~30)·발굴(부족). <B>✨AI 검증</B>은 Claude가 내용·맥락까지 읽어 통과시킨 후기예요.</Item>
            </>
          ) : (
            <>
              <div className="bg-[#2b2018] text-[#f4ece0] rounded-xl px-4 py-3 text-[12.5px] leading-relaxed">
                검증된 진짜 후기로 <b className="text-[#e8b87a]">내 카페 경쟁력</b>을 진단하고, <b className="text-[#e8b87a]">쇼케이스</b>로 소비자에게 자연스럽게 홍보하세요.
              </div>
              <Item icon="📊" title="내 카페 분석">카페 이름을 검색하면 같은 동네와 비교한 <B>순위 · 성격(레이더) · 구성(도넛)</B> 3탭과 <B>리뷰 주기</B>를 보여드려요.</Item>
              <Item icon="💡" title="데이터 기반 액션 플랜">우리 카페 데이터에서만 나오는 구체 제안 — <B>차별점 · 빈 포지션 선점 · 보완점 · 순위 전략</B>. 일반론이 아니에요.</Item>
              <Item icon="🎀" title="쇼케이스 — 홍보물 만들기">글·사진을 올리고 <B>'✨ AI 홍보물 만들기'</B>를 누르면, Claude가 사진·글을 보고 <B>홍보 카피</B>를 만들어줘요. <B>'공개하기'</B>를 켜면 <B>카페 상세 맨 위</B>에 노출됩니다. <span className="text-[#9c6b3f]">(구독 기능 미리보기)</span></Item>
              <Item icon="🟢" title="자연스러운 광고 효과">소비자가 내 카페를 열면 <B>쇼케이스가 가장 먼저</B> 보여, 광고처럼 거슬리지 않게 홍보돼요.</Item>
              <Item icon="✍️" title="등록·보강">메뉴·분위기 등을 직접 등록하면 분석과 추천이 더 정확해지고, 후기 적은 숨은 집일수록 효과가 커요.</Item>
            </>
          )}
          <div className="text-[10.5px] text-[#a8927a] leading-relaxed pt-1 border-t border-[#f0e6d4]">모든 데이터는 네이버·구글·유튜브 공개 후기를 교차검증한 사실 기반입니다. 숫자엔 항상 출처·근거가 붙어요.</div>
        </div>

        <div className="shrink-0 px-5 py-3 border-t border-[#ece0cd]">
          <button onClick={onClose} className="w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 font-medium">알겠어요</button>
        </div>
      </div>
    </div>
  );
}
