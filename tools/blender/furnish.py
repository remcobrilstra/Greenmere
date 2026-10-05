# Furniture, street props, yards, floors and the square for greenmere.py.
# Exec'd into greenmere.py's namespace (Kit, palettes, B, F, T ...).
# Each function draws one piece in the kit's current frame: y = 0 is the floor
# it stands on, +z is its front, sizes come from townplan (f["w"], f["d"], f["h"]).
# Roles: "interior" (unclipped furniture), "props" (street), "glowFire",
# "glowPotion", "glowLamp"; depth-tier pieces are redirected to "tier<N>".

STEEL = [0xc5d0dc, 0xaab5c1]
GOLD = [0xd4a03a, 0xc79232]
COPPER = [0xb87333, 0xa86528, 0xc98443]
STRAW = [0xc9a85a, 0xd8b968, 0xb8984c]
BURLAP = [0xc2a36b, 0xb39460, 0xb89a66]
PLANK = [0x8a6a44, 0x7d5e3a, 0x96744a, 0x84643f]
STONE_G = [0x8a8f93, 0x7b8085, 0x9aa0a4, 0x858a80]
STONE_D = [0x4c545e, 0x5e6771, 0x56606a]
CREAM = [0xf4e7c8, 0xece0c0]
GOODS = [0xb64034, 0x2d62c8, 0x3e9a36, 0xd4a03a, 0xe7d7b4, 0x7a4a8c, 0x8d5b34, 0xc5d0dc]
POTIONS = [[0x6fd08a], [0x7eb6ef], [0xe0605a], [0xd4a03a], [0xb08ae0]]
WATER = [0x3b6e8c, 0x356480]

def frame_at(x, y, z, yaw=0.0, base=None):
    m = Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw or 0.0, 4, 'Y')
    return base @ m if base is not None else m

def sub(kit, x, y, z, yaw=0.0):
    """Run a nested piece at an offset; returns a restore callable."""
    old = kit.frame
    kit.frame = old @ frame_at(x, y, z, yaw)
    return lambda: setattr(kit, "frame", old)

# ---------------------------------------------------------------- small goods

def goods_row(kit, role, w, y, z, depth):
    x = -w / 2 + 0.12
    while x < w / 2 - 0.15:
        k = kit.r.random()
        col = kit.pick(GOODS)
        if k < 0.35:
            h = kit.r.uniform(0.18, 0.34)
            kit.cylr(role, 0.07, 0.085, h, 7, col, x, y + h / 2, z + kit.r.uniform(-0.15, 0.15) * depth)
            kit.cylr(role, 0.03, 0.03, 0.05, 6, TIMBER_M, x, y + h + 0.025, z)
            x += 0.2
        elif k < 0.7:
            s = kit.r.uniform(0.16, 0.3)
            kit.box(role, s, s * kit.r.uniform(0.7, 1.2), min(depth * 0.8, s), col, x + s / 2, y + s * 0.42, z, ry=kit.r.uniform(-0.2, 0.2))
            kit.box(role, s + 0.01, 0.03, min(depth * 0.8, s) + 0.01, [shade(col, 0.75)], x + s / 2, y + s * 0.2, z)
            x += s + 0.06
        else:
            kit.ball(role, 0.1, BURLAP, x, y + 0.1, z, 1, 0.9, 1)
            kit.box(role, 0.06, 0.06, 0.06, [0x8a6a44], x, y + 0.21, z)
            x += 0.24

def bottle_row(kit, w, y, z):
    x = -w / 2 + 0.12
    while x < w / 2 - 0.12:
        h = kit.r.uniform(0.16, 0.3)
        kit.cylr("glowPotion", 0.06, 0.075, h, 7, kit.pick(POTIONS), x, y + h / 2, z)
        kit.cylr("interior", 0.025, 0.035, 0.07, 6, TIMBER_M, x, y + h + 0.035, z)
        x += kit.r.uniform(0.17, 0.23)

def plank_top(kit, role, w, d, y, th=0.07, pal=TIMBER_L, along="x"):
    """A top made of planks with hairline gaps."""
    n = max(2, round((d if along == "x" else w) / 0.22))
    for i in range(n):
        if along == "x":
            pd = d / n
            kit.box(role, w, th, pd - 0.012, pal, 0, y - th / 2, -d / 2 + pd * (i + 0.5))
        else:
            pw = w / n
            kit.box(role, pw - 0.012, th, d, pal, -w / 2 + pw * (i + 0.5), y - th / 2, 0)

def string_line(kit, role, ax, az, bx, bz, y, sag, n, col=CREAM):
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        x0, z0 = ax + (bx - ax) * t0, az + (bz - az) * t0
        x1, z1 = ax + (bx - ax) * t1, az + (bz - az) * t1
        y0 = y - math.sin(t0 * math.pi) * sag
        y1 = y - math.sin(t1 * math.pi) * sag
        h = math.hypot(x1 - x0, z1 - z0)
        ln = math.hypot(h, y1 - y0)
        kit.box(role, 0.02, 0.02, ln, col, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2,
                ry=math.atan2(x1 - x0, z1 - z0), rx=-math.atan2(y1 - y0, h))

def pennant(kit, role, x, y, z, yaw, col, s=1.0):
    kit.cone(role, 0.13 * s, 0.28 * s, 3, col, x, y, z, ry=yaw, rz=math.pi)

# ---------------------------------------------------------------- furniture

def f_counter(kit, f):
    w, d, h = f["w"], f["d"], f["h"]
    kit.box("interior", w, h - 0.08, d, TIMBER_M, 0, (h - 0.08) / 2, 0)
    # panelled front
    n = max(2, round(w / 0.7))
    for i in range(n):
        x = -w / 2 + w * (i + 0.5) / n
        kit.box("interior", w / n - 0.14, h - 0.36, 0.03, TIMBER_L, x, (h - 0.08) / 2, d / 2 + 0.015)
    for i in range(n + 1):
        kit.box("interior", 0.08, h - 0.12, 0.05, TIMBER_D, -w / 2 + w * i / n, (h - 0.08) / 2, d / 2 + 0.02)
    kit.box("interior", w + 0.04, 0.1, d + 0.04, TIMBER_D, 0, 0.05, 0)
    plank_top(kit, "interior", w + 0.12, d + 0.12, h, 0.08, TIMBER_L)
    if f.get("bottles"):
        bottle_row(kit, w * 0.5, h, -0.1)
    else:
        kit.box("interior", 0.5, 0.06, 0.36, CREAM, -w * 0.25, h + 0.03, 0)
        kit.box("interior", 0.02, 0.07, 0.36, [0x8e3a2e], -w * 0.25, h + 0.035, 0)
        sx = w * 0.25
        kit.cylr("interior", 0.03, 0.03, 0.4, 6, GOLD, sx, h + 0.2, 0)
        kit.box("interior", 0.5, 0.03, 0.03, GOLD, sx, h + 0.4, 0)
        for s in (-1, 1):
            kit.cylr("interior", 0.11, 0.08, 0.05, 8, GOLD, sx + s * 0.22, h + 0.28, 0)
            kit.box("interior", 0.01, 0.12, 0.01, GOLD, sx + s * 0.22, h + 0.34, 0)
        for i in range(4):
            kit.cylr("interior", 0.05, 0.05, 0.015, 7, GOLD, -w * 0.05 + i * 0.03, h + 0.008 + i * 0.016, 0.1)

def f_shelf(kit, f):
    w, d, h = f["w"], f["d"], f["h"]
    kit.box("interior", w, h, 0.05, TIMBER_D, 0, h / 2, -d / 2 + 0.025)
    for s in (-1, 1):
        kit.box("interior", 0.07, h, d, TIMBER_M, s * (w / 2 - 0.035), h / 2, 0)
    kit.box("interior", w + 0.08, 0.08, d + 0.06, TIMBER_D, 0, h + 0.04, 0.01)
    levels = 4
    for i in range(levels):
        y = 0.12 + i * (h - 0.3) / (levels - 1)
        kit.box("interior", w - 0.1, 0.045, d, TIMBER_L, 0, y, 0)
        kit.box("interior", w - 0.1, 0.06, 0.02, TIMBER_M, 0, y - 0.01, d / 2 - 0.01)
        if i < levels - 1:
            if f.get("bottles"):
                bottle_row(kit, w - 0.2, y + 0.022, 0)
            else:
                goods_row(kit, "interior", w - 0.2, y + 0.022, 0, d)

def barrel(kit, role, r, h, hoops=IRON, staves=TIMBER_M, lid=TIMBER_L):
    seg = 10
    kit.cylr(role, r * 0.88, r * 0.88, h, seg, staves, 0, h / 2, 0)
    kit.cylr(role, r, r * 0.92, h * 0.25, seg, staves, 0, h * 0.62, 0)
    kit.cylr(role, r * 0.92, r, h * 0.25, seg, staves, 0, h * 0.38, 0)
    for y in (0.12, 0.5, 0.88):
        rr = r * (0.9 if y != 0.5 else 1.0) + 0.012
        kit.cylr(role, rr, rr, 0.05, seg, hoops, 0, h * y, 0)
    kit.cylr(role, r * 0.82, r * 0.82, 0.02, seg, lid, 0, h + 0.005, 0)

def f_barrel(kit, f):
    r = min(f["w"], f["d"]) / 2 * 0.92
    barrel(kit, "interior", r, f["h"])
    if f.get("coal"):
        for i in range(9):
            kit.ball("interior", kit.r.uniform(0.06, 0.1), [0x1c1c1e, 0x2a2a2c, 0x242426], kit.r.uniform(-0.6, 0.6) * r,
                     f["h"] + 0.03, kit.r.uniform(-0.6, 0.6) * r)

def crate(kit, role, s, h, x=0, y=0, z=0, ry=0, pal=TIMBER_L):
    restore = sub(kit, x, y, z, ry)
    kit.box(role, s, h, s, pal, 0, h / 2, 0)
    for zs in (-1, 1):
        for yy in (0.06, h - 0.06):
            kit.box(role, s + 0.02, 0.09, 0.03, TIMBER_D, 0, yy, zs * (s / 2 + 0.005))
        kit.box(role, math.hypot(s, h) - 0.1, 0.08, 0.025, TIMBER_D, 0, h / 2, zs * (s / 2 + 0.01), rz=math.atan2(h, s))
    for xs in (-1, 1):
        for yy in (0.06, h - 0.06):
            kit.box(role, 0.03, 0.09, s + 0.02, TIMBER_D, xs * (s / 2 + 0.005), yy, 0)
    restore()

def f_crates(kit, f):
    s = min(f["w"], f["d"])
    crate(kit, "interior", s, s * 0.6, 0, 0, 0, 0.1)
    crate(kit, "interior", s * 0.7, s * 0.5, 0.05, s * 0.6, 0, -0.25, TIMBER_M)
    if s > 0.9:
        kit.ball("interior", 0.12, [0x3e9a36, 0xb64034, 0xd4a03a], 0.1, s * 1.1 + 0.08, 0.05)

def legs4(kit, w, d, h, inset=0.1, t=0.08, pal=TIMBER_D):
    for sx in (-1, 1):
        for sz in (-1, 1):
            kit.box("interior", t, h, t, pal, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset))
    for sz in (-1, 1):
        kit.box("interior", w - 2 * inset, 0.06, 0.04, pal, 0, h * 0.25, sz * (d / 2 - inset))

def stool(kit, x, z, h=0.45):
    kit.cylr("interior", 0.18, 0.18, 0.06, 8, TIMBER_L, x, h, z)
    for i in range(3):
        a = i / 3 * math.pi * 2
        kit.box("interior", 0.045, h, 0.045, TIMBER_D, x + math.cos(a) * 0.1, h / 2, z + math.sin(a) * 0.1, rz=math.cos(a) * 0.12, rx=-math.sin(a) * 0.12)

def f_table(kit, f):
    w, d, h = f["w"], f["d"], f["h"]
    plank_top(kit, "interior", w, d, h, 0.07, TIMBER_L, along="z" if w > d else "x")
    legs4(kit, w, d, h - 0.07)
    if f.get("goods"):
        goods_row(kit, "interior", w - 0.2, h, 0, d)
    if f.get("stools"):
        for sz in (-1, 1):
            stool(kit, 0, sz * (d / 2 + 0.35))
        kit.cylr("interior", 0.07, 0.06, 0.16, 7, [0xb8b2a4], 0.15, h + 0.08, 0)
        kit.ball("interior", 0.12, [0xd8b968], -0.2, h + 0.06, 0.05, 1, 0.6, 1)
        kit.cylr("interior", 0.16, 0.16, 0.025, 8, [0xe7d7b4], -0.2, h + 0.012, 0.05)
    if f.get("herbs"):
        for i in range(5):
            kit.cylr("interior", 0.06, 0.02, 0.32, 5, [0x3e9a36, 0x67b84a, 0x8d7a3a], -w / 2 + 0.25 + i * 0.22, h + 0.05,
                     kit.r.uniform(-0.15, 0.15), rz=math.pi / 2)
        kit.cylr("interior", 0.14, 0.1, 0.1, 7, STONE_G, w / 2 - 0.25, h + 0.05, 0)
        kit.cylr("interior", 0.03, 0.03, 0.2, 5, TIMBER_L, w / 2 - 0.25, h + 0.12, 0, rz=0.5)

def f_sacks(kit, f):
    for i in range(3):
        x, y, z = (i % 2 - 0.5) * 0.3, 0.3 + (0.3 if i == 2 else 0), (i - 1) * 0.42
        kit.ball("interior", 0.36, BURLAP, x, y, z, 1, 0.85, 1.05, ry=i)
        kit.cylr("interior", 0.07, 0.1, 0.12, 6, BURLAP, x, y + 0.33, z)
        kit.cylr("interior", 0.075, 0.075, 0.03, 6, [0x8a6a44], x, y + 0.3, z)

def f_rug(kit, f):
    w, d = f["w"], f["d"]
    kit.box("interior", w, 0.02, d, [0x8e3a2e], 0, 0.01, 0)
    kit.box("interior", w - 0.3, 0.022, d - 0.3, [0xc98443], 0, 0.012, 0)
    kit.box("interior", w - 0.6, 0.024, d - 0.6, [0x6e2e28], 0, 0.013, 0)
    kit.box("interior", (w - 0.6) * 0.4, 0.026, (d - 0.6) * 0.4, [0xd4a03a], 0, 0.014, 0, ry=math.pi / 4)
    for s in (-1, 1):
        for i in range(int(w / 0.12)):
            kit.box("interior", 0.03, 0.01, 0.1, CREAM, -w / 2 + 0.06 + i * 0.12, 0.005, s * (d / 2 + 0.05))

def f_forge(kit, f):
    w, d, h = f["w"], f["d"], f["h"]
    # stone hearth built of blocks
    kit.box("interior", w, h, d, {"*": MORTAR}, 0, h / 2, 0)
    for side, (L, ox, oz, ry) in {"f": (w, 0, d / 2, 0), "l": (d, -w / 2, 0, -math.pi / 2), "r": (d, w / 2, 0, math.pi / 2)}.items():
        restore = sub(kit, ox, 0, oz, ry)
        y = 0
        i = 0
        while y < h - 0.05:
            hh = min(0.25, h - y)
            course_row(kit, -L / 2, L / 2, y, hh, [], RUBBLE, 0.02, 0.04, 0.3, 0.5, role="interior", stagger=0.5 if i % 2 else 1.0)
            y += hh; i += 1
        restore()
    kit.box("interior", w + 0.08, 0.1, d + 0.08, QUOIN, 0, h + 0.03, 0)
    kit.box("interior", w - 0.4, 0.06, d - 0.4, [0x1c1c1e], 0, h + 0.07, 0)
    for i in range(14):
        kit.ball("glowFire", kit.r.uniform(0.08, 0.14), [0xff7a2a, 0xffa040, 0xff5a1a], kit.r.uniform(-1, 1) * (w / 2 - 0.4),
                 h + 0.1, kit.r.uniform(-1, 1) * (d / 2 - 0.4), 1, 0.6, 1)
    # hood and flue
    kit.cylr("interior", 0.42, w * 0.55, 1.1, 4, STONE_D, 0, h + 1.35, 0, ry=math.pi / 4)
    kit.box("interior", 0.8, 1.6, 0.8, STONE_D, 0, h + 2.6, 0)
    kit.box("interior", w * 0.8, 0.1, 0.12, TIMBER_D, 0, h + 0.8, d * 0.38)
    for i in range(4):
        kit.box("interior", 0.03, 0.4, 0.03, IRON, -0.5 + i * 0.33, h + 0.58, d * 0.38 + 0.05)
    # bellows
    restore = sub(kit, w / 2 + 0.38, 0, 0.1)
    kit.box("interior", 0.08, 0.66, 0.08, TIMBER_D, 0, 0.33, 0)
    kit.box("interior", 0.5, 0.06, 0.8, TIMBER_M, 0, 0.66, 0, rx=0.15)
    kit.box("interior", 0.46, 0.16, 0.72, [0x5a3a24], 0, 0.76, 0, rx=0.12)
    kit.box("interior", 0.5, 0.06, 0.8, TIMBER_M, 0, 0.88, 0, rx=0.08)
    kit.box("interior", 0.06, 0.06, 0.5, TIMBER_L, 0, 0.9, 0.55)
    restore()

def f_anvil(kit, f):
    kit.cylr("interior", 0.32, 0.36, 0.5, 8, TIMBER_M, 0, 0.25, 0)
    kit.cylr("interior", 0.33, 0.33, 0.04, 8, IRON, 0, 0.42, 0)
    kit.box("interior", 0.5, 0.12, 0.36, IRON, 0, 0.56, 0)
    kit.box("interior", 0.28, 0.14, 0.22, IRON, 0, 0.68, 0)
    kit.box("interior", 0.72, 0.14, 0.32, IRON, 0, 0.8, 0)
    kit.box("interior", 0.66, 0.02, 0.26, STEEL, -0.02, 0.875, 0)
    kit.cone("interior", 0.13, 0.42, 6, IRON, 0.56, 0.8, 0, rz=-math.pi / 2)
    kit.box("interior", 0.36, 0.04, 0.05, TIMBER_M, -0.15, 0.89, 0.1, ry=0.4)
    kit.box("interior", 0.1, 0.06, 0.08, IRON, 0.0, 0.9, 0.08, ry=0.4)

def f_trough(kit, f):
    w, d, h = f["w"], f["d"], f["h"]
    for s in (-1, 1):
        kit.box("interior", w, h, 0.14, QUOIN, 0, h / 2, s * (d / 2 - 0.07))
        kit.box("interior", 0.14, h, d - 0.28, QUOIN, s * (w / 2 - 0.07), h / 2, 0)
    kit.box("interior", w - 0.28, 0.12, d - 0.28, QUOIN, 0, 0.06, 0)
    kit.box("interior", w - 0.28, 0.04, d - 0.28, WATER, 0, h - 0.1, 0)

def f_bench(kit, f, role="interior"):
    w, d, h = f["w"], f["d"], f["h"]
    plank_top(kit, role, w, d, h, 0.07, TIMBER_L)
    for s in (-1, 1):
        kit.box(role, 0.1, h - 0.07, d - 0.1, TIMBER_D, s * (w / 2 - 0.2), (h - 0.07) / 2, 0)
        kit.box(role, 0.14, 0.06, d - 0.04, TIMBER_D, s * (w / 2 - 0.2), 0.03, 0)
    kit.box(role, w - 0.5, 0.06, 0.05, TIMBER_D, 0, h * 0.3, 0)
    if f.get("tools"):
        kit.box(role, 0.4, 0.06, 0.1, IRON, -0.8, h + 0.03, 0)
        kit.box(role, 0.06, 0.06, 0.34, TIMBER_M, -0.8, h + 0.03, 0.18)
        kit.box(role, 0.5, 0.04, 0.06, IRON, 0.1, h + 0.02, -0.1, ry=0.4)
        kit.box(role, 0.26, 0.22, 0.2, IRON, w / 2 - 0.4, h + 0.11, 0)
        kit.box(role, 0.2, 0.06, 0.24, IRON, w / 2 - 0.4, h + 0.25, 0)
        kit.box(role, w - 0.2, 0.9, 0.04, TIMBER_D, 0, h + 0.75, -d / 2 + 0.02)
        for i in range(6):
            x = -w / 2 + 0.4 + i * 0.45
            kit.box(role, 0.04, 0.04, 0.06, TIMBER_L, x, h + 1.0, -d / 2 + 0.06)
            if i % 2:
                kit.box(role, 0.05, 0.36, 0.04, IRON, x, h + 0.8, -d / 2 + 0.08)
            else:
                kit.box(role, 0.04, 0.3, 0.03, TIMBER_M, x, h + 0.82, -d / 2 + 0.08)
                kit.box(role, 0.14, 0.08, 0.05, IRON, x, h + 0.68, -d / 2 + 0.08)

def f_rack(kit, f):
    w, d, h = f["w"], f["d"], f["h"]
    for s in (-1, 1):
        kit.box("interior", 0.1, h, 0.1, TIMBER_D, s * (w / 2 - 0.05), h / 2, -d / 2 + 0.05)
    kit.box("interior", w, 0.08, 0.1, TIMBER_M, 0, h * 0.85, -d / 2 + 0.05)
    kit.box("interior", w, 0.08, 0.3, TIMBER_M, 0, 0.12, 0)
    for i in range(5):
        x = -w / 2 + 0.35 + i * (w - 0.7) / 4
        kit.box("interior", 0.06, 1.3, 0.025, STEEL, x, 0.9, -0.02, rx=-0.12)
        kit.cone("interior", 0.04, 0.12, 4, STEEL, x, 1.6, -0.1, rx=-0.12)
        kit.box("interior", 0.22, 0.05, 0.05, GOLD, x, 0.3, 0.02)
        kit.box("interior", 0.05, 0.22, 0.05, [0x5a3a24], x, 0.16, 0.03)
    for s, col in ((-1, [0x2d62c8]), (1, [0xb64034])):
        kit.cylr("interior", 0.3, 0.3, 0.06, 10, col, s * w / 4, h * 0.85 + 0.35, -d / 2 + 0.12, rx=math.pi / 2)
        kit.cylr("interior", 0.32, 0.32, 0.04, 10, IRON, s * w / 4, h * 0.85 + 0.35, -d / 2 + 0.1, rx=math.pi / 2)
        kit.ball("interior", 0.07, GOLD, s * w / 4, h * 0.85 + 0.35, -d / 2 + 0.16)

def f_grindstone(kit, f):
    for s in (-1, 1):
        kit.box("interior", 0.1, 0.8, 0.1, TIMBER_D, s * 0.2, 0.4, 0)
    kit.cylr("interior", 0.42, 0.42, 0.14, 12, STONE_G, 0, 0.75, 0, rz=math.pi / 2)
    kit.cylr("interior", 0.04, 0.04, 0.6, 6, IRON, 0, 0.75, 0, rz=math.pi / 2)
    kit.box("interior", 0.06, 0.3, 0.06, IRON, 0.3, 0.62, 0)
    kit.box("interior", 0.7, 0.2, 0.4, TIMBER_M, 0, 0.1, 0)
    kit.box("interior", 0.36, 0.1, 0.3, WATER, 0, 0.25, 0)

def f_still(kit, f):
    kit.box("interior", 1.2, 0.5, 1.2, QUOIN, 0, 0.25, 0)
    kit.box("interior", 1.3, 0.06, 1.3, STONE_D, 0, 0.52, 0)
    kit.box("glowFire", 0.5, 0.18, 0.06, [0xff7a2a, 0xffa040], 0, 0.2, 0.6)
    kit.box("interior", 0.6, 0.06, 0.04, IRON, 0, 0.33, 0.61)
    kit.cylr("interior", 0.55, 0.5, 0.75, 12, COPPER, 0, 0.88, 0)
    kit.cylr("interior", 0.57, 0.57, 0.05, 12, [0x8a5226], 0, 0.7, 0)
    kit.ball("interior", 0.56, COPPER, 0, 1.25, 0, 1, 0.55, 1)
    kit.cone("interior", 0.22, 0.5, 10, COPPER, 0, 1.75, 0)
    kit.cylr("interior", 0.05, 0.05, 1.2, 6, COPPER, 0.45, 1.75, 0, rz=-1.05)
    kit.cylr("interior", 0.32, 0.32, 0.9, 10, TIMBER_M, 0.0, 0.45, -0.1)
    kit.cylr("interior", 0.06, 0.06, 0.3, 6, COPPER, 0.95, 1.2, 0, rz=math.pi / 2)
    for k in range(4):
        kit.cylr("interior", 0.14, 0.14, 0.04, 8, COPPER, 0.95, 0.5 + k * 0.16, 0)
    kit.cylr("glowPotion", 0.12, 0.16, 0.3, 8, [0x6fd08a], 0.95, 0.15, 0.55)

def f_cauldron(kit, f):
    for i in range(3):
        a = i / 3 * math.pi * 2
        kit.ball("interior", 0.18, RUBBLE, math.cos(a) * 0.38, 0.1, math.sin(a) * 0.38)
    kit.ball("interior", 0.5, IRON, 0, 0.5, 0, 1, 0.8, 1)
    kit.cylr("interior", 0.46, 0.46, 0.06, 12, IRON, 0, 0.82, 0)
    kit.cylr("glowPotion", 0.42, 0.42, 0.04, 12, [0x6fd08a, 0x58c070], 0, 0.8, 0)
    for i in range(5):
        kit.ball("glowFire", 0.08, [0xff7a2a, 0xffa040], kit.r.uniform(-0.15, 0.15), 0.08, kit.r.uniform(-0.15, 0.15))
    kit.box("interior", 0.06, 0.9, 0.06, TIMBER_L, 0.15, 1.05, 0, rz=0.4)

def f_lectern(kit, f):
    h = f["h"]
    kit.box("interior", 0.5, 0.08, 0.4, TIMBER_D, 0, 0.04, 0)
    kit.box("interior", 0.14, h - 0.1, 0.14, TIMBER_M, 0, (h - 0.1) / 2, 0)
    kit.box("interior", f["w"], 0.06, f["d"], TIMBER_L, 0, h, 0, rx=0.35)
    kit.box("interior", 0.6, 0.06, 0.42, CREAM, 0, h + 0.06, 0.02, rx=0.35)
    kit.box("interior", 0.02, 0.07, 0.42, [0x8e3a2e], 0, h + 0.065, 0.02, rx=0.35)

def f_dummy(kit, f):
    h = f["h"]
    kit.cylr("interior", 0.35, 0.4, 0.1, 8, QUOIN, 0, 0.05, 0)
    kit.box("interior", 0.12, h, 0.12, TIMBER_D, 0, h / 2, 0)
    kit.cylr("interior", 0.26, 0.22, 0.75, 8, STRAW, 0, 1.15, 0)
    for y in (0.9, 1.15, 1.4):
        kit.cylr("interior", 0.27, 0.27, 0.04, 8, [0x8a6a44], 0, y, 0)
    kit.box("interior", 1.0, 0.1, 0.1, TIMBER_M, 0, 1.4, 0)
    kit.ball("interior", 0.2, BURLAP, 0, h - 0.1, 0)
    kit.box("interior", 0.3, 0.04, 0.02, [0x8e3a2e], 0, 1.25, 0.24)
    kit.box("interior", 0.04, 0.3, 0.02, [0x8e3a2e], 0, 1.25, 0.24)

def f_brazier(kit, f):
    h = f["h"]
    for i in range(3):
        a = i / 3 * math.pi * 2
        kit.box("interior", 0.05, h - 0.2, 0.05, IRON, math.cos(a) * 0.18, (h - 0.2) / 2, math.sin(a) * 0.18, ry=-a)
    kit.cylr("interior", 0.3, 0.16, 0.22, 8, IRON, 0, h - 0.1, 0)
    kit.cone("glowFire", 0.2, 0.42, 6, [0xff8a2a, 0xffc060], 0, h + 0.2, 0)
    for i in range(5):
        kit.ball("glowFire", 0.07, [0xff5a1a, 0xff7a2a], kit.r.uniform(-0.15, 0.15), h + 0.02, kit.r.uniform(-0.15, 0.15))

def f_kegs(kit, f):
    w, d = f["w"], f["d"]
    kit.box("interior", w, 0.3, d, TIMBER_D, 0, 0.15, 0)
    for i in range(3):
        x = -w / 3 + i * w / 3
        restore = sub(kit, x, 0.62, 0)
        kit.frame = kit.frame @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation((0, -(d - 0.05) / 2, 0))
        barrel(kit, "interior", 0.32, d - 0.05)
        restore()
        kit.cylr("interior", 0.04, 0.04, 0.16, 6, GOLD, x, 0.5, d / 2 + 0.02, rx=math.pi / 2)
    plank_top(kit, "interior", w, d, 1.03, 0.06, TIMBER_L)
    for i in range(6):
        x = -w / 2 + 0.3 + i * 0.55
        kit.cylr("interior", 0.08, 0.07, 0.2, 7, [0xb8b2a4, 0x8d5b34], x, 1.13, 0)
        kit.box("interior", 0.03, 0.1, 0.06, [0xb8b2a4], x + 0.09, 1.13, 0)

def f_fireplace(kit, f):
    w, d, h = f["w"], f["d"], f["h"]
    top = f.get("top") or 3.6
    kit.box("interior", w, h, d, {"*": MORTAR}, 0, h / 2, 0)
    restore = sub(kit, 0, 0, d / 2)
    y = 0; i = 0
    while y < h - 0.05:
        hh = min(0.28, h - y)
        course_row(kit, -w / 2, w / 2, y, hh, [(-0.62, 0.62, -1, 0.98)], RUBBLE, 0.02, 0.04, 0.3, 0.55, role="interior",
                   stagger=0.5 if i % 2 else 1.0)
        y += hh; i += 1
    restore()
    kit.box("interior", 1.2, 0.9, 0.2, [0x1c1c1e], 0, 0.5, d / 2 - 0.05)
    for s in (-1, 1):
        kit.box("interior", 0.18, 1.0, 0.24, QUOIN, s * 0.68, 0.5, d / 2)
    kit.box("interior", 1.6, 0.2, 0.26, QUOIN, 0, 1.04, d / 2)
    for k in range(3):
        kit.cylr("interior", 0.07, 0.08, 0.7, 6, [0x5a3a24, 0x6b4428], -0.15 + k * 0.15, 0.12 + (k == 1) * 0.1, d / 2 - 0.1, ry=0.3 * (k - 1), rz=math.pi / 2)
    kit.cone("glowFire", 0.3, 0.6, 6, [0xff8a2a, 0xffc060], 0, 0.42, d / 2 - 0.1)
    kit.box("interior", w + 0.3, 0.14, d + 0.2, TIMBER_D, 0, 1.2, 0.05)
    for i in range(3):
        kit.cylr("interior", 0.06, 0.05, 0.16, 7, [0xb8b2a4, 0x8a5226, 0xd4a03a], -0.4 + i * 0.35, 1.35, 0.1)
    kit.box("interior", w * 0.7, top - h, d * 0.8, {"*": MORTAR}, 0, h + (top - h) / 2, -0.05)
    restore = sub(kit, 0, 0, -0.05 + d * 0.4)
    y = h + 0.14; i = 0
    while y < top - 0.05:
        hh = min(0.3, top - y)
        course_row(kit, -w * 0.35, w * 0.35, y, hh, [], RUBBLE, 0.02, 0.04, 0.3, 0.5, role="interior", stagger=0.5 if i % 2 else 1.0)
        y += hh; i += 1
    restore()

def f_bankCounter(kit, f):
    w, d, h = f["w"], f["d"], f["h"]
    kit.box("interior", w, h - 0.08, d, {"*": MORTAR}, 0, (h - 0.08) / 2, 0)
    restore = sub(kit, 0, 0, d / 2)
    course_row(kit, -w / 2, w / 2, 0, h - 0.08, [], ASHLAR, 0.02, 0.02, 0.6, 0.6, role="interior", gap=0.02, stagger=1.0)
    restore()
    plank_top(kit, "interior", w + 0.12, d + 0.12, h, 0.08, TIMBER_D)
    kit.box("interior", w, 0.06, 0.06, GOLD, 0, h + 1.0, 0)
    x = -w / 2 + 0.1
    while x <= w / 2:
        if abs(x) >= 0.35:
            kit.box("interior", 0.03, 1.0, 0.03, GOLD, x, h + 0.5, 0)
        x += 0.22
    kit.box("interior", 0.74, 0.06, 0.06, GOLD, 0, h + 0.5, 0)
    kit.box("interior", 0.42, 0.5, 0.36, CREAM, -1.2, h + 0.03, 0.05)
    for i in range(5):
        kit.cylr("interior", 0.05, 0.05, 0.015, 7, GOLD, 0.8 + i * 0.03, h + 0.008 + i * 0.016, 0.1)
    kit.cylr("interior", 0.03, 0.03, 0.22, 6, [0xf4e7c8], 1.6, h + 0.11, 0)
    kit.cylr("interior", 0.08, 0.08, 0.02, 8, GOLD, 1.6, h + 0.01, 0)
    kit.cone("glowFire", 0.03, 0.06, 4, [0xffc060], 1.6, h + 0.25, 0)

def f_vault(kit, f):
    w, h = f["w"], f["h"]
    kit.box("interior", w + 0.4, h + 0.3, 0.1, STONE_D, 0, (h + 0.3) / 2, 0)
    kit.cylr("interior", w / 2, w / 2, 0.14, 16, IRON, 0, h / 2 + 0.1, 0.08, rx=math.pi / 2)
    kit.cylr("interior", w / 2 - 0.08, w / 2 - 0.08, 0.04, 16, [0x3b3f45], 0, h / 2 + 0.1, 0.16, rx=math.pi / 2)
    for k in range(8):
        a = k / 8 * math.pi * 2
        kit.ball("interior", 0.04, GOLD, math.cos(a) * (w / 2 - 0.12), h / 2 + 0.1 + math.sin(a) * (w / 2 - 0.12), 0.17)
    kit.cylr("interior", 0.22, 0.22, 0.08, 10, GOLD, 0, h / 2 + 0.1, 0.18, rx=math.pi / 2)
    for k in range(4):
        kit.box("interior", 0.05, 0.5, 0.05, GOLD, 0, h / 2 + 0.1, 0.24, rz=k * math.pi / 4)

def f_bed(kit, f):
    w, d = f["w"], f["d"]
    kit.box("interior", w, 0.3, d, TIMBER_M, 0, 0.17, 0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            kit.box("interior", 0.1, 0.5 if sz > 0 else 1.0, 0.1, TIMBER_D, sx * (w / 2 - 0.05), (0.5 if sz > 0 else 1.0) / 2, sz * (d / 2 - 0.05))
    kit.box("interior", w - 0.1, 0.16, d - 0.15, [0xe7d7b4], 0, 0.4, 0.05)
    quilt = kit.pick([[0x8e3a2e], [0x2d62c8], [0x3e6a4a], [0x7a4a8c]])
    kit.box("interior", w - 0.04, 0.12, d * 0.6, quilt, 0, 0.5, d * 0.18)
    kit.box("interior", w + 0.02, 0.25, d * 0.6, quilt, 0, 0.4, d * 0.18, skip=("+y",))
    kit.box("interior", w - 0.02, 0.13, 0.08, CREAM, 0, 0.51, d * 0.18 - d * 0.3 + 0.04)
    kit.box("interior", w * 0.6, 0.14, 0.32, [0xf4e7c8], 0, 0.53, -d / 2 + 0.3, rx=-0.15)
    kit.box("interior", w, 0.9, 0.08, TIMBER_D, 0, 0.55, -d / 2 + 0.04)
    kit.box("interior", w - 0.3, 0.5, 0.1, TIMBER_L, 0, 0.6, -d / 2 + 0.06)

def f_chest(kit, f):
    w, d, h = f["w"], f["d"], f["h"]
    kit.box("interior", w, h * 0.72, d, TIMBER_M, 0, h * 0.36, 0)
    kit.cylr("interior", d / 2 + 0.02, d / 2 + 0.02, w + 0.04, 8, TIMBER_L, 0, h * 0.72, 0, rz=math.pi / 2)
    kit.box("interior", w + 0.06, 0.05, d + 0.06, IRON, 0, h * 0.72, 0)
    for s in (-1, 1):
        kit.box("interior", 0.06, h * 0.72, d + 0.04, IRON, s * (w / 2 - 0.12), h * 0.36, 0)
    kit.box("interior", 0.1, 0.12, 0.04, GOLD, 0, h * 0.66, d / 2 + 0.03)

def f_wardrobe(kit, f):
    w, d, h = f["w"], f["d"], f["h"]
    kit.box("interior", w, h, d, TIMBER_M, 0, h / 2, 0)
    for s in (-1, 1):
        kit.box("interior", w / 2 - 0.12, h - 0.4, 0.03, TIMBER_L, s * w / 4, h / 2 + 0.05, d / 2 + 0.015)
        kit.box("interior", 0.04, 0.16, 0.04, GOLD, s * 0.06, h / 2, d / 2 + 0.04)
    kit.box("interior", 0.04, h - 0.2, 0.04, TIMBER_D, 0, h / 2, d / 2 + 0.01)
    kit.box("interior", w + 0.1, 0.1, d + 0.1, TIMBER_D, 0, h + 0.05, 0)
    kit.box("interior", w + 0.04, 0.12, d + 0.04, TIMBER_D, 0, 0.06, 0)

def f_coffer(kit, f):
    h = f["h"]
    kit.box("interior", f["w"], 0.22, f["d"], TIMBER_D, 0, h + 0.11, 0)
    kit.box("interior", f["w"] + 0.02, 0.04, f["d"] + 0.02, GOLD, 0, h + 0.2, 0)
    for i in range(9):
        kit.cylr("interior", 0.06, 0.06, 0.02, 8, GOLD, (i % 3 - 1) * 0.13, h + 0.24 + (i // 3) * 0.02, kit.r.uniform(-0.08, 0.08))

def f_trophy(kit, f):
    w, h = f["w"], f["h"]
    kit.box("interior", w, 0.8, 0.08, TIMBER_D, 0, h, 0)
    kit.box("interior", w + 0.1, 0.9, 0.05, GOLD, 0, h, -0.03)
    kit.cone("glowFire", 0.16, 0.5, 4, [0xff8a2a, 0xffc060], 0, h, 0.12, rz=math.pi)
    for s in (-1, 1):
        kit.cone("interior", 0.08, 0.5, 4, IRON, s * (w / 2 - 0.2), h + 0.15, 0.1, rz=-s * 0.6)

def f_armorStand(kit, f):
    kit.cylr("interior", 0.3, 0.34, 0.08, 8, TIMBER_D, 0, 0.04, 0)
    kit.box("interior", 0.08, 1.4, 0.08, TIMBER_D, 0, 0.75, 0)
    kit.box("interior", 0.62, 0.7, 0.36, STEEL, 0, 1.2, 0)
    kit.box("interior", 0.5, 0.08, 0.38, STEEL, 0, 1.0, 0)
    kit.box("interior", 0.66, 0.1, 0.4, GOLD, 0, 0.88, 0)
    for s in (-1, 1):
        kit.ball("interior", 0.2, STEEL, s * 0.36, 1.48, 0)
    kit.cone("interior", 0.2, 0.36, 8, STEEL, 0, 1.75, 0)
    kit.box("interior", 0.26, 0.04, 0.04, [0x14100e], 0, 1.7, 0.18)

def f_herbRack(kit, f):
    w, h = f["w"], f["h"]
    kit.box("interior", w, 0.06, 0.06, TIMBER_D, 0, h, 0)
    for i in range(9):
        x = -w / 2 + 0.2 + i * (w - 0.4) / 8
        kit.box("interior", 0.015, 0.3, 0.015, [0xb8984c], x, h - 0.15, 0)
        kit.cone("interior", 0.09, 0.32, 5, [0x3e9a36, 0x67b84a, 0x8d7a3a, 0xc7b0f0][i % 4], x, h - 0.42, 0, rz=math.pi)

def f_alembic(kit, f):
    f_table(kit, {"w": f["w"], "d": f["d"], "h": f["h"]})
    h = f["h"]
    kit.ball("glowPotion", 0.17, [0x7eb6ef], -0.15, h + 0.17, 0)
    kit.cylr("interior", 0.03, 0.03, 0.5, 6, COPPER, 0.08, h + 0.4, 0, rz=-0.9)
    kit.ball("glowPotion", 0.1, [0xe0605a], 0.3, h + 0.1, 0)
    kit.box("interior", 0.04, 0.4, 0.04, IRON, -0.15, h + 0.2, -0.2)

def f_crystal(kit, f):
    h = f["h"]
    kit.cylr("interior", 0.12, 0.14, 0.05, 8, GOLD, 0, h + 0.025, 0)
    kit.cone("glowPotion", 0.13, 0.18, 4, [0xb08ae0, 0x7eb6ef], 0, h + 0.29, 0)
    kit.cone("glowPotion", 0.13, 0.18, 4, [0xb08ae0, 0x7eb6ef], 0, h + 0.11, 0, rz=math.pi)

def f_banner(kit, f):
    w, h = f["w"], f["h"]
    col = [f.get("color") or 0x2d62c8]
    kit.box("interior", w + 0.2, 0.06, 0.06, TIMBER_D, 0, h, 0)
    for s in (-1, 1):
        kit.ball("interior", 0.05, GOLD, s * (w / 2 + 0.12), h, 0)
    kit.box("interior", w, 1.4, 0.03, col, 0, h - 0.75, 0)
    kit.cone("interior", w / 2, 0.35, 3, col, 0, h - 1.6, 0, rz=math.pi)
    kit.box("interior", w * 0.5, 0.06, 0.035, GOLD, 0, h - 0.5, 0.01)
    kit.box("interior", 0.06, w * 0.5, 0.035, GOLD, 0, h - 0.5, 0.01)

def f_bunting(kit, f, role="interior"):
    w, d, h = f["w"], f["d"], f["h"]
    flags = [[0xb64034], [0xd4a03a], [0x2d62c8], [0x3e9a36]]
    for ax, az, bx, bz in ((-w / 2, -d / 2, w / 2, d / 2), (-w / 2, d / 2, w / 2, -d / 2)):
        n = 14
        string_line(kit, role, ax, az, bx, bz, h + 0.13, 0.5, n)
        for i in range(n + 1):
            t = i / n
            pennant(kit, role, ax + (bx - ax) * t, h - math.sin(t * math.pi) * 0.5, az + (bz - az) * t, math.atan2(bx - ax, bz - az), flags[i % 4])

def f_tavernTable(kit, f):
    h = f["h"]
    r = min(f["w"], f["d"]) / 2
    kit.cylr("interior", r * 0.75, r * 0.75, 0.07, 10, TIMBER_L, 0, h - 0.035, 0)
    kit.cylr("interior", 0.08, 0.14, h - 0.07, 6, TIMBER_D, 0, (h - 0.07) / 2, 0)
    kit.cylr("interior", 0.3, 0.32, 0.05, 6, TIMBER_D, 0, 0.025, 0)
    for i in range(3):
        a = i / 3 * math.pi * 2 + 0.5
        stool(kit, math.cos(a) * r * 1.1, math.sin(a) * r * 1.1)
    kit.cylr("interior", 0.07, 0.06, 0.16, 7, [0xb8b2a4], 0.15, h + 0.08, 0.1)
    kit.box("interior", 0.03, 0.1, 0.06, [0xb8b2a4], 0.24, h + 0.08, 0.1)
    kit.cylr("interior", 0.14, 0.14, 0.02, 8, [0xe7d7b4], -0.15, h + 0.01, -0.1)

FURNITURE = {k[2:]: v for k, v in list(globals().items()) if k.startswith("f_") and callable(v)}

# ---------------------------------------------------------------- props

def p_well(kit, p):
    r = p["r"]
    seg = 12
    # stone drum of blocks
    for k in range(3):
        y = 0.05 + k * 0.28
        for i in range(seg):
            a = (i + 0.5 * (k % 2)) / seg * math.pi * 2
            kit.box("props", 2 * math.pi * r / seg - 0.04, 0.26, 0.24, QUOIN if k == 2 else RUBBLE,
                    math.cos(a) * (r - 0.06), y + 0.13, math.sin(a) * (r - 0.06), ry=-a + math.pi / 2)
    kit.cylr("props", r - 0.15, r - 0.15, 0.8, seg, {"*": MORTAR}, 0, 0.4, 0)
    kit.cylr("props", r - 0.17, r - 0.17, 0.04, seg, [0x2a4a5c], 0, 0.6, 0)
    kit.cylr("props", r + 0.1, r + 0.12, 0.1, seg, PLINTH, 0, 0.03, 0)
    # posts tall enough that the eaves clear a head (about 2.3 m)
    for s in (-1, 1):
        kit.box("props", 0.16, 2.9, 0.16, TIMBER_D, s * (r - 0.05), 1.45, 0)
        kit.box("props", 0.12, 0.6, 0.12, TIMBER_D, s * (r - 0.3), 2.72, 0, rz=s * 0.7)
    kit.box("props", r * 2 + 0.3, 0.12, 0.12, TIMBER_M, 0, 2.55, 0)
    kit.cylr("props", 0.08, 0.08, r * 2 - 0.1, 8, TIMBER_L, 0, 1.4, 0, rz=math.pi / 2)
    kit.box("props", 0.05, 0.3, 0.05, IRON, r - 0.05, 1.25, 0.12)
    kit.box("props", 0.2, 0.05, 0.05, IRON, r - 0.05, 1.12, 0.22)
    kit.box("props", 0.015, 0.4, 0.015, [0xc2a36b], 0.15, 1.2, 0)
    restore = sub(kit, 0.15, 0.88, 0)
    barrel(kit, "props", 0.13, 0.22)
    restore()
    # little shingled roof, just wider than the drum
    ang = 0.55
    rw = r * 2 + 0.35
    for s in (-1, 1):
        restore = sub(kit, 0, 2.95, 0, 0 if s > 0 else math.pi)
        kit.frame = kit.frame @ Matrix.Rotation(ang, 4, 'X')
        ln = r + 0.2
        kit.box("props", rw, 0.06, ln, TIMBER_D, 0, 0.03, ln / 2)
        rows = int(ln / 0.16)
        for i in range(rows):
            x = -rw / 2
            while x < rw / 2 - 0.02:
                w = min(kit.r.uniform(0.14, 0.24), rw / 2 - x)
                kit.box("props", w - 0.015, 0.025, 0.24, tones(0x6e2e28, 0.12, 6), x + w / 2, 0.075, ln - i * 0.16 - 0.1, rx=-0.08)
                x += w
        restore()
    kit.box("props", rw + 0.06, 0.12, 0.12, TIMBER_D, 0, 3.0, 0, rx=math.pi / 4)

def p_stall(kit, p):
    w, d = p["w"], p["d"]
    aw = p.get("awning", 0xb64034)
    for sx in (-1, 1):
        for sz in (-1, 1):
            h = 2.5 if sz < 0 else 2.1
            kit.box("props", 0.12, h, 0.12, TIMBER_D, sx * (w / 2 - 0.06), h / 2, sz * (d / 2 - 0.06))
    kit.box("props", w - 0.1, 0.8, d * 0.7, TIMBER_M, 0, 0.42, 0.1)
    for i in range(int(w / 0.22)):
        kit.box("props", 0.2, 0.74, 0.03, kit.pick(PLANK), -w / 2 + 0.16 + i * 0.22, 0.42, 0.1 + d * 0.35 + 0.015)
    plank_top(kit, "props", w, d * 0.75, 0.9, 0.06, TIMBER_L)
    goods_row(kit, "props", w - 0.3, 0.9, 0.1, d * 0.6)
    # canopy: striped cloth with a scalloped valance
    stripes = 6
    ang = math.atan2(0.45, d + 0.4)
    for i in range(stripes):
        col = CREAM if i % 2 else [aw]
        x = -w / 2 + (i + 0.5) * (w / stripes)
        kit.box("props", w / stripes + 0.01, 0.04, d + 0.6, col, x, 2.33, 0.05, rx=ang)
        kit.box("props", w / stripes + 0.01, 0.22, 0.03, col, x, 2.0, d / 2 + 0.33)
        kit.cone("props", w / stripes / 2, 0.14, 3, col, x, 1.82, d / 2 + 0.33, rz=math.pi)
    kit.box("props", w + 0.1, 0.06, 0.06, TIMBER_D, 0, 2.12, d / 2 + 0.33)
    # crates and a basket beside
    crate(kit, "props", 0.45, 0.35, w / 2 - 0.3, 0, -d / 2 + 0.05, 0.2)
    kit.cylr("props", 0.2, 0.15, 0.22, 8, STRAW, -w / 2 + 0.35, 0.11, -d / 2 + 0.15)
    for i in range(4):
        kit.ball("props", 0.06, [0xb64034, 0x3e9a36, 0xd4a03a], -w / 2 + 0.3 + (i % 2) * 0.1, 0.25, -d / 2 + 0.1 + (i // 2) * 0.1)

def p_bench(kit, p):
    f_bench(kit, {"w": p["w"], "d": p["d"], "h": 0.48}, role="props")
    kit.box("props", p["w"], 0.4, 0.06, TIMBER_L, 0, 0.78, -p["d"] / 2 + 0.03, rx=-0.15)
    for s in (-1, 1):
        kit.box("props", 0.08, 0.5, 0.08, TIMBER_D, s * (p["w"] / 2 - 0.2), 0.7, -p["d"] / 2 + 0.04, rx=-0.15)

def p_notice(kit, p):
    w = p["w"]
    for s in (-1, 1):
        kit.box("props", 0.14, 2.3, 0.14, TIMBER_D, s * (w / 2 - 0.07), 1.15, 0)
        kit.box("props", 0.3, 0.12, 0.3, PLINTH, s * (w / 2 - 0.07), 0.06, 0)
    kit.box("props", w, 1.0, 0.08, TIMBER_M, 0, 1.5, 0)
    kit.box("props", w + 0.06, 0.08, 0.12, TIMBER_D, 0, 2.04, 0)
    kit.box("props", w + 0.06, 0.08, 0.12, TIMBER_D, 0, 0.96, 0)
    # little slate roof
    for s in (-1, 1):
        kit.box("props", w + 0.4, 0.05, 0.5, tones(0x2f363e, 0.1, 5), 0, 2.32, s * 0.2, rx=s * 0.55)
    kit.box("props", w + 0.42, 0.1, 0.1, CLAY, 0, 2.46, 0, rx=math.pi / 4)
    for i in range(6):
        x = -w / 2 + 0.3 + i * (w - 0.6) / 5
        kit.box("props", kit.r.uniform(0.22, 0.32), kit.r.uniform(0.28, 0.4), 0.015, CREAM, x, 1.5 + kit.r.uniform(-0.2, 0.2),
                0.05, rz=kit.r.uniform(-0.12, 0.12))
        kit.box("props", 0.03, 0.03, 0.02, [0xb64034], x, 1.67, 0.06)
    kit.box("props", 0.4, 0.06, 0.15, TIMBER_L, w / 2 - 0.3, 0.9, 0.12)

def p_wayboard(kit, p):
    # A painted town map on a post, with two finger-boards above (front is local +z).
    w = p["w"]
    kit.box("props", 0.5, 0.16, 0.5, PLINTH, 0, 0.08, -0.08)
    kit.box("props", 0.16, 2.95, 0.16, TIMBER_D, 0, 1.475, -0.08)
    kit.cone("props", 0.14, 0.22, 4, TIMBER_D, 0, 3.06, -0.08, ry=math.pi / 4)
    kit.box("props", w, 0.86, 0.06, TIMBER_M, 0, 1.4, 0.02)
    for y in (0.95, 1.85):
        kit.box("props", w + 0.08, 0.07, 0.1, TIMBER_D, 0, y, 0.02)
    for s in (-1, 1):
        kit.box("props", 0.07, 0.97, 0.1, TIMBER_D, s * (w / 2 + 0.005), 1.4, 0.02)
        kit.box("props", 0.05, 0.05, 0.03, IRON, s * (w / 2 - 0.08), 1.85, 0.08)
    # the map: green wood, the grey square, the gate road north, roofs round it
    kit.box("props", w - 0.14, 0.72, 0.012, [0x5e8a3a, 0x568234], 0, 1.4, 0.056)
    kit.cylr("props", 0.1, 0.1, 0.012, 12, [0xb8b2a4], 0, 1.36, 0.064, rx=math.pi / 2)
    kit.box("props", 0.05, 0.3, 0.012, [0xc9a85a], 0, 1.6, 0.064)
    kit.box("props", 0.09, 0.09, 0.014, [0x2d62c8], 0, 1.71, 0.066, rz=math.pi / 4)
    roofs = [0x6e2e28, 0x2f363e, 0x3d4a3a, 0x7a4a2a, 0x2f363e, 0x6e2e28]
    spots = [(-0.3, 0.02), (0.3, 0.02), (-0.22, 0.2), (0.22, 0.2), (0, -0.24), (-0.22, -0.18)]
    for (sx, sy), c in zip(spots, roofs):
        kit.box("props", 0.1, 0.08, 0.014, [c], sx, 1.36 + sy, 0.066)
    for i in range(5):
        a = i / 5 * math.pi * 2
        kit.box("props", 0.035, 0.035, 0.012, [0xd8b968], math.cos(a) * 0.16, 1.36 + math.sin(a) * 0.16, 0.066)
    # finger-boards: one toward the square, one toward the gate
    for y, s in ((2.3, 1), (2.62, -1)):
        kit.box("props", 0.7, 0.15, 0.04, CREAM, s * 0.38, y, -0.08)
        kit.box("props", 0.11, 0.11, 0.04, CREAM, s * 0.73, y, -0.08, rz=math.pi / 4)
        kit.box("props", 0.4, 0.02, 0.045, [0x6b4428], s * 0.36, y, -0.08)
        kit.box("props", 0.04, 0.04, 0.05, IRON, 0, y, -0.08)

def p_cart(kit, p):
    w, d = p["w"], p["d"]
    plank_top(kit, "props", w, d - 0.6, 0.8, 0.1, TIMBER_L)
    for s in (-1, 1):
        kit.box("props", 0.08, 0.4, d - 0.6, TIMBER_M, s * (w / 2 - 0.04), 0.98, -0.3)
        for k in range(3):
            kit.box("props", 0.1, 0.5, 0.06, TIMBER_D, s * (w / 2 - 0.02), 0.95, -0.3 - (d - 0.6) / 2 + 0.1 + k * (d - 0.8) / 2)
    kit.box("props", w - 0.08, 0.4, 0.08, TIMBER_M, 0, 0.98, -0.3 - (d - 0.6) / 2)
    for i in range(6):
        kit.box("props", kit.r.uniform(0.5, 0.8), 0.3, 0.45, STRAW, kit.r.uniform(-0.2, 0.2), 1.0 + (i // 3) * 0.2,
                -0.3 + kit.r.uniform(-0.6, 0.6), ry=kit.r.uniform(-0.3, 0.3))
    for s in (-1, 1):
        restore = sub(kit, s * (w / 2 + 0.1), 0.5, -0.4)
        kit.cylr("props", 0.5, 0.5, 0.06, 12, TIMBER_D, 0, 0, 0, rz=math.pi / 2)
        kit.cylr("props", 0.42, 0.42, 0.07, 12, TIMBER_M, 0, 0, 0, rz=math.pi / 2)
        for k in range(6):
            kit.box("props", 0.05, 0.8, 0.05, TIMBER_D, 0, 0, 0, rx=k * math.pi / 6)
        kit.cylr("props", 0.1, 0.1, 0.14, 8, IRON, 0, 0, 0, rz=math.pi / 2)
        restore()
        kit.box("props", 0.08, 0.08, 1.4, TIMBER_M, s * 0.45, 0.6, d / 2 - 0.2, rx=-0.2)
    kit.box("props", 1.0, 0.08, 0.08, TIMBER_M, 0, 0.47, d / 2 + 0.4)

def p_woodpile(kit, p):
    w, d = p["w"], p["d"]
    for row in range(3):
        for i in range(6 - row):
            x = -w / 2 + 0.2 + (i + row * 0.5) * 0.32
            kit.cylr("props", 0.15, 0.15, d, 7, [0x6b4428, 0x8d5b34, 0x5a3a24], x, 0.15 + row * 0.26, 0, rx=math.pi / 2)
            kit.cylr("props", 0.11, 0.11, 0.01, 7, [0xc9a06a, 0xb88f5a], x, 0.15 + row * 0.26, d / 2 + 0.005, rx=math.pi / 2)
    for s in (-1, 1):
        kit.box("props", 0.08, 0.9, 0.08, TIMBER_D, s * (w / 2 + 0.05), 0.45, 0)
    kit.cylr("props", 0.22, 0.25, 0.4, 8, TIMBER_M, w / 2 + 0.5, 0.2, 0.2)
    kit.box("props", 0.05, 0.5, 0.05, TIMBER_L, w / 2 + 0.5, 0.55, 0.2, rz=0.3)
    kit.box("props", 0.14, 0.1, 0.03, IRON, w / 2 + 0.47, 0.4, 0.2, rz=0.3)

def p_barrels(kit, p):
    for i in range(3):
        a = i / 3 * math.pi * 2
        restore = sub(kit, math.cos(a) * 0.38, 0, math.sin(a) * 0.38)
        barrel(kit, "props", 0.285, 0.85)
        restore()

def p_trough(kit, p):
    f_trough(kit, {"w": p["w"], "d": p["d"], "h": 0.65})

def p_statue(kit, p):
    r = p["r"]
    st = [0x9aa0a4, 0x8a8f93]
    kit.cylr("props", r, r + 0.1, 0.5, 10, QUOIN, 0, 0.25, 0)
    kit.box("props", r * 1.3, 0.6, r * 1.3, QUOIN, 0, 0.8, 0)
    kit.box("props", r * 1.4, 0.1, r * 1.4, ASHLAR, 0, 1.13, 0)
    kit.box("props", r * 1.35, 0.06, 0.05, GOLD, 0, 0.9, r * 0.66)
    for s in (-1, 1):
        kit.box("props", 0.24, 0.9, 0.24, st, s * 0.16, 1.63, 0)
    kit.box("props", 0.82, 0.5, 0.46, st, 0, 1.95, 0)
    kit.box("props", 0.78, 0.7, 0.42, st, 0, 2.38, 0)
    for s in (-1, 1):
        kit.ball("props", 0.2, st, s * 0.46, 2.68, 0)
    kit.ball("props", 0.24, st, 0, 3.03, 0)
    kit.cone("props", 0.27, 0.36, 6, st, 0, 3.23, 0.03)
    kit.box("props", 0.06, 1.1, 0.04, st, 0.5, 2.68, -0.25, rx=-0.4)
    kit.cylr("props", 0.26, 0.26, 0.06, 8, st, -0.5, 2.48, -0.2, rx=math.pi / 2)
    kit.box("props", 0.7, 1.1, 0.04, st, 0, 2.2, -0.24, rx=0.12)

def p_bunting(kit, p):
    posts = [[8.4, -6.2], [-9.8, 1.0], [-8.4, -6.8], [9.6, 2.4], [2.6, 10.6], [-2.6, 10.6]]
    flags = [[0xb64034], [0xd4a03a], [0x2d62c8], [0x3e9a36], [0xf4e7c8]]
    # Each lamp post that carries a string gets a pole on top, so the flags hang well overhead.
    top = 3.95
    for x, z in posts:
        kit.cylr("props", 0.05, 0.07, top - 2.6, 6, TIMBER_D, x, (top + 2.6) / 2, z)
        kit.ball("props", 0.08, GOLD, x, top + 0.05, z)
    k = 0
    for a, c in ((0, 1), (2, 3), (4, 2), (5, 0)):
        ax, az = posts[a]
        bx, bz = posts[c]
        n = round(math.hypot(bx - ax, bz - az) / 0.55)
        string_line(kit, "props", ax, az, bx, bz, top - 0.1, 0.55, n)
        for i in range(1, n):
            t = i / n
            pennant(kit, "props", ax + (bx - ax) * t, top - 0.25 - math.sin(t * math.pi) * 0.55, az + (bz - az) * t,
                    math.atan2(bx - ax, bz - az), flags[k % 5], 1.1)
            k += 1

def p_lamp(kit, p):
    kit.cylr("props", 0.24, 0.28, 0.24, 8, QUOIN, 0, 0.12, 0)
    kit.cylr("props", 0.09, 0.12, 2.7, 8, TIMBER_D, 0, 1.55, 0)
    kit.box("props", 0.62, 0.08, 0.08, TIMBER_D, 0.26, 2.72, 0)
    kit.box("props", 0.06, 0.4, 0.06, TIMBER_D, 0.12, 2.52, 0, rz=0.75)
    kit.box("props", 0.03, 0.18, 0.03, IRON, 0.5, 2.6, 0)
    kit.cone("props", 0.22, 0.16, 4, IRON, 0.5, 2.5, 0, ry=math.pi / 4)
    kit.box("glowLamp", 0.2, 0.28, 0.2, [0xffe0a0], 0.5, 2.28, 0)
    for dx in (-0.11, 0.11):
        for dz in (-0.11, 0.11):
            kit.box("props", 0.025, 0.3, 0.025, IRON, 0.5 + dx, 2.28, dz)
    kit.box("props", 0.26, 0.04, 0.26, IRON, 0.5, 2.13, 0)

PROPS_FN = {k[2:]: v for k, v in list(globals().items()) if k.startswith("p_") and callable(v)}

# ---------------------------------------------------------------- inside a building

def build_floor(kit, b):
    d = b.d
    kit.frame = Matrix.Identity(4)
    x0, x1 = -b.W / 2 + T, b.W / 2 - T
    z = -b.D / 2 + T
    while z < b.D / 2 - T - 0.02:
        pw = min(0.24, b.D / 2 - T - z)
        x = x0 - kit.r.uniform(0, 1.2)
        while x < x1 - 0.02:
            ln = kit.r.uniform(1.2, 2.6)
            a, c = max(x, x0), min(x + ln, x1)
            if c - a > 0.05:
                kit.box("interior", c - a - 0.01, 0.05, pw - 0.012, PLANK, (a + c) / 2, F - 0.025, z + pw / 2)
            x += ln
        z += pw
    # threshold planks under each door
    for dd in d["doors"]:
        side = dd["side"]
        if side in ("front", "back"):
            zz = (b.D / 2 - T / 2) * (1 if side == "front" else -1)
            kit.box("interior", DOOR_W, 0.05, T, PLANK, dd["at"], F - 0.025, zz)
        else:
            xx = (b.W / 2 - T / 2) * (1 if side == "right" else -1)
            kit.box("interior", T, 0.05, DOOR_W, PLANK, xx, F - 0.025, dd["at"] * (1 if side == "left" else -1))

def build_stairs(kit, b):
    s = b.d["stairs"]
    if not s:
        return
    STAIR_W = PLAN["STAIR_W"]
    rise = b.d["levelTop"] - F
    n = math.ceil(rise / 0.2)
    run = (s["z1"] - s["z0"]) / n
    kit.frame = Matrix.Identity(4)
    for k in range(n):
        top_y = F + rise * (k + 1) / n
        zc = s["z0"] + run * (k + 0.5)
        kit.box("interior", STAIR_W - 0.1, top_y - F, abs(run) + 0.01, TIMBER_M, s["x"], (top_y + F) / 2, zc)
        kit.box("interior", STAIR_W + 0.04, 0.05, abs(run) * 0.4 + 0.04, TIMBER_L, s["x"], top_y - 0.02, zc + run * 0.3)
    for sx in (-1, 1):
        ln = math.hypot(s["z1"] - s["z0"], rise)
        ang = math.atan2(rise, abs(s["z1"] - s["z0"])) * math.copysign(1, s["z0"] - s["z1"])
        kit.box("interior", 0.06, 0.3, ln, TIMBER_D, s["x"] + sx * (STAIR_W / 2 - 0.03), F + rise / 2 + 0.05, (s["z0"] + s["z1"]) / 2, rx=ang)
    room = 1 if s["x"] < 0 else -1
    rx = s["x"] + room * (STAIR_W / 2 + 0.05)
    ln = math.hypot(s["z1"] - s["z0"], rise)
    ang = math.atan2(rise, abs(s["z1"] - s["z0"])) * math.copysign(1, s["z0"] - s["z1"])
    kit.box("interior", 0.08, 0.08, ln, TIMBER_L, rx, F + rise / 2 + 0.95, (s["z0"] + s["z1"]) / 2, rx=ang)
    for k in range(1, 6):
        t = k / 6
        kit.box("interior", 0.06, 0.95, 0.06, TIMBER_D, rx, F + rise * t + 0.475, s["z0"] + (s["z1"] - s["z0"]) * t)
    kit.box("interior", 0.12, 1.2, 0.12, TIMBER_D, rx, F + 0.6, s["z0"])
    kit.ball("interior", 0.08, TIMBER_L, rx, F + 1.25, s["z0"])

def build_room(kit, b):
    """Upstairs: floor slab with a stairwell, floorboards, rails and inner trim (role shell, clipped)."""
    s = b.d["stairs"]
    if not (b.U and s):
        return
    STAIR_W = PLAN["STAIR_W"]
    uw, ud = b.W + 2 * b.J, b.D + 2 * b.J
    top = b.TOP
    sx0, sx1 = s["x"] - STAIR_W / 2, s["x"] + STAIR_W / 2
    sz0, sz1 = min(s["z0"], s["z1"]), max(s["z0"], s["z1"])
    x0, x1, z0, z1 = -uw / 2 + T, uw / 2 - T, -ud / 2 + T, ud / 2 - T
    kit.frame = Matrix.Identity(4)
    def slab(ax, bx, az, bz):
        if bx - ax < 0.01 or bz - az < 0.01:
            return
        kit.box("shell", bx - ax, 0.16, bz - az, TIMBER_M, (ax + bx) / 2, top - 0.1, (az + bz) / 2)
        # boards on top, running along z
        x = ax
        while x < bx - 0.01:
            pw = min(0.22, bx - x)
            kit.box("shell", pw - 0.012, 0.04, bz - az, PLANK, x + pw / 2, top - 0.02, (az + bz) / 2)
            x += pw
    slab(x0, sx0, z0, z1)
    slab(sx1, x1, z0, z1)
    slab(sx0, sx1, z0, sz0)
    slab(sx0, sx1, sz1, z1)
    for sgn in (-1, 1):
        for a in (-b.W / 4, b.W / 4):
            kit.box("shell", 1.1, 0.08, 0.16, TIMBER_L, a, top + b.U / 2 - 0.4, sgn * (ud / 2 - T - 0.08))
            kit.box("glass", 0.9, 0.9, 0.04, GLASS, a, top + b.U / 2 + 0.1, sgn * (ud / 2 - T - 0.01))
        kit.box("shell", uw - 2 * T, 0.18, 0.14, TIMBER_M, 0, top + b.U - 0.3, sgn * (ud / 2 - T - 0.07))
    room = 1 if s["x"] < 0 else -1
    rx = s["x"] + room * (STAIR_W / 2 + 0.05)
    low, high = s["z0"], s["z1"]
    kit.box("shell", 0.08, 0.08, abs(high - low), TIMBER_L, rx, top + 0.95, (low + high) / 2)
    kit.box("shell", STAIR_W + 0.1, 0.08, 0.08, TIMBER_L, s["x"], top + 0.95, low - math.copysign(0.05, high - low))
    for k in range(7):
        kit.box("shell", 0.07, 0.95, 0.07, TIMBER_D, rx, top + 0.475, low + (high - low) * k / 6)
    for k in range(4):
        kit.box("shell", 0.07, 0.95, 0.07, TIMBER_D, s["x"] - STAIR_W / 2 + k * STAIR_W / 3, top + 0.475, low - math.copysign(0.05, high - low))

def build_ring(kit, b):
    rg = b.d["ring"]
    if not rg:
        return
    kit.frame = Matrix.Translation((rg["x"], F, rg["z"]))
    kit.cylr("interior", rg["r"] + 0.4, rg["r"] + 0.45, 0.04, 24, QUOIN, 0, 0.02, 0)
    kit.cylr("interior", rg["r"] + 0.1, rg["r"] + 0.1, 0.045, 24, [0xb8a27a], 0, 0.022, 0)
    kit.cylr("interior", 0.6, 0.6, 0.05, 12, GOLD, 0, 0.035, 0)
    kit.cylr("interior", 0.45, 0.45, 0.055, 12, [0x8a2e2a], 0, 0.04, 0)
    for i in range(rg["stones"]):
        a = (i + 0.5) / rg["stones"] * math.pi * 2 + math.pi / 2
        h = 0.6 if i % 2 else 1.05
        kit.cylr("interior", 0.27, 0.34, h, 6, RUBBLE, math.cos(a) * rg["r"], h / 2, math.sin(a) * rg["r"], ry=a)
        kit.cylr("interior", 0.2, 0.27, 0.06, 6, LICHEN, math.cos(a) * rg["r"], h + 0.02, math.sin(a) * rg["r"], ry=a)

def tier_redirect(t):
    r = "tier%d" % t
    return {"interior": r, "props": r, "glowPotion": r, "glowFire": r, "glowLamp": r}

def build_furniture(kit, b):
    for f in b.d["furniture"]:
        fn = FURNITURE.get(f["type"])
        if not fn:
            print("no furniture builder:", f["type"])
            continue
        kit.frame = frame_at(f["x"], F, f["z"], f.get("yaw", 0))
        kit.redirect = tier_redirect(f["tier"]) if f.get("tier") else None
        fn(kit, f)
        kit.redirect = None
    for f in b.d["upperFurniture"]:
        fn = FURNITURE.get(f["type"])
        if not fn:
            continue
        kit.frame = frame_at(f["x"], b.d["levelTop"], f["z"], f.get("yaw", 0))
        kit.redirect = {"interior": "shell", "glowPotion": "shell", "glowFire": "shell"}
        fn(kit, f)
        kit.redirect = None

def build_sign(kit, b):
    if not b.d["sign"]:
        return
    d0 = b.d["doors"][0]
    side = d0["side"]
    kit.frame = b.frame(side)
    a = (d0["at"] + DOOR_W / 2 + 0.75) * b.flip(side)
    # Board centre just under door height, so the bracket stays below the eave
    # overhang and the sign reads from the street (view/buildings.js buildSign matches).
    y = DOOR_H - 0.05
    kit.box("shell", 0.08, 0.08, 1.15, IRON, a, y + 0.42, 0.55)
    kit.box("shell", 0.06, 0.5, 0.06, IRON, a, y + 0.18, 0.08, rx=0.7)
    for zz in (0.25, 0.85):
        kit.box("shell", 0.02, 0.18, 0.02, IRON, a, y + 0.32, zz)
    kit.box("shell", 0.07, 0.6, 0.86, TIMBER_M, a, y, 0.55)
    kit.box("shell", 0.08, 0.66, 0.92, GOLD, a, y, 0.55)
    kit.box("shell", 0.085, 0.5, 0.76, TIMBER_D, a, y, 0.55)
    icon = b.d["sign"]
    for s in (-1, 1):
        old = kit.frame
        kit.frame = old @ Matrix.Translation((a + s * 0.07, y, 0.55))
        sign_icon(kit, icon)
        kit.frame = old

def sign_icon(kit, icon):
    if icon == "coin":
        for i in range(3):
            kit.cylr("shell", 0.16, 0.16, 0.05, 10, GOLD, 0, -0.12 + i * 0.07, 0, rz=math.pi / 2)
    elif icon == "anvil":
        kit.box("shell", 0.1, 0.1, 0.36, IRON, 0, 0.06, 0)
        kit.box("shell", 0.1, 0.12, 0.16, IRON, 0, -0.04, 0)
        kit.box("shell", 0.1, 0.06, 0.28, IRON, 0, -0.13, 0)
    elif icon == "flask":
        kit.ball("glowPotion", 0.15, [0x6fd08a], 0, -0.06, 0, 0.6, 1, 1)
        kit.cylr("shell", 0.04, 0.04, 0.14, 6, CREAM, 0, 0.12, 0)
    elif icon == "ring":
        for k in range(8):
            a = k / 8 * math.pi * 2
            kit.box("shell", 0.08, 0.04, 0.12, GOLD, 0, math.sin(a) * 0.15, math.cos(a) * 0.15, rx=-a)
    elif icon == "key":
        for k in range(8):
            a = k / 8 * math.pi * 2
            kit.box("shell", 0.06, 0.03, 0.08, GOLD, 0, 0.12 + math.sin(a) * 0.09, math.cos(a) * 0.09, rx=-a)
        kit.box("shell", 0.05, 0.05, 0.32, GOLD, 0, 0.12, -0.24)
        kit.box("shell", 0.05, 0.12, 0.05, GOLD, 0, 0.06, -0.33)
        kit.box("shell", 0.05, 0.09, 0.05, GOLD, 0, 0.07, -0.22)
    elif icon == "tankard":
        kit.cylr("shell", 0.1, 0.11, 0.24, 8, [0xb8b2a4], 0, 0, 0)
        kit.box("shell", 0.05, 0.14, 0.06, [0xb8b2a4], 0, 0, -0.15)
        kit.cylr("shell", 0.105, 0.105, 0.05, 8, CREAM, 0, 0.13, 0)

def build_yard(kit, b):
    y = b.d["yard"]
    if not y:
        return
    kit.frame = Matrix.Identity(4)
    for f in y["fences"]:
        dx, dz = f["x1"] - f["x"], f["z1"] - f["z0"]
        ln = math.hypot(dx, dz)
        yaw = math.atan2(dx, dz)
        mx, mz = (f["x"] + f["x1"]) / 2, (f["z0"] + f["z1"]) / 2
        for yy in (0.35, 0.72):
            kit.box("yard", 0.05, 0.07, ln, TIMBER_L, mx, yy, mz, ry=yaw)
        n = max(1, round(ln / 0.16))
        for i in range(n + 1):
            t = i / n
            post = i % 3 == 0
            h = 1.0 if post else kit.r.uniform(0.82, 0.9)
            kit.box("yard", 0.09 if post else 0.1, h, 0.05 if not post else 0.08, TIMBER_M if post else [0xa88a62, 0x9a7c56, 0xb39468],
                    f["x"] + dx * t, h / 2, f["z0"] + dz * t, ry=yaw)
            if not post:
                kit.cone("yard", 0.07, 0.08, 4, [0xa88a62, 0x9a7c56], f["x"] + dx * t, h + 0.04, f["z0"] + dz * t, ry=yaw + math.pi / 4)
    g = y["garden"]
    kit.box("yard", g["w"] + 0.2, 0.12, g["d"] + 0.2, TIMBER_M, g["x"], 0.06, g["z"])
    kit.box("yard", g["w"], 0.18, g["d"], [0x4a3024, 0x5a3a24], g["x"], 0.09, g["z"])
    for r in range(4):
        kit.box("yard", g["w"] - 0.3, 0.04, 0.16, [0x3e2a1e], g["x"], 0.19, g["z"] - g["d"] / 2 + 0.35 + r * (g["d"] - 0.7) / 3)
        for c in range(5):
            px = g["x"] - g["w"] / 2 + 0.3 + c * (g["w"] - 0.6) / 4
            pz = g["z"] - g["d"] / 2 + 0.35 + r * (g["d"] - 0.7) / 3
            if r % 2:
                kit.ball("yard", 0.14, [0x3e9a36, 0x4eaf45], px, 0.28, pz, 1, 0.8, 1)
                kit.ball("yard", 0.1, [0x67b84a], px + 0.06, 0.36, pz, 1, 0.6, 1)
            else:
                for k in range(3):
                    kit.cone("yard", 0.05, 0.3, 4, [0x67b84a, 0x8bc85a], px + (k - 1) * 0.06, 0.33, pz, rz=(k - 1) * 0.25)
                kit.ball("yard", 0.06, [0xe07a2a], px, 0.2, pz)
    l = y["line"]
    for zz in (l["z0"], l["z1"]):
        kit.box("yard", 0.09, 1.9, 0.09, TIMBER_D, l["x"], 0.95, zz)
        kit.box("yard", 0.06, 0.06, 0.4, TIMBER_D, l["x"], 1.8, zz)
    string_line(kit, "yard", l["x"], l["z0"], l["x"], l["z1"], 1.82, 0.12, 8)
    cloth = [CREAM, [0x2d62c8], [0xb64034], [0xd4a03a], [0x3e6a4a]]
    for i in range(4):
        z = l["z0"] + 0.5 + i * (abs(l["z1"] - l["z0"]) - 1) / 3
        sag = math.sin((z - l["z0"]) / (l["z1"] - l["z0"]) * math.pi) * 0.12
        kit.box("yard", 0.03, 0.55 + (i % 2) * 0.2, 0.45, cloth[i], l["x"], 1.5 - (i % 2) * 0.1 - sag, z, rx=kit.r.uniform(-0.05, 0.05))
        kit.box("yard", 0.04, 0.06, 0.03, TIMBER_L, l["x"], 1.8 - sag, z - 0.15)
    # a water butt by the back wall and a stepping-stone path to the gate
    kit.frame = Matrix.Translation((b.W / 2 - 0.5, 0, -b.D / 2 - 0.5))
    barrel(kit, "yard", 0.32, 0.8, hoops=IRON, staves=TIMBER_M, lid=[0x2a4a5c])
    kit.frame = Matrix.Identity(4)
    gx = y["gate"]["x"]
    z = b.D / 2 + 0.6
    while z < y["gate"]["z"] - 0.4:
        kit.cylr("yard", 0.24, 0.26, 0.06, 7, STONE_G, gx + kit.r.uniform(-0.1, 0.1), 0.03, z, ry=kit.r.uniform(0, 1))
        z += 0.55

def furnish_building(kit, b):
    build_floor(kit, b)
    build_stairs(kit, b)
    build_room(kit, b)
    build_ring(kit, b)
    build_furniture(kit, b)
    build_sign(kit, b)
    build_yard(kit, b)

# ---------------------------------------------------------------- the square, roads, street props

COBBLE = [0x8a8f93, 0x7b8085, 0x9aa0a4, 0x6e7377, 0x858a80, 0x928e86]
DIRT = [0x9a7a52, 0x8c6d47, 0xa4865c]

def build_ground(kit):
    R = PLAN["SQUARE_R"]
    top = PLAN["SQUARE_TOP"]
    roads = PLAN["roads"]
    kit.frame = Matrix.Identity(4)
    # Mortar bed (top 0.05) sits clear above every road (centres top out at 0.034).
    kit.cylr("ground", R + 0.3, R + 0.3, 0.06, 48, [0x5d5a52], 0, 0.02, 0)
    # Cobbles in concentric courses around the hearth: the fan reads as a town square.
    ring = 0.9
    rr = 1.2
    while rr < R - 0.35:
        n = max(6, round(2 * math.pi * rr / 0.42))
        off = kit.r.random()
        for i in range(n):
            a = (i + off) / n * math.pi * 2
            w = 2 * math.pi * rr / n - 0.05
            kit.box("ground", w, 0.07, 0.36, COBBLE, math.cos(a) * rr, top - 0.035 + kit.r.uniform(-0.006, 0.006), math.sin(a) * rr,
                    ry=-a + math.pi / 2, rx=kit.r.uniform(-0.02, 0.02))
        rr += 0.41
    # flagstone ring round the well
    well = next((p for p in PLAN["props"] if p["type"] == "well"), None)
    if well:
        for k in range(14):
            a = k / 14 * math.pi * 2
            kit.box("ground", 0.62, 0.075, 0.5, QUOIN, well["x"] + math.cos(a) * 1.45, top - 0.03, well["z"] + math.sin(a) * 1.45,
                    ry=-a + math.pi / 2)
    # the hearth camp: a packed-earth clearing with a few flagstones
    hx, hz = PLAN["HEARTH"]["x"], PLAN["HEARTH"]["z"]
    # Stepped clear of the footpath (centre 0.022) and of each other.
    kit.cylr("ground", 3.1, 3.2, 0.05, 20, [0x7d6040], hx, 0.025, hz)
    kit.cylr("ground", 2.6, 2.6, 0.06, 20, DIRT, hx, 0.032, hz)
    for k in range(9):
        a = k / 9 * math.pi * 2 + 0.3
        rr = kit.r.uniform(2.7, 3.0)
        kit.cylr("ground", kit.r.uniform(0.22, 0.32), kit.r.uniform(0.24, 0.34), 0.06, 6, STONE_G, hx + math.cos(a) * rr, 0.045,
                 hz + math.sin(a) * rr, ry=kit.r.uniform(0, 1))
    # curb ring, broken where roads arrive
    for i in range(64):
        a = i / 64 * math.pi * 2
        cx, cz = math.cos(a) * R, math.sin(a) * R
        if any(math.hypot(r["bx"] - cx, r["bz"] - cz) < r["w"] / 2 + 0.9 or math.hypot(r["ax"] - cx, r["az"] - cz) < r["w"] / 2 + 0.9 for r in roads):
            continue
        kit.box("ground", 2 * math.pi * R / 64 - 0.04, 0.14, 0.36, QUOIN if i % 4 else STONE_G, cx, 0.07, cz, ry=-a + math.pi / 2)
    for r in roads:
        road_strip(kit, r)

def road_strip(kit, r):
    """One continuous dirt surface: a grid along the road with ragged edges,
    darker wheel ruts on the wide roads, and a few pebbles."""
    dx, dz = r["bx"] - r["ax"], r["bz"] - r["az"]
    ln = math.hypot(dx, dz)
    ux, uz = dx / ln, dz / ln          # along
    px, pz = uz, -ux                   # across
    w = r["w"]
    nu = max(2, round(ln / 0.55))
    nv = 6
    R = kit.role("ground")
    base = len(R["v"])
    # Wider roads ride higher, so where a path meets a road it tucks under instead of fighting it.
    yc = 0.012 + 0.006 * w
    for i in range(nu + 1):
        t = i / nu
        edge = [kit.r.uniform(-0.18, 0.12), kit.r.uniform(-0.18, 0.12)]
        for j in range(nv + 1):
            v = j / nv - 0.5
            off = v * w + (edge[0] * -1 if j == 0 else edge[1] if j == nv else kit.r.uniform(-0.03, 0.03))
            x = r["ax"] + dx * t + px * off
            z = r["az"] + dz * t + pz * off
            y = yc if 0 < j < nv else yc - 0.018
            R["v"].append(Vector((x, y, z)))
    ruts = w > 2
    for i in range(nu):
        for j in range(nv):
            a = base + i * (nv + 1) + j
            R["f"].append((a, a + nv + 1, a + nv + 2, a + 1))
            dark = ruts and j in (1, 4)
            c = hexc(kit.pick([0x7d6040, 0x86684a] if dark else DIRT))
            R["c"].append(c)
    for k in range(int(ln * w * 0.6)):
        t, v = kit.r.random(), kit.r.uniform(-0.45, 0.45)
        kit.ball("ground", kit.r.uniform(0.03, 0.07), STONE_G, r["ax"] + dx * t + px * v * w, yc + 0.01, r["az"] + dz * t + pz * v * w)

def build_hearth(kit):
    """Fire pit at the hearth: stone ring, ash bed and the eight seats (local to the hearth group)."""
    kit.frame = Matrix.Identity(4)
    for i in range(12):
        a = i / 12 * math.pi * 2
        kit.box("hearth", 0.34, 0.22, 0.26, QUOIN if i % 3 else RUBBLE, math.cos(a) * 0.72, 0.1, math.sin(a) * 0.72, ry=-a + math.pi / 2)
    kit.cylr("hearth", 0.6, 0.62, 0.04, 12, [0x2a2624, 0x34302c], 0, 0.06, 0)
    for i in range(10):
        kit.ball("hearth", kit.r.uniform(0.05, 0.09), [0x1c1c1e, 0x3a3634], kit.r.uniform(-0.35, 0.35), 0.08, kit.r.uniform(-0.35, 0.35))
    # seats where the collider stones stand: stumps and dressed blocks alternately
    for i in range(8):
        a = i / 8 * math.pi * 2
        s = 0.55 + (i % 3) * 0.12
        x, z = math.cos(a) * 2.15, math.sin(a) * 2.15
        if i % 2:
            r = s * 0.55
            kit.cylr("hearth", r * 0.92, r, 0.45, 9, TIMBER_M, x, 0.225, z)
            kit.cylr("hearth", r * 0.8, r * 0.8, 0.01, 9, [0xc9a06a, 0xb88f5a], x, 0.455, z)
        else:
            kit.box("hearth", s * 0.9, 0.42, s * 0.62, QUOIN, x, 0.21, z, ry=-a + math.pi / 2)
            kit.box("hearth", s * 0.95, 0.06, s * 0.66, ASHLAR, x, 0.44, z, ry=-a + math.pi / 2)
    # the fire itself: four logs leaning into a cone over a bed of embers (the flame stays code-built)
    for i in range(14):
        kit.ball("hearth", kit.r.uniform(0.05, 0.09), [0xff7a2a, 0xe0601e, 0x9a3a1a, 0x2a2624], kit.r.uniform(-0.3, 0.3), 0.09,
                 kit.r.uniform(-0.3, 0.3), 1, 0.6, 1)
    for k in range(4):
        a = k / 4 * math.pi * 2 + 0.4
        kit.cylr("hearth", 0.07, 0.095, 0.9, 7, [0x5a3a24, 0x4a3020, 0x6b4428], math.cos(a) * 0.2, 0.3, math.sin(a) * 0.2,
                 ry=-a, rz=0.85)
        kit.cylr("hearth", 0.06, 0.06, 0.012, 7, [0x2a2220], math.cos(a) * 0.02, 0.62, math.sin(a) * 0.02, ry=-a, rz=0.85)
    # a log pile and kindling
    for k in range(5):
        kit.cylr("hearth", 0.09, 0.09, 0.8, 7, [0x5a3a24, 0x6b4428], 1.05 + (k % 3) * 0.19, 0.09 + (k // 3) * 0.16, -1.3, ry=0.6, rz=math.pi / 2)

ANCIENT = [0x5c6168, 0x51565d, 0x676c71, 0x5a5f5a, 0x60646b]
ANCIENT_L = [0x7a7f84, 0x72777c, 0x808589]
RUNE = [0x7fe0cc, 0x9af0dc]

def build_gate(kit):
    """The Delve Gate in its own frame (opening centred on x = 0, ground y = 0, town at +z).
    Pillars keep the code gate's footprint (x = +-2.08, half 0.48 x 0.62) so the colliders hold."""
    W, H = 3.2, 3.6
    hx, hz = 0.48, 0.62
    px = W / 2 + hx
    kit.frame = Matrix.Identity(4)
    for s in (-1, 1):
        x = s * px
        kit.box("gate", hx * 2 + 0.24, 0.42, hz * 2 + 0.22, ANCIENT, x, 0.21, 0)
        kit.box("gate", hx * 2 + 0.3, 0.08, hz * 2 + 0.28, ANCIENT_L, x, 0.45, 0)
        y = 0.49
        k = 0
        while y < H - 0.05:
            h = min(kit.r.uniform(0.42, 0.56), H - y)
            inset = 0.0 if k % 2 else 0.05
            kit.box("gate", hx * 2 - inset, h - 0.03, hz * 2 - inset, ANCIENT, x + kit.r.uniform(-0.015, 0.015), y + h / 2, 0,
                    ry=kit.r.uniform(-0.02, 0.02))
            y += h
            k += 1
        # rune channels on the town face, the gate face and the inner face
        for face in (1, -1):
            for j in range(4):
                ry = 1.0 + j * 0.62
                kit.box("gateGlow", 0.08, 0.32, 0.02, RUNE, x - s * 0.12, ry, face * (hz + 0.006))
                kit.box("gateGlow", 0.2, 0.05, 0.02, RUNE, x - s * 0.12 + (0.08 if j % 2 else -0.08), ry + 0.12, face * (hz + 0.006))
        for j in range(5):
            kit.box("gateGlow", 0.02, 0.22, 0.12, RUNE, x - s * (hx + 0.006), 0.9 + j * 0.55, kit.r.uniform(-0.2, 0.2))
        kit.box("gate", hx * 2 + 0.26, 0.3, hz * 2 + 0.26, ANCIENT_L, x, H + 0.15, 0)
        # moss at the foot
        for j in range(6):
            kit.ball("gate", kit.r.uniform(0.08, 0.16), LICHEN + LEAF[:2], x + kit.r.uniform(-0.6, 0.6), 0.48,
                     kit.r.uniform(-0.75, 0.75), 1, 0.5, 1)
    # Arch over the opening: voussoirs from pillar top to pillar top, a carved tympanum, a gold keystone.
    R0 = W / 2 + 0.02
    R1 = R0 + 0.62
    n = 11
    for i in range(n):
        a0 = math.pi * i / n
        a1 = math.pi * (i + 1) / n
        am = (a0 + a1) / 2
        key = i == n // 2
        ext = 0.12 if key else 0.0
        r_in, r_out = R0, R1 + ext
        pts = []
        for rr, aa in ((r_in, a0 + 0.012), (r_in, a1 - 0.012)):
            pts.append((math.cos(aa) * rr, H + 0.3 + math.sin(aa) * rr))
        for rr, aa in ((r_out, a1 - 0.012), (r_out, a0 + 0.012)):
            pts.append((math.cos(aa) * rr, H + 0.3 + math.sin(aa) * rr))
        d = hz + (0.08 if key else 0.0)
        kit.prism("gate", list(reversed(pts)), -d, d, ANCIENT_L if not key else [0xb4ad9e])
        if key:
            kit.box("gate", 0.22, 0.22, 0.04, GOLD, math.cos(am) * (R0 + 0.36), H + 0.3 + math.sin(am) * (R0 + 0.36), d + 0.02,
                    rz=math.pi / 4)
    # tympanum: a slab under the arch, with a ringed eye rune
    seg = 14
    pts = [(-R0, H + 0.3)] + [(math.cos(math.pi * (1 - j / seg)) * R0, H + 0.3 + math.sin(math.pi * (1 - j / seg)) * R0) for j in range(1, seg)] + [(R0, H + 0.3)]
    kit.prism("gate", list(reversed(pts)), -hz + 0.12, hz - 0.12, ANCIENT)
    kit.box("gate", W + 0.04, 0.32, hz * 2 - 0.1, ANCIENT_L, 0, H + 0.14, 0)
    for face in (1, -1):
        cy = H + 0.3 + R0 * 0.45
        for j in range(12):
            a = j / 12 * math.pi * 2
            kit.box("gateGlow", 0.1, 0.04, 0.02, RUNE, math.cos(a) * 0.42, cy + math.sin(a) * 0.42, face * (hz - 0.1),
                    rz=a + math.pi / 2)
        kit.box("gateGlow", 0.32, 0.12, 0.02, RUNE, 0, cy, face * (hz - 0.1))
        kit.box("gateGlow", 0.1, 0.1, 0.03, [0xf2d58a], 0, cy, face * (hz - 0.09), rz=math.pi / 4)
        for s in (-1, 1):
            kit.box("gateGlow", 0.04, 0.3, 0.02, RUNE, s * 0.8, cy - 0.1, face * (hz - 0.1), rz=s * 0.4)
    # threshold and a worn flagstone apron both sides
    kit.box("gate", W, 0.06, hz * 2, ANCIENT_L, 0, 0.03, 0)
    kit.box("gateGlow", W - 0.3, 0.012, 0.05, RUNE, 0, 0.064, 0)
    for zs in (1, -1):
        for row in range(3):
            z = zs * (hz + 0.35 + row * 0.62)
            x = -W / 2 - 0.9 + (0.3 if row % 2 else 0)
            while x < W / 2 + 0.9:
                w = kit.r.uniform(0.5, 0.8)
                kit.box("gate", w - 0.05, 0.05, 0.56, ANCIENT_L + STONE_G, x + w / 2, 0.025, z, ry=kit.r.uniform(-0.04, 0.04))
                x += w
    # rune circle at the descent spot (gate-local)
    dz = PLAN["GATE"]["descent"]
    cx, cz = dz["x"] - PLAN["GATE"]["x"], dz["z"] - PLAN["GATE"]["z"]
    kit.cylr("gate", 0.98, 1.02, 0.05, 16, ANCIENT, cx, 0.03, cz)
    kit.cylr("gate", 0.72, 0.72, 0.055, 16, ANCIENT_L, cx, 0.035, cz)
    kit.cylr("gate", 0.88, 0.88, 0.056, 16, GOLD, cx, 0.033, cz)
    kit.cylr("gate", 0.8, 0.8, 0.057, 16, ANCIENT, cx, 0.034, cz)
    for j in range(8):
        a = j / 8 * math.pi * 2
        kit.box("gateGlow", 0.14, 0.012, 0.05, RUNE, cx + math.cos(a) * 0.45, 0.066, cz + math.sin(a) * 0.45, ry=-a)
    kit.cylr("gateGlow", 0.14, 0.14, 0.012, 8, RUNE, cx, 0.066, cz)

def furnish_town(kit):
    build_ground(kit)
    for p in PLAN["props"]:
        fn = PROPS_FN.get(p["type"])
        if not fn:
            print("no prop builder:", p["type"])
            continue
        kit.frame = frame_at(p["x"], 0, p["z"], p.get("yaw", 0))
        # furniture helpers write "interior"; in the street that is the props mesh
        kit.redirect = tier_redirect(p["tier"]) if p.get("tier") else {"interior": "props"}
        fn(kit, p)
        kit.redirect = None
    build_hearth(kit)
    build_gate(kit)
