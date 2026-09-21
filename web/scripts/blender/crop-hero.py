# 📓 finalize-hero.py 뒤에 실행 — 빈 바닥(아래 22%)을 잘라내고 page.tsx의 y좌표를 /0.78로 환산(2026-09-22 규약, hero10부터).
#   실행: python3 scripts/blender/crop-hero.py <hero_name>
import sys, re
from PIL import Image
name = sys.argv[1]; K = 0.78
p = f"public/note/{name}.webp"; im = Image.open(p); W, H = im.size; assert (W, H) == (1400, 1680), im.size
H2 = int(H * K); im.crop((0, 0, W, H2)).save(p, "WEBP", quality=88, method=6)
s = open("app/page.tsx", encoding="utf-8").read()
def conv(m):
    pts = eval(m.group(1)); return f"const HERO_PAGE: [number, number][] = {[[x, round(y / K, 5)] for x, y in pts]};".replace("'", "")
s = re.sub(r'const HERO_PAGE: \[number, number\]\[\] = (\[\[.*?\]\]);', conv, s, count=1)
s = re.sub(r'const HERO_CUP: \[number, number\] = \[([^\]]*)\];', lambda m: f"const HERO_CUP: [number, number] = [{m.group(1).split(',')[0].strip()}, {round(float(m.group(1).split(',')[1]) / K, 5)}];", s, count=1)
s = re.sub(r'const HERO_W = 1400, HERO_H = \d+;', f'const HERO_W = 1400, HERO_H = {H2};', s, count=1)
open("app/page.tsx", "w", encoding="utf-8").write(s)
print("cropped", p, (W, H2))
