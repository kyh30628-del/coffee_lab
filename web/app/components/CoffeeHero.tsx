"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

const LINE = "원두 직접 골라 마시는 동네 로스터리. 주인 안목 좋고, 가격도 합리적. 매주 들르게 되는 집.";

export default function CoffeeHero() {
  const stageRef = useRef<HTMLDivElement>(null);
  const replayRef = useRef<() => void>(() => {});

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let disposed = false;

    (async () => {
      try { await (document as any).fonts?.load("48px 'Nanum Pen Script'"); } catch {}
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      stage.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.set(0.2, 4.6, 6.6);
      camera.lookAt(0, 0.2, 0);

      scene.add(new THREE.HemisphereLight(0xfff1dc, 0x6b4a2e, 0.9));
      const sun = new THREE.DirectionalLight(0xffe4bd, 1.9);
      sun.position.set(3.5, 6, 3);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.radius = 6;
      const sc = sun.shadow.camera as THREE.OrthographicCamera;
      sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5;
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0xd9b98a, 0.5);
      fill.position.set(-4, 2, -2);
      scene.add(fill);

      const group = new THREE.Group();
      scene.add(group);
      const table = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.ShadowMaterial({ opacity: 0.22 }));
      table.rotation.x = -Math.PI / 2; table.receiveShadow = true; group.add(table);

      // 노트 (캔버스 텍스처에 손글씨가 써짐)
      const W = 1024, H = 700;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d")!;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

      ctx.font = "58px 'Nanum Pen Script'";
      const lines: string[] = [];
      { let cur = ""; for (const w of LINE.split(" ")) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > W - 160) { lines.push(cur); cur = w; } else cur = t; } lines.push(cur); }
      const totalChars = LINE.length;

      const drawPaper = (n: number) => {
        ctx.fillStyle = "#ede2cf"; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = "rgba(107,90,72,.22)"; ctx.lineWidth = 2;
        for (let y = 170; y < H; y += 88) { ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(W - 60, y); ctx.stroke(); }
        ctx.fillStyle = "#9c6b3f"; ctx.font = "34px 'Gowun Batang'"; ctx.fillText("성내동", 80, 90);
        ctx.fillStyle = "#3a2a1c"; ctx.font = "bold 44px 'Gowun Batang'"; ctx.fillText("커피볶는아침", 80, 142);
        ctx.font = "58px 'Nanum Pen Script'";
        let count = 0;
        outer: for (let li = 0; li < lines.length; li++) {
          let x = 80; const y = 245 + li * 88;
          for (const ch of lines[li]) { if (count >= n) break outer; ctx.globalAlpha = 0.75 + ((count * 7) % 25) / 100; ctx.fillText(ch, x, y); x += ctx.measureText(ch).width; count++; }
          count++;
        }
        ctx.globalAlpha = 1; tex.needsUpdate = true;
      };

      const paperMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
      const sideMat = new THREE.MeshStandardMaterial({ color: 0xe3d5bf, roughness: 1 });
      const note = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.04, 2.46), [sideMat, sideMat, paperMat, sideMat, sideMat, sideMat]);
      note.position.set(-0.55, 0.02, 0.25); note.rotation.y = 0.16; note.castShadow = true; note.receiveShadow = true; group.add(note);
      const tape = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.01, 0.28), new THREE.MeshStandardMaterial({ color: 0xd9b98a, roughness: 0.8, transparent: true, opacity: 0.9 }));
      tape.position.set(-0.7, 0.05, -0.92); tape.rotation.y = 0.1; group.add(tape);

      // 펜
      const pen = new THREE.Group(); group.add(pen);
      const penBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 16), new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.4 }));
      penBody.position.y = 0.75; penBody.castShadow = true; pen.add(penBody);
      const penTip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 16), new THREE.MeshStandardMaterial({ color: 0xc9925f, roughness: 0.5 }));
      penTip.rotation.x = Math.PI; penTip.position.y = -0.09; pen.add(penTip);
      pen.rotation.z = -0.55; pen.rotation.x = 0.25;
      const penTo = (n: number) => {
        let c = 0;
        for (let li = 0; li < lines.length; li++) {
          const ln = lines[li];
          if (n <= c + ln.length) {
            ctx.font = "58px 'Nanum Pen Script'";
            const px = 80 + ctx.measureText(ln.slice(0, n - c)).width, py = 245 + li * 88;
            const local = new THREE.Vector3((px / W - 0.5) * 3.6, 0.12, (py / H - 0.5) * 2.46);
            local.applyAxisAngle(new THREE.Vector3(0, 1, 0), note.rotation.y).add(note.position);
            pen.position.copy(local); return;
          }
          c += ln.length + 1;
        }
      };

      // 잔
      const cupMat = new THREE.MeshStandardMaterial({ color: 0xf7f1e6, roughness: 0.32, metalness: 0.02, side: THREE.DoubleSide });
      const prof: THREE.Vector2[] = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(0.44 + 0.2 * Math.pow(t, 0.8), t * 0.8)); }
      const cup = new THREE.Group(); cup.position.set(1.35, 0, 0.05); group.add(cup);
      const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), cupMat); body.castShadow = true; body.receiveShadow = true; cup.add(body);
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.44, 48), cupMat); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.005; cup.add(bottom);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.03, 16, 64), cupMat); rim.rotation.x = Math.PI / 2; rim.position.y = 0.8; cup.add(rim);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.055, 16, 48, Math.PI), cupMat); handle.position.set(0.6, 0.42, 0); handle.rotation.z = -Math.PI / 2; handle.castShadow = true; cup.add(handle);
      const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.12, metalness: 0.1 })); coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.68; cup.add(coffee);
      const crema = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.6, 48), new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.6, transparent: true, opacity: 0.5 })); crema.rotation.x = -Math.PI / 2; crema.position.y = 0.685; cup.add(crema);
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.85, 0.06, 64), cupMat); saucer.position.y = 0.03; saucer.receiveShadow = true; saucer.castShadow = true; cup.add(saucer);

      // 원두
      const beanMat = new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.55 });
      const grooveMat = new THREE.MeshStandardMaterial({ color: 0x2a160c, roughness: 0.9 });
      const beans: THREE.Group[] = [];
      ([[-2.4, 1.3, 0.4], [-1.9, 1.6, 2.1], [2.5, -1.3, 1.3], [0.4, 1.8, 5.2], [-2.7, -0.8, 3.9], [2.2, 1.7, 0.9]] as const).forEach(([x, z, r]) => {
        const b = new THREE.Group();
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.19, 32, 24), beanMat); s.scale.set(1, 0.55, 0.72); s.castShadow = true; b.add(s);
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.035), grooveMat); g.position.y = 0.105; b.add(g);
        b.position.set(x, 0.105, z); b.rotation.y = r; group.add(b); beans.push(b);
      });

      const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
      window.addEventListener("resize", resize); resize();

      let tx = 0, ty = 0, cx = 0, cy = 0;
      const onMove = (e: PointerEvent) => { const r = stage.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width - 0.5; ty = (e.clientY - r.top) / r.height - 0.5; };
      const onLeave = () => { tx = 0; ty = 0; };
      stage.addEventListener("pointermove", onMove); stage.addEventListener("pointerleave", onLeave);

      let written = 0, lastT = 0, delay = 0, done = false;
      drawPaper(REDUCE ? totalChars + 5 : 0); penTo(0); pen.visible = !REDUCE;
      replayRef.current = () => { written = 0; done = false; pen.visible = !REDUCE; drawPaper(0); };

      const clock = new THREE.Clock();
      const tick = () => {
        const t = clock.getElapsedTime();
        cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
        group.rotation.y = (REDUCE ? 0 : Math.sin(t * 0.25) * 0.06) + cx * 0.5;
        group.rotation.x = cy * 0.16;
        if (!REDUCE) {
          beans.forEach((b, i) => { b.position.y = 0.105 + Math.sin(t * 0.9 + i) * 0.012; });
          if (!done && t > 0.8 && t - lastT > delay) {
            lastT = t; written++;
            const ch = LINE[written - 1];
            delay = ch === "." || ch === "," ? 0.28 : ch === " " ? 0.08 : 0.05 + Math.random() * 0.06;
            drawPaper(written); penTo(written); pen.position.y += 0.02 + Math.random() * 0.02;
            if (written >= totalChars) { done = true; setTimeout(() => { pen.visible = false; }, 600); }
          }
        }
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      tick();

      (stage as any).__cleanup = () => {
        window.removeEventListener("resize", resize);
        stage.removeEventListener("pointermove", onMove); stage.removeEventListener("pointerleave", onLeave);
        renderer.dispose(); renderer.domElement.remove();
      };
    })();

    return () => { disposed = true; cancelAnimationFrame(raf); (stage as any).__cleanup?.(); };
  }, []);

  return (
    <div ref={stageRef} style={{ position: "relative", aspectRatio: "1 / 1", maxHeight: 580, width: "100%" }}>
      <style>{`div[data-hero] canvas{width:100%!important;height:100%!important;display:block}`}</style>
      <button onClick={() => replayRef.current()} style={{ position: "absolute", left: 10, bottom: 6, font: "inherit", fontSize: ".8rem", color: "#6b5a48", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>다시 쓰기</button>
      <span style={{ position: "absolute", right: 10, bottom: 6, fontSize: ".78rem", color: "#6b5a48", opacity: .7 }}>마우스를 움직여 보세요</span>
    </div>
  );
}
