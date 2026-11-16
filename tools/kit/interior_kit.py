"""House interior + cellar mock from Ed's RD kit. Run: python3 -I interior_kit.py <raw_dir> <out_dir>"""
import sys, random
from PIL import Image, ImageDraw
RAW, OUT = sys.argv[1], sys.argv[2]
def L(n): return Image.open(f"{RAW}/{n}").convert('RGBA')
TW = 16
rnd = random.Random(3)

def base_of(im):
    a = im.split()[3]
    for yy in range(im.height - 1, -1, -1):
        if any(a.getpixel((xx, yy)) > 128 for xx in range(im.width)): return yy
    return im.height - 1

def room(cols, rows, floor, wall, wall_rows=3, dark=0):
    W, H = cols*TW, (rows+wall_rows)*TW + 8
    im = Image.new('RGBA', (W+16, H+8), (23, 19, 26, 255))
    ox, oy = 8, 4
    for y in range(rows):
        for x in range(cols):
            t = floor if rnd.random() > .5 else floor.transpose(Image.FLIP_LEFT_RIGHT)
            im.alpha_composite(t, (ox + x*TW, oy + (wall_rows+y)*TW))
    for y in range(wall_rows):
        for x in range(cols):
            im.alpha_composite(wall, (ox + x*TW, oy + y*TW))
    d = ImageDraw.Draw(im)
    # ceiling beam and skirting in palette wood tones
    d.rectangle([ox, oy, ox + W - 1, oy + 5], fill=(56, 38, 25, 255))
    d.line([ox, oy + 6, ox + W - 1, oy + 6], fill=(31, 22, 18, 255))
    sk = oy + wall_rows*TW - 3
    d.rectangle([ox, sk, ox + W - 1, sk + 2], fill=(85, 58, 34, 255))
    d.line([ox, sk + 3, ox + W - 1, sk + 3], fill=(31, 22, 18, 255))
    # side walls as dark frame
    d.rectangle([0, 0, ox - 1, im.height], fill=(43, 35, 41, 255))
    d.rectangle([ox + W, 0, im.width, im.height], fill=(43, 35, 41, 255))
    d.rectangle([0, oy + H - 8, im.width, im.height], fill=(43, 35, 41, 255))
    if dark:  # cellar gloom: darken floor away from the candle
        pass
    return im, ox, oy, oy + wall_rows*TW

def place(scene, items):
    shade = Image.new('L', scene.size, 0)
    for name, x, base, crop in items:
        im = L(name)
        if crop: im = im.crop(crop)
        b = base_of(im); a = im.split()[3].point(lambda v: 255 if v > 128 else 0)
        # small contact shadow: silhouette bottom squashed, offset right
        sq = a.resize((a.width, max(2, a.height // 6)), Image.NEAREST)
        shade.paste(255, (x + 3, base - sq.height + 3), sq)
    scene = Image.composite(Image.new('RGBA', scene.size, (23, 19, 26, 255)), scene, shade.point(lambda v: 80 if v else 0))
    for name, x, base, crop in sorted(items, key=lambda i: i[2]):
        im = L(name)
        if crop: im = im.crop(crop)
        scene.alpha_composite(im, (x, base - base_of(im)))
    return scene

def light(scene, lights, ambient):
    """Darken everything by distance to candles; banded (3 steps) to stay pixel-crisp."""
    W, H = scene.size
    m = Image.new('L', (W, H), 0); px = m.load()
    for y in range(H):
        for x in range(W):
            v = ambient
            for lx, ly, r in lights:
                d = ((x-lx)**2 + ((y-ly)*1.3)**2) ** .5
                if d < r*0.45: v = max(v, 255)
                elif d < r*0.75: v = max(v, 200)
                elif d < r: v = max(v, 150)
            px[x, y] = 255 - v
    tint = Image.new('RGBA', (W, H), (14, 10, 22, 255))
    out = Image.composite(tint, scene, m.point(lambda v: int(v*0.85)))
    warm = Image.new('RGBA', (W, H), (255, 196, 87, 255))
    glow = m.point(lambda v: 28 if v == 0 else 0)
    return Image.composite(warm, out, glow)

F = 'seen_from_the_front-'
P = 'pixelated_figure_in-286101848-1.png'
# ---- ground floor, half cleared
gf, ox, oy, fy = room(14, 7, L('old_wide_oak_floorbo-674666663-0.png'), L('interior_wall_of_an-2104742763-0.png'))
gf = place(gf, [
    ('f3-hearth.png', ox + 16, fy + 1, None),
    ('wall_shelves_with_cl-1744474867-0.png', ox + 60, fy - 4, None),
    ('f1-bed.png', ox + 176, fy + 30, None),
    ('f2-table.png', ox + 64, fy + 44, None),
    ('an_iron_bound_wooden-689282988-0.png', ox + 196, fy + 4, None),
    ('f7-junk.png', ox + 132, fy + 70, None),
    ('f7-junk.png', ox + 172, fy + 92, None),
    ('f8-trapdoor.png', ox + 100, fy + 96, None),
    ('f10-candle.png', ox + 72, fy + 30, None),
    (P, ox + 124, fy + 52, (0, 80, 32, 120)),       # player, seen from behind
])
gf = light(gf, [(ox + 32, fy - 4, 90), (ox + 80, fy + 22, 70)], 80)
# ---- cellar: sealed door, flagstones, one candle
ce, ox2, oy2, fy2 = room(10, 5, L('dark_damp_stone_flag-883655077-0.png'), L('dark_damp_stone_flag-883655077-0.png'))
ce = place(ce, [
    ('an_old_arched_oak_do-500798596-0.png', ox2 + 68, fy2 + 1, None),
    ('f10-candle.png', ox2 + 44, fy2 + 12, None),
    ('f7-junk.png', ox2 + 120, fy2 + 34, None),
    (P, ox2 + 72, fy2 + 50, (0, 80, 32, 120)),
])
ce = light(ce, [(ox2 + 52, fy2 + 4, 80)], 40)

W = gf.width + ce.width + 12
out = Image.new('RGBA', (W, max(gf.height, ce.height)), (23, 19, 26, 255))
out.alpha_composite(gf, (0, 0)); out.alpha_composite(ce, (gf.width + 12, 0))
out.resize((out.width*3, out.height*3), Image.NEAREST).save(f"{OUT}/interior-kit-3x.png")
print(out.size)
