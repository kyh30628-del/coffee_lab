#!/usr/bin/env node
// 📸 인스타 계정 추출 픽스처(09-24) — 게시물·초대·태그 링크를 계정으로 오인하면 화면에 @p·@stories가 뜨고, 사장님 글 판정이 그 단어가 든 블로그 후기를 버린다.
//   사용: node --import tsx scripts/fixtures-ighandle.mjs
const { igHandle, igProfileUrl } = await import("../lib/cafeDetailView.ts");
const T = [["https://www.instagram.com/cafe.ahrity","cafe.ahrity"],["https://instagram.com/stories/dalbodre__cake/2479281225816548957?utm_source=x","dalbodre__cake"],["https://www.instagram.com/@ochi_coffeenbingsu","ochi_coffeenbingsu"],["https://www.instagram.com/p/C_aXop_SHZf/?igsh=x",null],["https://www.instagram.com/reel/DJX/",null],["https://www.instagram.com/invites/contact/?i=1",null],["https://www.instagram.com/explore/tags/구룡가옥/",null],["https://www.instagram.com/accounts/emailsignup/",null],["https://www.instagram.com/stories/apenner_coffe_n_pub/","apenner_coffe_n_pub"],["https://www.instagram.com/Pipe.Coffee/?hl=ko","Pipe.Coffee"],[null,null],["https://blog.naver.com/x",null]];
let f=0; for (const [u,e] of T) { const g=igHandle(u); if (g!==e) { f++; console.log("FAIL",u,g,e); } }
console.log(`인스타 계정 추출 픽스처: ${T.length - f}/${T.length} 통과`);
if (f || igProfileUrl(T[1][0]) !== "https://www.instagram.com/dalbodre__cake/") process.exit(1);
