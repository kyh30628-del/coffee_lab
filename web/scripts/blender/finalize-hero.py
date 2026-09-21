# 📓 히어로 렌더 산출물 → 서비스 파일 + page.tsx 상수 갱신
#   실행: python3 scripts/blender/finalize-hero.py <render_dir> <hero_name e.g. hero4>
#   hero.png → public/note/<hero>.webp(1400×1680 q82) · pen-top.png → public/note/pen.webp(촉 끝 비율 실측)
#   quad.json → app/page.tsx HERO_PAGE / HERO_CUP / PEN_TIP / img src
import sys, os, json, re
from PIL import Image
d, name = sys.argv[1], sys.argv[2]
hero = Image.open(os.path.join(d, "hero.png")).convert("RGB")
assert hero.size == (1400, 1680), hero.size
hero.save(f"public/note/{name}.webp", "WEBP", quality=82, method=6)
pen = Image.open(os.path.join(d, "pen-top.png")).convert("RGBA")
assert pen.size == (167, 1382), pen.size
a = pen.getchannel("A"); bb = a.point(lambda v: 255 if v > 60 else 0).getbbox()   # 불투명 부분
# 촉 끝 = 불투명 영역 맨 아래 행의 가운데
row = bb[3] - 1; xs = [x for x in range(pen.size[0]) if a.getpixel((x, row)) > 60]
tip = (round((min(xs) + max(xs)) / 2 / pen.size[0], 4), round(row / pen.size[1], 4))
pen.save("public/note/pen.webp", "WEBP", quality=90, method=6)
q = json.load(open(os.path.join(d, "quad.json")))
p = "app/page.tsx"; s = open(p, encoding="utf-8").read()
s = re.sub(r'const HERO_PAGE: \[number, number\]\[\] = \[\[.*?\]\];', f'const HERO_PAGE: [number, number][] = {json.dumps(q["HERO_PAGE"])};', s, count=1)
s = re.sub(r'const HERO_CUP: \[number, number\] = \[[^\]]*\];', f'const HERO_CUP: [number, number] = {json.dumps(q["HERO_CUP"])};', s, count=1)
s = re.sub(r'PEN_TIP: \[number, number\] = \[[^\]]*\];', f'PEN_TIP: [number, number] = {json.dumps(list(tip))};', s, count=1)
s = re.sub(r'<img src="/note/hero\d*\.webp" alt="" aria-hidden', f'<img src="/note/{name}.webp" alt="" aria-hidden', s, count=1)
open(p, "w", encoding="utf-8").write(s)
print("hero", f"public/note/{name}.webp", os.path.getsize(f"public/note/{name}.webp"), "B · pen tip", tip, "· quad", q)
