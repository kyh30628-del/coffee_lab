import BackLink from "../BackLink";
import ShowcaseBanner, { SHOWCASE_CSS, SHOWCASE_TEMPLATES } from "../ShowcaseBanner";
export const metadata = { title: "쇼케이스 스타일 샘플 10종" };

const SAMPLES = [
  { cafe: "애크로매틱 커피", area: "강동구 · 로스터리", scene: "☕", headline: "오늘 볶은 원두,\n정직한 한 잔", tagline: "강동에서 직접 볶는 싱글 오리진", points: ["직접 로스팅", "싱글오리진"] },
  { cafe: "스윗솔트", area: "강동구 · 디저트 카페", scene: "🍰", headline: "달콤함이\n머무는 시간", tagline: "디저트와 커피의 완벽한 페어링", cta: "지금 가보기 →", points: [] },
  { cafe: "메모러블모먼트", area: "강동구 · 무드 카페", scene: "🎞️", headline: "오늘 이곳에서", tagline: "기억에 남는 공간", points: ["분위기", "데이트"] },
  { cafe: "더 화이트 라운지", area: "강동구 · 작업·조용", scene: "🤍", headline: "여백이 있는\n조용한 라운지", tagline: "A quiet white lounge", points: [] },
  { cafe: "블랑제리11-17", area: "강동구 · 베이커리", scene: "🥐", headline: "향이 번지는\n아침의 베이커리", tagline: "매일 아침 갓 구운 빵", points: ["갓구운빵", "아침"] },
  { cafe: "테라로사 길동점", area: "강동구 · 스페셜티", scene: "☕", headline: "변하지 않는\n스페셜티", tagline: "정통 로스터리의 자부심", points: ["스페셜티", "핸드드립"] },
  { cafe: "우드멜로우", area: "강동구 · 모던 카페", scene: "🪑", headline: "결이 다른\n공간", tagline: "WOOD & MELLOW", points: ["작업하기 좋은", "모던"] },
  { cafe: "동네카페", area: "강동구 · 플랜테리어", scene: "🌿", headline: "초록이 머무는\n느린 오후", tagline: "식물과 햇살 사이에서", points: ["플랜테리어", "조용"] },
  { cafe: "비터", area: "강동구 · 에스프레소바", scene: "☕", headline: "쌉싸름함의\n깊이", tagline: "어른의 커피", points: ["에스프레소", "다크"] },
  { cafe: "브랜뉴하이몬드", area: "강동구 · 디저트", scene: "🍮", headline: "구름 위의\n디저트", tagline: "몽글몽글 달콤한 한 입", points: ["디저트", "인생샷"] },
];

export default function ShowcaseStyles() {
  return (
    <main className="min-h-screen bg-[#e7ded0]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <style dangerouslySetInnerHTML={{ __html: SHOWCASE_CSS }} />
      <div className="max-w-md mx-auto px-5 py-8">
        <BackLink to="/" label="홈" className="text-[#9c6b3f] mb-3" />
        <h1 className="text-2xl font-bold text-[#2b2018] mb-1">쇼케이스 스타일 10종</h1>
        <p className="text-[13px] text-[#6b5a48] mb-6">강동구 카페로 만든 샘플. 새로고침하면 애니메이션이 처음부터 재생됩니다. 사장님은 등록 시 이 중 하나를 고릅니다.</p>
        <div className="space-y-8">
          {SHOWCASE_TEMPLATES.map((t, i) => {
            const s = SAMPLES[i];
            return (
              <div key={t.id}>
                <div className="mb-2">
                  <span className="inline-block text-[11px] font-bold text-white bg-[#9c6b3f] rounded-full px-2 py-0.5 mr-1.5">{t.id}</span>
                  <span className="text-[#2b2018] font-bold">{t.name}</span>
                  <span className="text-[12px] text-[#8a7458]"> · {t.desc}</span>
                </div>
                <div className="rounded-2xl overflow-hidden shadow-lg bg-[#fdfaf4]">
                  <ShowcaseBanner style={t.id} scene={s.scene} headline={s.headline} tagline={s.tagline} points={s.points} cta={s.cta} height="220px" />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[12px] text-[#8a7458] mt-8 text-center">마음에 드는 번호들을 알려주시면 사장님 등록 화면에 ‘템플릿 선택’으로 적용돼 있어요.</p>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
