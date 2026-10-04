# Underwood foes for view/foes.js, exec'd into greenmere.py's namespace (after dungeon.py).
#
#   g["build_foes"]()              -> assets/models/foes-<key>.glb for every biome
#   g["build_foes"](["crypt"])     one biome
#   g["preview_foes"]("crypt")     build without baking or exporting, lined up to look at
#   g["look_foes"]("crypt")        frame them in the viewport
#
# One file per biome, objects "fo_<key>_<archetype>_<part>", each with its origin on the
# part's pivot (the joint it swings about) and its mesh relative to that pivot.
# "<part>Glow" objects ride the same pivot and render self-lit (eyes, embers, sacs).
# Game space: metres, y up, the face looks down local -z, feet on y = 0.
#
# Parts the game animates (view/foes.js holds the motion rules):
#   body head jaw tail sac cloak     legFL legFR legBL legBR (four-legged)
#   armL armR legL legR (two-legged; armR holds the weapon)
# Archetypes: skirmisher (hound), brute (hulk), spitter (toad with a throat sac),
# shade (hooded biped), boss (one per biome, see FO_BOSS).

FO_ORDER = ["cave", "temple", "root", "crypt", "forge"]

# hide/skin/muzzle/sac mirror theme.foe in src/view/lights.js; the rest is dressing.
FO_PAL = {
    "cave": dict(hide=[0x4c545e, 0x5e6771, 0x3e4650], skin=[0x3c6e2e, 0x4f8c38, 0x2c6b2a], belly=[0x6e7882, 0x737c84],
                 muzzle=[0xc8f08a, 0x8fb84a], sac=[0x7fe0c8, 0x9ff0d8], crest=[0x2c6b2a, 0x4f8c38], eye=0x9ff0d8,
                 trim=[0x6e7882, 0x8d93a0], cloth=[0x2c6b2a, 0x3c6e2e], dress="moss"),
    "temple": dict(hide=[0xa88a58, 0xb89a64, 0x8f7448], skin=[0x6b4428, 0x8d5b34, 0x5a3a24], belly=[0xc9a96e, 0xd3b47c],
                   muzzle=[0xe2ba60, 0xd4a03a], sac=[0xffc860, 0xe2ba60], crest=[0xe2ba60, 0xd4a03a], eye=0xffc860,
                   trim=[0xe2ba60, 0xd4a03a], cloth=[0x8e2e28, 0x2e5a6e], dress="gold"),
    "root": dict(hide=[0x3a2416, 0x5a3a24, 0x6b4428], skin=[0x8e2e28, 0x6e2e28, 0xa34a3a], belly=[0x6b4428, 0x8d5b34],
                 muzzle=[0xe0a878, 0xd4a03a], sac=[0x8fb84a, 0xc6d46a], crest=[0x5a3a24, 0x6b4428], eye=0xd8f07a,
                 trim=[0x3c6e2e, 0x4f8c38], cloth=[0x3c6e2e, 0x2c6b2a], dress="bark"),
    "crypt": dict(hide=[0xd8c8a0, 0xc4b48a, 0xe7d7b4], skin=[0x6e7882, 0x8d93a0, 0x5e6771], belly=[0xc4b48a, 0xb8a87e],
                  muzzle=[0x9fd0ff, 0xd8ecff], sac=[0x9fd0ff, 0xd8ecff], crest=[0xe7d7b4, 0xd8c8a0], eye=0x9fd0ff,
                  trim=[0x8d93a0, 0x6e7882], cloth=[0x4a3a6e, 0x2e3a5a], dress="bone"),
    "forge": dict(hide=[0x241c18, 0x2f363e, 0x3a2416], skin=[0x4a3024, 0x6b3a24, 0x3a2416], belly=[0x3e4650, 0x4c545e],
                  muzzle=[0xff8a2a, 0xffb84a], sac=[0xff8a2a, 0xffb84a], crest=[0xff8a2a, 0xd4602a], eye=0xffa040,
                  trim=[0xd4a03a, 0x8a5a2a], cloth=[0x8e2e28, 0x5a2420], dress="iron"),
}
FO_BOSS = {"cave": "colossus", "temple": "idol", "root": "king", "crypt": "warden", "forge": "custodian"}
FO_TEETH = [0xefe6d4, 0xe7d7b4]
FO_DARK = [0x241c18, 0x1c1612]


class Foe:
    """Collects one creature's parts: roles "<arch>_<part>" plus pivots, all in game space."""

    def __init__(self, kit, key, arch, s=1.0):
        self.kit, self.key, self.arch, self.s = kit, key, arch, s
        self.P = FO_PAL[key]
        self.pivots = {}
        kit.frame = Matrix.Scale(s, 4)

    def part(self, name, pivot):
        self.pivots[name] = Vector(pivot) * self.s
        return "%s_%s" % (self.arch, name)

    def glow(self, role):
        return role + "Glow"


def fo_hide(kit, pal, belly=None, back=None, thresh=0.55):
    def fn(n, p):
        if belly and n.y < -0.35:
            return kit.pick(belly)
        if back and n.y > thresh and kit.r.random() < 0.8:
            return kit.pick(back)
        return kit.pick(pal)
    return fn


def fo_blob(kit, role, r, pal, x, y, z, sx=1, sy=1, sz=1, belly=None, back=None, noise=0.16, seed=0, subdiv=1, thresh=0.55):
    blob(kit, role, r, fo_hide(kit, pal, belly, back, thresh), x, y, z, sx, sy, sz, noise=noise, subdiv=subdiv, seed=seed)


def fo_eyes(kit, role, P, x, y, z, r=0.04):
    for s in (-1, 1):
        kit.ball(role + "Glow", r, [P["eye"]], s * x, y, z, 1.0, 0.8, 0.7)


def fo_leg(kit, role, top, foot, r0, r1, pal, knee=(0, 0, 0), paw=None, claws=True):
    top, foot = Vector(top), Vector(foot)
    mid = (top + foot) / 2 + Vector(knee)
    kit.ball(role, r0 * 1.15, pal, top.x, top.y, top.z)
    dk_tube(kit, role, [top, mid, foot + Vector((0, r1, 0))], [r0, (r0 + r1) * 0.5, r1], 6, pal)
    w = paw or r1 * 2.6
    kit.box(role, w, r1 * 1.1, w * 1.25, pal, foot.x, r1 * 0.55, foot.z - w * 0.15)
    if claws:
        for k in (-1, 0, 1):
            kit.cone(role, r1 * 0.32, r1 * 0.9, 4, FO_TEETH, foot.x + k * w * 0.3, r1 * 0.25, foot.z - w * 0.8, rx=-math.pi / 2)


def fo_teeth(kit, role, x0, x1, y, z, n, h, down=True):
    for i in range(n):
        x = x0 + (x1 - x0) * (i + 0.5) / n
        kit.cone(role, h * 0.35, h, 4, FO_TEETH, x, y - (h / 2 if down else -h / 2), z, rx=math.pi if down else 0)


def fo_tube_branch(kit, role, base, pts, r0, pal):
    pts = [Vector(base)] + [Vector(p) for p in pts]
    radii = [r0 * (1 - 0.85 * i / (len(pts) - 1)) for i in range(len(pts))]
    radii[-1] = 0.004
    dk_tube(kit, role, pts, radii, 5, pal)

# ---------------------------------------------------------------- biome dressing

def fo_crest(f, role, x, y, z, size, along=0.0):
    """Biome crest at a head or spine anchor: tufts, horns, antlers, spines, embers."""
    kit, P, d = f.kit, f.P, f.P["dress"]
    if d == "moss":
        for i in range(4):
            fo_blob(kit, role, size * 0.16, P["crest"], x + (i - 1.5) * size * 0.1, y + size * 0.05, z + (i % 2) * size * 0.08, 1.2, 0.7, 1.0, noise=0.3, seed=i + 40)
    elif d == "gold":
        for s in (-1, 1):
            fo_tube_branch(kit, role, (x + s * size * 0.12, y, z), [(x + s * size * 0.3, y + size * 0.18, z + size * 0.1),
                                                                   (x + s * size * 0.36, y + size * 0.42, z + size * 0.02)], size * 0.06, P["crest"])
    elif d == "bark":
        for s in (-1, 1):
            b = Vector((x + s * size * 0.1, y, z))
            tip = [(b.x + s * size * 0.22, b.y + size * 0.3, b.z + size * 0.05), (b.x + s * size * 0.36, b.y + size * 0.62, b.z + size * 0.12)]
            fo_tube_branch(kit, role, b, tip, size * 0.05, P["crest"])
            for k, (ax, ay) in enumerate(((0.2, 0.32), (0.3, 0.5))):
                o = Vector((b.x + s * size * ax, b.y + size * ay, b.z + size * 0.06))
                fo_tube_branch(kit, role, o, [(o.x + s * size * 0.06, o.y + size * 0.16, o.z - size * 0.1)], size * 0.03, P["crest"])
    elif d == "bone":
        for i in range(4):
            kit.cone(role, size * 0.05, size * 0.28, 4, P["crest"], x, y + size * 0.1, z + (i - 1.5) * size * 0.12 + along, rx=0.4)
    elif d == "iron":
        for i in range(3):
            kit.box(role + "Glow", size * 0.1, size * 0.16, size * 0.08, [P["sac"][0]], x + (i - 1) * size * 0.1, y + size * 0.08, z + (i - 1) * size * 0.05, ry=0.6)


def fo_back(f, role, x, y, z, length, width, n=4):
    """Spine dressing along the back from z to z + length."""
    kit, P, d = f.kit, f.P, f.P["dress"]
    for i in range(n):
        t = (i + 0.5) / n
        zz = z + length * t
        if d == "moss":
            fo_blob(kit, role, width * 0.28, P["skin"], kit.r.uniform(-0.3, 0.3) * width, y, zz, 1.2, 0.5, 1.0, noise=0.35, seed=60 + i)
            if i % 2 == 0:
                dk_spike(kit, role + "Glow", (kit.r.uniform(-0.2, 0.2) * width, y + width * 0.05, zz), width * 0.55, width * 0.08, 0.25, kit.r.uniform(0, 6.28), [P["sac"][0]])
        elif d == "gold":
            kit.box(role, width * 0.9, width * 0.12, length / n * 0.6, P["trim"], 0, y, zz)
        elif d == "bark":
            kit.box(role, width * 0.3, width * 0.22, length / n * 0.8, P["hide"], kit.r.uniform(-0.15, 0.15) * width, y + width * 0.05, zz, rx=0.2)
            if i % 2:
                fo_blob(kit, role, width * 0.2, P["trim"], kit.r.uniform(-0.3, 0.3) * width, y + width * 0.08, zz, 1.2, 0.5, 1.0, noise=0.35, seed=70 + i)
        elif d == "bone":
            kit.cone(role, width * 0.09, width * 0.5, 4, P["crest"], 0, y + width * 0.2, zz, rx=0.45)
            for s in (-1, 1):
                kit.box(role, width * 0.5, width * 0.06, width * 0.08, P["hide"], s * width * 0.32, y - width * 0.12, zz, rz=s * 0.7)
        elif d == "iron":
            kit.box(role, width * 0.95, width * 0.08, length / n * 0.85, P["belly"], 0, y, zz, rx=0.08)
            kit.box(role + "Glow", width * 0.5, width * 0.04, length / n * 0.12, [P["sac"][0]], 0, y + 0.02, zz + length / n * 0.45)


def fo_weapon(f, role, hand, size):
    """What armR holds, pointing down local -y from the hand (hangs when the arm hangs)."""
    kit, P, d = f.kit, f.P, f.P["dress"]
    h = Vector(hand)
    if d == "moss":
        kit.cylr(role, 0.035 * size, 0.045 * size, 0.7 * size, 6, FO_DARK + [0x4a3426], h.x, h.y - 0.25 * size, h.z)
        dk_spike(kit, role + "Glow", (h.x, h.y - 0.55 * size, h.z), 0.45 * size, 0.08 * size, math.pi, 0, [P["sac"][0]])
    elif d == "gold":
        kit.cylr(role, 0.03 * size, 0.03 * size, 1.4 * size, 6, P["trim"], h.x, h.y - 0.1 * size, h.z)
        kit.box(role, 0.04 * size, 0.42 * size, 0.24 * size, [0xc8c0b0, 0xb8b0a0], h.x, h.y - 0.92 * size, h.z - 0.1 * size, rx=0.2)
    elif d == "bark":
        dk_tube(kit, role, [(h.x, h.y + 0.25 * size, h.z), (h.x + 0.04, h.y - 0.4 * size, h.z), (h.x, h.y - 0.95 * size, h.z - 0.05)],
                [0.04 * size, 0.035 * size, 0.03 * size], 5, P["hide"])
        kit.ball(role + "Glow", 0.09 * size, [P["eye"]], h.x, h.y + 0.3 * size, h.z)
    elif d == "bone":
        kit.box(role, 0.06 * size, 0.14 * size, 0.26 * size, P["trim"], h.x, h.y - 0.05 * size, h.z)
        kit.box(role, 0.05 * size, 0.85 * size, 0.12 * size, [0x8d93a0, 0x6e7882], h.x, h.y - 0.55 * size, h.z)
        kit.cone(role, 0.07 * size, 0.14 * size, 4, [0x8d93a0], h.x, h.y - 1.04 * size, h.z, rx=math.pi)
    elif d == "iron":
        kit.cylr(role, 0.03 * size, 0.03 * size, 0.85 * size, 6, FO_DARK, h.x, h.y - 0.25 * size, h.z)
        kit.box(role, 0.22 * size, 0.2 * size, 0.34 * size, P["belly"], h.x, h.y - 0.7 * size, h.z)
        kit.box(role + "Glow", 0.23 * size, 0.04 * size, 0.35 * size, [P["sac"][0]], h.x, h.y - 0.7 * size, h.z)

# ---------------------------------------------------------------- anatomies

def fo_hound(f):
    """Skirmisher: a lean, fast four-legged biter about 1 m long."""
    kit, P = f.kit, f.P
    body = f.part("body", (0, 0.5, 0.05))
    fo_blob(kit, body, 0.3, P["hide"], 0, 0.5, 0.05, 0.85, 0.72, 1.45, belly=P["belly"], noise=0.12, seed=1)
    fo_blob(kit, body, 0.22, P["hide"], 0, 0.56, -0.26, 1.0, 0.95, 0.9, belly=P["belly"], noise=0.12, seed=2)
    fo_back(f, body, 0, 0.7, -0.25, 0.6, 0.3, n=4)
    head = f.part("head", (0, 0.6, -0.4))
    fo_blob(kit, head, 0.17, P["skin"], 0, 0.66, -0.52, 1.0, 0.9, 1.1, noise=0.1, seed=3)
    fo_blob(kit, head, 0.1, P["skin"], 0, 0.645, -0.7, 0.85, 0.6, 1.2, noise=0.06, seed=4)
    for s in (-1, 1):
        kit.box(head, 0.025, 0.025, 0.03, FO_DARK, s * 0.025, 0.675, -0.81)
    fo_eyes(kit, head, P, 0.085, 0.73, -0.62, 0.03)
    fo_crest(f, head, 0, 0.78, -0.46, 0.55)
    for s in (-1, 1):
        kit.cone(head, 0.05, 0.12, 4, P["skin"], s * 0.12, 0.8, -0.44, rz=-s * 0.4)
    jaw = f.part("jaw", (0, 0.6, -0.56))
    kit.box(jaw, 0.13, 0.05, 0.22, P["skin"], 0, 0.585, -0.68)
    fo_teeth(kit, jaw, -0.05, 0.05, 0.61, -0.77, 3, 0.04, down=False)
    fo_teeth(kit, head, -0.06, 0.06, 0.6, -0.78, 3, 0.05)
    for name, x, z, kz in (("legFL", -0.15, -0.28, 0.06), ("legFR", 0.15, -0.28, 0.06), ("legBL", -0.15, 0.36, -0.08), ("legBR", 0.15, 0.36, -0.08)):
        role = f.part(name, (x, 0.45, z))
        fo_leg(kit, role, (x, 0.45, z), (x * 1.15, 0.0, z), 0.07, 0.04, P["hide"], knee=(0, 0, kz))
    tail = f.part("tail", (0, 0.55, 0.42))
    dk_tube(kit, tail, [(0, 0.55, 0.4), (0, 0.5, 0.62), (0, 0.42, 0.85), (0, 0.38, 1.02)], [0.07, 0.05, 0.03, 0.005], 5, P["hide"])


def fo_brute(f):
    """Brute: a hunched, heavy-shouldered hulk; head low in front, thick forelegs."""
    kit, P = f.kit, f.P
    body = f.part("body", (0, 0.85, 0.05))
    fo_blob(kit, body, 0.5, P["hide"], 0, 0.85, 0.15, 1.0, 0.85, 1.15, belly=P["belly"], noise=0.12, seed=11)
    fo_blob(kit, body, 0.48, P["hide"], 0, 1.08, -0.3, 1.15, 0.85, 0.95, belly=P["belly"], noise=0.12, seed=12)
    fo_back(f, body, 0, 1.45, -0.55, 1.0, 0.55, n=4)
    head = f.part("head", (0, 1.0, -0.65))
    fo_blob(kit, head, 0.26, P["skin"], 0, 1.0, -0.85, 1.15, 0.85, 1.0, noise=0.1, seed=13)
    fo_blob(kit, head, 0.17, P["skin"], 0, 0.98, -1.06, 1.05, 0.6, 0.85, noise=0.06, seed=14)
    for s in (-1, 1):
        kit.box(head, 0.04, 0.035, 0.04, FO_DARK, s * 0.045, 1.03, -1.2)
    fo_eyes(kit, head, P, 0.13, 1.1, -1.0, 0.04)
    kit.box(head, 0.36, 0.06, 0.1, P["skin"], 0, 1.16, -0.98)  # brow
    fo_crest(f, head, 0, 1.18, -0.78, 0.9)
    for s in (-1, 1):
        kit.cone(head, 0.05, 0.22, 5, FO_TEETH, s * 0.13, 1.0, -1.18, rx=-0.9, rz=-s * 0.3)  # tusks
    jaw = f.part("jaw", (0, 0.92, -0.88))
    kit.box(jaw, 0.3, 0.09, 0.28, P["skin"], 0, 0.87, -1.02)
    fo_teeth(kit, jaw, -0.1, 0.1, 0.92, -1.12, 4, 0.05, down=False)
    for name, x, z, top, r0, r1 in (("legFL", -0.36, -0.42, 1.05, 0.2, 0.13), ("legFR", 0.36, -0.42, 1.05, 0.2, 0.13),
                                    ("legBL", -0.32, 0.48, 0.8, 0.18, 0.11), ("legBR", 0.32, 0.48, 0.8, 0.18, 0.11)):
        role = f.part(name, (x, top, z))
        fo_leg(kit, role, (x, top, z), (x * 1.1, 0.0, z - 0.05), r0, r1, P["hide"], knee=(x * 0.15, 0, 0.1 if z < 0 else -0.12))
    tail = f.part("tail", (0, 0.9, 0.6))
    dk_tube(kit, tail, [(0, 0.9, 0.58), (0, 0.8, 0.8), (0, 0.65, 0.95)], [0.1, 0.06, 0.01], 5, P["hide"])


def fo_spitter(f):
    """Spitter: a squat, wide toad; the glowing throat sac swells as it winds up."""
    kit, P = f.kit, f.P
    body = f.part("body", (0, 0.4, 0.05))
    fo_blob(kit, body, 0.36, P["skin"], 0, 0.42, 0.08, 1.15, 0.75, 1.15, belly=P["belly"], noise=0.14, seed=21)
    fo_back(f, body, 0, 0.66, -0.1, 0.45, 0.35, n=3)
    for i in range(5):
        a = i * 1.3
        kit.ball(body, 0.05, P["hide"], math.cos(a) * 0.22, 0.62, 0.12 + math.sin(a) * 0.2)  # warts
    head = f.part("head", (0, 0.48, -0.3))
    fo_blob(kit, head, 0.24, P["skin"], 0, 0.52, -0.44, 1.25, 0.7, 0.95, noise=0.1, seed=22)
    fo_eyes(kit, head, P, 0.15, 0.66, -0.5, 0.05)
    for s in (-1, 1):
        kit.ball(head, 0.07, P["hide"], s * 0.15, 0.64, -0.46)
    kit.box(head, 0.3, 0.04, 0.04, FO_DARK, 0, 0.47, -0.64)
    fo_crest(f, head, 0, 0.66, -0.36, 0.5)
    sac = f.part("sac", (0, 0.4, -0.44))
    blob(kit, sac + "Glow", 0.17, lambda n, p: kit.pick(P["sac"]), 0, 0.36, -0.52, 1.15, 0.9, 0.9, noise=0.08, seed=23)
    for name, x, z, top in (("legFL", -0.24, -0.25, 0.35), ("legFR", 0.24, -0.25, 0.35), ("legBL", -0.32, 0.3, 0.35), ("legBR", 0.32, 0.3, 0.35)):
        role = f.part(name, (x, top, z))
        fo_leg(kit, role, (x, top, z), (x * 1.5, 0.0, z + (0.12 if z > 0 else -0.06)), 0.08, 0.04, P["skin"], knee=(x * 0.6, 0.12, 0), claws=False)


def fo_biped(f, heavy=1.0, hood=True):
    """Shade, and the two-legged bosses: hooded or helmed, a weapon in the right hand."""
    kit, P, d = f.kit, f.P, f.P["dress"]
    w = heavy
    body = f.part("body", (0, 0.78, 0))
    fo_blob(kit, body, 0.26, P["hide"], 0, 0.86, 0, 1.0 * w, 0.75, 0.7, noise=0.08, seed=31)
    fo_blob(kit, body, 0.3, P["hide"], 0, 1.12, 0, 1.15 * w, 0.75, 0.75, noise=0.08, seed=32)
    kit.box(body, 0.56 * w, 0.08, 0.36, P["trim"], 0, 0.82, 0)  # belt
    kit.box(body, 0.1, 0.1, 0.04, P["trim"], 0, 0.82, -0.19)
    if d == "iron":
        kit.box(body + "Glow", 0.2 * w, 0.18, 0.04, [P["sac"][0]], 0, 1.1, -0.24)
        kit.box(body, 0.28 * w, 0.26, 0.05, P["belly"], 0, 1.1, -0.22, skip=("-z",))
        kit.box(body + "Glow", 0.2 * w, 0.03, 0.06, [P["sac"][0]], 0, 1.07, -0.25)
    elif d == "bone":
        for i in range(3):
            kit.box(body, 0.34 * w, 0.03, 0.05, P["crest"], 0, 0.98 + i * 0.08, -0.21)
    elif d == "gold":
        kit.box(body, 0.42 * w, 0.06, 0.04, P["trim"], 0, 1.24, -0.22)
        kit.cone(body, 0.06, 0.12, 4, P["trim"], 0, 1.17, -0.23, rx=math.pi)
    for s in (-1, 1):  # pauldrons
        fo_blob(kit, body, 0.12, P["trim"] if d in ("gold", "iron", "bone") else P["hide"], s * 0.3 * w, 1.3, 0, 1.2, 0.7, 1.0, noise=0.1, seed=33 + s)
    cloak = f.part("cloak", (0, 1.32, 0.12))
    kit.box(cloak, 0.6 * w, 0.95, 0.04, P["cloth"], 0, 0.86, 0.24, rx=-0.1)
    for i in range(4):
        kit.cone(cloak, 0.08 * w, 0.14, 3, P["cloth"], (i - 1.5) * 0.15 * w, 0.32, 0.29, rx=math.pi)
    head = f.part("head", (0, 1.36, 0))
    if hood:
        fo_blob(kit, head, 0.2, P["cloth"], 0, 1.52, 0.02, 1.0, 1.15, 1.05, noise=0.06, seed=35)
        kit.box(head, 0.24, 0.22, 0.04, FO_DARK, 0, 1.5, -0.18)
        kit.cone(head, 0.12, 0.2, 5, P["cloth"], 0, 1.74, 0.08, rx=0.5)
    else:
        fo_blob(kit, head, 0.19, P["hide"], 0, 1.52, 0, 1.0, 1.1, 1.0, noise=0.05, seed=36)
        kit.box(head, 0.3, 0.06, 0.06, FO_DARK, 0, 1.53, -0.17)  # visor slit
        fo_crest(f, head, 0, 1.68, 0.0, 0.6)
    fo_eyes(kit, head, P, 0.06, 1.53, -0.19, 0.03)
    for name, s in (("armL", -1), ("armR", 1)):
        x = s * 0.34 * w
        role = f.part(name, (x, 1.26, 0))
        kit.ball(role, 0.08 * w, P["hide"], x, 1.26, 0)
        dk_tube(kit, role, [(x, 1.26, 0), (x + s * 0.04, 1.0, 0.03), (x + s * 0.05, 0.74, -0.02)], [0.07 * w, 0.06 * w, 0.05 * w], 6, P["hide"])
        kit.ball(role, 0.07 * w, P["skin"], x + s * 0.05, 0.7, -0.03)
        if s > 0:
            fo_weapon(f, role, (x + s * 0.05, 0.7, -0.05), 1.0)
    for name, s in (("legL", -1), ("legR", 1)):
        x = s * 0.13 * w
        role = f.part(name, (x, 0.76, 0))
        dk_tube(kit, role, [(x, 0.78, 0), (x, 0.42, -0.03), (x, 0.08, 0)], [0.09 * w, 0.075 * w, 0.06 * w], 6, P["hide"])
        kit.box(role, 0.15 * w, 0.1, 0.26, FO_DARK if d != "bone" else P["hide"], x, 0.05, -0.05)


def fo_boss(f):
    kind = FO_BOSS[f.key]
    if kind in ("colossus", "king"):
        fo_brute(f)
        kit, P = f.kit, f.P
        body = "%s_body" % f.arch
        head = "%s_head" % f.arch
        if kind == "colossus":
            for i in range(6):
                dk_spike(kit, body + "Glow", (kit.r.uniform(-0.3, 0.3), 1.3, kit.r.uniform(-0.6, 0.3)), kit.r.uniform(0.35, 0.6), 0.07, kit.r.uniform(0.1, 0.6), kit.r.uniform(0, 6.28), [P["sac"][0]])
            for i in range(5):
                fo_blob(kit, body, 0.2, P["skin"], kit.r.uniform(-0.45, 0.45), 1.35, kit.r.uniform(-0.5, 0.5), 1.3, 0.45, 1.2, noise=0.35, seed=80 + i)
        else:
            for s in (-1, 1):  # great antlers
                b = Vector((s * 0.16, 1.2, -0.78))
                fo_tube_branch(kit, head, b, [(b.x + s * 0.3, 1.55, -0.7), (b.x + s * 0.55, 1.95, -0.62), (b.x + s * 0.7, 2.25, -0.5)], 0.06, P["crest"])
                for (ox, oy, oz) in ((0.32, 1.6, -0.7), (0.5, 1.9, -0.63)):
                    o = Vector((s * ox, oy, oz))
                    fo_tube_branch(kit, head, o, [(o.x + s * 0.08, o.y + 0.3, o.z - 0.2)], 0.035, P["crest"])
            for i in range(4):
                dk_tube(kit, body, [(kit.r.uniform(-0.4, 0.4), 1.2, kit.r.uniform(-0.5, 0.4)), (kit.r.uniform(-0.6, 0.6), 0.7, kit.r.uniform(-0.5, 0.5)), (kit.r.uniform(-0.7, 0.7), 0.3, kit.r.uniform(-0.6, 0.6))],
                        [0.06, 0.04, 0.005], 5, P["trim"])
    else:
        fo_biped(f, heavy=1.3, hood=False)
        kit, P = f.kit, f.P
        head = "%s_head" % f.arch
        if kind == "idol":
            kit.box(head, 0.36, 0.42, 0.05, P["trim"], 0, 1.52, -0.2)  # golden mask
            kit.box(head, 0.06, 0.14, 0.04, FO_DARK, 0, 1.44, -0.23)
            for i in range(5):
                kit.box(head, 0.08, 0.35, 0.04, P["trim"] if i % 2 else P["cloth"], (i - 2) * 0.09, 1.82, -0.05, rz=(i - 2) * 0.25)
        elif kind == "warden":
            kit.cone(head, 0.05, 0.3, 4, P["crest"], 0, 1.84, 0.05, rx=-0.3)
        elif kind == "custodian":
            kit.cylr(head, 0.06, 0.07, 0.3, 6, FO_DARK, 0.12, 1.78, 0.1)  # flue
            kit.ball(head + "Glow", 0.05, [P["sac"][1]], 0.12, 1.95, 0.1)

# ---------------------------------------------------------------- build

FO_ARCH = [("skirmisher", fo_hound, 1.0), ("brute", fo_brute, 1.0), ("spitter", fo_spitter, 1.0), ("shade", fo_biped, 0.92), ("boss", fo_boss, 1.5)]


def fo_kit(key):
    kit = Kit(0)
    kit.r = random.Random(0xf0e + FO_ORDER.index(key))
    pivots = {}
    for arch, fn, s in FO_ARCH:
        f = Foe(kit, key, arch, s)
        fn(f)
        for part, pv in f.pivots.items():
            pivots["%s_%s" % (arch, part)] = pv
            pivots["%s_%sGlow" % (arch, part)] = pv
    kit.frame = Matrix.Identity(4)
    return kit, pivots


def build_foes(keys=None, export=True, bake=True, samples=64):
    report = []
    keep = bpy.context.window.scene
    for key in keys or FO_ORDER:
        t0 = time.time()
        kit, pivots = fo_kit(key)
        bid = "foes-" + key
        scn = scene_for(bid)
        objs = []
        for role, R in kit.roles.items():
            if not R["f"]:
                continue
            assert role in pivots, "part without a pivot: " + role
            o = to_object("fo_%s_%s" % (key, role), R, scn.collection)
            pv = pivots[role]
            bl = Vector((pv.x, -pv.z, pv.y))
            o.data.transform(Matrix.Translation(-bl))
            o.location = bl
            objs.append(o)
        bpy.context.view_layer.update()
        if bake:
            for o in objs:
                if o.name.endswith("Glow"):
                    continue
                arch = o.name.split("_")[2]
                for o2 in objs:
                    o2.hide_render = o2.name.split("_")[2] != arch or o2.name.endswith("Glow")
                bake_ao(scn, o, None, strength=0.45, gamma=0.8, distance=0.35, samples=samples)
            for o in objs:
                o.hide_render = False
        for o in objs:
            if not bake or o.name.endswith("Glow"):
                o.data.color_attributes.active_color = o.data.color_attributes["base"]
        line = {"id": bid, "parts": len(objs), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)}
        if export:
            p, size = write_glb(scn, objs, bid)
            line["kb"] = round(size / 1024)
        fo_layout(objs, key)
        line["s"] = round(time.time() - t0, 1)
        report.append(line)
    bpy.context.window.scene = keep
    return report


def fo_layout(objs, key):
    """Line the creatures up along x for a look (export already happened)."""
    order = [a for a, _, _ in FO_ARCH]
    for o in objs:
        i = order.index(o.name.split("_")[2])
        o.location.x += (i - 2) * 2.6


def preview_foes(key="crypt"):
    return build_foes([key], export=False, bake=False)


def look_foes(key, dist=11, pitch=72, yaw=-25):
    bpy.context.window.scene = bpy.data.scenes["gm_foes-" + key]
    for area in bpy.context.window.screen.areas:
        if area.type == 'VIEW_3D':
            sp = area.spaces[0]
            sp.shading.type = 'SOLID'
            sp.shading.color_type = 'VERTEX'
            sp.shading.light = 'STUDIO'
            r3 = sp.region_3d
            r3.view_perspective = 'PERSP'
            r3.view_location = Vector((0, 0, 0.9))
            r3.view_rotation = Matrix.Rotation(math.radians(yaw), 4, 'Z').to_quaternion() @ Matrix.Rotation(math.radians(pitch), 4, 'X').to_quaternion()
            r3.view_distance = dist
