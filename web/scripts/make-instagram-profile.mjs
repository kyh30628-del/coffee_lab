// 인스타그램 프로필 이미지 생성 — 동네 커피 노트
// 규격: 320x320 정사각, 원형 크롭 안전영역(중심 반경 160 원) 고려해 핵심요소를 반경 ~132 이내 배치.
// 톤: 랜딩 크림 배경(#f4ece0) + 브랜드 컬러(다크브라운 #2b2018 · 골드 #c98a3c/#e8b87a) + 커피잔 로고 + 서비스명.
// 실행: (web/) node scripts/make-instagram-profile.mjs  → public/instagram-profile.png
import sharp from "sharp";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="72%">
      <stop offset="0%" stop-color="#faf4ea"/>
      <stop offset="70%" stop-color="#f4ece0"/>
      <stop offset="100%" stop-color="#eaddc6"/>
    </radialGradient>
    <linearGradient id="steam" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8b87a" stop-opacity="0"/>
      <stop offset="100%" stop-color="#c98a3c" stop-opacity="0.9"/>
    </linearGradient>
  </defs>
  <rect width="320" height="320" fill="url(#bg)"/>
  <!-- 원형크롭 안전영역 내 장식 링 (r=138, 크롭 후에도 보임) -->
  <circle cx="160" cy="160" r="138" fill="none" stroke="#d8b98a" stroke-width="2" stroke-opacity="0.55"/>
  <circle cx="160" cy="160" r="132" fill="none" stroke="#c98a3c" stroke-width="1" stroke-opacity="0.4" stroke-dasharray="2 5"/>

  <!-- 김(steam) -->
  <g stroke="url(#steam)" stroke-width="5.5" fill="none" stroke-linecap="round">
    <path d="M142 84 q-8 -11 0 -22 q8 -11 0 -22"/>
    <path d="M160 80 q-8 -11 0 -22 q8 -11 0 -22"/>
    <path d="M178 84 q-8 -11 0 -22 q8 -11 0 -22"/>
  </g>

  <!-- 커피잔 -->
  <g>
    <path d="M203 108 a20 20 0 0 1 0 34" fill="none" stroke="#2b2018" stroke-width="9" stroke-linecap="round"/>
    <path d="M117 100 h86 v18 a43 40 0 0 1 -86 0 z" fill="#2b2018"/>
    <ellipse cx="160" cy="101" rx="41" ry="7" fill="#e8b87a"/>
    <ellipse cx="160" cy="150" rx="60" ry="10" fill="#2b2018"/>
    <ellipse cx="160" cy="149" rx="46" ry="6" fill="#3a2c20"/>
  </g>

  <!-- 서비스명 -->
  <text x="160" y="215" font-family="'Apple SD Gothic Neo','AppleGothic','Noto Sans KR',sans-serif" font-size="33" font-weight="800" fill="#2b2018" text-anchor="middle" letter-spacing="-1">동네 커피 노트</text>
  <!-- 태그라인 -->
  <text x="160" y="245" font-family="'Apple SD Gothic Neo','AppleGothic','Noto Sans KR',sans-serif" font-size="15" font-weight="700" fill="#c98a3c" text-anchor="middle" letter-spacing="0.5">진짜 후기만, 우리 동네 카페</text>
</svg>`;

const out = new URL("../public/instagram-profile.png", import.meta.url);
await sharp(Buffer.from(svg)).png().toFile(out.pathname);
console.log("wrote", out.pathname);
