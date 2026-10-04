# Underwood dungeon kits for view/dungeon.js, exec'd into greenmere.py's namespace.
#
#   g["build_dungeon"]()                 -> assets/models/dungeon-<key>.glb for every biome
#   g["build_dungeon"](["crypt"])        one biome
#   g["preview_dungeon"]("crypt")        lay the pieces out in a row to look at (no export)
#
# One file per biome (src/sim/biomes.js keys), objects "dk_<key>_<piece>". Game space,
# metres, y up. Pieces are stamped into the floor's merged builders by dungeon.js:
#
#   wall0..3     one 4 m wall face: x -2..2, the rock face is the plane z = 0 and the
#                room is +z. Built biomes stand 3.6 tall (the heightfield rim) and end
#                in half pilasters, so neighbouring segments meet in a whole one.
#                Organic biomes are a rock skirt the bare heightfield rises behind.
#   cornerOut    convex rock corner at the origin; rock fills x < 0, z < 0.
#   cornerIn     concave corner at the origin; the room fills x > 0, z > 0.
#   <prop>0..n   one per floorgen prop kind of the biome, plus pillar0 where the biome
#                has pillars. Base on y = 0, centred, inside the floorgen collider radius.
#   scatter0..n  floor clutter, about 1.2 m across, no collider.
#   <piece>Glow  the emissive parts of a piece (tinted by the biome accent in game).
#
# Ambient occlusion is baked into the vertex colours against a ground plane and, for
# walls and corners, the rock behind them.

BUILT_H = 3.6

# Mirrors DUNGEON_THEMES in src/view/lights.js (same keys as src/sim/biomes.js).
DK_PAL = {
    "cave": dict(wall=[0x5e6771, 0x4c545e, 0x6e7882], top=[0x3c6e2e, 0x4f8c38, 0x2c6b2a],
                 trim=[0x4c545e, 0x3e4650], rock=[0x6e7882, 0x5e6771, 0x4c545e, 0x737c84],
                 root=[0x3a2416, 0x5a3a24, 0x6b4428], cloth=[0x2c6b2a], alt=[0x3c6e2e, 0x4f8c38, 0x2c6b2a],
                 floor=[0x4a5a3a, 0x55663f, 0x3f5034]),
    "temple": dict(wall=[0xb89a64, 0xa88a58, 0xc4a670, 0xb0925e], top=[0xa89060, 0x9a8456, 0xb09868],
                   trim=[0xe2ba60, 0xd4a03a], rock=[0xb89a64, 0xa88a58, 0x8f7448],
                   root=[0x4f8c38, 0x3c6e2e, 0x6b8a3a], cloth=[0x8e2e28, 0x2e5a6e], alt=[0xa88a58, 0xb8955a],
                   floor=[0xc9a96e, 0xbf9d62, 0xd3b47c]),
    "root": dict(wall=[0x4a3426, 0x3a2416, 0x5a4030], top=[0x3c6e2e, 0x5a3a24, 0x2c6b2a],
                 trim=[0x3a2416, 0x5a3a24], rock=[0x4c545e, 0x5e6771, 0x56504a, 0x4a4440],
                 root=[0x3a2416, 0x5a3a24, 0x6b4428, 0x4a3020], cloth=[0x3c6e2e], alt=[0x3c6e2e, 0x4a3020],
                 floor=[0x5a3a24, 0x6b4428, 0x4a3020]),
    "crypt": dict(wall=[0x3e4650, 0x4c545e, 0x353d47, 0x444c56], top=[0x5e6771, 0x6e7882, 0x4c545e],
                  trim=[0x8d93a0, 0x6e7882], rock=[0x4c545e, 0x6e7882, 0x3e4650],
                  root=[0x1c2228, 0x3e4650, 0x3a2416], cloth=[0x4a3a6e, 0x2e3a5a], alt=[0x3e4650, 0x6e7882],
                  floor=[0x4c545e, 0x5e6771, 0x434b55]),
    "forge": dict(wall=[0x3a2416, 0x4c545e, 0x2f363e, 0x433a34], top=[0x4a3024, 0x3a2a22, 0x2f363e],
                  trim=[0xd4a03a, 0x8a5a2a], rock=[0x3e4650, 0x4a3024, 0x2f363e],
                  root=[0x3a2416, 0x4a3024, 0x4c545e], cloth=[0x8e2e28], alt=[0x5a3a24, 0x2f363e],
                  floor=[0x3e4650, 0x4a3024, 0x2f363e]),
}
DK_ORDER = ["cave", "temple", "root", "crypt", "forge"]

DK_BONE = [0xe7d7b4, 0xd8c8a0, 0xcdbd94]
DK_WAX = [0xe7d7b4, 0xefe2c4, 0xd8c8a0]
DK_IRON = [0x2f363e, 0x3e4650, 0x262b31]
DK_SOOT = [0x241c18, 0x2f2622, 0x1c1612]
DK_WOOD = [0x5e3b22, 0x6b4428, 0x4a2e1a]
DK_DARK = 0x14100c
GLOW = [0xffffff]


def G(name):
    return name + "Glow"

# ---------------------------------------------------------------- primitives

def dk_lathe(kit, role, rings, seg, col, x=0.0, z=0.0, rot=0.0, wob=0.0, cap=True):
    """Surface of revolution: rings = [(radius, y), ...] bottom to top; radius 0 closes it.
    col is one palette for the whole piece or a list of palettes, one per band."""
    R = kit.role(role)
    banded = isinstance(col, list) and col and isinstance(col[0], list)
    ringpts = []
    for i, (r, y) in enumerate(rings):
        pts = []
        for k in range(seg):
            a = rot + 2 * math.pi * k / seg
            rr = r * (1 + (kit.r.uniform(-wob, wob) if wob and 0 < i < len(rings) - 1 else 0))
            pts.append(kit.frame @ Vector((x + math.cos(a) * rr, y, z - math.sin(a) * rr)))
        ringpts.append(pts)
    for i in range(len(rings) - 1):
        pal = col[min(i, len(col) - 1)] if banded else col
        lo, hi = ringpts[i], ringpts[i + 1]
        for k in range(seg):
            j = (k + 1) % seg
            if rings[i][0] > 0 and rings[i + 1][0] > 0:
                quad = [lo[k], lo[j], hi[j], hi[k]]
            elif rings[i][0] > 0:
                quad = [lo[k], lo[j], hi[0]]
            else:
                quad = [lo[0], hi[j], hi[k]]
            base = len(R["v"])
            R["v"].extend(quad)
            R["f"].append(tuple(range(base, base + len(quad))))
            R["c"].append(hexc(kit.pick(pal)))
    if cap and rings[-1][0] > 0:
        pal = col[-1] if banded else col
        base = len(R["v"])
        R["v"].extend(ringpts[-1])
        R["f"].append(tuple(range(base, base + seg)))
        R["c"].append(hexc(kit.pick(pal)))
    if cap and rings[0][0] > 0 and rings[0][1] > 0.01:
        pal = col[0] if banded else col
        base = len(R["v"])
        R["v"].extend(reversed(ringpts[0]))
        R["f"].append(tuple(range(base, base + seg)))
        R["c"].append(hexc(kit.pick(pal)))


def dk_tube(kit, role, pts, radii, seg, col, cap_end=True):
    """A tube along a polyline, radius per point; the start is open (it grows out of
    something), the end is closed into a point when its radius is ~0, else capped."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    rings = []
    prev_u = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        ref = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
        u = t.cross(ref).normalized() if prev_u is None else (prev_u - t * prev_u.dot(t)).normalized()
        w = t.cross(u).normalized()
        prev_u = u
        rings.append([kit.frame @ (p + (u * math.cos(2 * math.pi * k / seg) + w * math.sin(2 * math.pi * k / seg)) * radii[i])
                      for k in range(seg)])
    R = kit.role(role)
    for i in range(n - 1):
        lo, hi = rings[i], rings[i + 1]
        for k in range(seg):
            j = (k + 1) % seg
            quad = [lo[k], lo[j], hi[j], hi[k]]
            # keep the face pointing away from the axis
            c = (pts[i] + pts[i + 1]) / 2
            nrm = (quad[1] - quad[0]).cross(quad[2] - quad[0])
            if nrm.dot((quad[0] + quad[2]) / 2 - (kit.frame @ c)) < 0:
                quad.reverse()
            base = len(R["v"])
            R["v"].extend(quad)
            R["f"].append(tuple(range(base, base + 4)))
            R["c"].append(hexc(kit.pick(col)))
    if cap_end and radii[-1] > 1e-3:
        base = len(R["v"])
        ring = rings[-1]
        nrm = (ring[1] - ring[0]).cross(ring[2] - ring[0])
        tdir = (kit.frame @ pts[-1]) - (kit.frame @ pts[-2])
        R["v"].extend(ring if nrm.dot(tdir) > 0 else list(reversed(ring)))
        R["f"].append(tuple(range(base, base + seg)))
        R["c"].append(hexc(kit.pick(col)))


def dk_dir(tilt, phi):
    return Vector((-math.sin(tilt) * math.cos(phi), math.cos(tilt), math.sin(tilt) * math.sin(phi)))


def dk_spike(kit, role, base, h, r, tilt, phi, col, seg=5, tip=0.32):
    """A crystal: a prism body and a pointed tip leaning `tilt` toward heading `phi`."""
    d = dk_dir(tilt, phi)
    b = Vector(base)
    body = h * (1 - tip)
    c = b + d * (body / 2)
    kit.cylr(role, r * 0.92, r, body, seg, col, c.x, c.y, c.z, ry=phi, rz=tilt)
    c2 = b + d * (body + h * tip / 2)
    kit.cone(role, r * 0.92, h * tip, seg, col, c2.x, c2.y, c2.z, ry=phi, rz=tilt)


def dk_stone_col(kit, pal, moss=None, thresh=0.55, dark=0.82):
    def fn(n, p):
        if moss and n.y > thresh and kit.r.random() < 0.85:
            return kit.pick(moss)
        c = kit.pick(pal)
        return shade(c, dark) if n.y < -0.4 else c
    return fn


def dk_boulder(kit, role, r, pal, x, z, sx=1.0, sy=1.0, sz=1.0, moss=None, y=None, noise=0.24, seed=0, thresh=0.55):
    """A boulder sitting on the ground (its flattened base at y = 0 unless y is given)."""
    cy = 0.5 * r * sy - 0.04 if y is None else y
    blob(kit, role, r, dk_stone_col(kit, pal, moss, thresh), x, cy, z, sx, sy, sz, noise=noise, flat=-0.5, seed=seed)


def dk_ashlar(kit, role, x0, x1, y0, y1, rows, pal, dmin, dmax, wmin, wmax, holes=(), gap=0.04):
    """Coursed blocks on the plane z = 0, each protruding dmin..dmax; holes are
    (xa, xb, ya, yb) rectangles left open."""
    h = (y1 - y0) / rows
    for j in range(rows):
        ya = y0 + j * h
        yb = ya + h
        x = x0 - (kit.r.uniform(0.25, 0.6) * wmin if j % 2 else 0)
        while x < x1 - 1e-3:
            xa = max(x, x0)
            xb = min(x + kit.r.uniform(wmin, wmax), x1)
            if x1 - xb < 0.45 * wmin:
                xb = x1
            x = xb
            if xb - xa < 0.12:
                continue
            if any(xa < hb and xb > ha and ya < vb and yb > va for ha, hb, va, vb in holes):
                continue
            d = kit.r.uniform(dmin, dmax)
            kit.box(role, xb - xa - gap, h - gap, d, pal, (xa + xb) / 2, (ya + yb) / 2, d / 2, skip=("-z",))


def dk_backing(kit, role, w, h, hex_, x=0.0, z=-0.012):
    kit.box(role, w, h, 0.02, [hex_], x, h / 2, z, skip=("-z", "-y", "+y", "-x", "+x"))

# ---------------------------------------------------------------- built walls (temple, crypt, forge)

def built_wall_frame(kit, role, P, block, mortar, holes=(), rows=5, dmin=0.05, dmax=0.12, wmin=0.55, wmax=1.05,
                     plinth=None, cornice=None):
    """Plinth, coursed blocks, a moulding and cornice, half pilasters at both ends."""
    H = BUILT_H
    dk_backing(kit, role, 4.0, H, mortar)
    pl = plinth or P["trim"]
    kit.box(role, 4.0, 0.44, 0.32, {"+y": [pl[0]], "*": pl[1:] or pl}, 0, 0.22, 0.16, skip=("-z", "-y"))
    dk_ashlar(kit, role, -1.72, 1.72, 0.44, 3.12, rows, block, dmin, dmax, wmin, wmax, holes)
    co = cornice or P["trim"]
    kit.box(role, 4.0, 0.08, 0.2, [co[-1]], 0, 3.16, 0.1, skip=("-z",))
    kit.box(role, 4.0, 0.4, 0.42, {"+y": P["top"], "*": [co[0]]}, 0, 3.4, 0.21, skip=("-z",))
    for s in (-1, 1):
        kit.box(role, 0.28, 2.76, 0.3, [P["wall"][0], shade(P["wall"][0], 0.94)], s * 1.86, 0.44 + 1.38, 0.15, skip=("-z",))
        kit.box(role, 0.36, 0.12, 0.36, [co[0]], s * 1.82, 3.05, 0.18, skip=("-z",))


def built_corner_out(kit, role, P, shaft, band=None):
    """A square pier over a convex corner, centred on it (half of it is inside rock)."""
    H = BUILT_H
    kit.box(role, 1.12, 0.46, 1.12, {"+y": [P["trim"][0]], "*": [P["trim"][-1]]}, 0, 0.23, 0)
    kit.box(role, 0.96, H - 0.92, 0.96, shaft, 0, 0.46 + (H - 0.92) / 2, 0, skip=("-y",))
    if band:
        kit.box(role, 1.0, 0.12, 1.0, band, 0, 1.25, 0)
    kit.box(role, 1.06, 0.1, 1.06, [P["trim"][-1]], 0, H - 0.41, 0)
    kit.box(role, 1.16, 0.36, 1.16, {"+y": P["top"], "*": [P["trim"][0]]}, 0, H - 0.18, 0)


def built_corner_in(kit, role, P, shaft):
    """An engaged column filling a concave corner (room quadrant x > 0, z > 0)."""
    H = BUILT_H
    kit.box(role, 0.66, 0.48, 0.66, {"+y": [P["trim"][0]], "*": [P["trim"][-1]]}, 0.33, 0.24, 0.33, skip=("-z", "-x"))
    kit.cylr(role, 0.27, 0.29, H - 0.96, 8, shaft, 0.3, 0.48 + (H - 0.96) / 2, 0.3)
    kit.box(role, 0.68, 0.48, 0.68, {"+y": P["top"], "*": [P["trim"][0]]}, 0.34, H - 0.24, 0.34, skip=("-z", "-x"))


def banner(kit, role, P, x, top, w=1.2, h=1.9, cloth=None, emblem=None):
    c = cloth or kit.pick(P["cloth"])
    kit.box(role, w + 0.2, 0.07, 0.07, [P["trim"][0]], x, top, 0.12)
    for s in (-1, 1):
        kit.ball(role, 0.06, [P["trim"][0]], x + s * (w / 2 + 0.12), top, 0.12)
    kit.box(role, w, h, 0.04, [c], x, top - h / 2, 0.1, skip=("-z",))
    # swallow-tail hem
    pts = [(-w / 2, 0), (0, -0.32), (w / 2, 0)]
    y = top - h
    for a, b in ((0, 1), (1, 2)):
        kit.hexa(role, [(x + pts[a][0], y + pts[a][1], 0.08), (x + pts[b][0], y + pts[b][1], 0.08), (x + pts[b][0], y, 0.08), (x + pts[a][0], y, 0.08),
                        (x + pts[a][0], y + pts[a][1], 0.12), (x + pts[b][0], y + pts[b][1], 0.12), (x + pts[b][0], y, 0.12), (x + pts[a][0], y, 0.12)], [c])
    kit.box(role, w, 0.06, 0.05, [P["trim"][0]], x, top - 0.2, 0.125)
    if emblem:
        kit.box(role, 0.36, 0.36, 0.03, [emblem], x, top - h * 0.45, 0.13, rz=math.pi / 4)


def sconce(kit, role, P, x, y, metal=None, flame=True):
    m = metal or DK_IRON
    kit.box(role, 0.14, 0.34, 0.06, m, x, y, 0.03)
    kit.box(role, 0.06, 0.06, 0.3, m, x, y - 0.1, 0.18)
    dk_lathe(kit, role, [(0.05, y - 0.13), (0.17, y - 0.02), (0.19, y + 0.04)], 7, [P["trim"][0]], x, 0.32)
    if flame:
        dk_lathe(kit, G(role), [(0.13, y + 0.02), (0.08, y + 0.2), (0.0, y + 0.42)], 5, GLOW, x, 0.32, rot=0.3)
        dk_lathe(kit, G(role), [(0.06, y + 0.04), (0.0, y + 0.3)], 4, GLOW, x + 0.05, 0.36)


def candle(kit, role, x, y, z, h, r=0.045):
    kit.cylr(role, r, r * 1.08, h, 6, DK_WAX, x, y + h / 2, z)
    for k in range(2):
        a = kit.r.uniform(0, 6.28)
        kit.box(role, 0.025, kit.r.uniform(0.04, 0.1), 0.025, DK_WAX, x + math.cos(a) * r, y + h - 0.04, z + math.sin(a) * r)
    dk_lathe(kit, G(role), [(0.032, y + h + 0.01), (0.0, y + h + 0.13)], 4, GLOW, x, z)


def skull(kit, role, x, y, z, s=1.0, ry=0.0):
    blob(kit, role, 0.11 * s, lambda n, p: kit.pick(DK_BONE), x, y + 0.1 * s, z, 1, 0.95, 1.1, noise=0.05, flat=-0.6, seed=int(x * 100) & 255)
    kit.box(role, 0.13 * s, 0.07 * s, 0.1 * s, DK_BONE, x + math.sin(ry) * 0.06 * s, y + 0.04 * s, z + math.cos(ry) * 0.06 * s, ry=ry)
    for sgn in (-1, 1):
        ex = x + math.cos(ry) * sgn * 0.045 * s + math.sin(ry) * 0.1 * s
        ez = z - math.sin(ry) * sgn * 0.045 * s + math.cos(ry) * 0.1 * s
        kit.box(role, 0.04 * s, 0.035 * s, 0.02 * s, [DK_DARK], ex, y + 0.12 * s, ez, ry=ry)


def bone(kit, role, x, z, ln, ry, y=0.0):
    kit.box(role, ln, 0.045, 0.045, DK_BONE, x, y + 0.025, z, ry=ry)
    for s in (-1, 1):
        kit.ball(role, 0.04, DK_BONE, x + math.cos(ry) * s * ln / 2, y + 0.03, z - math.sin(ry) * s * ln / 2)

# ---------------------------------------------------------------- organic walls (cave, root)

def rock_skirt(kit, role, P, seed, n=4, tall=(1.2, 2.4), moss=True):
    """A run of boulders shouldering against the rock face across x -2.2..2.2."""
    xs = [-2.0 + 4.0 * (i + 0.5) / n + kit.r.uniform(-0.25, 0.25) for i in range(n)]
    for i, x in enumerate(xs):
        h = kit.r.uniform(*tall)
        r = kit.r.uniform(0.62, 0.86)
        dk_boulder(kit, role, r, P["rock"], x, -0.02, 1.0, h / (2 * r), 0.62, moss=P["top"] if moss else None,
                   y=h / 2 - 0.12, seed=seed + i, thresh=0.45)
    # small stones at the foot
    for i in range(3):
        x = kit.r.uniform(-1.8, 1.8)
        dk_boulder(kit, role, kit.r.uniform(0.16, 0.26), P["rock"], x, kit.r.uniform(0.32, 0.45), 1.2, 0.7, 1.0, seed=seed + 20 + i)


def glow_mushrooms(kit, role, P, x, z, n, scale=1.0, stem=DK_WAX):
    for i in range(n):
        a = kit.r.uniform(0, 6.28)
        d = 0 if i == 0 else kit.r.uniform(0.12, 0.26) * scale
        mx, mz = x + math.cos(a) * d, z + math.sin(a) * d
        h = kit.r.uniform(0.18, 0.42) * scale
        r = kit.r.uniform(0.09, 0.17) * scale
        lean = kit.r.uniform(-0.15, 0.15)
        kit.cylr(role, 0.03 * scale, 0.045 * scale, h, 5, stem, mx, h / 2, mz, rz=lean)
        tx = mx - math.sin(lean) * h
        dk_lathe(kit, G(role), [(r * 0.35, h - 0.02), (r, h + 0.03), (r * 0.72, h + 0.1), (0, h + 0.14)], 7, GLOW, tx, mz)


def crystal_cluster(kit, role, P, x, y, z, n, h=(0.45, 1.0), spread=0.2, face=None, base=True):
    if base:
        dk_boulder(kit, role, 0.32, P["rock"], x, z, 1.3, 0.5, 1.0, y=y + 0.06, seed=int(abs(x) * 37) + 5)
    for i in range(n):
        phi = kit.r.uniform(0, 6.28) if face is None else face + kit.r.uniform(-0.9, 0.9)
        tilt = 0.0 if i == 0 else kit.r.uniform(0.25, 0.7)
        d = 0 if i == 0 else kit.r.uniform(0.05, spread)
        dk_spike(kit, G(role), (x + math.cos(phi) * d, y, z - math.sin(phi) * d), kit.r.uniform(*h) * (1.15 if i == 0 else 1),
                 kit.r.uniform(0.07, 0.12), tilt, phi, GLOW, seg=5)


def climbing_root(kit, role, P, x, top, z=0.06, r0=0.16, wander=0.35, foot=True):
    """A root that comes out of the floor, hugs the face and disappears over the top."""
    pts, radii = [], []
    steps = 7
    for i in range(steps + 1):
        t = i / steps
        y = -0.05 + t * (top + 0.25)
        pts.append((x + math.sin(t * 5.1 + x) * wander, y, z + 0.12 * math.sin(t * 3.3) + (0.18 * (1 - t) ** 3 if foot else 0)))
        radii.append(r0 * (1.15 - 0.55 * t))
    dk_tube(kit, role, pts, radii, 6, P["root"])
    if foot:
        for s in (-1, 1):
            a = [(x, 0.06, z + 0.1), (x + s * 0.35, 0.05, z + 0.35), (x + s * 0.7, 0.0, z + 0.45), (x + s * 0.9, -0.08, z + 0.5)]
            dk_tube(kit, role, a, [r0 * 0.8, r0 * 0.6, r0 * 0.4, 0.01], 5, P["root"])


def hanging_roots(kit, role, P, x0, x1, top, n, ln=(0.8, 2.0)):
    for i in range(n):
        x = x0 + (x1 - x0) * (i + kit.r.uniform(0.2, 0.8)) / n
        L = kit.r.uniform(*ln)
        pts = [(x, top + 0.1, 0.06), (x + kit.r.uniform(-0.1, 0.1), top - L * 0.4, 0.1), (x + kit.r.uniform(-0.15, 0.15), top - L * 0.8, 0.14), (x + kit.r.uniform(-0.1, 0.1), top - L, 0.16)]
        dk_tube(kit, role, pts, [0.06, 0.045, 0.03, 0.005], 4, P["root"])

# ---------------------------------------------------------------- shared props

def prop_rock(kit, role, P, seed, moss=None):
    dk_boulder(kit, role, 0.48, P["rock"], 0, 0, 1.05, 0.72, 0.95, moss=moss, seed=seed)
    if seed % 2:
        dk_boulder(kit, role, 0.24, P["rock"], 0.42, 0.22, 1.1, 0.8, 1.0, moss=moss, seed=seed + 1)
    else:
        dk_boulder(kit, role, 0.2, P["rock"], -0.38, 0.3, 1.0, 0.7, 1.0, moss=moss, seed=seed + 2)
        dk_boulder(kit, role, 0.13, P["rock"], 0.4, -0.3, 1.0, 0.8, 1.0, seed=seed + 3)


def prop_urn(kit, role, P, tall=True, broken=False):
    body = P["wall"] if tall else P["rock"]
    h = 0.92 if tall else 0.68
    rings = [(0.18, 0.0), (0.3, h * 0.28), (0.33, h * 0.5), (0.26, h * 0.72), (0.13, h * 0.84), (0.13, h * 0.9), (0.2, h)]
    if broken:
        rings = rings[:4] + [(0.2, h * 0.68)]
    dk_lathe(kit, role, rings, 9, [body, [P["trim"][0]], body, body, [P["trim"][-1]], body], rot=0.2, cap=False)
    # dark mouth
    top = rings[-1]
    dk_lathe(kit, role, [(top[0] * 0.9, top[1] - 0.005), (0, top[1] - 0.005)], 9, [DK_DARK], cap=False)
    if broken:
        for k in range(3):
            a = kit.r.uniform(0, 6.28)
            kit.box(role, kit.r.uniform(0.12, 0.2), 0.03, kit.r.uniform(0.08, 0.14), body, math.cos(a) * 0.42, 0.02, math.sin(a) * 0.42, ry=a)
    if tall:
        for s in (-1, 1):
            kit.box(role, 0.06, 0.18, 0.05, [P["trim"][0]], s * 0.3, h * 0.72, 0, rz=s * 0.4)


def prop_rubble(kit, role, P, seed, drum=False):
    kit.r = random.Random(seed)
    for i in range(5):
        s = kit.r.uniform(0.2, 0.38)
        x, z = kit.r.uniform(-0.38, 0.38), kit.r.uniform(-0.38, 0.38)
        kit.box(role, s * 1.4, s * 0.75, s, P["wall"], x, s * 0.37 - 0.02, z, ry=kit.r.uniform(0, 3), rx=kit.r.uniform(-0.15, 0.15), rz=kit.r.uniform(-0.2, 0.2))
    if drum:
        kit.cylr(role, 0.3, 0.3, 0.55, 8, P["wall"], 0.05, 0.3, 0.1, rx=math.pi / 2, ry=0.6)
    for i in range(6):
        x, z = kit.r.uniform(-0.6, 0.6), kit.r.uniform(-0.6, 0.6)
        kit.box(role, 0.1, 0.06, 0.08, P["wall"], x, 0.03, z, ry=kit.r.uniform(0, 3))


def prop_brazier(kit, role, P, tall=True):
    h = 0.78 if tall else 0.5
    for k in range(3):
        a = k * 2 * math.pi / 3 + 0.3
        x, z = math.cos(a) * 0.2, -math.sin(a) * 0.2
        kit.box(role, 0.06, h + 0.06, 0.06, DK_IRON, x, h / 2, z, ry=a, rz=0.2)
        kit.box(role, 0.12, 0.05, 0.1, DK_IRON, math.cos(a) * 0.29, 0.025, -math.sin(a) * 0.29, ry=a)
    dk_lathe(kit, role, [(0.12, h - 0.06), (0.36, h + 0.1), (0.42, h + 0.2), (0.4, h + 0.24)], 8, [[P["trim"][-1]], [P["trim"][0]], [P["trim"][0]]], cap=False)
    dk_lathe(kit, G(role), [(0.36, h + 0.15), (0.2, h + 0.24), (0.0, h + 0.27)], 7, GLOW)
    dk_lathe(kit, G(role), [(0.28, h + 0.2), (0.17, h + 0.5), (0.0, h + 0.86)], 5, GLOW, rot=0.4)
    dk_lathe(kit, G(role), [(0.14, h + 0.2), (0.0, h + 0.6)], 4, GLOW, 0.12, 0.08)
    dk_lathe(kit, G(role), [(0.12, h + 0.2), (0.0, h + 0.52)], 4, GLOW, -0.12, -0.06)


def prop_pillar(kit, role, P, shaft, round_=True, band=None, glow_band=False):
    H = BUILT_H
    kit.box(role, 1.36, 0.22, 1.36, {"+y": [P["trim"][-1]], "*": [P["trim"][-1]]}, 0, 0.11, 0)
    kit.box(role, 1.16, 0.18, 1.16, [P["trim"][0]], 0, 0.31, 0)
    if round_:
        dk_lathe(kit, role, [(0.52, 0.4), (0.48, 0.55), (0.46, H * 0.5), (0.43, H - 0.6), (0.5, H - 0.48)], 12, shaft, rot=math.pi / 12, cap=False)
    else:
        kit.box(role, 0.9, H - 0.88, 0.9, shaft, 0, 0.4 + (H - 0.88) / 2, 0, skip=("-y",))
    if band:
        kit.cylr(role, 0.52, 0.52, 0.14, 12, band, 0, 1.3, 0)
    if glow_band:
        dk_lathe(kit, G(role), [(0.5, 1.22), (0.5, 1.4)], 12, GLOW, cap=False)
    kit.box(role, 1.1, 0.14, 1.1, [P["trim"][0]], 0, H - 0.41, 0)
    kit.box(role, 1.32, 0.34, 1.32, {"+y": P["top"], "*": [P["trim"][0]]}, 0, H - 0.17, 0)


def prop_mushrooms(kit, role, P, seed, big=False):
    kit.r = random.Random(seed)
    dk_boulder(kit, role, 0.22, P["rock"], 0.15, -0.12, 1.2, 0.5, 1.0, moss=P["top"], seed=seed)
    glow_mushrooms(kit, role, P, 0, 0, 5 if big else 3, 1.5 if big else 1.0)
    if big:
        glow_mushrooms(kit, role, P, 0.3, 0.2, 2, 0.7)


def prop_crystal(kit, role, P, seed, n=4):
    kit.r = random.Random(seed)
    crystal_cluster(kit, role, P, 0, 0.0, 0, n, h=(0.55, 1.15), spread=0.22)


def prop_stalagmite(kit, role, P, seed, pair=False):
    kit.r = random.Random(seed)
    h = 2.0 if pair else 1.7
    def stal(x, z, h, r):
        rings = [(r, 0.0), (r * 0.78, h * 0.18), (r * 0.6, h * 0.42), (r * 0.36, h * 0.68), (r * 0.16, h * 0.88), (0.0, h)]
        cols = [[P["top"][0], P["rock"][1]], P["rock"], P["rock"], P["rock"], P["rock"]]
        dk_lathe(kit, role, rings, 7, cols, x, z, rot=kit.r.uniform(0, 1), wob=0.12)
    stal(0, 0, h, 0.44)
    stal(0.34, 0.24, h * 0.5, 0.24)
    if pair:
        stal(-0.3, 0.2, h * 0.7, 0.28)
    dk_boulder(kit, role, 0.18, P["rock"], -0.3, -0.32, 1.2, 0.6, 1, seed=seed + 9)


def prop_root(kit, role, P, seed, arch=False):
    kit.r = random.Random(seed)
    if arch:
        pts = [(-0.75, -0.1, 0.1), (-0.55, 0.45, 0.05), (-0.15, 0.85, -0.05), (0.3, 0.75, -0.08), (0.62, 0.32, 0.05), (0.8, -0.1, 0.1)]
        dk_tube(kit, role, pts, [0.2, 0.2, 0.17, 0.15, 0.13, 0.1], 7, P["root"])
        dk_tube(kit, role, [(-0.2, 0.8, -0.04), (-0.35, 1.1, 0.1), (-0.3, 1.35, 0.2), (-0.2, 1.5, 0.22)], [0.08, 0.06, 0.04, 0.005], 5, P["root"])
    else:
        pts = [(0, -0.1, 0), (0.05, 0.4, 0.03), (-0.04, 0.9, -0.02), (0.08, 1.35, 0.05), (0.02, 1.6, 0.04)]
        dk_tube(kit, role, pts, [0.3, 0.22, 0.14, 0.07, 0.005], 7, P["root"])
        for k in range(3):
            a = k * 2.1 + kit.r.uniform(-0.3, 0.3)
            ca, sa = math.cos(a), -math.sin(a)
            dk_tube(kit, role, [(ca * 0.1, 0.25, sa * 0.1), (ca * 0.4, 0.12, sa * 0.4), (ca * 0.65, 0.0, sa * 0.65), (ca * 0.8, -0.08, sa * 0.8)], [0.12, 0.09, 0.05, 0.01], 5, P["root"])
        dk_tube(kit, role, [(0.02, 0.8, 0), (0.3, 1.0, 0.1), (0.45, 1.15, 0.12)], [0.06, 0.04, 0.005], 5, P["root"])
    for k in range(4):
        a = kit.r.uniform(0, 6.28)
        kit.box(role, 0.18, 0.02, 0.1, P["top"], math.cos(a) * 0.5, 0.01, math.sin(a) * 0.5, ry=a)

# ---------------------------------------------------------------- scatter

def scatter_pebbles(kit, role, pal, seed, n=6, moss=None):
    kit.r = random.Random(seed)
    for i in range(n):
        s = kit.r.uniform(0.07, 0.16)
        dk_boulder(kit, role, s, pal, kit.r.uniform(-0.6, 0.6), kit.r.uniform(-0.6, 0.6), 1.3, 0.6, 1.0, moss=moss, seed=seed + i, noise=0.3)
    if moss:
        for i in range(3):
            kit.box(role, kit.r.uniform(0.2, 0.4), 0.02, kit.r.uniform(0.15, 0.3), moss, kit.r.uniform(-0.5, 0.5), 0.01, kit.r.uniform(-0.5, 0.5), ry=kit.r.uniform(0, 3))

# ---------------------------------------------------------------- biomes

def dk_cave(kit):
    P = DK_PAL["cave"]
    rock_skirt(kit, "wall0", P, 100)
    rock_skirt(kit, "wall1", P, 110, n=3)
    crystal_cluster(kit, "wall1", P, 0.4, 0.0, 0.35, 5, h=(0.5, 1.1), face=math.pi / 2)
    rock_skirt(kit, "wall2", P, 120, n=3, tall=(0.8, 1.5))
    glow_mushrooms(kit, "wall2", P, -0.5, 0.42, 4)
    glow_mushrooms(kit, "wall2", P, 0.9, 0.4, 2, 0.8)
    # wall3: a tall leaning slab and a ledge of moss
    dk_boulder(kit, "wall3", 0.9, P["rock"], -0.6, -0.05, 1.0, 1.5, 0.55, moss=P["top"], y=1.2, seed=131, thresh=0.5)
    dk_boulder(kit, "wall3", 0.7, P["rock"], 0.9, -0.02, 1.0, 0.9, 0.62, moss=P["top"], y=0.5, seed=132)
    dk_boulder(kit, "wall3", 0.22, P["rock"], 0.1, 0.42, 1.1, 0.7, 1.0, seed=133)
    # corners
    dk_boulder(kit, "cornerOut", 0.95, P["rock"], 0.05, 0.05, 1.0, 1.1, 1.0, moss=P["top"], y=0.9, seed=140, thresh=0.45)
    dk_boulder(kit, "cornerOut", 0.35, P["rock"], 0.75, 0.25, 1, 0.8, 1, seed=141)
    dk_boulder(kit, "cornerIn", 0.8, P["rock"], 0.15, 0.15, 1.0, 1.4, 1.0, moss=P["top"], y=1.0, seed=145, thresh=0.45)
    dk_boulder(kit, "cornerIn", 0.4, P["rock"], 0.85, 0.2, 1, 0.8, 1, moss=P["top"], seed=146)
    dk_boulder(kit, "cornerIn", 0.35, P["rock"], 0.2, 0.85, 1, 0.8, 1, seed=147)
    # props
    prop_stalagmite(kit, "stalagmite0", P, 150)
    prop_stalagmite(kit, "stalagmite1", P, 151, pair=True)
    prop_rock(kit, "rock0", P, 160, moss=P["top"])
    prop_rock(kit, "rock1", P, 163, moss=P["top"])
    prop_mushrooms(kit, "mushroom0", P, 170)
    prop_mushrooms(kit, "mushroom1", P, 171, big=True)
    prop_crystal(kit, "crystal0", P, 180)
    prop_crystal(kit, "crystal1", P, 181, n=6)
    scatter_pebbles(kit, "scatter0", P["rock"], 190, moss=P["top"])
    scatter_pebbles(kit, "scatter1", P["rock"], 191, n=9)
    kit.r = random.Random(192)
    scatter_pebbles(kit, "scatter2", P["rock"], 193, n=3)
    crystal_cluster(kit, "scatter2", P, 0.2, 0.0, 0.1, 3, h=(0.18, 0.35), spread=0.1, base=False)


def dk_root(kit):
    P = DK_PAL["root"]
    rock_skirt(kit, "wall0", P, 200, n=3, tall=(0.8, 1.5))
    climbing_root(kit, "wall0", P, -0.6, 3.4)
    climbing_root(kit, "wall0", P, 1.2, 3.4, r0=0.11, wander=0.25, foot=False)
    # wall1: a buttress root arching from high on the face to the floor
    rock_skirt(kit, "wall1", P, 210, n=2, tall=(0.7, 1.2))
    dk_tube(kit, "wall1", [(-1.4, 3.6, 0.0), (-0.9, 2.6, 0.25), (-0.2, 1.4, 0.4), (0.4, 0.5, 0.45), (0.9, 0.05, 0.45), (1.3, -0.1, 0.4)],
            [0.32, 0.3, 0.26, 0.22, 0.17, 0.1], 7, P["root"])
    dk_tube(kit, "wall1", [(-0.5, 2.0, 0.3), (-0.1, 2.3, 0.35), (0.4, 2.6, 0.25), (0.8, 3.0, 0.1)], [0.1, 0.08, 0.05, 0.01], 5, P["root"])
    rock_skirt(kit, "wall2", P, 220, n=3, tall=(0.7, 1.3))
    climbing_root(kit, "wall2", P, 0.2, 3.4, r0=0.12)
    glow_mushrooms(kit, "wall2", P, -1.0, 0.45, 3)
    glow_mushrooms(kit, "wall2", P, 1.1, 0.42, 2, 0.8)
    # wall3: a curtain of hanging roots over a low skirt
    rock_skirt(kit, "wall3", P, 230, n=4, tall=(0.6, 1.1))
    hanging_roots(kit, "wall3", P, -1.9, 1.9, 3.3, 9)
    kit.box("wall3", 3.8, 0.14, 0.3, P["top"], 0, 3.32, 0.12, skip=("-z",))
    # corners
    dk_boulder(kit, "cornerOut", 0.85, P["rock"], 0.05, 0.05, 1.0, 1.0, 1.0, moss=P["top"], y=0.75, seed=240)
    dk_tube(kit, "cornerOut", [(0.2, 3.6, 0.2), (0.55, 2.4, 0.55), (0.6, 1.2, 0.6), (0.75, 0.2, 0.7), (1.1, -0.1, 0.9)], [0.22, 0.2, 0.18, 0.14, 0.06], 6, P["root"])
    dk_boulder(kit, "cornerIn", 0.75, P["rock"], 0.15, 0.15, 1.0, 1.3, 1.0, moss=P["top"], y=0.9, seed=245)
    climbing_root(kit, "cornerIn", P, 0.55, 3.4, z=0.55, r0=0.14, wander=0.1)
    # props
    prop_root(kit, "root0", P, 250)
    prop_root(kit, "root1", P, 251, arch=True)
    prop_rock(kit, "rock0", P, 260, moss=P["top"])
    prop_rock(kit, "rock1", P, 263, moss=P["top"])
    prop_mushrooms(kit, "mushroom0", P, 270)
    prop_mushrooms(kit, "mushroom1", P, 271, big=True)
    # scatter: twigs and leaf litter, a few pebbles
    kit.r = random.Random(280)
    for i in range(5):
        a = kit.r.uniform(0, 3.14)
        x, z = kit.r.uniform(-0.5, 0.5), kit.r.uniform(-0.5, 0.5)
        kit.box("scatter0", kit.r.uniform(0.3, 0.6), 0.04, 0.04, P["root"], x, 0.02, z, ry=a)
    for i in range(8):
        kit.box("scatter0", 0.1, 0.012, 0.06, P["top"] + [0x6b4428, 0x8a6a2a], kit.r.uniform(-0.6, 0.6), 0.01, kit.r.uniform(-0.6, 0.6), ry=kit.r.uniform(0, 3))
    scatter_pebbles(kit, "scatter1", P["rock"], 281, n=6, moss=P["top"])
    kit.r = random.Random(282)
    dk_tube(kit, "scatter2", [(-0.6, -0.08, 0), (-0.3, 0.1, 0.05), (0.1, 0.12, -0.05), (0.5, 0.0, 0.05), (0.7, -0.08, 0)], [0.1, 0.09, 0.08, 0.06, 0.03], 6, P["root"])


def dk_temple(kit):
    P = DK_PAL["temple"]
    mortar = 0x7d6440
    built_wall_frame(kit, "wall0", P, P["wall"], mortar)
    # wall1: a fallen block and vines over the cornice
    built_wall_frame(kit, "wall1", P, P["wall"], mortar, holes=[(0.3, 1.0, 1.5, 2.1)])
    kit.box("wall1", 0.66, 0.5, 0.02, [DK_DARK], 0.65, 1.8, 0.01)
    for k in range(6):
        x = kit.r.uniform(-1.6, 1.6)
        L = kit.r.uniform(0.8, 2.2)
        kit.box("wall1", 0.12, L, 0.05, P["root"], x, 3.2 - L / 2, 0.44, skip=("-z",))
        for j in range(int(L / 0.35)):
            kit.box("wall1", 0.16, 0.1, 0.06, P["root"], x + kit.r.uniform(-0.08, 0.08), 3.1 - j * 0.35, 0.46, rz=kit.r.uniform(-0.6, 0.6))
    kit.box("wall1", 4.0, 0.12, 0.3, P["root"], 0, 3.62, 0.25, skip=("-z", "-y"))
    kit.box("wall1", 0.5, 0.3, 0.4, P["wall"], 0.7, 0.15, 0.6, ry=0.3)
    # wall2: a banner
    built_wall_frame(kit, "wall2", P, P["wall"], mortar)
    banner(kit, "wall2", P, 0.0, 2.95, cloth=P["cloth"][0], emblem=P["trim"][0])
    # wall3: twin sconces and a carved relief
    built_wall_frame(kit, "wall3", P, P["wall"], mortar, holes=[(-0.55, 0.55, 1.0, 2.6)])
    kit.box("wall3", 1.1, 1.6, 0.1, [shade(P["wall"][0], 0.9)], 0, 1.8, 0.05, skip=("-z",))
    kit.box("wall3", 0.6, 0.6, 0.06, [P["trim"][0]], 0, 1.95, 0.12, rz=math.pi / 4)
    kit.box("wall3", 0.3, 0.3, 0.06, [P["wall"][2]], 0, 1.95, 0.16, rz=math.pi / 4)
    for s in (-1, 1):
        kit.box("wall3", 0.1, 1.7, 0.16, [P["trim"][0]], s * 0.6, 1.8, 0.1, skip=("-z",))
        sconce(kit, "wall3", P, s * 1.15, 1.75)
    built_corner_out(kit, "cornerOut", P, P["wall"], band=[P["trim"][0]])
    built_corner_in(kit, "cornerIn", P, P["wall"])
    # props
    prop_urn(kit, "urn0", P, tall=True)
    prop_urn(kit, "urn1", P, tall=False, broken=True)
    prop_rubble(kit, "rubble0", P, 300)
    prop_rubble(kit, "rubble1", P, 301, drum=True)
    prop_brazier(kit, "brazier0", P)
    # statue0: a robed idol on a plinth; statue1: the same, broken off at the waist
    for role, whole in (("statue0", True), ("statue1", False)):
        kit.box(role, 0.92, 0.42, 0.92, {"+y": [P["trim"][0]], "*": P["wall"]}, 0, 0.21, 0)
        top = 1.55 if whole else 0.95
        dk_lathe(kit, role, [(0.34, 0.42), (0.36, 0.7), (0.3, 1.2), (0.26, top)], 8, P["wall"], cap=not whole)
        if whole:
            dk_lathe(kit, role, [(0.26, 1.55), (0.3, 1.62), (0.12, 1.7)], 8, P["wall"], cap=False)
            blob(kit, role, 0.17, lambda n, p: kit.pick(P["wall"]), 0, 1.86, 0, 1, 1.15, 1, noise=0.06)
            kit.cone(role, 0.2, 0.3, 4, [P["trim"][0]], 0, 2.12, 0, ry=math.pi / 4)
            for s in (-1, 1):
                kit.box(role, 0.12, 0.5, 0.14, P["wall"], s * 0.3, 1.3, 0.1, rx=-0.6)
            kit.box(role, 0.3, 0.12, 0.12, P["wall"], 0, 1.12, 0.32)
            dk_lathe(kit, G(role), [(0.08, 1.18), (0.1, 1.25), (0.0, 1.34)], 6, GLOW, 0, 0.34)
        else:
            blob(kit, role, 0.17, lambda n, p: kit.pick(P["wall"]), 0.55, 0.12, 0.4, 1, 1.15, 1, noise=0.08, flat=-0.4)
            kit.box(role, 0.3, 0.12, 0.25, P["wall"], -0.45, 0.06, 0.45, ry=0.6)
    prop_pillar(kit, "pillar0", P, P["wall"], band=[P["trim"][0]])
    # scatter: broken floor tiles and sand
    kit.r = random.Random(310)
    for i in range(6):
        kit.box("scatter0", kit.r.uniform(0.25, 0.45), 0.04, kit.r.uniform(0.2, 0.35), P["alt"] + P["wall"], kit.r.uniform(-0.5, 0.5), 0.03, kit.r.uniform(-0.5, 0.5),
                ry=kit.r.uniform(0, 3), rx=kit.r.uniform(-0.1, 0.1))
    scatter_pebbles(kit, "scatter1", P["rock"], 311, n=7)
    kit.r = random.Random(312)
    kit.box("scatter2", 0.9, 0.03, 0.7, [0xd3b47c], 0, 0.015, 0, ry=0.4)
    for i in range(4):
        kit.box("scatter2", 0.18, 0.06, 0.12, P["root"], kit.r.uniform(-0.4, 0.4), 0.03, kit.r.uniform(-0.3, 0.3), ry=kit.r.uniform(0, 3))


def dk_crypt(kit):
    P = DK_PAL["crypt"]
    mortar = 0x2a3038
    built_wall_frame(kit, "wall0", P, P["wall"], mortar, rows=6, wmin=0.45, wmax=0.8)
    # wall1: a candle ledge
    built_wall_frame(kit, "wall1", P, P["wall"], mortar, rows=6, wmin=0.45, wmax=0.8)
    kit.box("wall1", 2.4, 0.1, 0.36, [P["trim"][0]], 0, 1.2, 0.18, skip=("-z",))
    for s in (-0.8, 0.8):
        kit.box("wall1", 0.12, 0.22, 0.3, [P["trim"][-1]], s, 1.06, 0.15, skip=("-z",))
    for i, x in enumerate([-1.0, -0.7, -0.45, 0.1, 0.5, 0.75, 1.05]):
        candle(kit, "wall1", x, 1.25, 0.2 + (i % 2) * 0.06, kit.r.uniform(0.12, 0.38))
    skull(kit, "wall1", -0.15, 1.25, 0.2, ry=0.0)
    # wall2: two burial niches with skulls
    holes = [(-1.35, -0.25, 0.9, 1.6), (0.25, 1.35, 0.9, 1.6)]
    built_wall_frame(kit, "wall2", P, P["wall"], mortar, rows=6, wmin=0.45, wmax=0.8, holes=holes)
    for xa, xb, ya, yb in holes:
        cx = (xa + xb) / 2
        kit.box("wall2", xb - xa, yb - ya, 0.02, [DK_DARK], cx, (ya + yb) / 2, 0.012)
        kit.box("wall2", xb - xa + 0.16, 0.08, 0.2, [P["trim"][0]], cx, yb + 0.04, 0.1, skip=("-z",))
        kit.box("wall2", xb - xa + 0.16, 0.08, 0.22, [P["trim"][0]], cx, ya - 0.04, 0.11, skip=("-z",))
        skull(kit, "wall2", cx - 0.15, ya, 0.06, s=0.9)
        bone(kit, "wall2", cx + 0.22, 0.07, 0.36, 0.2, y=ya)
    # wall3: a mourning banner between two candles
    built_wall_frame(kit, "wall3", P, P["wall"], mortar, rows=6, wmin=0.45, wmax=0.8)
    banner(kit, "wall3", P, 0.0, 2.95, w=1.0, h=2.1, cloth=P["cloth"][0], emblem=P["trim"][0])
    for s in (-1, 1):
        kit.box("wall3", 0.3, 0.06, 0.26, [P["trim"][0]], s * 1.0, 1.3, 0.13)
        candle(kit, "wall3", s * 1.0, 1.33, 0.14, 0.26, r=0.05)
    built_corner_out(kit, "cornerOut", P, P["wall"])
    built_corner_in(kit, "cornerIn", P, P["wall"])
    # props: sarcophagi, candle stands, urns, rubble
    for role, open_ in (("tomb0", False), ("tomb1", True)):
        kit.box(role, 0.86, 0.12, 1.36, [P["trim"][-1]], 0, 0.06, 0)
        kit.box(role, 0.76, 0.42, 1.26, P["wall"], 0, 0.33, 0, skip=("-y",))
        for s in (-1, 1):
            kit.box(role, 0.04, 0.2, 0.9, [P["trim"][0]], s * 0.39, 0.34, 0)
        if open_:
            kit.box(role, 0.66, 0.02, 1.16, [DK_DARK], 0, 0.535, 0)
            kit.box(role, 0.84, 0.12, 1.34, [P["trim"][0]], 0.42, 0.42, 0.25, ry=0.35, rz=-0.35)
            skull(kit, role, 0.05, 0.5, -0.35, s=0.8)
        else:
            kit.box(role, 0.84, 0.12, 1.34, {"+y": [P["trim"][0]], "*": [P["trim"][-1]]}, 0, 0.6, 0)
            # effigy: a hooded figure with folded hands
            kit.box(role, 0.38, 0.14, 0.86, P["wall"], 0, 0.73, 0.08)
            blob(kit, role, 0.13, lambda n, p: kit.pick(P["wall"]), 0, 0.76, -0.45, 1, 0.8, 1.1, noise=0.05)
            kit.box(role, 0.16, 0.08, 0.14, [P["trim"][0]], 0, 0.83, -0.08)
    for role, n in (("candle0", 4), ("candle1", 7)):
        kit.r = random.Random(400 + n)
        if n > 5:
            kit.box(role, 0.58, 0.14, 0.48, {"+y": [P["trim"][0]], "*": P["wall"]}, 0, 0.07, 0)
            y0 = 0.14
        else:
            dk_lathe(kit, role, [(0.18, 0.0), (0.08, 0.1), (0.05, 0.75), (0.16, 0.82), (0.18, 0.86)], 6, [[P["trim"][-1]], DK_IRON, DK_IRON, [P["trim"][0]]])
            y0 = 0.86
        for i in range(n):
            a = 2 * math.pi * i / n + kit.r.uniform(-0.2, 0.2)
            d = 0 if i == 0 else (0.11 if n <= 5 else kit.r.uniform(0.08, 0.2))
            candle(kit, role, math.cos(a) * d, y0, math.sin(a) * d, kit.r.uniform(0.12, 0.34) if i else 0.38)
    prop_urn(kit, "urn0", P, tall=True)
    prop_urn(kit, "urn1", P, tall=False, broken=True)
    prop_rubble(kit, "rubble0", P, 420)
    prop_rubble(kit, "rubble1", P, 421)
    skull(kit, "rubble1", 0.35, 0.0, 0.35, ry=0.8)
    prop_pillar(kit, "pillar0", P, P["wall"], round_=False)
    # scatter: bones, a skull, grave dust
    kit.r = random.Random(430)
    for i in range(4):
        bone(kit, "scatter0", kit.r.uniform(-0.45, 0.45), kit.r.uniform(-0.45, 0.45), kit.r.uniform(0.25, 0.45), kit.r.uniform(0, 3))
    skull(kit, "scatter0", 0.25, 0.0, -0.2, ry=1.1)
    scatter_pebbles(kit, "scatter1", P["rock"], 431, n=7)
    kit.r = random.Random(432)
    for i in range(3):
        bone(kit, "scatter2", kit.r.uniform(-0.4, 0.4), kit.r.uniform(-0.4, 0.4), kit.r.uniform(0.2, 0.4), kit.r.uniform(0, 3))
    kit.box("scatter2", 0.5, 0.025, 0.36, P["cloth"], -0.1, 0.012, 0.15, ry=0.7)


def dk_forge(kit):
    P = DK_PAL["forge"]
    mortar = 0x1c1410
    def straps(role, xs):
        for x in xs:
            kit.box(role, 0.16, 2.7, 0.05, DK_IRON, x, 0.44 + 1.35, 0.15, skip=("-z",))
            for y in (0.7, 1.3, 1.9, 2.5, 3.0):
                kit.box(role, 0.06, 0.06, 0.03, [P["trim"][-1]], x, y, 0.185)
    built_wall_frame(kit, "wall0", P, P["wall"], mortar, rows=4, dmin=0.06, dmax=0.14, wmin=0.6, wmax=1.2, plinth=DK_IRON + DK_IRON, cornice=[DK_IRON[0], P["trim"][-1]])
    straps("wall0", (-0.9, 0.9))
    # wall1: a glowing seam of magma down the face, pooling at the foot
    built_wall_frame(kit, "wall1", P, P["wall"], mortar, rows=4, dmin=0.06, dmax=0.14, wmin=0.6, wmax=1.2,
                     holes=[(-0.35, 0.15, 0.44, 3.1)], plinth=DK_IRON + DK_IRON, cornice=[DK_IRON[0], P["trim"][-1]])
    pts = [(-0.1 + 0.12 * math.sin(i * 1.7), 3.1 - i * 0.33, 0.04) for i in range(9)] + [(0.0, 0.2, 0.2), (0.1, 0.04, 0.5)]
    dk_tube(kit, G("wall1"), pts, [0.09] * 9 + [0.12, 0.05], 5, GLOW)
    kit.box(G("wall1"), 1.3, 0.03, 0.5, GLOW, 0.1, 0.02, 0.55, ry=0.2)
    for s in (-1, 1):
        kit.box("wall1", 0.3, 0.06, 0.6, DK_SOOT, 0.1 + s * 0.75, 0.03, 0.5, ry=0.2)
    # wall2: a furnace vent behind an iron grille, pipes over the top
    built_wall_frame(kit, "wall2", P, P["wall"], mortar, rows=4, dmin=0.06, dmax=0.14, wmin=0.6, wmax=1.2,
                     holes=[(-0.7, 0.7, 0.44, 1.5)], plinth=DK_IRON + DK_IRON, cornice=[DK_IRON[0], P["trim"][-1]])
    kit.box(G("wall2"), 1.36, 1.0, 0.02, GLOW, 0, 0.98, 0.02)
    kit.box("wall2", 1.6, 0.16, 0.3, [P["trim"][0]], 0, 1.58, 0.15, skip=("-z",))
    for i in range(7):
        kit.box("wall2", 0.06, 1.05, 0.06, DK_IRON, -0.6 + i * 0.2, 0.98, 0.2)
    kit.box("wall2", 1.4, 0.06, 0.06, DK_IRON, 0, 1.2, 0.2)
    for s in (-1, 1):
        kit.cylr("wall2", 0.1, 0.1, 2.0, 8, [P["trim"][-1], P["trim"][0]], s * 1.25, 2.1, 0.32)
        kit.cylr("wall2", 0.14, 0.14, 0.1, 8, DK_IRON, s * 1.25, 1.6, 0.32)
        kit.cylr("wall2", 0.14, 0.14, 0.1, 8, DK_IRON, s * 1.25, 2.7, 0.32)
    # wall3: a tool rack with tongs and hammers, chains from the cornice
    built_wall_frame(kit, "wall3", P, P["wall"], mortar, rows=4, dmin=0.06, dmax=0.14, wmin=0.6, wmax=1.2, plinth=DK_IRON + DK_IRON, cornice=[DK_IRON[0], P["trim"][-1]])
    straps("wall3", (-1.3,))
    kit.box("wall3", 1.8, 0.12, 0.12, DK_WOOD, 0.3, 2.1, 0.22)
    for i, x in enumerate((-0.4, 0.0, 0.4, 0.8)):
        if i % 2:
            kit.box("wall3", 0.05, 0.75, 0.05, DK_WOOD, x, 1.65, 0.3)
            kit.box("wall3", 0.22, 0.12, 0.12, DK_IRON, x, 1.25, 0.3)
        else:
            for s in (-1, 1):
                kit.box("wall3", 0.035, 0.9, 0.035, DK_IRON, x + s * 0.05, 1.6, 0.3, rz=s * 0.08)
    for x in (1.2, 1.5):
        for j in range(8):
            kit.box("wall3", 0.06, 0.13, 0.03 if j % 2 else 0.11, DK_IRON, x, 3.1 - j * 0.12, 0.3, ry=0 if j % 2 else math.pi / 2)
    built_corner_out(kit, "cornerOut", P, P["wall"], band=DK_IRON)
    built_corner_in(kit, "cornerIn", P, P["wall"])
    # props
    prop_brazier(kit, "brazier0", P)
    for role, stump in (("anvil0", True), ("anvil1", False)):
        if stump:
            dk_lathe(kit, role, [(0.34, 0.0), (0.3, 0.1), (0.28, 0.42)], 8, DK_WOOD)
            kit.cylr(role, 0.22, 0.22, 0.02, 8, [0x8a6a4a], 0, 0.43, 0)
            y = 0.44
        else:
            kit.box(role, 0.5, 0.42, 0.44, DK_IRON, 0, 0.21, 0)
            y = 0.42
        kit.box(role, 0.26, 0.14, 0.26, DK_IRON, 0, y + 0.07, 0)
        kit.box(role, 0.32, 0.16, 0.7, DK_IRON, 0, y + 0.22, 0.05)
        kit.cone(role, 0.12, 0.34, 6, DK_IRON, 0, y + 0.24, -0.47, rx=-math.pi / 2)
        kit.box(role, 0.34, 0.03, 0.72, [0x4c545e], 0, y + 0.31, 0.05)
        kit.box(role, 0.05, 0.05, 0.5, DK_WOOD, 0.28, y + 0.36, 0.3, ry=0.4)
        kit.box(role, 0.16, 0.1, 0.1, DK_IRON, 0.18, y + 0.36, 0.08, ry=0.4)
        kit.box(G(role), 0.12, 0.04, 0.24, GLOW, -0.05, y + 0.34, -0.12, ry=0.2)
    prop_rock(kit, "rock0", P, 560)
    prop_rock(kit, "rock1", P, 563)
    for role, seed in (("slag0", 570), ("slag1", 571)):
        kit.r = random.Random(seed)
        dk_boulder(kit, role, 0.46, DK_SOOT + [0x3a2416], 0, 0, 1.1, 0.55, 0.95, seed=seed, noise=0.32)
        dk_boulder(kit, role, 0.22, DK_SOOT, 0.4, 0.25, 1.1, 0.6, 1, seed=seed + 1, noise=0.35)
        blob(kit, G(role), 0.2, lambda n, p: 0xffffff, -0.05, 0.36, 0.05, 1.4, 0.25, 1.1, noise=0.3, seed=seed + 2)
        if seed % 2:
            blob(kit, G(role), 0.12, lambda n, p: 0xffffff, 0.42, 0.2, 0.22, 1.2, 0.3, 1.0, noise=0.3, seed=seed + 3)
    prop_pillar(kit, "pillar0", P, P["wall"], round_=False, band=None, glow_band=True)
    kit.box("pillar0", 0.94, 0.1, 0.94, DK_IRON, 0, 1.12, 0)
    kit.box("pillar0", 0.94, 0.1, 0.94, DK_IRON, 0, 1.5, 0)
    # scatter: slag crumbs with an ember, iron scraps
    kit.r = random.Random(580)
    scatter_pebbles(kit, "scatter0", DK_SOOT, 581, n=7)
    blob(kit, G("scatter0"), 0.06, lambda n, p: 0xffffff, 0.1, 0.03, 0.1, 1.2, 0.5, 1, noise=0.2, seed=3)
    scatter_pebbles(kit, "scatter1", P["rock"], 582, n=6)
    kit.r = random.Random(583)
    for i in range(4):
        kit.box("scatter2", kit.r.uniform(0.15, 0.35), 0.03, kit.r.uniform(0.06, 0.12), DK_IRON, kit.r.uniform(-0.4, 0.4), 0.015, kit.r.uniform(-0.4, 0.4), ry=kit.r.uniform(0, 3))
    for j in range(7):
        a = j * 0.9
        kit.box("scatter2", 0.12, 0.04, 0.06, DK_IRON, 0.3 + math.cos(a) * 0.15, 0.03, -0.2 + math.sin(a) * 0.15, ry=-a)


DK_BUILDERS = {"cave": dk_cave, "temple": dk_temple, "root": dk_root, "crypt": dk_crypt, "forge": dk_forge}

# ---------------------------------------------------------------- blender

def dk_kit(key):
    kit = Kit(0)
    kit.r = random.Random(0xd0 + DK_ORDER.index(key))
    DK_BUILDERS[key](kit)
    return kit


def dk_occluders(scn, piece):
    """Boxes standing in for the rock a wall or corner is set against (game space)."""
    if piece.startswith("wall"):
        boxes = [(-8, 8, -4, -0.03)]
    elif piece == "cornerOut":
        boxes = [(-6, -0.02, -6, -0.02)]
    elif piece == "cornerIn":
        boxes = [(-6, -0.02, -6, 6), (-0.02, 6, -6, -0.02)]
    else:
        return []
    out = []
    for x0, x1, z0, z1 in boxes:
        me = bpy.data.meshes.new("dk_tmp")
        y0, y1 = -0.1, 6.0
        v = [(x, -z, y) for y in (y0, y1) for z in (z0, z1) for x in (x0, x1)]
        f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        me.from_pydata(v, [], f)
        o = bpy.data.objects.new("dk_tmp", me)
        scn.collection.objects.link(o)
        out.append(o)
    return out


def build_dungeon(keys=None, export=True, bake=True, samples=64):
    report = []
    keep = bpy.context.window.scene
    for key in keys or DK_ORDER:
        t0 = time.time()
        kit = dk_kit(key)
        bid = "dungeon-" + key
        scn = scene_for(bid)
        objs = []
        for role, R in kit.roles.items():
            if R["f"]:
                objs.append(to_object("dk_%s_%s" % (key, role), R, scn.collection))
        prefix = "dk_%s_" % key
        for o in objs:
            piece = o.name[len(prefix):]
            if not bake or piece.endswith("Glow"):
                o.data.color_attributes.active_color = o.data.color_attributes["base"]
                continue
            glow = bpy.data.objects.get(o.name + "Glow")
            for o2 in objs:
                o2.hide_render = o2 is not o and o2 is not glow
            occ = dk_occluders(scn, piece)
            wall = piece.startswith("wall") or piece.startswith("corner")
            bake_ao(scn, o, None, strength=0.5 if wall else 0.45, gamma=0.8, distance=0.8 if wall else 0.5, samples=samples)
            for oc in occ:
                me = oc.data
                bpy.data.objects.remove(oc, do_unlink=True)
                bpy.data.meshes.remove(me)
        for o in objs:
            o.hide_render = False
        line = {"id": bid, "parts": len(objs), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)}
        if export:
            p, size = write_glb(scn, objs, bid)
            line["kb"] = round(size / 1024)
        line["s"] = round(time.time() - t0, 1)
        dk_layout(objs, prefix)
        report.append(line)
    bpy.context.window.scene = keep
    return report


def dk_layout(objs, prefix):
    """Spread the pieces out for a look: walls and corners in the back row, props in front."""
    walls = [o for o in objs if o.name[len(prefix):].startswith(("wall", "corner"))]
    rest = [o for o in objs if o not in walls]
    def place(group, row, step):
        names = sorted({o.name[len(prefix):].replace("Glow", "") for o in group})
        for o in group:
            i = names.index(o.name[len(prefix):].replace("Glow", ""))
            o.location = (i * step - (len(names) - 1) * step / 2, -row, 0)
    place(walls, 0, 4.6)
    place(rest, 4, 1.9)


def preview_dungeon(key="crypt"):
    """Build one biome's pieces without baking or exporting and frame them."""
    return build_dungeon([key], export=False, bake=False)


def look_dungeon(key, dist=17, x=0.0, y=-2.0, pitch=62, yaw=0):
    """Point the 3D viewport at a biome's laid-out pieces (vertex colours, studio light)."""
    bpy.context.window.scene = bpy.data.scenes["gm_dungeon-" + key]
    for area in bpy.context.window.screen.areas:
        if area.type == 'VIEW_3D':
            sp = area.spaces[0]
            sp.shading.type = 'SOLID'
            sp.shading.color_type = 'VERTEX'
            sp.shading.light = 'STUDIO'
            r3 = sp.region_3d
            r3.view_perspective = 'PERSP'
            r3.view_location = Vector((x, y, 1.2))
            r3.view_rotation = Matrix.Rotation(math.radians(yaw), 4, 'Z').to_quaternion() @ Matrix.Rotation(math.radians(pitch), 4, 'X').to_quaternion()
            r3.view_distance = dist
