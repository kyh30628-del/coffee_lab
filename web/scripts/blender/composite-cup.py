# ☕ 렌더한 잔(cup.png, 투명+그림자)을 hero.webp의 옛 잔 자리에 합성한다.
#   1) 옛 잔·받침 영역을 주변 나무결로 덮고(같은 x대의 아래쪽 나무를 페더 마스크로 복제) 2) 새 잔을 받침 폭에 맞춰 얹는다.
#   실행: python3 scripts/blender/composite-cup.py <cup.png> <in hero.webp> <out hero.webp>
import sys
from PIL import Image, ImageFilter, ImageDraw
cup_p, src_p, out_p = sys.argv[1:4]
hero = Image.open(src_p).convert("RGB"); W, H = hero.size            # 1400×1680
cup = Image.open(cup_p).convert("RGBA")
# 옛 잔·받침 자리(700×840 축소본 실측 → 원본 배율 2): x 1010~1370, y 450~820. 노트 오른쪽 가장자리가 x≈1056~1090에 걸친다.
# 덮개 두 장(타원 마스크는 네 귀퉁이에 옛 잔 림·받침 테두리를 남겼다 → 페더 사각형):
#   A) 잔 윗부분(y 430~600): 같은 x의 **위쪽** 나무(y 100~270, 콩 없음)로
#   B) 받침 부분(y 560~840): 같은 x의 **아래쪽**(y 890~1170)으로 — 노트 가장자리 어긋남(≈40px)은 새 받침이 덮는다
def feather_paste(box, src_box, blur=18):
    patch = hero.crop(src_box)
    m = Image.new("L", patch.size, 0); ImageDraw.Draw(m).rectangle((10, 10, patch.size[0] - 10, patch.size[1] - 10), fill=255)
    hero.paste(patch, (box[0], box[1]), m.filter(ImageFilter.GaussianBlur(blur)))
feather_paste((1030, 430, 1390, 600), (1030, 160, 1390, 330), blur=30)
#   B1) 노트 가장자리 띠(x 1030~1110)는 **위쪽**(y-330)에서 — 아래쪽은 가장자리가 오른쪽으로 밀려 페이지 흰색이 딸려온다(v4 실측: 받침 왼쪽 흰 띠)
feather_paste((1030, 560, 1110, 840), (1030, 230, 1110, 510), blur=10)
#   B2) 나무 부분(x≥1100)은 아래쪽(y+330)에서
feather_paste((1100, 560, 1390, 840), (1100, 890, 1390, 1170))
#   B1 소스에 딸려온 콩 조각(받침 왼쪽 아래, v5 실측) — 바로 위 60px로 덮는다
feather_paste((1025, 725, 1090, 800), (1025, 660, 1090, 735), blur=8)
# 새 잔: 렌더 받침 폭 ≈ 660px(1000px 중) → 0.55 → 363px. 받침이 노트 가장자리 위 옛 받침 자리(x≥1033)를 완전히 덮도록 중심을 오른쪽으로.
scale = 0.55
cw, ch = int(cup.size[0] * scale), int(cup.size[1] * scale)
cup_s = cup.resize((cw, ch), Image.LANCZOS)
cx, cy = 1215, 700
px, py = int(cx - 480 * scale), int(cy - 640 * scale)   # 렌더 받침 중심 (480, 640)
hero.paste(cup_s, (px, py), cup_s)
hero.save(out_p, "WEBP", quality=82, method=6)
print("saved", out_p, hero.size, "paste at", (px, py), "size", (cw, ch))
