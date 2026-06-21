import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: false, args:["--no-sandbox","--window-size=1100,900"] });
const p = await b.newPage();
await p.setCacheEnabled(false);
await p.setViewport({width:1080,height:840});
await p.goto("https://dongnecoffeenote.com/?n="+Math.random(), { waitUntil:"networkidle2", timeout:60000 });
await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>{ const e=[...document.querySelectorAll("button,a")].find(x=>/소비자로 시작/.test(x.textContent||"")); e&&e.click(); });
await new Promise(r=>setTimeout(r,2500));
await p.evaluate(()=>{ const e=[...document.querySelectorAll("button")].find(x=>/동의|확인|시작|닫기/.test(x.textContent||"")); e&&e.click(); });
await new Promise(r=>setTimeout(r,1200));
await p.evaluate(()=>{ const e=[...document.querySelectorAll("button,a,[role=button]")].find(x=>/지도/.test(x.textContent||"")&&(x.textContent||"").length<8); e&&e.click(); });
await new Promise(r=>setTimeout(r,7000));
const setSel = async (idx, rx)=> p.evaluate((idx,rx)=>{ const s=[...document.querySelectorAll("select")][idx]; const o=[...s.options].find(o=>new RegExp(rx).test(o.textContent)); if(!o)return "no"; s.value=o.value; s.dispatchEvent(new Event("change",{bubbles:true})); return o.textContent; }, idx, rx);
// 구 레벨(동 미선택): 역 없어야
await setSel(0,"서울"); await new Promise(r=>setTimeout(r,2500));
await setSel(1,"강남구"); await new Promise(r=>setTimeout(r,6000));
const guLevel = await p.evaluate(()=>{ const ic=[...document.querySelectorAll(".leaflet-marker-icon")]; return { z:window.__ml?.getZoom?.().toFixed(1), stations: ic.filter(i=>/역<\/span>/.test(i.innerHTML)).length, cafes: ic.filter(i=>/border-radius:50% 50% 50% 0/.test(i.innerHTML)).length, circles: ic.filter(i=>/[0-9]+<\/span>/.test(i.innerHTML)&&!/역<\/span>/.test(i.innerHTML)).length }; });
console.log("구레벨(강남구,동미선택):", JSON.stringify(guLevel));
// 동 선택 → 개별카페 + 역
await setSel(2,"논현|역삼|삼성"); await new Promise(r=>setTimeout(r,6000));
const dongLevel = await p.evaluate(()=>{ const ic=[...document.querySelectorAll(".leaflet-marker-icon")]; return { z:window.__ml?.getZoom?.().toFixed(1), stations: ic.filter(i=>/역<\/span>/.test(i.innerHTML)).length, cafes: ic.filter(i=>/border-radius:50% 50% 50% 0/.test(i.innerHTML)).length }; });
console.log("동레벨:", JSON.stringify(dongLevel));
// 팬 → 카페 실시간 갱신(개수 변화)
const box = await p.evaluate(()=>{ const m=document.querySelector(".leaflet-container"); const r=m.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; });
const c1 = await p.evaluate(()=>[...document.querySelectorAll(".leaflet-marker-icon")].filter(i=>/border-radius:50% 50% 50% 0/.test(i.innerHTML)).map(i=>i.textContent.slice(0,8)).sort().join("|").slice(0,60));
await p.mouse.move(box.x,box.y); await p.mouse.down(); await p.mouse.move(box.x-280,box.y-180,{steps:10}); await p.mouse.up();
await new Promise(r=>setTimeout(r,2500));
const c2 = await p.evaluate(()=>[...document.querySelectorAll(".leaflet-marker-icon")].filter(i=>/border-radius:50% 50% 50% 0/.test(i.innerHTML)).map(i=>i.textContent.slice(0,8)).sort().join("|").slice(0,60));
console.log("팬 전후 카페셋 다른가:", c1!==c2, "| 전:", c1.slice(0,40), "| 후:", c2.slice(0,40));
console.log("V7DONE");
await b.close();
