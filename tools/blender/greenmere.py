# Greenmere town exteriors for Blender (5.x), built from tools/blender/townplan.json.
#
# In Blender (Scripting tab, or the MCP execute tool):
#   p = r"D:/ArBe-Projects/game/tools/blender/greenmere.py"
#   g = {"__file__": p}; exec(open(p).read(), g)
#   g["build"](["smith"])        # one or more ids; build() does every building
#   g["build"](["smith"], export=False)   # look first, export later
#
# Each building is generated in its own scene "gm_<id>", ambient occlusion is
# baked into the vertex colours (Cycles), and it is exported to
# assets/models/<id>.glb (meshopt compressed). The game loads it through
# src/view/townmodels.js and swaps it in for the code-built shell.
#
# Space: game building-local (x right, y up, +z = front), metres. Blender
# position = (x, -z, y); the glTF exporter (+Y up) maps it back.
# Objects: <id>_shell (clipped walls/roof), <id>_glass (window glow), <id>_lamp.
# The upstairs room, sign, stairs and furniture stay code-built; keep the
# footprint, openings and chimney tops in step with townplan.

import bpy, json, math, os, random, time
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(globals().get("__file__") or r"D:/ArBe-Projects/game/tools/blender/greenmere.py"))
REPO = os.path.dirname(os.path.dirname(HERE))
PLAN = json.load(open(os.path.join(HERE, "townplan.json")))
F = PLAN["FLOOR_Y"]; T = PLAN["WALL_T"]; DOOR_W = PLAN["DOOR_W"]; DOOR_H = PLAN["DOOR_H"]
OVER = 0.5
WIN_Y = 1.75

# ---------------------------------------------------------------- colour

def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hexc(h):
    return [lin(((h >> 16) & 255) / 255), lin(((h >> 8) & 255) / 255), lin((h & 255) / 255)]

def mix(a, b, t):
    ca = [(a >> s) & 255 for s in (16, 8, 0)]
    cb = [(b >> s) & 255 for s in (16, 8, 0)]
    c = [round(x + (y - x) * t) for x, y in zip(ca, cb)]
    return (c[0] << 16) | (c[1] << 8) | c[2]

def shade(h, k):
    c = [min(255, round(((h >> s) & 255) * k)) for s in (16, 8, 0)]
    return (c[0] << 16) | (c[1] << 8) | c[2]

def tones(h, spread=0.1, n=6, hue=None):
    out = [h]
    for i in range(1, n):
        k = 1 + spread * ((i % 3) - 1) * (1 + i / n)
        c = shade(h, k)
        if hue is not None and i % 2:
            c = mix(c, hue, 0.12)
        out.append(c)
    return out

RUBBLE = [0x8c8a84, 0x7f807c, 0x989389, 0x727578, 0x9e978b, 0x878076, 0x7a7670]
QUOIN = [0xb4ad9e, 0xaaa395, 0xbcb4a4]
ASHLAR = [0xc9c0ad, 0xbfb6a2, 0xd0c7b3, 0xc4baa5]
PLINTH = [0x5e6166, 0x55595e, 0x676a6e, 0x60605c]
MORTAR = 0x57534d
LIME = 0xd8cdb4
PLASTER = [0xe7d7b4, 0xe9dab9, 0xe5d5b1]
OCHRE = [0xdcc08a, 0xdfc38e, 0xd9bd87]
WHITE = [0xeee6d4, 0xf0e8d7, 0xece3d0]
TIMBER_D = [0x3a2416, 0x432a1a, 0x3e2718]
TIMBER_M = [0x5e3b22, 0x6b4428, 0x553520]
TIMBER_L = [0x8d5b34, 0x7d5030]
TAR = [0x3b3029, 0x433529, 0x372c25, 0x45382c]
BOARD = [0x7a5a3c, 0x6e5034, 0x836244, 0x735538]
IRON = [0x2c3036, 0x33373d]
BRICK = [0x8a4a36, 0x7c4230, 0x94523c, 0x6f3c2c]
CLAY = [0x6a4434, 0x5e3c2e, 0x744a38]
LICHEN = [0x4a5440, 0x585a44, 0x46503e]
GLASS = 0xf6d59a
LAMP = 0xffd27a
FLOWERS = [0xffe14a, 0xf2a3c2, 0xff8d6a, 0xfff6e4, 0xc7b0f0, 0xe85a5a]
LEAF = [0x3f6b2e, 0x4a7a34, 0x365e28, 0x527f3a]

# Per building: wall facing, roof covering, gable fill, chimney stone, extras.
STYLES = {
    "smith":   dict(walls="rubble", roof="slate", gable="boards", chim="rubble", lamp=True, grille=True, extras="smith"),
    "bank":    dict(walls="ashlar", roof="slate", gable="ashlar", chim="ashlar", lamp=True, grille=True, extras="bank"),
    "store":   dict(walls="timber", plaster=PLASTER, roof="tile", gable="plaster", chim="brick", lamp=True, extras="store"),
    "inn":     dict(walls="timber", plaster=OCHRE, roof="shingle", gable="plaster", chim="brick", lamp=True, extras="inn"),
    "still":   dict(walls="stoneboard", roof="slate", moss=0.18, gable="boards", chim="brick", lamp=False, extras="still"),
    "trainer": dict(walls="hall", roof="slate", gable="boards", chim="rubble", lamp=True, extras="trainer"),
    "cottage": dict(walls="timber", plaster=WHITE, roof=None, gable="plaster", chim="rubble", lamp=False, extras="cottage"),
}

def style_for(b):
    s = dict(STYLES.get(b["id"]) or STYLES["cottage"])
    if s["roof"] is None:
        rc = b["roofColor"]
        s["roof"] = {0x6e2e28: "tile", 0x2f363e: "slate", 0x5a3a24: "thatch"}.get(rc, "tile")
    return s

# ---------------------------------------------------------------- kit

class Kit:
    HEX_FACES = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    HEX_LABELS = ["-y", "+y", "-z", "+x", "+z", "-x"]

    def __init__(self, seed):
        self.r = random.Random(seed)
        self.roles = {}
        self.frame = Matrix.Identity(4)
        self.post = None
        self.redirect = None

    def role(self, name):
        if self.redirect and name in self.redirect:
            name = self.redirect[name]
        if name not in self.roles:
            self.roles[name] = {"v": [], "f": [], "c": []}
        return self.roles[name]

    def pick(self, pal):
        if isinstance(pal, (list, tuple)):
            return pal[self.r.randrange(len(pal))]
        return pal

    def xf(self, x=0, y=0, z=0, ry=0, rx=0, rz=0):
        return (self.frame @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(rx, 4, 'X')
                @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rz, 4, 'Z'))

    def _emit(self, role, pts, faces, col, labels, skip):
        R = self.role(role)
        base = len(R["v"])
        R["v"].extend(pts)
        cen = sum(pts, Vector()) / len(pts)
        whole = None if isinstance(col, dict) else self.pick(col)
        for f, lab in zip(faces, labels):
            if lab in skip:
                continue
            hx = self.pick(col.get(lab, col.get("*"))) if isinstance(col, dict) else whole
            c = hexc(hx)
            if self.post:
                c = self.post(c, cen, role)
            R["f"].append(tuple(base + i for i in f))
            R["c"].append(c)

    def hexa(self, role, pts, col, m=None, skip=()):
        m = m if m is not None else self.frame
        self._emit(role, [m @ Vector(p) for p in pts], self.HEX_FACES, col, self.HEX_LABELS, skip)

    def box(self, role, w, h, d, col, x=0, y=0, z=0, ry=0, rx=0, rz=0, skip=()):
        hx, hy, hz = w / 2, h / 2, d / 2
        pts = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, -hy, hz), (-hx, -hy, hz),
               (-hx, hy, -hz), (hx, hy, -hz), (hx, hy, hz), (-hx, hy, hz)]
        self.hexa(role, pts, col, self.xf(x, y, z, ry, rx, rz), skip)

    def prism(self, role, pts2d, z0, z1, col, m=None):
        m = m if m is not None else self.frame
        n = len(pts2d)
        pts = [m @ Vector((x, y, z0)) for x, y in pts2d] + [m @ Vector((x, y, z1)) for x, y in pts2d]
        faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
        labels = ["-z", "+z"]
        for i in range(n):
            j = (i + 1) % n
            faces.append((i, j, n + j, n + i))
            labels.append("side")
        self._emit(role, pts, faces, col, labels, ())

    def cyl(self, role, r, h, seg, col, x=0, y=0, z=0, rx=0, rz=0):
        # Upright n-gon prism centred at (x, y, z); rx/rz tip it over.
        pts = [(r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
        m = self.xf(x, y, z, 0, rx, rz) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
        self.prism(role, pts, -h / 2, h / 2, col, m)

    def cylr(self, role, rt, rb, h, seg, col, x=0, y=0, z=0, ry=0, rx=0, rz=0):
        """Tapered upright prism (three.js CylinderGeometry argument order)."""
        m = self.xf(x, y, z, ry, rx, rz)
        top = [m @ Vector((rt * math.cos(2 * math.pi * i / seg), h / 2, -rt * math.sin(2 * math.pi * i / seg))) for i in range(seg)]
        bot = [m @ Vector((rb * math.cos(2 * math.pi * i / seg), -h / 2, -rb * math.sin(2 * math.pi * i / seg))) for i in range(seg)]
        faces = [tuple(range(seg - 1, -1, -1)), tuple(range(seg, 2 * seg))]
        faces = [tuple(range(seg)), tuple(range(2 * seg - 1, seg - 1, -1))]
        labels = ["+y", "-y"]
        for i in range(seg):
            j = (i + 1) % seg
            faces.append((i, seg + i, seg + j, j))
            labels.append("side")
        self._emit(role, top + bot, faces, col, labels, ())

    def cone(self, role, r, h, seg, col, x=0, y=0, z=0, ry=0, rx=0, rz=0):
        m = self.xf(x, y, z, ry, rx, rz)
        base = [m @ Vector((r * math.cos(2 * math.pi * i / seg), -h / 2, -r * math.sin(2 * math.pi * i / seg))) for i in range(seg)]
        apex = m @ Vector((0, h / 2, 0))
        faces = [tuple(range(seg - 1, -1, -1))]
        labels = ["-y"]
        for i in range(seg):
            faces.append((i, (i + 1) % seg, seg))
            labels.append("side")
        self._emit(role, base + [apex], faces, col, labels, ())

    ICO = None

    def ball(self, role, r, col, x=0, y=0, z=0, sx=1, sy=1, sz=1, ry=0):
        if Kit.ICO is None:
            t = (1 + 5 ** 0.5) / 2
            v = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
                 (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
            n = (1 + t * t) ** 0.5
            f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
                 (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
            Kit.ICO = ([(a / n, b / n, c / n) for a, b, c in v], f)
        v, f = Kit.ICO
        m = self.xf(x, y, z, ry) @ Matrix.Diagonal((sx * r, sy * r, sz * r, 1))
        self._emit(role, [m @ Vector(p) for p in v], f, col, ["side"] * len(f), ())

    def grid(self, role, w, h, cell, col, x=0, y=0, z=0, ry=0):
        # Subdivided quad facing local +z; shared vertices so baked AO interpolates.
        m = self.xf(x, y, z, ry)
        nx = max(1, round(w / cell)); ny = max(1, round(h / cell))
        R = self.role(role)
        base = len(R["v"])
        for j in range(ny + 1):
            for i in range(nx + 1):
                R["v"].append(m @ Vector((-w / 2 + w * i / nx, -h / 2 + h * j / ny, 0)))
        for j in range(ny):
            for i in range(nx):
                a = base + j * (nx + 1) + i
                R["f"].append((a, a + 1, a + nx + 2, a + nx + 1))
                c = hexc(self.pick(col))
                cen = (R["v"][a] + R["v"][a + nx + 2]) / 2
                R["c"].append(self.post(c, cen, role) if self.post else c)

def subtract(a0, a1, holes):
    segs = [(a0, a1)]
    for h0, h1 in holes:
        nxt = []
        for s0, s1 in segs:
            if h1 <= s0 or h0 >= s1:
                nxt.append((s0, s1)); continue
            if h0 > s0: nxt.append((s0, h0))
            if h1 < s1: nxt.append((h1, s1))
        segs = nxt
    return segs

def course_row(kit, x0, x1, y, h, holes, pal, dmin, dmax, wmin, wmax, gap=0.035, back=0.03, stagger=None, role="shell"):
    x = x0
    first = True
    while x < x1 - 0.02:
        w = kit.r.uniform(wmin, wmax)
        if first:
            w *= stagger if stagger is not None else kit.r.uniform(0.35, 1.0)
            first = False
        if x1 - (x + w) < wmin * 0.45:
            w = x1 - x
        sx0, sx1 = x + gap / 2, x + w - gap / 2
        sy0, sy1 = y + gap / 2, y + h - gap / 2
        hx = [(h0, h1) for (h0, h1, v0, v1) in holes if v1 > sy0 and v0 < sy1]
        for p0, p1 in subtract(sx0, sx1, hx):
            if p1 - p0 < 0.1:
                continue
            d = kit.r.uniform(dmin, dmax)
            ph = (sy1 - sy0) * (kit.r.uniform(0.94, 1.0) if dmax > dmin else 1.0)
            kit.box(role, p1 - p0, ph, d + back, pal, (p0 + p1) / 2, sy0 + ph / 2, (d - back) / 2, skip=("-z",))
        x += w

# ---------------------------------------------------------------- building

class B:
    """Derived numbers for one building (all local)."""
    def __init__(self, d):
        self.d = d
        self.id = d["id"]
        self.W = d["w"]; self.D = d["d"]; self.H = d["wallH"]
        self.U = d["upper"]; self.J = d["jetty"]
        self.TOP = F + self.H
        self.Y0 = self.TOP + self.U
        self.RISE = d["roofH"]
        self.halfD = self.D / 2 + self.J
        self.roofW = self.W + 2 * self.J + 0.8
        self.style = style_for(d)

    def L(self, side):
        return self.W if side in ("front", "back") else self.D

    def flip(self, side):
        return -1 if side in ("back", "right") else 1

    def frame(self, side):
        W, D = self.W, self.D
        if side == "front":
            return Matrix.Translation((0, F, D / 2))
        if side == "back":
            return Matrix.Translation((0, F, -D / 2)) @ Matrix.Rotation(math.pi, 4, 'Y')
        if side == "left":
            return Matrix.Translation((-W / 2, F, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'Y')
        return Matrix.Translation((W / 2, F, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')

    def doors(self, side):
        return [dd["at"] * self.flip(side) for dd in self.d["doors"] if dd["side"] == side]

    def windows(self, side):
        return [w["at"] * self.flip(side) for w in self.d["windows"] if w["side"] == side]

    def holes(self, side):
        out = []
        for a in self.windows(side):
            out.append((a - 0.74, a + 0.74, 0.98, 2.62))
        for a in self.doors(side):
            out.append((a - 1.32, a + 1.32, -1.0, 3.34 if self.style["walls"] in ("rubble", "ashlar") else DOOR_H + 0.3))
        return out

    def sign_at(self):
        d0 = self.d["doors"][0]
        return d0["side"], (d0["at"] + DOOR_W / 2 + 0.75) * self.flip(d0["side"])

def wall_cores(kit, b):
    out_lab = {"front": "+z", "back": "-z", "left": "-x", "right": "+x"}
    in_lab = {"front": "-z", "back": "+z", "left": "+x", "right": "-x"}
    for w in b.d["walls"]:
        side, x, z, hx, hz = w["side"], w["x"], w["z"], w["hx"], w["hz"]
        kit.frame = Matrix.Identity(4)
        kit.box("shell", hx * 2, b.TOP + 0.2, hz * 2, {"*": MORTAR}, x, (b.TOP - 0.2) / 2, z, skip=(in_lab[side],))
        inner = {"front": (x, z - hz - 0.002, math.pi), "back": (x, z + hz + 0.002, 0.0),
                 "left": (x + hx + 0.002, z, math.pi / 2), "right": (x - hx - 0.002, z, -math.pi / 2)}[side]
        width = hx * 2 if side in ("front", "back") else hz * 2
        kit.grid("shell", width, b.TOP - F + 0.02, 0.5, LIME, inner[0], (b.TOP + F) / 2, inner[1], inner[2])
    # Infill over each door up to the wall top.
    for side in ("front", "back", "left", "right"):
        for a in b.doors(side):
            kit.frame = b.frame(side)
            ih = b.H - DOOR_H
            kit.box("shell", DOOR_W, ih, T, {"*": MORTAR}, a, DOOR_H + ih / 2, -T / 2, skip=("-z",))
            kit.grid("shell", DOOR_W, ih, 0.4, LIME, a, DOOR_H + ih / 2, -T - 0.002, ry=math.pi)

def courses_for(kit, b, y0, hmin, hmax):
    out = []
    y = y0
    while y < b.H - 0.01:
        h = kit.r.uniform(hmin, hmax)
        if b.H - (y + h) < 0.22:
            h = b.H - y
        out.append((y, h)); y += h
    return out

def plinth(kit, b, side, top=0.3, pal=PLINTH):
    L = b.L(side)
    A = side in ("front", "back")
    ext = 0.13 if A else 0.0
    ph = [(a - DOOR_W / 2, a + DOOR_W / 2, -1, 1) for a in b.doors(side)]
    course_row(kit, -L / 2 - ext, L / 2 + ext, -0.36, top + 0.36, ph, pal, 0.12, 0.15, 0.6, 1.1, gap=0.04)

# ---- facings. Each writes one side in its side frame (x along, y up from floor, +z out).

def face_stone(kit, b, side, courses, pal, quoin_pal, dmin, dmax, wmin, wmax, regular=False, y_top=None):
    L = b.L(side)
    A = side in ("front", "back")
    holes = b.holes(side)
    for i, (cy, ch) in enumerate(courses):
        if y_top is not None and cy >= y_top - 0.01:
            break
        if y_top is not None:
            ch = min(ch, y_top - cy)
        long_here = (i % 2 == 0) == A
        q = 0.72 if long_here else 0.36
        qd = 0.075
        for sgn in (-1, 1):
            e = qd if A else 0.0
            qa, qb = (L / 2 - q, L / 2 + e) if sgn > 0 else (-L / 2 - e, -L / 2 + q)
            kit.box("shell", qb - qa - 0.02, ch - 0.035, qd + 0.03, quoin_pal, (qa + qb) / 2, cy + ch / 2, (qd - 0.03) / 2, skip=("-z",))
        st = (0.5 if i % 2 else 1.0) if regular else None
        course_row(kit, -L / 2 + q + 0.01, L / 2 - q - 0.01, cy, ch, holes, pal, dmin, dmax, wmin, wmax,
                   gap=0.022 if regular else 0.035, stagger=st)

def plaster_face(kit, b, side, y0, y1, pal):
    L = b.L(side)
    gaps = [(a - DOOR_W / 2, a + DOOR_W / 2) for a in b.doors(side)] if y0 < DOOR_H else []
    for s0, s1 in subtract(-L / 2, L / 2, gaps):
        kit.grid("shell", s1 - s0, y1 - y0, 0.45, pal, (s0 + s1) / 2, (y0 + y1) / 2, 0.003)
    if gaps and y1 > DOOR_H:
        for a in b.doors(side):
            kit.grid("shell", DOOR_W, y1 - DOOR_H, 0.45, pal, a, (DOOR_H + y1) / 2, 0.003)

def timber_frame(kit, b, side, y0, y1, close=False, braces=True):
    """Posts, rails and braces proud of a plaster face, y0..y1 in the side frame."""
    L = b.L(side)
    H = y1 - y0
    blocked = [(a - DOOR_W / 2 - 0.12, a + DOOR_W / 2 + 0.12) for a in b.doors(side)] if y0 < DOOR_H else []
    wins = b.windows(side)
    for a in wins:
        blocked.append((a - 0.62, a + 0.62))
    posts = [-L / 2 + 0.11, L / 2 - 0.11]
    step = 0.62 if close else 1.35
    n = max(1, round(L / step))
    for i in range(1, n):
        a = -L / 2 + i * L / n
        if all(not (r0 < a < r1) for r0, r1 in blocked):
            posts.append(a)
    for a in b.doors(side):
        if y0 < DOOR_H:
            posts += [a - DOOR_W / 2 - 0.11, a + DOOR_W / 2 + 0.11]
    posts.sort()
    for a in posts:
        kit.box("shell", 0.2, H, 0.16, TIMBER_D, a, y0 + H / 2, 0.06, skip=("-z",))
    # Sole plate, mid rail (broken at openings), head beam.
    kit.box("shell", L + 0.04, 0.2, 0.2, TIMBER_D, 0, y0 + 0.1, 0.07, skip=("-z",))
    kit.box("shell", L + 0.04, 0.24, 0.2, TIMBER_D, 0, y1 - 0.12, 0.07, skip=("-z",))
    mid = y0 + H * 0.42 if not close else None
    if mid is not None:
        hol = [(a - 0.62, a + 0.62) for a in wins] + [(a - DOOR_W / 2 - 0.1, a + DOOR_W / 2 + 0.1) for a in b.doors(side) if y0 < DOOR_H]
        for s0, s1 in subtract(-L / 2 + 0.2, L / 2 - 0.2, hol):
            if s1 - s0 > 0.2:
                kit.box("shell", s1 - s0, 0.16, 0.14, TIMBER_M, (s0 + s1) / 2, mid, 0.05, skip=("-z",))
    if braces:
        for i in range(len(posts) - 1):
            a0, a1 = posts[i], posts[i + 1]
            span = a1 - a0
            if span < 0.9 or span > 2.2:
                continue
            if any(r0 < a1 and r1 > a0 for r0, r1 in blocked):
                continue
            if i not in (0, len(posts) - 2):
                continue
            top = (mid if mid is not None else y1 - 0.24) - 0.05
            hgt = top - (y0 + 0.2)
            ln = math.hypot(span - 0.2, hgt)
            ang = math.atan2(hgt, span - 0.2) * (1 if i == 0 else -1)
            kit.box("shell", ln, 0.15, 0.13, TIMBER_D, (a0 + a1) / 2, y0 + 0.2 + hgt / 2, 0.05, rz=ang, skip=("-z",))

def boards_face(kit, b, side, y0, y1, pal, vertical=True, batten=True):
    L = b.L(side)
    holes = b.holes(side)
    if vertical:
        x = -L / 2
        while x < L / 2 - 0.01:
            w = min(kit.r.uniform(0.22, 0.3), L / 2 - x)
            hs = [(h0, h1, v0, v1) for h0, h1, v0, v1 in holes if h0 < x + w and h1 > x]
            segs = [(y0, y1)]
            for h0, h1, v0, v1 in hs:
                segs = subtract_y(segs, v0, v1)
            for s0, s1 in segs:
                if s1 - s0 > 0.08:
                    kit.box("shell", w - 0.02, s1 - s0, 0.05, pal, x + w / 2, (s0 + s1) / 2, 0.025, skip=("-z",))
                    if batten:
                        kit.box("shell", 0.07, s1 - s0, 0.03, TIMBER_D, x + w, (s0 + s1) / 2, 0.06, skip=("-z",))
            x += w
    else:
        y = y0
        while y < y1 - 0.02:
            h = min(0.24, y1 - y)
            row = [(h0, h1) for h0, h1, v0, v1 in holes if v0 < y + h and v1 > y]
            col = kit.pick(pal)
            for s0, s1 in subtract(-L / 2, L / 2, row):
                if s1 - s0 > 0.1:
                    kit.box("shell", s1 - s0, h + 0.04, 0.03, col, (s0 + s1) / 2, y + h / 2, 0.035, rx=-0.09, skip=("-z",))
            y += h

def subtract_y(segs, v0, v1):
    out = []
    for s0, s1 in segs:
        if v1 <= s0 or v0 >= s1:
            out.append((s0, s1)); continue
        if v0 > s0: out.append((s0, v0))
        if v1 < s1: out.append((v1, s1))
    return out

# ---- openings

def window(kit, b, side, a, kind):
    y = WIN_Y
    if kind == "stone":
        kit.box("shell", 1.56, 0.13, 0.24, QUOIN, a, y - 0.66, 0.06)
        kit.box("shell", 1.56, 0.26, 0.12, QUOIN, a, y + 0.72, 0.03)
        for sgn in (-1, 1):
            yb = y - 0.6; k = 0
            while yb < y + 0.58:
                bh = min(0.4, y + 0.59 - yb)
                bw = 0.24 if k % 2 == 0 else 0.16
                kit.box("shell", bw, bh - 0.03, 0.12, QUOIN, a + sgn * (0.5 + bw / 2 + 0.01), yb + bh / 2, 0.03)
                yb += bh; k += 1
        if b.style.get("grille"):
            for dx in (-0.25, 0.25):
                kit.box("shell", 0.045, 1.15, 0.045, IRON, a + dx, y, 0.05)
            kit.box("shell", 1.0, 0.045, 0.045, IRON, a, y + 0.05, 0.05)
        else:
            kit.box("shell", 0.06, 1.15, 0.06, TIMBER_D, a, y, 0.04)
    else:
        # Timber: frame, mullion and transom, shutters, sill; flower box on the front.
        kit.box("shell", 1.24, 0.14, 0.18, TIMBER_D, a, y + 0.64, 0.07)
        kit.box("shell", 1.34, 0.1, 0.28, TIMBER_L, a, y - 0.62, 0.1)
        for sgn in (-1, 1):
            kit.box("shell", 0.11, 1.24, 0.16, TIMBER_D, a + sgn * 0.555, y, 0.06)
        kit.box("shell", 0.06, 1.15, 0.08, TIMBER_D, a, y, 0.05)
        kit.box("shell", 1.0, 0.06, 0.08, TIMBER_D, a, y + 0.22, 0.05)
        shut = kit.pick([[0x3e6a4a], [0x2f4f6e], [0x7a3a2c], [0x5e3b22]]) if b.style["walls"] != "hall" else TIMBER_M
        for sgn in (-1, 1):
            sx = a + sgn * 0.9
            for k in range(3):
                kit.box("shell", 0.16, 1.2, 0.05, shut, sx - 0.16 + k * 0.16, y, 0.12)
            kit.box("shell", 0.5, 0.08, 0.04, TIMBER_D, sx, y + 0.35, 0.16)
            kit.box("shell", 0.5, 0.08, 0.04, TIMBER_D, sx, y - 0.35, 0.16)
        if side == "front" or b.style["extras"] in ("inn", "cottage"):
            flower_box(kit, a, y - 0.82, 0.24)
    kit.box("glass", 1.0, 1.15, 0.04, GLASS, a, y, 0.01)
    kit.box("glass", 1.0, 1.15, 0.04, GLASS, a, y, -T - 0.01)
    kit.box("shell", 1.2, 0.08, 0.2, TIMBER_M, a, y - 0.62, -T - 0.08)

def flower_box(kit, a, y, z, w=1.1):
    kit.box("shell", w, 0.24, 0.3, TIMBER_M, a, y, z)
    n = int(w / 0.16)
    for k in range(n):
        x = a - w / 2 + 0.1 + k * (w - 0.2) / max(1, n - 1)
        kit.box("shell", 0.13, 0.12, 0.13, LEAF, x, y + 0.16, z + kit.r.uniform(-0.06, 0.06), ry=kit.r.uniform(0, 1))
        if kit.r.random() < 0.7:
            kit.box("shell", 0.08, 0.08, 0.08, FLOWERS, x + kit.r.uniform(-0.04, 0.04), y + 0.25, z + kit.r.uniform(-0.05, 0.08), ry=0.7)

def door_free(b, side, a, sgn):
    """Clear run of wall beside a door for a leaf to lie flat (side-frame x)."""
    L = b.L(side)
    edge = a + sgn * DOOR_W / 2
    lim = L / 2 - 0.3
    room = lim - sgn * edge
    for h0, h1, v0, v1 in b.holes(side):
        if v0 > DOOR_H:
            continue
        c = (h0 + h1) / 2
        if c == a:
            continue
        # timber windows carry shutters past the opening
        if b.style["walls"] not in ("rubble", "ashlar"):
            h0, h1 = h0 - 0.45, h1 + 0.45
        if sgn > 0 and h0 > edge: room = min(room, h0 - edge)
        if sgn < 0 and h1 < edge: room = min(room, edge - h1)
    return room

def door(kit, b, side, a, kind):
    if kind == "stone":
        for sgn in (-1, 1):
            yb = -0.02; k = 0
            while yb < DOOR_H - 0.05:
                bh = min(0.42, DOOR_H - yb)
                bw = 0.42 if k % 2 == 0 else 0.28
                kit.box("shell", bw, bh - 0.03, 0.12, QUOIN, a + sgn * (DOOR_W / 2 + bw / 2), yb + bh / 2, 0.03)
                yb += bh; k += 1
        kit.box("shell", DOOR_W + 1.0, 0.3, 0.36, TIMBER_D, a, DOOR_H + 0.15, -0.08)
        n = 7
        for i in range(n):
            t = (i + 0.5) / n * 2 - 1
            key = i == n // 2
            hh = 0.5 if key else 0.42
            kit.box("shell", 2.3 / n - 0.035, hh, 0.12 if key else 0.09, QUOIN, a + t * 1.15, DOOR_H + 0.32 + hh / 2, 0.035, rz=-t * 0.32)
    else:
        for sgn in (-1, 1):
            kit.box("shell", 0.22, DOOR_H + 0.12, 0.22, TIMBER_D, a + sgn * (DOOR_W / 2 + 0.11), (DOOR_H + 0.12) / 2, 0.05)
            kit.box("shell", 0.16, 0.3, 0.16, TIMBER_D, a + sgn * (DOOR_W / 2 + 0.05), DOOR_H - 0.12, 0.12, rz=sgn * 0.7)
        kit.box("shell", DOOR_W + 0.7, 0.26, 0.26, TIMBER_D, a, DOOR_H + 0.13, 0.07)
    # Leaves swung flat against the wall where there is room.
    for sgn in (-1, 1):
        if door_free(b, side, a, sgn) < 0.9:
            continue
        c = a + sgn * (DOOR_W / 2 + (0.92 if kind == "stone" else 0.66))
        for k in range(4):
            kit.box("shell", 0.19, DOOR_H - 0.12, 0.05, TIMBER_M, c - 0.3 + k * 0.2, (DOOR_H - 0.12) / 2 + 0.02, 0.15)
        for yy in (0.45, DOOR_H - 0.55):
            kit.box("shell", 0.82, 0.07, 0.03, IRON, c, yy, 0.19)
        kit.box("shell", 0.07, 1.6, 0.025, TIMBER_D, c, DOOR_H / 2 - 0.05, 0.185, rz=sgn * 0.46)
    kit.box("shell", DOOR_W + 0.5, 0.12, 0.75, PLINTH, a, -F + 0.06, 0.38)

def lantern(kit, x, y, z0=0.0):
    kit.box("shell", 0.04, 0.04, 0.5, IRON, x, y + 0.34, z0 + 0.25)
    kit.box("shell", 0.04, 0.3, 0.04, IRON, x, y + 0.19, z0 + 0.06, rx=0.5)
    kit.box("shell", 0.02, 0.12, 0.02, IRON, x, y + 0.26, z0 + 0.46)
    kit.box("shell", 0.28, 0.06, 0.28, IRON, x, y + 0.17, z0 + 0.46)
    kit.box("shell", 0.16, 0.08, 0.16, IRON, x, y + 0.22, z0 + 0.46)
    kit.box("lamp", 0.2, 0.28, 0.2, LAMP, x, y, z0 + 0.46)
    for dx in (-0.11, 0.11):
        for dz in (-0.11, 0.11):
            kit.box("shell", 0.03, 0.3, 0.03, IRON, x + dx, y, z0 + 0.46 + dz)
    kit.box("shell", 0.26, 0.04, 0.26, IRON, x, y - 0.15, z0 + 0.46)

def horseshoe(kit, x, y, z, up):
    s = 1 if up else -1
    kit.box("shell", 0.035, 0.17, 0.03, IRON, x - 0.065, y, z, rz=0.18 * s)
    kit.box("shell", 0.035, 0.17, 0.03, IRON, x + 0.065, y, z, rz=-0.18 * s)
    kit.box("shell", 0.12, 0.035, 0.03, IRON, x, y - s * 0.085, z)

def ivy(kit, a, y0, h, w):
    for k in range(int(h * w * 9)):
        x = a + kit.r.uniform(-w / 2, w / 2) * (1 - 0.5 * kit.r.random())
        y = y0 + h * (kit.r.random() ** 1.6)
        s = kit.r.uniform(0.1, 0.2)
        kit.box("shell", s, s, 0.06, LEAF, x, y, 0.05, rz=kit.r.uniform(0, 1.5))

# ---- walls per style

def build_walls(kit, b):
    st = b.style["walls"]
    stone_open = st in ("rubble", "ashlar")
    for side in ("front", "back", "left", "right"):
        kit.frame = b.frame(side)
        L = b.L(side)
        if st == "rubble":
            plinth(kit, b, side)
            face_stone(kit, b, side, b.courses, RUBBLE, QUOIN, 0.025, 0.065, 0.42, 0.9)
        elif st == "ashlar":
            plinth(kit, b, side, top=0.45, pal=[0x8e8778, 0x857e70, 0x968f80])
            face_stone(kit, b, side, b.courses, ASHLAR, [0xddd4c0, 0xd6cdb9], 0.03, 0.03, 0.85, 0.85, regular=True)
            # string course and cornice
            for y, h, dz in ((b.H * 0.5, 0.14, 0.12), (b.H - 0.1, 0.22, 0.2)):
                row = [(h0, h1) for h0, h1, v0, v1 in b.holes(side) if v0 < y + h and v1 > y]
                ext = 0.2 if side in ("front", "back") else 0.0
                for s0, s1 in subtract(-L / 2 - ext, L / 2 + ext, row):
                    kit.box("shell", s1 - s0, h, dz + 0.03, [0xddd4c0], (s0 + s1) / 2, y, (dz - 0.03) / 2, skip=("-z",))
        elif st == "timber":
            plinth(kit, b, side)
            plaster_face(kit, b, side, 0.3, b.H, b.style["plaster"])
            timber_frame(kit, b, side, 0.3, b.H, close=b.U > 0)
        elif st == "hall":
            plinth(kit, b, side, top=0.6)
            boards_face(kit, b, side, 0.6, b.H, BOARD, vertical=True)
            kit.box("shell", L + 0.1, 0.26, 0.24, TIMBER_D, 0, b.H - 0.13, 0.09, skip=("-z",))
            n = max(1, round(L / 2.6))
            for i in range(n + 1):
                a = -L / 2 + 0.14 + i * (L - 0.28) / n
                if any(h0 < a < h1 for h0, h1, v0, v1 in b.holes(side)):
                    continue
                kit.box("shell", 0.28, b.H - 0.6, 0.24, TIMBER_D, a, 0.6 + (b.H - 0.6) / 2, 0.09, skip=("-z",))
        elif st == "stoneboard":
            plinth(kit, b, side)
            face_stone(kit, b, side, b.courses, RUBBLE, QUOIN, 0.025, 0.06, 0.4, 0.8, y_top=1.25)
            boards_face(kit, b, side, 1.25, b.H, TAR, vertical=False)
            kit.box("shell", L + 0.12, 0.14, 0.14, TIMBER_D, 0, 1.25, 0.08, skip=("-z",))
            for sgn in (-1, 1):
                kit.box("shell", 0.18, b.H - 1.25, 0.16, TIMBER_D, sgn * (L / 2 - 0.02), 1.25 + (b.H - 1.25) / 2, 0.08)
        kind = "stone" if stone_open else "timber"
        for a in b.windows(side):
            window(kit, b, side, a, kind)
        for a in b.doors(side):
            door(kit, b, side, a, kind)

def build_upper(kit, b):
    """Jettied upper storey: walls with plaster both faces, close studding, windows."""
    if not b.U:
        return
    U, J = b.U, b.J
    uw, ud = b.W + 2 * J, b.D + 2 * J
    top = b.TOP
    kit.frame = Matrix.Identity(4)
    walls = [((0, top + U / 2, ud / 2 - T / 2), (uw, U, T), "front"), ((0, top + U / 2, -ud / 2 + T / 2), (uw, U, T), "back"),
             ((-uw / 2 + T / 2, top + U / 2, 0), (T, U, ud - 2 * T), "left"), ((uw / 2 - T / 2, top + U / 2, 0), (T, U, ud - 2 * T), "right")]
    for (x, y, z), (w, h, d), side in walls:
        kit.box("shell", w, h, d, {"*": MORTAR}, x, y, z)
    for side in ("front", "back", "left", "right"):
        L = uw if side in ("front", "back") else ud
        m = {"front": Matrix.Translation((0, top, ud / 2)), "back": Matrix.Translation((0, top, -ud / 2)) @ Matrix.Rotation(math.pi, 4, 'Y'),
             "left": Matrix.Translation((-uw / 2, top, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'Y'),
             "right": Matrix.Translation((uw / 2, top, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')}[side]
        kit.frame = m
        inner_L = L - 2 * T if side in ("left", "right") else L - 2 * T
        kit.grid("shell", inner_L, U, 0.5, LIME, 0, U / 2, -T - 0.002, ry=math.pi)
        wins = [-b.W / 4, b.W / 4] if side in ("front", "back") else []
        kit.grid("shell", L, U, 0.45, b.style["plaster"], 0, U / 2, 0.003)
        # Close studding with a mid rail; windows at the code's positions.
        blocked = [(a - 0.6, a + 0.6) for a in wins]
        n = max(1, round(L / 0.55))
        for i in range(n + 1):
            a = -L / 2 + 0.1 + i * (L - 0.2) / n
            if any(r0 < a < r1 for r0, r1 in blocked):
                kit.box("shell", 0.14, U * 0.22, 0.12, TIMBER_D, a, U * 0.11 + 0.1, 0.05, skip=("-z",))
                continue
            kit.box("shell", 0.14, U, 0.12, TIMBER_D, a, U / 2, 0.05, skip=("-z",))
        kit.box("shell", L + 0.1, 0.26, 0.2, TIMBER_D, 0, 0.13, 0.08, skip=("-z",))
        kit.box("shell", L + 0.1, 0.22, 0.2, TIMBER_D, 0, U - 0.11, 0.08, skip=("-z",))
        for s0, s1 in subtract(-L / 2, L / 2, blocked):
            if s1 - s0 > 0.2:
                kit.box("shell", s1 - s0, 0.12, 0.14, TIMBER_D, (s0 + s1) / 2, U * 0.45, 0.06, skip=("-z",))
        for a in wins:
            wy = U / 2 + 0.1
            kit.box("glass", 0.9, 0.9, 0.04, GLASS, a, wy, 0.01)
            kit.box("shell", 1.1, 0.12, 0.2, TIMBER_D, a, wy + 0.51, 0.08)
            kit.box("shell", 1.16, 0.1, 0.26, TIMBER_L, a, wy - 0.5, 0.1)
            for sgn in (-1, 1):
                kit.box("shell", 0.1, 1.0, 0.16, TIMBER_D, a + sgn * 0.5, wy, 0.06)
            kit.box("shell", 0.05, 0.9, 0.06, TIMBER_D, a, wy, 0.05)
            kit.box("shell", 0.9, 0.05, 0.06, TIMBER_D, a, wy, 0.05)
            if b.style["extras"] in ("inn", "store"):
                flower_box(kit, a, wy - 0.68, 0.22, w=1.0)
    # Jetty: bressumer and joist ends over the ground walls.
    kit.frame = Matrix.Identity(4)
    for sgn in (-1, 1):
        x = -b.W / 2 + 0.3
        while x < b.W / 2 - 0.1:
            kit.box("shell", 0.14, 0.16, J + 0.32, TIMBER_D, x, top - 0.06, sgn * (b.D / 2 + (J - 0.02) / 2))
            x += 0.55
        kit.box("shell", uw + 0.08, 0.2, J + 0.06, TIMBER_D, 0, top - 0.24, sgn * (b.D / 2 + J / 2))
        kit.box("shell", 0.14, 0.14, ud, TIMBER_D, sgn * (uw / 2 - 0.05), top - 0.06, 0)
    # Soffit over the jetty overhang.
    for sgn in (-1, 1):
        kit.box("shell", uw, 0.04, J, TIMBER_M, 0, top - 0.02, sgn * (b.D / 2 + J / 2))
        kit.box("shell", J, 0.04, b.D, TIMBER_M, sgn * (b.W / 2 + J / 2), top - 0.02, 0)

# ---- gables, roof, chimneys

def gable_frame(b, sgn):
    return Matrix.Translation((sgn * (b.W / 2 + b.J), 0, 0)) @ Matrix.Rotation(sgn * math.pi / 2, 4, 'Y')

def build_gables(kit, b):
    hd = b.halfD
    base = b.Y0
    g = b.style["gable"]
    for sgn in (-1, 1):
        kit.frame = gable_frame(b, sgn)
        kit.prism("shell", [(-hd, base), (hd, base), (0, base + b.RISE)], -T, 0.0, {"*": MORTAR})
        kit.box("shell", 2 * hd + 0.14, 0.22, 0.14, TIMBER_D, 0, base + 0.11, 0.05)
        top = lambda x: base + b.RISE * (1 - abs(x) / hd) - 0.02
        if g == "boards":
            x = -hd
            while x < hd - 0.01:
                bw = min(kit.r.uniform(0.2, 0.26), hd - x)
                if x < 0 < x + bw:
                    bw = -x
                xa, xb = x + 0.012, x + bw - 0.012
                y0 = base + 0.2
                z1 = 0.05 + kit.r.uniform(0, 0.012)
                kit.hexa("shell", [(xa, y0, 0), (xb, y0, 0), (xb, y0, z1), (xa, y0, z1),
                                   (xa, top(xa), 0), (xb, top(xb), 0), (xb, top(xb), z1), (xa, top(xa), z1)],
                         kit.pick(TIMBER_M if b.style["walls"] != "stoneboard" else TAR), skip=("-z",))
                x += bw
        elif g == "ashlar":
            y = base + 0.22; i = 0
            while y < base + b.RISE - 0.15:
                h = 0.4
                half = hd * (1 - (y + h - base) / b.RISE)
                if half > 0.2:
                    course_row(kit, -half, half, y, h, [], ASHLAR, 0.03, 0.03, 0.85, 0.85, gap=0.022, stagger=0.5 if i % 2 else 1.0)
                y += h; i += 1
        else:
            # plaster with king post and collar
            pal = b.style.get("plaster", PLASTER)
            R = kit.role("shell")
            m = kit.frame
            n = 8
            for j in range(n):
                y0 = base + 0.22 + (b.RISE - 0.22) * j / n
                y1 = base + 0.22 + (b.RISE - 0.22) * (j + 1) / n
                h0 = hd * (1 - (y0 - base) / b.RISE) - 0.02
                h1 = hd * (1 - (y1 - base) / b.RISE) - 0.02
                kit._emit("shell", [m @ Vector((-h0, y0, 0.004)), m @ Vector((h0, y0, 0.004)), m @ Vector((h1, y1, 0.004)), m @ Vector((-h1, y1, 0.004))],
                          [(0, 1, 2, 3)], kit.pick(pal), ["+z"], ())
            kit.box("shell", 0.18, b.RISE * 0.9, 0.14, TIMBER_D, 0, base + b.RISE * 0.45, 0.06, skip=("-z",))
            kit.box("shell", hd * 1.0, 0.16, 0.14, TIMBER_D, 0, base + b.RISE * 0.5, 0.06, skip=("-z",))
            for s in (-1, 1):
                ln = math.hypot(hd * 0.5, b.RISE * 0.45)
                kit.box("shell", ln, 0.14, 0.12, TIMBER_D, s * hd * 0.25, base + b.RISE * 0.27, 0.06, rz=-s * math.atan2(b.RISE * 0.45, hd * 0.5), skip=("-z",))
        if not b.U:
            vy = base + b.RISE * 0.35
            kit.box("glass", 0.6, 0.6, 0.04, GLASS, 0, vy, 0.07)
            kit.box("shell", 0.8, 0.1, 0.12, TIMBER_D, 0, vy + 0.35, 0.08)
            kit.box("shell", 0.86, 0.1, 0.18, TIMBER_D, 0, vy - 0.35, 0.1)
            for s in (-1, 1):
                kit.box("shell", 0.1, 0.6, 0.12, TIMBER_D, s * 0.35, vy, 0.08)

def roof_frame(b, sgn):
    ang = math.atan(b.RISE / b.halfD)
    m = Matrix.Translation((0, b.Y0 + b.RISE, 0))
    if sgn < 0:
        m = m @ Matrix.Rotation(math.pi, 4, 'Y')
    return m @ Matrix.Rotation(ang, 4, 'X')

ROOFS = {
    # length along slope, course pitch, thickness, width range, tail lift
    "slate":   dict(L=0.44, pitch=0.25, th=0.03, w=(0.3, 0.46), lift=0.035),
    "tile":    dict(L=0.4, pitch=0.22, th=0.05, w=(0.26, 0.3), lift=0.05),
    "shingle": dict(L=0.42, pitch=0.2, th=0.035, w=(0.16, 0.34), lift=0.04),
}

def roof_palette(b):
    rc = b.d["roofColor"]
    kind = b.style["roof"]
    if kind == "slate":
        return tones(rc, 0.1, 7, hue=0x40384a)
    if kind == "tile":
        return tones(rc, 0.12, 7, hue=0x8a4a2a)
    if kind == "shingle":
        return tones(mix(rc, 0x6a4a30, 0.3), 0.14, 7, hue=0x4a3a2a)
    return tones(mix(rc, 0xc9a35a, 0.72), 0.1, 7, hue=0x9a7a3a)

def build_roof(kit, b):
    hd = b.halfD
    ang = math.atan(b.RISE / hd)
    slab = (hd + OVER) / math.cos(ang)
    wall_s = hd / math.cos(ang)
    rw = b.roofW
    kind = b.style["roof"]
    pal = roof_palette(b)
    moss = b.style.get("moss", 0.08 if kind == "slate" else 0.04)
    for sgn in (-1, 1):
        kit.frame = roof_frame(b, sgn)
        kit.box("shell", rw, 0.12, slab, TIMBER_D, 0, 0.06, slab / 2)
        kit.box("shell", rw + 0.04, 0.24, 0.06, TIMBER_D, 0, -0.04, slab + 0.02)
        x = -rw / 2 + 0.3
        while x < rw / 2 - 0.2:
            kit.box("shell", 0.12, 0.14, slab - wall_s + 0.1, TIMBER_M, x, -0.07, (slab + wall_s) / 2)
            x += 0.6
        for bx in (-1, 1):
            kit.box("shell", 0.07, 0.3, slab + 0.02, TIMBER_D, bx * (rw / 2 + 0.035), 0.02, slab / 2)
        if kind == "thatch":
            thatch(kit, b, slab, rw, pal)
            continue
        P = ROOFS[kind]
        tilt = math.atan(P["lift"] / P["L"])
        s = slab + 0.06
        row = 0
        while s - P["L"] > -0.05:
            s0 = max(0.0, s - P["L"])
            x = -rw / 2 - 0.02 - (P["w"][0] * 0.5 if row % 2 else 0.0)
            while x < rw / 2 + 0.02:
                w = kit.r.uniform(*P["w"])
                xa = max(x, -rw / 2 - 0.02)
                xb = min(x + w, rw / 2 + 0.02)
                if xb - xa > 0.08:
                    c = LICHEN if (row < 6 and kit.r.random() < moss) else pal
                    yy = 0.12 + P["th"] / 2 + 0.012 + kit.r.uniform(0, 0.008)
                    kit.box("shell", xb - xa - 0.018, P["th"], s - s0, c, (xa + xb) / 2, yy, (s0 + s) / 2,
                            rx=-tilt + kit.r.uniform(-0.01, 0.01), rz=kit.r.uniform(-0.012, 0.012), skip=("-y",))
                    if kind == "tile":
                        # roll on each tile so the course reads as pantiles
                        kit.box("shell", 0.07, 0.035, s - s0 - 0.04, c, xa + 0.05, yy + 0.035, (s0 + s) / 2, rx=-tilt, skip=("-y",))
                x += w
            s -= P["pitch"]
            row += 1
    kit.frame = Matrix.Identity(4)
    ridge_y = b.Y0 + b.RISE + 0.2
    if kind == "thatch":
        kit.cyl("shell", 0.32, rw + 0.1, 8, [shade(pal[0], 0.85)], 0, ridge_y + 0.05, 0, rz=math.pi / 2)
        for k in range(int(rw / 0.7)):
            x = -rw / 2 + 0.35 + k * 0.7
            kit.box("shell", 0.04, 0.04, 0.9, TIMBER_M, x, ridge_y + 0.2, 0, rx=0.0)
        return
    rpal = CLAY if kind == "slate" else (pal if kind == "tile" else TIMBER_D)
    x = -rw / 2
    while x < rw / 2 - 0.01:
        w = min(0.5, rw / 2 - x)
        kit.box("shell", w - 0.02, 0.26, 0.26, rpal, x + w / 2, ridge_y, 0, rx=math.pi / 4)
        x += w

def thatch(kit, b, slab, rw, pal):
    # Courses of straw bundles: short, thick, jittered so the eave edge is ragged
    # and the surface reads as straw rather than boards. Swells past the gables.
    s = slab + 0.16
    k = 0
    ext = 0.22
    while s > 0.02:
        ln = min(0.62, s + 0.05)
        th = 0.22 if k else 0.3
        x = -rw / 2 - ext - (0.2 if k % 2 else 0.0)
        while x < rw / 2 + ext:
            w = kit.r.uniform(0.32, 0.52)
            xa, xb = max(x, -rw / 2 - ext), min(x + w, rw / 2 + ext)
            if xb - xa > 0.1:
                dl = kit.r.uniform(-0.06, 0.06)
                kit.box("shell", xb - xa + 0.04, th * kit.r.uniform(0.85, 1.1), ln + dl, pal, (xa + xb) / 2,
                        0.12 + th / 2 + 0.02 * (k % 2), s - (ln + dl) / 2,
                        rx=-0.12 + kit.r.uniform(-0.03, 0.03), rz=kit.r.uniform(-0.04, 0.04), skip=("-y",))
            x += w
        s -= 0.3
        k += 1

def build_chimneys(kit, b):
    slope = b.RISE / b.halfD
    for c in b.d["chimneys"]:
        cx, cz = c["x"], c["z"]
        s = (1.1 if c.get("big") else 0.7) + 0.1
        h_top = b.Y0 + b.RISE + 1.0
        y0 = b.TOP - 0.5
        core_top = h_top - 0.12
        kit.frame = Matrix.Identity(4)
        kit.box("shell", s, core_top - y0, s, {"*": MORTAR}, cx, (y0 + core_top) / 2, cz)
        roof_low = b.Y0 + b.RISE - slope * (abs(cz) + s / 2) - 0.1
        kind = b.style["chim"]
        pal, qpal, hmin, hmax, wmin, wmax = {
            "rubble": (RUBBLE, QUOIN, 0.24, 0.34, 0.32, 0.55),
            "ashlar": (ASHLAR, ASHLAR, 0.36, 0.36, 0.6, 0.6),
            "brick": (BRICK, BRICK, 0.13, 0.13, 0.3, 0.3),
        }[kind]
        hs = s / 2
        for k, (fx, fz, ry) in enumerate([(cx, cz + hs, 0), (cx, cz - hs, math.pi), (cx - hs, cz, -math.pi / 2), (cx + hs, cz, math.pi / 2)]):
            kit.frame = Matrix.Translation((fx, 0, fz)) @ Matrix.Rotation(ry, 4, 'Y')
            e = 0.06 if k < 2 else 0.0
            y = roof_low
            i = 0
            while y < core_top - 0.6:
                h = kit.r.uniform(hmin, hmax)
                course_row(kit, -hs - e, hs + e, y, h, [], pal, 0.03, 0.05 if kind != "brick" else 0.03, wmin, wmax,
                           gap=0.03 if kind != "brick" else 0.022, stagger=(0.5 if i % 2 else 1.0) if kind != "rubble" else None)
                y += h; i += 1
        kit.frame = Matrix.Identity(4)
        band_y = core_top - 0.4
        kit.box("shell", s + 0.26, 0.16, s + 0.26, QUOIN if kind != "brick" else BRICK, cx, band_y, cz)
        for k in range(2):
            kit.box("shell", s - 0.02, 0.18, s - 0.02, pal, cx, band_y + 0.17 + k * 0.18, cz)
        kit.box("shell", s + 0.3, 0.12, s + 0.3, QUOIN if kind != "brick" else [0x5e5a54], cx, h_top, cz)
        kit.box("shell", s * 0.55, 0.02, s * 0.55, 0x14100e, cx, h_top + 0.07, cz)
        if not c.get("big"):
            kit.cyl("shell", 0.13, 0.32, 8, [0xa0583a, 0x8e4e34], cx, h_top + 0.2, cz)

# ---- extras by building

def build_extras(kit, b):
    ex = b.style["extras"]
    d0 = b.d["doors"][0]
    side = d0["side"]
    a = d0["at"] * b.flip(side)
    kit.frame = b.frame(side)
    L = b.L(side)
    sign_side, sign_a = b.sign_at()
    if b.style.get("lamp"):
        lx = a - 1.95 if abs(a - 1.95) < L / 2 - 0.4 else a + 2.1
        if b.d["sign"] and abs(lx - sign_a) < 0.5:
            lx = a + 2.3
        lantern(kit, lx, DOOR_H + 0.1)
    if ex == "smith":
        horseshoe(kit, a, DOOR_H + 0.15, 0.17, up=True)
        kit.box("shell", 1.7, 0.12, 0.08, TIMBER_D, a - 3.55, 2.05, 0.1)
        for k in range(5):
            xx = a - 4.2 + k * 0.33
            kit.box("shell", 0.03, 0.03, 0.1, IRON, xx, 2.0, 0.17)
            horseshoe(kit, xx, 1.84, 0.17, up=False)
    elif ex == "bank":
        # pilasters and a pediment-like hood over the door
        for sgn in (-1, 1):
            kit.box("shell", 0.3, DOOR_H + 0.6, 0.16, [0xddd4c0], a + sgn * 1.45, (DOOR_H + 0.6) / 2, 0.08)
        kit.box("shell", 3.3, 0.24, 0.34, [0xddd4c0], a, DOOR_H + 0.75, 0.12)
        # studded iron bands on the leaves are part of door(); add a brass plate
        kit.box("shell", 0.5, 0.3, 0.03, [0xd4a03a], a - 2.2, 1.6, 0.12)
    elif ex == "store":
        # goods hoist beam under the gable eave, and a hanging basket
        kit.frame = gable_frame(b, 1)
        kit.box("shell", 0.18, 0.18, 1.2, TIMBER_D, 0, b.Y0 + b.RISE * 0.55, 0.6)
        kit.box("shell", 0.04, 0.6, 0.04, [0xc2a36b], 0, b.Y0 + b.RISE * 0.55 - 0.3, 1.1)
        kit.cyl("shell", 0.1, 0.14, 6, TIMBER_M, 0, b.Y0 + b.RISE * 0.55 - 0.62, 1.1)
    elif ex == "inn":
        kit.frame = b.frame(side)
        ivy(kit, -L / 2 + 0.6, 0.3, b.H - 0.6, 1.0)
    elif ex == "still":
        # copper flue running down the side wall into the lean of the roof
        kit.frame = b.frame("right")
        for k in range(6):
            kit.cyl("shell", 0.09, 0.62, 8, [0xb87333, 0xa86528, 0xc98443], 1.6, 0.6 + k * 0.6, 0.25)
        for k in range(3):
            kit.box("shell", 0.06, 0.06, 0.3, IRON, 1.6, 0.9 + k * 1.1, 0.12)
        kit.cyl("shell", 0.12, 0.12, 8, [0xb87333], 1.6, b.H + 0.05, 0.25)
    elif ex == "trainer":
        # crossed practice swords over the door
        for sgn in (-1, 1):
            kit.box("shell", 0.06, 1.3, 0.03, [0xc5d0dc, 0xaab5c1], a, DOOR_H + 0.55, 0.2, rz=sgn * 0.7)
            kit.box("shell", 0.28, 0.06, 0.05, TIMBER_D, a + sgn * 0.33, DOOR_H + 0.22, 0.2, rz=sgn * 0.7)
        kit.cyl("shell", 0.38, 0.06, 10, [0x8a2e2a], a, DOOR_H + 0.55, 0.16, rx=math.pi / 2)
    elif ex == "cottage":
        kit.frame = b.frame("back")
        ivy(kit, kit.r.uniform(-1.5, 1.5), 0.3, b.H * 0.8, 1.2)

def soot(b):
    chims = [Vector((c["x"], b.Y0 + b.RISE + 1.0, c["z"])) for c in b.d["chimneys"]]
    doors = []
    for dd in b.d["doors"]:
        side = dd["side"]
        L = {"front": (dd["at"], b.D / 2), "back": (dd["at"], -b.D / 2), "left": (-b.W / 2, dd["at"]), "right": (b.W / 2, dd["at"])}[side]
        doors.append(Vector((L[0], F + DOOR_H + 0.5, L[1])))
    forge = b.id == "smith"

    def post(c, p, role):
        if role != "shell":
            return c
        k = 1.0
        for ch in chims:
            d = (Vector(p) - ch).length
            k *= 1 - (0.5 if forge else 0.3) * max(0.0, 1 - d / 2.4)
        if forge:
            for dv in doors:
                d2 = (Vector(p) - dv).length
                k *= 1 - 0.28 * max(0.0, 1 - d2 / 1.6)
        if p[1] < 0.9 and (abs(p[2]) > b.D / 2 - 0.4 or abs(p[0]) > b.W / 2 - 0.4):
            k *= 0.86 + 0.14 * max(0.0, p[1]) / 0.9
        return [c[0] * k, c[1] * k, c[2] * k]
    return post

def generate(d):
    b = B(d)
    kit = Kit(hash(d["id"]) & 0xffffffff)
    kit.r = random.Random(sum(ord(ch) * (i + 1) for i, ch in enumerate(d["id"])))
    kit.post = soot(b)
    b.courses = courses_for(kit, b, 0.3, 0.3, 0.42) if b.style["walls"] != "ashlar" else [
        (0.45 + i * 0.4, min(0.4, b.H - (0.45 + i * 0.4))) for i in range(int((b.H - 0.45) / 0.4 + 0.999))]
    wall_cores(kit, b)
    build_walls(kit, b)
    build_upper(kit, b)
    build_gables(kit, b)
    build_roof(kit, b)
    build_chimneys(kit, b)
    build_extras(kit, b)
    kit.post = None
    build_caps(kit, b)
    furnish_building(kit, b)
    if "yard" in kit.roles:
        merge_role(kit, "yard", "interior")
    return kit

CAP_FACE = {"rubble": RUBBLE, "ashlar": ASHLAR, "timber": TIMBER_D, "hall": BOARD, "stoneboard": TAR}

def build_caps(kit, b):
    """The cut line seen from indoors: a section through each wall in its own materials
    (role cap: ground floor at F + CUTAWAY_H; cap1: upstairs). Sized like the code caps."""
    cut = PLAN["CUTAWAY_H"]
    face = CAP_FACE[b.style["walls"]]
    core = b.style.get("plaster", PLASTER) if b.style["walls"] == "timber" else [MORTAR]
    kit.frame = Matrix.Identity(4)
    y = F + cut + 0.02
    for w in b.d["walls"]:
        kit.box("cap", w["hx"] * 2 + 0.3, 0.05, w["hz"] * 2 + 0.3, face, w["x"], y, w["z"])
        kit.box("cap", max(0.05, w["hx"] * 2 - 0.12), 0.052, max(0.05, w["hz"] * 2 - 0.12), core, w["x"], y + 0.002, w["z"])
    if b.U and b.d["stairs"]:
        uw, ud = b.W + 2 * b.J, b.D + 2 * b.J
        y1 = b.TOP + cut + 0.02
        for (x, z, sx, sz) in ((0, ud / 2 - T / 2, uw + 0.3, T + 0.3), (0, -ud / 2 + T / 2, uw + 0.3, T + 0.3),
                               (-uw / 2 + T / 2, 0, T + 0.3, ud), (uw / 2 - T / 2, 0, T + 0.3, ud)):
            kit.box("cap1", sx, 0.05, sz, face, x, y1, z)
            kit.box("cap1", sx - 0.42 if sx > sz else sx - 0.42, 0.052, sz - 0.42 if sz > sx else sz - 0.42, core, x, y1 + 0.002, z)

def merge_role(kit, src, dst):
    a = kit.roles.pop(src)
    R = kit.role(dst)
    base = len(R["v"])
    R["v"].extend(a["v"])
    R["f"].extend(tuple(base + i for i in f) for f in a["f"])
    R["c"].extend(a["c"])

def generate_town():
    kit = Kit(0)
    kit.r = random.Random(0x70e1)
    furnish_town(kit)
    return kit

# ---------------------------------------------------------------- blender

def to_object(name, role, coll):
    v = [Vector((p[0], -p[2], p[1])) for p in role["v"]]
    me = bpy.data.meshes.new(name)
    me.from_pydata(v, [], role["f"])
    me.update()
    attr = me.color_attributes.new("base", 'FLOAT_COLOR', 'CORNER')
    flat = []
    for poly in me.polygons:
        c = role["c"][poly.index]
        for _ in poly.loop_indices:
            flat += (c[0], c[1], c[2], 1.0)
    attr.data.foreach_set("color", flat)
    me.color_attributes.active_color = attr
    stale = bpy.data.objects.get(name)
    if stale is not None:
        bpy.data.objects.remove(stale, do_unlink=True)
    ob = bpy.data.objects.new(name, me)
    assert ob.name == name, "object name taken: " + name
    coll.objects.link(ob)
    return ob

def scene_for(bid):
    name = "gm_" + bid
    scn = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    for ob in list(scn.collection.all_objects):
        me = ob.data if ob.type == 'MESH' else None
        bpy.data.objects.remove(ob, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)
    return scn

def bake_planes(b):
    if b is None:
        return [(160, 0.0, (1, 1))]
    planes = [(60, 0.0, (1, 1))]
    return planes

def bake_ao(scn, ob, b, strength=0.55, gamma=0.7, distance=0.9, samples=256):
    bpy.context.window.scene = scn
    occ = []
    planes = bake_planes(b)
    for size, z, sc in planes:
        me = bpy.data.meshes.new("gm_tmp")
        hx, hy = size * sc[0] / 2, size * sc[1] / 2
        me.from_pydata([(-hx, -hy, z), (hx, -hy, z), (hx, hy, z), (-hx, hy, z)], [], [(0, 1, 2, 3)])
        o = bpy.data.objects.new("gm_tmp", me)
        scn.collection.objects.link(o)
        occ.append(o)
    me = ob.data
    if "ao" in me.color_attributes:
        me.color_attributes.remove(me.color_attributes["ao"])
    me.color_attributes.new("ao", 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = me.color_attributes["ao"]
    if not me.materials:
        mat = bpy.data.materials.get("gm_vc") or bpy.data.materials.new("gm_vc")
        me.materials.append(mat)
    try:
        scn.render.engine = 'CYCLES'
    except TypeError:
        pass
    scn.cycles.samples = samples
    if scn.world is None:
        scn.world = bpy.data.worlds.get("gm_world") or bpy.data.worlds.new("gm_world")
    scn.world.light_settings.distance = distance
    for o in scn.collection.all_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for o in occ:
        m = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.meshes.remove(m)
    base = me.color_attributes["base"].data
    ao = me.color_attributes["ao"].data
    n = len(base)
    bc = [0.0] * (n * 4); base.foreach_get("color", bc)
    ac = [0.0] * (n * 4); ao.foreach_get("color", ac)
    out = [0.0] * (n * 4)
    lo = 1 - strength
    for i in range(n):
        k = lo + strength * (max(0.0, ac[i * 4]) ** gamma)
        out[i * 4] = bc[i * 4] * k; out[i * 4 + 1] = bc[i * 4 + 1] * k; out[i * 4 + 2] = bc[i * 4 + 2] * k; out[i * 4 + 3] = 1.0
    if "Col" in me.color_attributes:
        me.color_attributes.remove(me.color_attributes["Col"])
    col = me.color_attributes.new("Col", 'FLOAT_COLOR', 'CORNER')
    col.data.foreach_set("color", out)
    me.color_attributes.active_color = col

def _gltf(**kw):
    bpy.ops.export_scene.gltf(**kw)

def write_glb(scn, objs, bid):
    bpy.context.window.scene = scn
    path = os.path.join(REPO, "assets", "models", bid + ".glb")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in scn.collection.all_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    import contextlib, io
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        _gltf(filepath=path, export_format='GLB', use_selection=True, use_active_scene=True, export_yup=True,
              export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_materials='PLACEHOLDER',
              export_normals=False, export_texcoords=False, export_apply=False,
              export_meshopt_compression_enable=True)
    return path, os.path.getsize(path)

def build(ids=None, export=True, bake=True):
    export_glb = export
    report = []
    keep = bpy.context.window.scene
    for d in PLAN["buildings"]:
        if ids and d["id"] not in ids:
            continue
        t0 = time.time()
        kit = generate(d)
        b = B(d)
        line = make_model(d["id"], kit, b, bake, export_glb)
        line["s"] = round(time.time() - t0, 1)
        report.append(line)
    if not ids or "town" in ids:
        t0 = time.time()
        line = make_model("town", generate_town(), None, bake, export_glb)
        line["s"] = round(time.time() - t0, 1)
        report.append(line)
    return report

ROLE_OBJECTS = ["shell", "glass", "lamp", "interior", "glowFire", "glowPotion", "glowLamp",
                "tier1", "tier2", "tier3", "ground", "props", "hearth", "gate", "gateGlow", "cap", "cap1"]
BAKED = {"shell", "interior", "tier1", "tier2", "tier3", "ground", "props", "hearth", "gate"}

def make_model(bid, kit, b, bake, export_glb):
    scn = scene_for(bid)
    objs = []
    for role in ROLE_OBJECTS:
        if role in kit.roles and kit.roles[role]["f"]:
            objs.append(to_object(bid + "_" + role, kit.roles[role], scn.collection))
    for role in kit.roles:
        if role not in ROLE_OBJECTS:
            print("unexported role", bid, role)
    for o in objs:
        role = o.name[len(bid) + 1:]
        if bake and role in BAKED:
            bake_ao(scn, o, b)
        else:
            o.data.color_attributes.active_color = o.data.color_attributes["base"]
    line = {"id": bid, "faces": sum(len(o.data.polygons) for o in objs)}
    if export_glb:
        p, size = write_glb(scn, objs, bid)
        line["kb"] = round(size / 1024)
    bpy.context.window.scene = scn
    return line

def show(bid, view="front", dist=None):
    """Point the 3D viewport at a building's scene with vertex colours."""
    scn = bpy.data.scenes["gm_" + bid]
    bpy.context.window.scene = scn
    d = next(x for x in PLAN["buildings"] if x["id"] == bid)
    yaw = {"front": -25, "back": 155, "left": -115, "right": 65, "top": -25}[view]
    pitch = 50 if view == "top" else 72
    from mathutils import Euler
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            sp = area.spaces.active
            sp.shading.type = 'SOLID'
            sp.shading.color_type = 'VERTEX'
            sp.shading.light = 'STUDIO'
            sp.overlay.show_overlays = False
            r3 = sp.region_3d
            r3.view_perspective = 'PERSP'
            r3.view_location = Vector((0, 0, d["wallH"] * 0.8 + d["upper"]))
            r3.view_distance = dist or max(d["w"], d["d"]) * 2.0
            r3.view_rotation = Euler((math.radians(pitch), 0, math.radians(yaw)), 'XYZ').to_quaternion()

exec(compile(open(os.path.join(HERE, "furnish.py")).read(), os.path.join(HERE, "furnish.py"), "exec"), globals())
exec(compile(open(os.path.join(HERE, "villagers.py")).read(), os.path.join(HERE, "villagers.py"), "exec"), globals())
exec(compile(open(os.path.join(HERE, "animals.py")).read(), os.path.join(HERE, "animals.py"), "exec"), globals())
exec(compile(open(os.path.join(HERE, "nature.py")).read(), os.path.join(HERE, "nature.py"), "exec"), globals())
exec(compile(open(os.path.join(HERE, "hero.py")).read(), os.path.join(HERE, "hero.py"), "exec"), globals())
