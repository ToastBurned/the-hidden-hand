"""First street mock from Ed's Retro Diffusion slice kit.
Run: python3 -I street_kit.py <raw_dir> <out_dir>
16px tiles; objects depth-sorted by base; hard pixel shadows cast down-right (light top-left)."""
import sys, random
from PIL import Image

RAW, OUT = sys.argv[1], sys.argv[2]
def L(n): return Image.open(f"{RAW}/{n}").convert('RGBA')

TW = 16
COLS, ROWS = 40, 22
W, H = COLS * TW, ROWS * TW
rnd = random.Random(7)

# ---- ground: corner-wang from the cobble/grass tileset (key TL,TR,BL,BR; G=grass s=stone)
wang = L('worn_grey_cobbleston-652224359-0.png')
LAYOUT = [['GGGG','GGGs','GGss','GGsG'],
          ['GGGG','GsGs','ssss','sGsG'],
          ['GGGG','GsGG','ssGG','sGGG'],
          ['ssss','sssG','ssGs','GssG'],
          ['ssss','sGss','Gsss','sGGs']]
tiles = {}
for ty, row in enumerate(LAYOUT):
    for tx, k in enumerate(row):
        tiles.setdefault(k, []).append(wang.crop((tx*16, ty*16, tx*16+16, ty*16+16)))
mud = L('muddy_brown_dirt_roa-1697939604-0.png')

# vertex grid: stone for the road band, with a ragged edge; grass elsewhere
V = [['G'] * (COLS + 1) for _ in range(ROWS + 1)]
for vy in range(ROWS + 1):
    for vx in range(COLS + 1):
        if 10 <= vy <= 14: V[vy][vx] = 's'
        if vy == 9 and rnd.random() < 0.55: V[vy][vx] = 's'   # paving runs up to the doors
        if vy == 15 and rnd.random() < 0.35: V[vy][vx] = 's'
        if 11 <= vy <= 13 and rnd.random() < 0.06: V[vy][vx] = 'G'  # weeds breaking through
ground = Image.new('RGBA', (W, H))
for y in range(ROWS):
    for x in range(COLS):
        k = V[y][x] + V[y][x+1] + V[y+1][x] + V[y+1][x+1]
        opts = tiles.get(k)
        if not opts:  # combination the set lacks: fall back by majority
            opts = tiles['ssss'] if k.count('s') >= 2 else tiles['GGGG']
        ground.alpha_composite(rnd.choice(opts), (x*TW, y*TW))

# ---- objects: (image, left x, base y)
def base_of(im):
    a = im.split()[3]
    for yy in range(im.height - 1, -1, -1):
        if any(a.getpixel((xx, yy)) > 128 for xx in range(im.width)): return yy
    return im.height - 1

objs = []
def put(name, x, base, crop=None, flip=False, shadow=True):
    im = L(name)
    if crop: im = im.crop(crop)
    if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    b = base_of(im)
    objs.append((base, im, x, base - b, shadow))

P = 'seen_from_the_front-'
# buildings along the north side of the street, fronts on row 10 (y=160)
HB = 160
put('Single_building_gam-642095917-0.png', -6, HB - 2)     # thatched cottage
put('Single_building_gam-671348431-0.png', 128, HB)        # inn
put('Single_building_gam-792807441-0.png', 262, HB)        # the inherited ruin
put('Single_building_gam-1830208851-0.png', 382, HB)       # rose townhouse
put(P+'1531781710-0.png', 92, HB - 30)   # tree behind, between cottage and inn
put(P+'1531781710-0.png', 520, HB - 6, flip=True)
put('s5-hedge.png', 236, HB - 2)
put('s5-hedge.png', 492, HB + 2)
put('s5-hedge.png', 600, HB + 2)

put(P+'1045256460-0.png', 140, HB + 6)       # barrel
put(P+'1045256460-0.png', 152, HB + 9)
put(P+'1327217255-0.png', 236, HB + 8)       # crates
put(P+'71503828-0.png', 118, HB + 10)        # sacks
put(P+'1622184279-0.png', 340, HB + 6)       # rubble by the ruin
put('f7-junk.png', 270, HB + 8)              # junk out front of the ruin
put(P+'1602032882-0.png', 254, HB + 22)      # lantern
put(P+'360564787-0.png', 486, HB + 22)       # lit lantern
put(P+'1735230104-0.png', 410, HB + 34)      # market stall
put(P+'1980512784-0.png', 196, HB + 46)      # handcart

# south side: garden, fence, well, tree
SB = 262
for i in range(6): put('s3-fence.png', 16 + i*25, SB - 10)
put('s4-vegpatch.png', 40, SB + 30)
put('s4-vegpatch.png', 76, SB + 30)
put('s5-hedge.png', 160, SB + 4)
put('s5-hedge.png', 184, SB + 6)
put(P+'678021924-0.png', 300, SB + 20)       # well
put(P+'1531781710-0.png', 230, SB + 40)      # tree
put(P+'1531781710-0.png', 580, SB + 40, flip=True)
put(P+'360564787-0.png', 560, HB + 22)
put(P+'1088207580-0.png', 360, SB + 6)       # bench
put(P+'2021806909-0.png', 470, SB + 4)       # sacks pile

# people: frames from the walk sheets are 32x40 cells (row0 front, row1 sides, row2 back)
def frame(sheet, col, row): return (col*32, row*40, col*32+32, row*40+40)
put('pixelated_figure_in-286101848-1.png', 292, HB + 30, frame(None, 0, 0))   # player, by the ruin
put('pixelated_woman_in_a-1196925804-1.png', 160, HB + 28, frame(None, 2, 1))  # goodwife walking
put('pixelated_man_wearin-956976857-1.png', 220, HB + 20, frame(None, 1, 0))   # dockhand at the crates
put('elderly_man_in_dark-796447829-1.png', 436, HB + 36, frame(None, 0, 0))    # merchant at his stall
put('pixelated_armored_wa-100894056-1.png', 528, HB + 30, frame(None, 0, 0))   # watchman at the gate
put('p2-goodwife.png', 380, HB + 50)

# ---- render
def shadow_of(im, ox, oy, base):
    """Hard shadow: silhouette flipped below the base, squashed, sheared right."""
    a = im.split()[3].point(lambda v: 255 if v > 128 else 0)
    h = a.height
    sh = Image.new('L', (W, H), 0)
    top = oy
    for yy in range(h):
        src_y = yy
        depth = (top + h - 1) - (top + yy)            # rows above the base
        if top + yy > base: continue
        dy = base + int(depth * 0.22) + 1
        dx = int(depth * 0.4)
        if dy >= H: continue
        row = a.crop((0, src_y, a.width, src_y + 1))
        sh.paste(255, (ox + dx, dy), row)
    return sh

scene = ground.copy()
objs.sort(key=lambda o: o[0])
shade = Image.new('L', (W, H), 0)
for base, im, x, y, s in objs:
    if s:
        sm = shadow_of(im, x, y, base)
        shade.paste(255, (0, 0), sm)
dark = Image.new('RGBA', (W, H), (23, 19, 26, 255))
mask = shade.point(lambda v: 92 if v else 0)
scene = Image.composite(dark, scene, mask)
scene = scene.convert('RGBA')
for base, im, x, y, s in objs:
    scene.alpha_composite(im, (max(x, 0), y)) if x >= 0 else scene.alpha_composite(im.crop((-x, 0, im.width, im.height)), (0, y))

scene.save(f"{OUT}/street-kit-1x.png")
scene.resize((W*2, H*2), Image.NEAREST).save(f"{OUT}/street-kit-2x.png")
print('ok', W, H)
