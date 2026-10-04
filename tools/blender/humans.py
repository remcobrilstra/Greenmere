# Skinned humans (docs/characters.md), exec'd into greenmere.py's namespace after hero.py.
#
#   g["hero_candidates"]()          phase 0: every style in HM_STYLES, in the linen base
#                                   and the heirloom outfit, posed rest / walk / strike,
#                                   lined up in scene "hm_candidates" (no export)
#   g["look_candidates"](row)       frame the lineup ("base", "rest", "walk", "strike")
#
# A figure is built in game space (metres, y up, face toward -z) from a joint graph:
# the body and the clothes are continuous shells from Blender's Skin modifier (one
# subdivision, flat shaded), the head is a shaped low-poly sphere with a face, and
# rigid gear rides one bone. Every vertex is weighted by the script (nearest bone
# segment, blended across joints), so the same skeleton drives every human.

from mathutils import Quaternion

HM_BONES = [
    # name, head joint, tail joint, parent
    ("hips", "pelvis", "belly", None),
    ("spine", "belly", "chest", "hips"),
    ("chest", "chest", "neck", "spine"),
    ("neck", "neck", "neckTop", "chest"),
    ("head", "neckTop", "crown", "neck"),
    ("shoulder.L", "clavL", "shL", "chest"), ("upperArm.L", "shL", "elL", "shoulder.L"),
    ("forearm.L", "elL", "wrL", "upperArm.L"), ("hand.L", "wrL", "hdL", "forearm.L"),
    ("shoulder.R", "clavR", "shR", "chest"), ("upperArm.R", "shR", "elR", "shoulder.R"),
    ("forearm.R", "elR", "wrR", "upperArm.R"), ("hand.R", "wrR", "hdR", "forearm.R"),
    ("thigh.L", "hipL", "knL", "hips"), ("shin.L", "knL", "anL", "thigh.L"), ("foot.L", "anL", "toeL", "shin.L"),
    ("thigh.R", "hipR", "knR", "hips"), ("shin.R", "knR", "anR", "thigh.R"), ("foot.R", "anR", "toeR", "shin.R"),
    ("cape.1", "capeTop", "capeMid", "chest"), ("cape.2", "capeMid", "capeLow", "cape.1"),
]

# Styles for phase 0. Lengths in metres; `build` widens limbs and torso; `head` is the
# head height (chin to crown); `facet` 0 keeps the shells at the skin cage, 1 subdivides.
HM_STYLES = {
    "storybook": dict(height=1.98, head=0.36, build=1.0, shoulders=0.21, hands=1.15, feet=1.15, facet=1,
                      jaw=0.78, nose=1.0, eye=0.022, brow=1.0, beard=False, hair="swept", head_sub=0),
    "heroic": dict(height=2.02, head=0.30, build=1.08, shoulders=0.235, hands=1.0, feet=1.0, facet=1,
                   jaw=0.86, nose=1.1, eye=0.018, brow=1.2, beard=True, hair="short", head_sub=0),
    # The pick (2026-10-04): the heroic body with the storybook head, a touch smaller so
    # the taller proportions hold.
    "warden": dict(height=2.02, head=0.34, build=1.15, shoulders=0.25, hands=1.08, feet=1.08, facet=1,
                   jaw=0.78, nose=1.0, eye=0.022, brow=1.0, beard=False, hair="swept", head_sub=0),
    "stout": dict(height=1.92, head=0.44, build=1.25, shoulders=0.215, hands=1.3, feet=1.3, facet=1,
                  jaw=0.72, nose=1.25, eye=0.03, brow=0.9, beard=False, hair="mop", head_sub=0),
}

HM_SKIN = [0xe0a878, 0xdea676]
HM_HAIR = [0x4a3020, 0x4e3322]
HM_LINEN = [0xcfc3a4, 0xc7bb9b, 0xd6caab]
HM_LINEN_D = [0xa89878, 0x9e8e6f]
HM_TROUSERS = [0x3a2a22, 0x43312a, 0x33251e]
HM_WRAPS = [0x6b4a32, 0x5e402b, 0x74513a]
HM_BOOT = [0x3b2a20, 0x33241b, 0x45312a]
HM_EYE = [0x1e1a18]
HM_LIP = [0xc07f62]
# The heirloom look (PREVIEW_OUTFITS in hero.py): royal blue, dark blue, gold, steel.
HM_CLOTH = [0x2d62c8, 0x2a5cbd, 0x3168d0]
HM_CLOTH_D = [0x1c3f8c, 0x1a3a82]
HM_TRIM = [0xd4a03a, 0xc99533, 0xdcaa48]
HM_STEEL = [0xc5d0dc, 0xb7c3cf, 0xd0d9e3]
HM_LEATHER = [0x5a3a24, 0x4f3320, 0x63412a]


def hm_tone(pal, rnd):
    return pal[rnd.randrange(len(pal))]


def hm_g2b(p):
    return Vector((p[0], -p[2], p[1]))


def hm_b2g(p):
    return Vector((p[0], p[2], -p[1]))

# ---------------------------------------------------------------- skeleton

def hm_joints(S, a_pose=40.0):
    """Joint positions (game space) for a style. Arms hang in an A-pose."""
    H = S["height"]
    head = S["head"]
    k = (H - head) / (1.98 - 0.36)            # body length scale against the storybook figure
    j = {}
    j["pelvis"] = Vector((0, 0.98 * k, 0))
    j["belly"] = Vector((0, 1.15 * k, 0))
    j["chest"] = Vector((0, 1.36 * k, -0.01))
    j["neck"] = Vector((0, 1.53 * k, 0.0))
    j["neckTop"] = Vector((0, H - head * 0.95, 0.01))
    j["crown"] = Vector((0, H, 0.02))
    ang = math.radians(a_pose)
    sh = S["shoulders"] * S["build"] ** 0.5
    for s, t in ((-1, "L"), (1, "R")):
        d = Vector((s * math.sin(ang), -math.cos(ang), 0))
        j["clav" + t] = Vector((s * 0.05, 1.47 * k, -0.005))
        j["sh" + t] = Vector((s * sh, 1.46 * k, 0))
        j["el" + t] = j["sh" + t] + d * 0.29 * k
        j["wr" + t] = j["el" + t] + d * 0.26 * k
        j["hd" + t] = j["wr" + t] + d * 0.1 * k * S["hands"]
        j["hip" + t] = Vector((s * 0.1 * S["build"] ** 0.5, 0.93 * k, 0))
        j["kn" + t] = Vector((s * 0.115 * S["build"] ** 0.5, 0.52 * k, -0.012))
        j["an" + t] = Vector((s * 0.125 * S["build"] ** 0.5, 0.1, 0.0))
        j["toe" + t] = Vector((s * 0.125 * S["build"] ** 0.5, 0.04, -0.16 * S["feet"]))
    j["capeTop"] = Vector((0, 1.5 * k, 0.17))
    j["capeMid"] = Vector((0, 1.05 * k, 0.24))
    j["capeLow"] = Vector((0, 0.6 * k, 0.28))
    return j

# ---------------------------------------------------------------- parts

class HmFig:
    """Parts in game space: each {"v": [Vector], "f": [tuple], "c": [hex], "rule": ...}."""

    def __init__(self, S, seed=7):
        self.S = S
        self.j = hm_joints(S)
        self.parts = []
        self.rnd = random.Random(seed)

    def add(self, v, f, c, rule):
        self.parts.append({"v": v, "f": f, "c": c, "rule": rule})

    def from_kit(self, kit, rule):
        for role, R in kit.roles.items():
            if R["f"]:
                self.add([Vector(p) for p in R["v"]], R["f"], R["c"], rule)
        kit.roles = {}


def hm_skin_shell(name, joints, edges, radii, root, levels=1, open_ends=()):
    """A continuous shell over a joint graph (Skin modifier + subdivision), returned as
    (verts, faces) in game space. open_ends: [(joint position, outward dir)] whose cap
    faces are removed (sleeve cuffs, skirt hems, collars)."""
    names = list(joints)
    me = bpy.data.meshes.new("hm_tmp")
    me.from_pydata([hm_g2b(joints[n]) for n in names], [(names.index(a), names.index(b)) for a, b in edges], [])
    ob = bpy.data.objects.new("hm_tmp", me)
    bpy.context.scene.collection.objects.link(ob)
    sk = ob.modifiers.new("skin", 'SKIN')
    sk.branch_smoothing = 0.5
    for i, n in enumerate(names):
        sv = me.skin_vertices[0].data[i]
        r = radii[n]
        sv.radius = (r, r) if not isinstance(r, tuple) else r
        sv.use_root = n == root
    if levels:
        sub = ob.modifiers.new("sub", 'SUBSURF')
        sub.levels = levels
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m2 = bpy.data.meshes.new_from_object(ev)
    verts = [hm_b2g(v.co) for v in m2.vertices]
    faces = []
    for p in m2.polygons:
        idx = tuple(p.vertices)
        cen = sum((verts[i] for i in idx), Vector()) / len(idx)
        nb = hm_b2g(p.normal)
        cap = False
        for pos, d, rr in open_ends:
            if nb.dot(d) > 0.6 and (cen - pos).dot(d) > -0.02 and (cen - pos - d * (cen - pos).dot(d)).length < rr:
                cap = True
        if not cap:
            faces.append(idx)
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)
    bpy.data.meshes.remove(m2)
    return verts, faces


def hm_paint(fig, verts, faces, fn):
    cols = []
    for f in faces:
        cen = sum((verts[i] for i in f), Vector()) / len(f)
        n = (verts[f[1]] - verts[f[0]]).cross(verts[f[2]] - verts[f[0]])
        n = n.normalized() if n.length > 1e-9 else Vector((0, 1, 0))
        cols.append(fn(cen, n))
    return cols


def hm_body(fig):
    S, j, rnd = fig.S, fig.j, fig.rnd
    b = S["build"]
    J = {n: j[n] for n in ("pelvis", "belly", "chest", "neck")}
    J["neckTop"] = j["neckTop"] + Vector((0, 0.04, 0))
    # torso and hips stay slim: clothes always cover them, and a slim core cannot poke through
    R = {"pelvis": (0.15 * b, 0.11 * b), "belly": (0.145 * b, 0.105 * b), "chest": (0.175 * b, 0.12 * b),
         "neck": 0.068 * b ** 0.5, "neckTop": 0.062 * b ** 0.5}
    E = [("pelvis", "belly"), ("belly", "chest"), ("chest", "neck"), ("neck", "neckTop")]
    for t in "LR":
        for n in ("sh", "el", "wr", "hd", "hip", "kn", "an"):
            J[n + t] = j[n + t]
        # mid-limb joints shape the muscle: upper arm, forearm, thigh, calf
        J["ua" + t] = j["sh" + t].lerp(j["el" + t], 0.45)
        J["fa" + t] = j["el" + t].lerp(j["wr" + t], 0.35)
        J["th" + t] = j["hip" + t].lerp(j["kn" + t], 0.4)
        J["ca" + t] = j["kn" + t].lerp(j["an" + t], 0.3) + Vector((0, 0, 0.012))
        R.update({"sh" + t: 0.085 * b, "ua" + t: 0.072 * b, "el" + t: 0.058 * b, "fa" + t: 0.062 * b, "wr" + t: 0.045 * b,
                  "hd" + t: (0.05 * S["hands"], 0.03 * S["hands"]), "hip" + t: 0.095 * b, "th" + t: 0.095 * b,
                  "kn" + t: 0.075 * b, "ca" + t: 0.078 * b, "an" + t: 0.05 * b})
        E += [("chest", "sh" + t), ("sh" + t, "ua" + t), ("ua" + t, "el" + t), ("el" + t, "fa" + t), ("fa" + t, "wr" + t), ("wr" + t, "hd" + t),
              ("pelvis", "hip" + t), ("hip" + t, "th" + t), ("th" + t, "kn" + t), ("kn" + t, "ca" + t), ("ca" + t, "an" + t)]
    v, f = hm_skin_shell("body", J, E, R, "pelvis", levels=S["facet"])
    fig.add(v, f, hm_paint(fig, v, f, lambda c, n: hm_tone(HM_SKIN, rnd)), ("auto", None))


# A head as cross-section loops, chin (y = 0) to crown (y = 1), head height 1. Each loop
# runs from the front centre round one side to the back centre as (x, z) pairs; z < 0 is
# the face. The other side is mirrored. Hand-placed like a box-modelled low-poly head.
HM_HEAD_LOOPS = [
    (0.00, [(0.00, -0.30), (0.08, -0.28), (0.14, -0.19), (0.13, -0.06), (0.08, 0.04), (0.00, 0.06)]),     # chin
    (0.11, [(0.00, -0.36), (0.13, -0.33), (0.25, -0.21), (0.27, -0.04), (0.17, 0.12), (0.00, 0.15)]),     # jaw
    (0.24, [(0.00, -0.39), (0.15, -0.36), (0.29, -0.24), (0.33, -0.02), (0.25, 0.2), (0.00, 0.24)]),      # mouth
    (0.37, [(0.00, -0.49), (0.08, -0.4), (0.3, -0.29), (0.37, 0.0), (0.3, 0.25), (0.00, 0.3)]),          # nose tip
    (0.52, [(0.00, -0.41), (0.17, -0.34), (0.35, -0.24), (0.41, 0.02), (0.34, 0.29), (0.00, 0.36)]),      # eyes
    (0.62, [(0.00, -0.43), (0.2, -0.42), (0.37, -0.27), (0.42, 0.03), (0.35, 0.31), (0.00, 0.39)]),       # brow
    (0.78, [(0.00, -0.38), (0.22, -0.35), (0.37, -0.18), (0.41, 0.06), (0.33, 0.31), (0.00, 0.39)]),      # forehead
    (0.92, [(0.00, -0.25), (0.17, -0.22), (0.28, -0.1), (0.31, 0.08), (0.24, 0.25), (0.00, 0.29)]),       # top
]


def hm_loop_k(S, y):
    """Width factor the head applies to the loop at height y (the jaw narrows)."""
    lower = max(0.0, (0.5 - y) / 0.5)
    return (1 - (1 - S["jaw"]) * lower * 1.2) * S.get("width", 1.0)


def hm_head_cage(S):
    """(verts, faces, region per face) in head units; regions name what a face is."""
    jaw = S["jaw"]
    nose = S["nose"]
    brow = S["brow"]
    loops = []
    for y, pts in HM_HEAD_LOOPS:
        k = hm_loop_k(S, y) / S.get("width", 1.0)
        row = []
        for i, (x, z) in enumerate(pts):
            if y == 0.37 and i == 0:
                z = -0.4 - 0.08 * nose             # nose tip
            if y == 0.62 and i in (0, 1):
                z -= 0.02 * (brow - 1)
            row.append((x * k * S.get("width", 1.0), z))
        # full ring: front centre, right side to back, then the left side back to front
        ring_pts = row + [(-x, z) for x, z in reversed(row[1:-1])]
        loops.append([Vector((x, y, z)) for x, z in ring_pts])
    n = len(loops[0])
    verts = [v for loop in loops for v in loop]
    top = len(verts)
    verts.append(Vector((0, 1.0, 0.04)))
    bottom = len(verts)
    verts.append(Vector((0, -0.03, -0.12)))
    faces, regions = [], []
    names = ["jaw", "mouth", "nose", "eyes", "brow", "forehead", "top"]
    for li in range(len(loops) - 1):
        for k in range(n):
            a = li * n + k
            b = li * n + (k + 1) % n
            faces.append((a, b, b + n, a + n))
            regions.append((names[li], k))
    for k in range(n):
        faces.append(((len(loops) - 1) * n + k, (len(loops) - 1) * n + (k + 1) % n, top))
        regions.append(("crown", k))
        faces.append(((k + 1) % n, k, bottom))
        regions.append(("under", k))
    return verts, faces, regions, n


def hm_head(fig, hood=False):
    """A box-modelled low-poly head from hand-placed loops (one subdivision when the style
    asks for it), eyes and brows set on the face, ears, hair as a fitted cap."""
    S, j, rnd = fig.S, fig.j, fig.rnd
    h = S["head"]
    base = j["neckTop"] + Vector((0, -h * 0.12, -h * 0.02))
    sc = h * 1.02
    v, f, regions, n = hm_head_cage(S)
    world = [base + Vector((p.x * sc, p.y * sc, p.z * sc)) for p in v]
    if S.get("head_sub", 0):
        world, f = hm_subdivide(world, f, S["head_sub"])
    fig.add(world, f, [HM_SKIN[0]] * len(f), ("rigid", "head"))
    kit = Kit(0)
    kit.r = rnd
    U = lambda x, y, z: base + Vector((x * sc, y * sc, z * sc))
    for s in (-1, 1):
        # eye: a dark almond in the socket under the brow, a glint
        e = U(s * 0.17, 0.53, -0.355)
        kit.ball("eye", h * 0.05 * S["eye"] / 0.022, HM_EYE, e.x, e.y, e.z, 1.35, 0.85, 0.45)
        kit.ball("eye", h * 0.012, [0xf4f0e8], e.x + s * h * 0.018, e.y + h * 0.018, e.z - h * 0.02, 1, 1, 0.6)
        # brow: a hair-coloured bar along the brow ridge
        b = U(s * 0.19, 0.615, -0.415 - 0.02 * (S["brow"] - 1))
        kit.box("brow", h * 0.2, h * 0.04 * S["brow"], h * 0.05, HM_HAIR, b.x, b.y, b.z, ry=-s * 0.3, rz=s * 0.12)
        # ear
        ep = U(s * 0.41, 0.47, 0.05)
        blob(kit, "ear", 1.0, lambda nn, pp: HM_SKIN[0], ep.x, ep.y, ep.z, h * 0.04, h * 0.11, h * 0.08, noise=0.05, subdiv=1, seed=3)
    m = U(0, 0.245, -0.375)
    kit.box("mouth", h * 0.2, h * 0.026, h * 0.03, [shade(HM_LIP[0], 0.62)], m.x, m.y, m.z)
    kit.box("mouth", h * 0.14, h * 0.022, h * 0.026, [HM_LIP[0]], m.x, m.y - h * 0.024, m.z + h * 0.004)
    fig.from_kit(kit, ("rigid", "head"))
    if S["beard"]:
        # beard: the jaw and chin loops pushed out, a moustache over the mouth
        bf = []
        loops = HM_HEAD_LOOPS
        ring = []
        for li, push in ((0, 0.07), (1, 0.06), (2, 0.04), (3, 0.02)):
            y, pts = loops[li]
            row = [(x * hm_loop_k(S, y) * (1.04 + push), z - push * (1 if z < 0 else 0.3)) for x, z in pts[:4]]
            full = [(-x, z) for x, z in reversed(row[1:])] + row
            ring.append([U(x, y - (0.05 if li == 0 else 0), z) for x, z in full])
        bv = [p for r in ring for p in r]
        w = len(ring[0])
        for li in range(len(ring) - 1):
            for k in range(w - 1):
                a = li * w + k
                bf.append((a, a + 1, a + 1 + w, a + w))
        fig.add(bv, bf, [HM_HAIR[k % len(HM_HAIR)] for k in range(len(bf))], ("rigid", "head"))
        mo = U(0, 0.29, -0.4)
        for s in (-1, 1):
            kit.box("stache", h * 0.13, h * 0.04, h * 0.04, HM_HAIR, mo.x + s * h * 0.065, mo.y, mo.z, rz=s * 0.25)
        fig.from_kit(kit, ("rigid", "head"))
    if not hood:
        hm_hair(fig, U, S["hair"], h, S)


def hm_subdivide(verts, faces, levels):
    me = bpy.data.meshes.new("hm_tmp")
    me.from_pydata([hm_g2b(v) for v in verts], [], faces)
    ob = bpy.data.objects.new("hm_tmp", me)
    bpy.context.scene.collection.objects.link(ob)
    sub = ob.modifiers.new("sub", 'SUBSURF')
    sub.levels = levels
    dg = bpy.context.evaluated_depsgraph_get()
    m2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    out_v = [hm_b2g(v.co) for v in m2.vertices]
    out_f = [tuple(p.vertices) for p in m2.polygons]
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)
    bpy.data.meshes.remove(m2)
    return out_v, out_f


def hm_hair(fig, U, kind, h, S):
    """Hair: the upper head loops grown outward into a cap. Growth tapers in from each
    column's lower edge, so the cap hugs the skull instead of flaring like a brim."""
    rnd = fig.rnd
    loops = HM_HEAD_LOOPS
    grow = {"swept": 0.065, "short": 0.045, "mop": 0.08}[kind]
    front_from = {"swept": 6, "short": 6, "mop": 5}[kind]
    def covered(li, x, z):
        return li >= front_from or (z > 0.06 and li >= 3) or (z > -0.22 and li >= 5)
    cols = []
    first = None
    full_rows = []
    for li in range(2, len(loops)):
        y, pts = loops[li]
        full_rows.append((li, y, pts + [(-x, z) for x, z in reversed(pts[1:-1])]))
    w = len(full_rows[0][2])
    first = [None] * w
    for li, y, full in full_rows:
        for k, (x, z) in enumerate(full):
            if first[k] is None and covered(li, x, z):
                first[k] = li
    rows = []
    for li, y, full in full_rows:
        row = []
        for k, (x, z) in enumerate(full):
            if covered(li, x, z):
                ramp = min(1.0, 0.35 + 0.4 * (li - first[k]))
                g = grow * ramp * (1 + 0.3 * (rnd.random() - 0.5))
            else:
                g = -0.03
            x *= hm_loop_k(S, y)
            r = (x * x + z * z) ** 0.5 or 1
            row.append(U(x * (1 + g / r), y + (0.015 if li == len(loops) - 1 else 0), z * (1 + g / r)))
        rows.append(row)
    top = U(0, 1.0 + grow * 0.8, 0.04)
    v = [p for r in rows for p in r] + [top]
    f = []
    for li in range(len(rows) - 1):
        for k in range(w):
            a = li * w + k
            b = li * w + (k + 1) % w
            f.append((a, b, b + w, a + w))
    t = len(v) - 1
    for k in range(w):
        f.append(((len(rows) - 1) * w + k, (len(rows) - 1) * w + (k + 1) % w, t))
    fig.add(v, f, [HM_HAIR[k % 2] for k in range(len(f))], ("rigid", "head"))


def hm_head_test(style="storybook", hood=False):
    """Just a head (and neck stub) in scene "hm_head" for close looks."""
    keep = bpy.context.window.scene
    scn = scene_for("hm_head")
    bpy.context.window.scene = scn
    out = []
    for i, st in enumerate([style] if isinstance(style, str) else style):
        fig = HmFig(HM_STYLES[st])
        hm_head(fig, hood=hood)
        ob, rig = hm_build_object(fig, "hmh_" + st, scn.collection)
        rig.location = Vector((i * 0.7, 0, -fig.j["neckTop"].y))
        rig.hide_set(True)
        out.append(sum(len(p.vertices) - 2 for p in ob.data.polygons))
    for area in bpy.context.window.screen.areas:
        if area.type == 'VIEW_3D':
            sp = area.spaces[0]
            sp.shading.type = 'SOLID'
            sp.shading.color_type = 'VERTEX'
            sp.shading.light = 'STUDIO'
            sp.overlay.show_overlays = False
            r3 = sp.region_3d
            r3.view_location = Vector(((len(out) - 1) * 0.35, 0, 0.2))
            r3.view_distance = 0.9 + 0.3 * len(out)
            r3.view_rotation = Matrix.Rotation(math.radians(215), 4, 'Z').to_quaternion() @ Matrix.Rotation(math.radians(84), 4, 'X').to_quaternion()
    return out


def hm_clothes_base(fig):
    """Linen tunic with short sleeves and a flared skirt, trousers, wraps, boots."""
    S, j, rnd = fig.S, fig.j, fig.rnd
    b = S["build"] * 1.2   # clothes clear the body shell
    k = (S["height"] - S["head"]) / (1.98 - 0.36)
    # tunic: torso, sleeves to mid upper arm, skirt to mid thigh
    J = {"pelvis": j["pelvis"], "belly": j["belly"], "chest": j["chest"], "collar": j["neck"] + Vector((0, -0.02, 0)),
         "skirt": j["pelvis"] + Vector((0, -0.16 * k, 0)), "hem": j["pelvis"] + Vector((0, -0.3 * k, 0.005))}
    R = {"pelvis": (0.185 * b, 0.135 * b), "belly": (0.17 * b, 0.128 * b), "chest": (0.198 * b, 0.143 * b), "collar": 0.085 * b,
         "skirt": (0.215 * b, 0.165 * b), "hem": (0.235 * b, 0.19 * b)}
    E = [("pelvis", "belly"), ("belly", "chest"), ("chest", "collar"), ("pelvis", "skirt"), ("skirt", "hem")]
    opens = [(J["hem"], Vector((0, -1, 0)), 0.3), (J["collar"], Vector((0, 1, 0)), 0.12)]
    for t in "LR":
        J["sh" + t] = j["sh" + t]
        J["sl" + t] = j["sh" + t].lerp(j["el" + t], 0.55)
        R["sh" + t] = 0.088 * b
        R["sl" + t] = 0.075 * b
        E += [("chest", "sh" + t), ("sh" + t, "sl" + t)]
        d = (j["el" + t] - j["sh" + t]).normalized()
        opens.append((J["sl" + t], d, 0.1))
    v, f = hm_skin_shell("tunic", J, E, R, "pelvis", levels=1, open_ends=opens)
    fig.add(v, f, hm_paint(fig, v, f, lambda c, n: hm_tone(HM_LINEN if c.y > j["pelvis"].y - 0.25 * k else HM_LINEN_D, rnd)),
            ("skirt", None))
    kit = Kit(0)
    kit.r = rnd
    # belt and buckle
    dk_lathe(kit, "belt", [(0.19 * b, j["pelvis"].y + 0.02), (0.195 * b, j["pelvis"].y + 0.075)], 12, HM_WRAPS, 0, 0, cap=False)
    kit.box("belt", 0.07, 0.06, 0.02, HM_TRIM, 0, j["pelvis"].y + 0.048, -0.145 * b)
    fig.from_kit(kit, ("rigid", "hips"))
    # trousers and boots as shells over the legs
    for t, s in (("L", -1), ("R", 1)):
        J = {"hip": j["hip" + t] + Vector((0, 0.02, 0)), "th": j["hip" + t].lerp(j["kn" + t], 0.4), "kn": j["kn" + t],
             "ca": j["kn" + t].lerp(j["an" + t], 0.3), "bt": j["kn" + t].lerp(j["an" + t], 0.55)}
        R = {"hip": 0.105 * b, "th": 0.094 * b, "kn": 0.07 * b, "ca": 0.072 * b, "bt": 0.06 * b}
        v, f = hm_skin_shell("legs", J, [("hip", "th"), ("th", "kn"), ("kn", "ca"), ("ca", "bt")], R, "hip", levels=1,
                             open_ends=[(J["hip"], Vector((0, 1, 0)), 0.14), (J["bt"], Vector((0, -1, 0)), 0.1)])
        fig.add(v, f, hm_paint(fig, v, f, lambda c, n: hm_tone(HM_TROUSERS, rnd)), ("auto", None))
        hm_boot(fig, t, HM_BOOT, cuff=HM_WRAPS)
        hm_glove(fig, t, HM_WRAPS)


def hm_boot(fig, t, pal, cuff=None, top=0.5):
    S, j, rnd = fig.S, fig.j, fig.rnd
    b = S["build"] * 1.2   # clothes clear the body shell
    up = j["kn" + t].lerp(j["an" + t], top)
    J = {"top": up, "an": j["an" + t] + Vector((0, 0.01, 0)), "ball": j["an" + t].lerp(j["toe" + t], 0.65) + Vector((0, -0.02, 0)),
         "toe": j["toe" + t] + Vector((0, -0.005, -0.02))}
    R = {"top": 0.07 * b, "an": 0.056 * b, "ball": (0.055 * S["feet"], 0.04), "toe": (0.048 * S["feet"], 0.034)}
    v, f = hm_skin_shell("boot", J, [("top", "an"), ("an", "ball"), ("ball", "toe")], R, "top", levels=1,
                         open_ends=[(J["top"], Vector((0, 1, 0)), 0.09)])
    fig.add(v, f, hm_paint(fig, v, f, lambda c, n: hm_tone(pal, rnd) if n.y > -0.6 else shade(pal[0], 0.7)), ("auto", None))
    if cuff:
        kit = Kit(0)
        kit.r = rnd
        dk_lathe(kit, "cuff", [(0.078 * b, up.y - 0.05), (0.082 * b, up.y + 0.01)], 9, cuff, up.x, up.z, cap=False)
        fig.from_kit(kit, ("rigid", "shin." + t))


def hm_glove(fig, t, pal, bracer=None):
    S, j, rnd = fig.S, fig.j, fig.rnd
    b = S["build"] * 1.2   # clothes clear the body shell
    J = {"fa": j["el" + t].lerp(j["wr" + t], 0.45), "wr": j["wr" + t], "hd": j["hd" + t]}
    R = {"fa": 0.054 * b, "wr": 0.043 * b, "hd": (0.047 * S["hands"], 0.03 * S["hands"])}
    d = (j["wr" + t] - j["el" + t]).normalized()
    v, f = hm_skin_shell("glove", J, [("fa", "wr"), ("wr", "hd")], R, "fa", levels=1, open_ends=[(J["fa"], -d, 0.07)])
    fig.add(v, f, hm_paint(fig, v, f, lambda c, n: hm_tone(bracer if bracer and (c - j["wr" + t]).dot(d) < 0 else pal, rnd)), ("auto", None))
    # thumb
    kit = Kit(0)
    kit.r = rnd
    side = -1 if t == "L" else 1
    th = j["wr" + t] + d * 0.04 + Vector((0, 0, -0.035))
    kit.cylr("thumb", 0.016, 0.02, 0.07 * S["hands"], 5, pal, th.x, th.y, th.z, rx=-0.6, rz=side * -0.4)
    fig.from_kit(kit, ("rigid", "hand." + t))


def hm_heirloom(fig):
    """The heirloom Warden: gambeson and tabard in royal blue, hood, pauldrons, cape."""
    S, j, rnd = fig.S, fig.j, fig.rnd
    b = S["build"] * 1.2   # clothes clear the body shell
    k = (S["height"] - S["head"]) / (1.98 - 0.36)
    # padded gambeson with long sleeves and a skirt to the knee
    J = {"pelvis": j["pelvis"], "belly": j["belly"], "chest": j["chest"], "collar": j["neck"] + Vector((0, -0.01, 0)),
         "skirt": j["pelvis"] + Vector((0, -0.2 * k, 0)), "hem": j["pelvis"] + Vector((0, -0.4 * k, 0.01))}
    R = {"pelvis": (0.19 * b, 0.14 * b), "belly": (0.178 * b, 0.136 * b), "chest": (0.205 * b, 0.15 * b), "collar": 0.09 * b,
         "skirt": (0.225 * b, 0.175 * b), "hem": (0.25 * b, 0.2 * b)}
    E = [("pelvis", "belly"), ("belly", "chest"), ("chest", "collar"), ("pelvis", "skirt"), ("skirt", "hem")]
    opens = [(J["hem"], Vector((0, -1, 0)), 0.32), (J["collar"], Vector((0, 1, 0)), 0.12)]
    for t in "LR":
        J["sh" + t] = j["sh" + t]
        J["ua" + t] = j["sh" + t].lerp(j["el" + t], 0.5)
        J["el" + t] = j["el" + t]
        J["cf" + t] = j["el" + t].lerp(j["wr" + t], 0.55)
        R.update({"sh" + t: 0.09 * b, "ua" + t: 0.074 * b, "el" + t: 0.064 * b, "cf" + t: 0.062 * b})
        E += [("chest", "sh" + t), ("sh" + t, "ua" + t), ("ua" + t, "el" + t), ("el" + t, "cf" + t)]
        opens.append((J["cf" + t], (j["wr" + t] - j["el" + t]).normalized(), 0.09))
    # the tabard is painted onto the fitted gambeson: a royal panel front and back with
    # gold edges, dark sides and sleeves, a gold hem
    half = 0.13 * b
    hem_y = J["hem"].y + 0.05
    def tabard(c, n):
        if c.y < hem_y:
            return hm_tone(HM_TRIM, rnd)
        if abs(c.x) < half and c.y < j["neck"].y - 0.04:
            return hm_tone(HM_TRIM, rnd) if abs(c.x) > half - 0.035 else hm_tone(HM_CLOTH, rnd)
        return hm_tone(HM_CLOTH_D, rnd)
    v, f = hm_skin_shell("gambeson", J, E, R, "pelvis", levels=1, open_ends=opens)
    fig.add(v, f, hm_paint(fig, v, f, tabard), ("skirt", None))
    kit = Kit(0)
    kit.r = rnd
    # emblem: a gold diamond on the chest
    kit.box("tabard", 0.11, 0.11, 0.03, HM_TRIM, 0, j["chest"].y, -0.15 * b - 0.012, rz=math.pi / 4)
    fig.from_kit(kit, ("rigid", "chest"))
    # belt with buckle and a pouch
    dk_lathe(kit, "belt", [(0.2 * b, j["pelvis"].y + 0.02), (0.205 * b, j["pelvis"].y + 0.08)], 12, HM_LEATHER, 0, 0, cap=False)
    kit.box("belt", 0.08, 0.07, 0.02, HM_TRIM, 0, j["pelvis"].y + 0.05, -0.2 * b - 0.03)
    kit.box("belt", 0.09, 0.1, 0.06, HM_LEATHER, 0.17 * b, j["pelvis"].y - 0.03, -0.1 * b)
    fig.from_kit(kit, ("rigid", "hips"))
    # pauldrons: domed steel with a gold rim
    for t, s in (("L", -1), ("R", 1)):
        p = j["sh" + t] + Vector((s * 0.02, 0.04, 0))
        blob(kit, "pauldron", 0.13 * b, lambda n, pp: hm_tone(HM_STEEL, rnd) if n.y > -0.2 else shade(HM_STEEL[0], 0.8),
             p.x, p.y, p.z, 1.05, 0.62, 1.1, noise=0.0, subdiv=1, seed=1)
        ring(kit, "pauldron", 0.12 * b, 0.016, HM_TRIM, p.x, p.y - 0.035, p.z, rz=s * 0.35, sz=1.05, segs=12, sides=4)
        fig.from_kit(kit, ("rigid", "shoulder." + t))
        hm_boot(fig, t, HM_LEATHER, cuff=HM_TRIM, top=0.25)
        hm_glove(fig, t, HM_LEATHER, bracer=HM_LEATHER)
        # trousers below the skirt
        J = {"th": j["hip" + t].lerp(j["kn" + t], 0.45), "kn": j["kn" + t], "ca": j["kn" + t].lerp(j["an" + t], 0.3)}
        v, f = hm_skin_shell("legs", J, [("th", "kn"), ("kn", "ca")], {"th": 0.094 * b, "kn": 0.07 * b, "ca": 0.07 * b}, "th", levels=1,
                             open_ends=[(J["th"], Vector((0, 1, 0)), 0.12), (J["ca"], Vector((0, -1, 0)), 0.09)])
        fig.add(v, f, hm_paint(fig, v, f, lambda c, n: hm_tone(HM_TROUSERS, rnd)), ("auto", None))
    # hood and a short mantle over the shoulders
    h = S["head"]
    c = j["neckTop"].lerp(j["crown"], 0.52)
    blob(kit, "hood", 1.0, lambda n, p: hm_tone(HM_CLOTH, rnd), c.x, c.y + 0.01, c.z + 0.02, h * 0.53, h * 0.6, h * 0.56, noise=0.04, subdiv=2, seed=9)
    R = kit.roles["hood"]
    keep = []
    keepc = []
    for f, col in zip(R["f"], R["c"]):
        cen = sum((R["v"][i] for i in f), Vector()) / 3
        rel = cen - c
        if rel.z < -h * 0.18 and abs(rel.x) < h * 0.3 and -h * 0.42 < rel.y < h * 0.3:
            continue  # the face opening
        keep.append(f)
        keepc.append(col)
    R["f"], R["c"] = keep, keepc
    ring(kit, "hood", h * 0.34, 0.02, HM_TRIM, c.x, c.y - h * 0.05, c.z - h * 0.42, rx=0.12, sx=0.86, sy=1.12, segs=14, sides=4)
    fig.from_kit(kit, ("rigid", "head"))
    dk_lathe(kit, "mantle", [(0.27 * b, j["chest"].y + 0.02), (0.2 * b, j["neck"].y - 0.02), (0.1 * b, j["neck"].y + 0.03)], 14,
             [HM_CLOTH, HM_CLOTH, HM_CLOTH_D], 0, 0, cap=False)
    fig.from_kit(kit, ("rigid", "chest"))
    # cape: a curved sheet down the back on cape.1 / cape.2
    rows, cols = 6, 6
    top, mid, lowp = j["capeTop"], j["capeMid"], j["capeLow"]
    v, f, c = [], [], []
    for r in range(rows + 1):
        t = r / rows
        p = top.lerp(mid, t * 2) if t < 0.5 else mid.lerp(lowp, (t - 0.5) * 2)
        w = 0.2 * b + 0.14 * t
        for q in range(cols + 1):
            u = q / cols * 2 - 1
            v.append(Vector((u * w, p.y, p.z + 0.06 * (1 - u * u) + 0.02)))
    for r in range(rows):
        for q in range(cols):
            a = r * (cols + 1) + q
            f.append((a, a + 1, a + cols + 2, a + cols + 1))
            c.append(hm_tone(HM_CLOTH_D, rnd) if r < rows - 1 else HM_TRIM[0])
    fig.add(v, f, c, ("cape", None))


def hm_gear(fig):
    """Sword in the right hand, heater shield on the left forearm."""
    j, rnd = fig.j, fig.rnd
    kit = Kit(0)
    kit.r = rnd
    d = (j["hdR"] - j["wrR"]).normalized()
    g = j["wrR"].lerp(j["hdR"], 0.55)
    # blade along the hand's forward (-z), grip through the fist
    old = kit.frame
    kit.frame = Matrix.Translation(g) @ Matrix.Rotation(-0.35, 4, 'X')
    kit.cylr("sword", 0.018, 0.02, 0.22, 6, HM_LEATHER, 0, 0, 0, rx=math.pi / 2)
    kit.box("sword", 0.22, 0.035, 0.04, HM_TRIM, 0, 0, -0.12)
    kit.box("sword", 0.065, 0.014, 0.8, HM_STEEL, 0, 0, -0.53)
    kit.cone("sword", 0.033, 0.09, 4, HM_STEEL, 0, 0, -0.97, rx=-math.pi / 2)
    kit.ball("sword", 0.032, HM_TRIM, 0, 0, 0.13)
    kit.frame = old
    fig.from_kit(kit, ("rigid", "hand.R"))
    a = j["elL"].lerp(j["wrL"], 0.5) + Vector((-0.06, 0, 0))
    pts = [(-0.24, 0.28), (0.24, 0.28), (0.24, 0.05), (0.15, -0.18), (0.0, -0.32), (-0.15, -0.18), (-0.24, 0.05)]
    n = len(pts)
    vv = [Vector((a.x - 0.035, a.y + y, a.z + x)) for x, y in pts] + [Vector((a.x - 0.075, a.y + y, a.z + x)) for x, y in pts]
    ff = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    fig.add(vv, ff, [HM_CLOTH[0], HM_CLOTH_D[0]] + [HM_TRIM[0]] * n, ("rigid", "forearm.L"))
    kit.ball("boss", 0.05, HM_TRIM, a.x - 0.09, a.y + 0.02, a.z, 0.5, 1, 1)
    fig.from_kit(kit, ("rigid", "forearm.L"))

# ---------------------------------------------------------------- weights

def hm_seg(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
    return (p - (a + ab * t)).length, t


def hm_weights(fig, p, rule, bones, children, Z=0.28):
    kind, arg = rule
    if kind == "rigid":
        return {arg: 1.0}
    if kind == "cape":
        _, t = hm_seg(p, fig.j["capeTop"], fig.j["capeLow"])
        if t < 0.12:
            return {"chest": 1.0 - t / 0.12, "cape.1": t / 0.12} if t > 0 else {"chest": 1.0}
        return {"cape.1": max(0.0, 1 - (t - 0.12) / 0.6), "cape.2": min(1.0, (t - 0.12) / 0.6)}
    cand = [bn for bn in bones if not bn[0].startswith("cape") and not bn[0].startswith("shoulder")]
    best, bt, bd = None, 0, 1e9
    for name, h, t, par in cand:
        d, tt = hm_seg(p, fig.j[h], fig.j[t])
        if d < bd:
            best, bt, bd = (name, h, t, par), tt, d
    name, h, t, par = best
    if kind == "skirt" and (name.startswith("thigh") or name.startswith("shin")):
        # cloth over the legs follows the hips more than the thigh: no tearing between the legs
        drop = max(0.0, min(1.0, (fig.j["pelvis"].y - p.y) / 0.45))
        leg = "thigh." + name[-1]
        return {"hips": 1 - 0.55 * drop, leg: 0.55 * drop}
    if name.startswith("upperArm") and bt < Z:
        # shoulders: blend into the chest, through the shoulder bone
        a = 0.5 + 0.5 * bt / Z
        return {name: a, "shoulder." + name[-1]: 1 - a}
    if bt < Z and par and not par.startswith("shoulder"):
        a = 0.5 + 0.5 * bt / Z
        return {name: a, par: 1 - a}
    if bt > 1 - Z and children.get(name):
        kids = [c for c in children[name] if not c[0].startswith("cape")]
        if not kids:
            return {name: 1.0}
        ch = min(kids, key=lambda c: hm_seg(p, fig.j[c[1]], fig.j[c[2]])[0])
        a = 0.5 + 0.5 * (1 - bt) / Z
        return {name: a, ch[0]: 1 - a}
    return {name: 1.0}

# ---------------------------------------------------------------- blender objects

def hm_build_object(fig, name, coll):
    """One mesh + armature for the figure; returns (mesh object, armature object)."""
    bones = HM_BONES
    children = {}
    for bn in bones:
        if bn[3]:
            children.setdefault(bn[3], []).append(bn)
    verts, faces, cols, groups = [], [], [], []
    for part in fig.parts:
        base = len(verts)
        for p in part["v"]:
            verts.append(hm_g2b(p))
            groups.append(hm_weights(fig, p, part["rule"], bones, children))
        for f, c in zip(part["f"], part["c"]):
            faces.append(tuple(base + i for i in f))
            cols.append(c)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    attr = me.color_attributes.new("Col", 'FLOAT_COLOR', 'CORNER')
    flat = []
    for poly in me.polygons:
        c = cols[poly.index]
        c = hexc(c) if isinstance(c, int) else c
        for _ in poly.loop_indices:
            flat += (c[0], c[1], c[2], 1.0)
    attr.data.foreach_set("color", flat)
    me.color_attributes.active_color = attr
    for poly in me.polygons:
        poly.use_smooth = False
    for o in (bpy.data.objects.get(name), bpy.data.objects.get(name + "_rig")):
        if o is not None:
            bpy.data.objects.remove(o, do_unlink=True)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    arm = bpy.data.armatures.new(name + "_rig")
    rig = bpy.data.objects.new(name + "_rig", arm)
    coll.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for bname, h, t, par in bones:
        b = arm.edit_bones.new(bname)
        b.head = hm_g2b(fig.j[h])
        b.tail = hm_g2b(fig.j[t])
        b.roll = 0.0
        if par:
            b.parent = eb[par]
            b.use_connect = False
        eb[bname] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    for bname, *_ in bones:
        ob.vertex_groups.new(name=bname)
    for i, w in enumerate(groups):
        for bname, wt in w.items():
            if wt > 1e-4:
                ob.vertex_groups[bname].add([i], wt, 'REPLACE')
    mod = ob.modifiers.new("rig", 'ARMATURE')
    mod.object = rig
    ob.parent = rig
    return ob, rig

# ---------------------------------------------------------------- poses

def hm_pose(rig, pose):
    """Pose by rotations about armature axes (Blender: X across the body, Y forward,
    Z up), each turned into the bone's own rest frame. Positive X swings a hanging limb
    forward; a negative X bends a knee; Y brings a hanging arm in or out; Z twists."""
    pb = rig.pose.bones
    for b in pb:
        b.rotation_mode = 'QUATERNION'
        b.rotation_quaternion = (1, 0, 0, 0)
    def rot(name, *steps):
        bone = rig.data.bones[name]
        inv = bone.matrix_local.to_3x3().inverted()
        q = pb[name].rotation_quaternion.copy()
        for axis, deg in steps:
            ax = inv @ Vector({"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}[axis])
            q = q @ Quaternion(ax.normalized(), math.radians(deg))
        pb[name].rotation_quaternion = q
    # arms down from the A-pose to the sides, elbows soft
    rot("upperArm.L", ("Y", -30))
    rot("upperArm.R", ("Y", 30))
    rot("forearm.L", ("X", 14))
    rot("forearm.R", ("X", 14))
    if pose == "walk":
        rot("thigh.L", ("X", 26))
        rot("shin.L", ("X", -8))
        rot("thigh.R", ("X", -20))
        rot("shin.R", ("X", -40))
        rot("foot.R", ("X", 14))
        rot("upperArm.L", ("X", -22))
        rot("upperArm.R", ("X", 24))
        rot("forearm.R", ("X", 20))
        rot("spine", ("Z", -5))
        rot("chest", ("Z", -4))
        rot("cape.1", ("X", -12))
        rot("cape.2", ("X", -8))
    elif pose == "strike":
        rot("upperArm.R", ("X", 150), ("Y", 15))
        rot("forearm.R", ("X", 35))
        rot("upperArm.L", ("X", 55), ("Y", 10))
        rot("forearm.L", ("X", 60))
        rot("spine", ("Z", 16), ("X", 4))
        rot("chest", ("Z", 12))
        rot("head", ("Z", -12))
        rot("thigh.L", ("X", 28), ("Y", -5))
        rot("shin.L", ("X", -24))
        rot("thigh.R", ("X", -18), ("Y", 5))
        rot("shin.R", ("X", -12))
        rot("cape.1", ("X", -20))


def hm_figure(style, outfit, seed=7):
    S = HM_STYLES[style]
    fig = HmFig(S, seed)
    hm_body(fig)
    hm_head(fig, hood=outfit == "heirloom")
    if outfit == "heirloom":
        hm_heirloom(fig)
        hm_gear(fig)
    else:
        hm_clothes_base(fig)
    return fig


def hero_candidates(styles=None):
    keep = bpy.context.window.scene
    scn = scene_for("hm_candidates")
    bpy.context.window.scene = scn
    styles = styles or list(HM_STYLES)
    rows = [("base", "linen", "rest"), ("rest", "heirloom", "rest"), ("walk", "heirloom", "walk"), ("strike", "heirloom", "strike")]
    report = {}
    for si, style in enumerate(styles):
        for ri, (label, outfit, pose) in enumerate(rows):
            fig = hm_figure(style, outfit)
            ob, rig = hm_build_object(fig, "hm_%s_%s" % (style, label), scn.collection)
            hm_pose(rig, pose)
            rig.location = Vector((hm_slot(ri, si, len(styles)), 0, 0))
            rig.show_in_front = False
            rig.hide_set(True)
            if label == "rest":
                report[style] = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    bpy.context.view_layer.update()
    return report


HM_ROWS = {"base": 0, "rest": 1, "walk": 2, "strike": 3}


def hm_slot(ri, si, n):
    """x of a figure: one group per style (base, rest, walk, strike), 1.5 m apart."""
    return si * (4 * 1.5 + 2.0) + ri * 1.5


def look_style(style, dist=6.2, yaw=200, pitch=84):
    """Frame one style's group: linen base, heirloom rest, walk, strike."""
    si = list(HM_STYLES).index(style)
    look_candidates(None, dist, yaw, pitch, x=hm_slot(1.5, si, len(HM_STYLES)))


def look_candidates(row="rest", dist=5.6, yaw=180, pitch=84, n=3, x=None):
    rows = HM_ROWS
    bpy.context.window.scene = bpy.data.scenes["gm_hm_candidates"]
    for area in bpy.context.window.screen.areas:
        if area.type == 'VIEW_3D':
            sp = area.spaces[0]
            sp.shading.type = 'SOLID'
            sp.shading.color_type = 'VERTEX'
            sp.shading.light = 'STUDIO'
            sp.overlay.show_overlays = False
            r3 = sp.region_3d
            r3.view_perspective = 'PERSP'
            r3.view_location = Vector((x if x is not None else hm_slot(rows[row], (n - 1) / 2, n), 0, 1.0))
            r3.view_rotation = Matrix.Rotation(math.radians(yaw), 4, 'Z').to_quaternion() @ Matrix.Rotation(math.radians(pitch), 4, 'X').to_quaternion()
            r3.view_distance = dist


def render_candidates(out_dir=None, w=1500, h=900, styles=None):
    """Workbench renders of each style's group and a face close-up, into shots/heroes/."""
    out_dir = out_dir or os.path.join(REPO, "shots", "heroes")
    os.makedirs(out_dir, exist_ok=True)
    scn = bpy.data.scenes["gm_hm_candidates"]
    bpy.context.window.scene = scn
    try:
        scn.render.engine = 'BLENDER_WORKBENCH'
    except TypeError as e:
        raise
    sh = scn.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'VERTEX'
    sh.show_shadows = True
    sh.show_cavity = False
    scn.display.shadow_focus = 0.6
    scn.render.resolution_x, scn.render.resolution_y = w, h
    scn.render.film_transparent = False
    if scn.world is None:
        scn.world = bpy.data.worlds.new("hm_world")
    scn.world.color = (0.08, 0.09, 0.1)
    cam = bpy.data.objects.get("hm_cam")
    if cam is None:
        cam = bpy.data.objects.new("hm_cam", bpy.data.cameras.new("hm_cam"))
        scn.collection.objects.link(cam)
    scn.camera = cam
    files = []
    styles = styles or list(HM_STYLES)
    for si, style in enumerate(styles):
        cx = hm_slot(1.5, si, len(styles))
        for tag, target, dist, lens, height in (("full", Vector((cx, 0, 1.0)), 9.5, 50, 1.6),
                                                ("face", Vector((hm_slot(0, si, 3), 0, HM_STYLES[style]["height"] - HM_STYLES[style]["head"] * 0.45)), 1.25, 60, 0.05)):
            yaw = math.radians(205 if tag == "full" else 215)
            # camera in front (+Y is the figures' front), a little to the side and above
            cam.location = target + Vector((-math.sin(yaw) * dist, -math.cos(yaw) * dist, height))
            d = (target - cam.location).normalized()
            cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
            cam.data.lens = lens
            path = os.path.join(out_dir, "%s-%s.png" % (style, tag))
            scn.render.filepath = path
            bpy.ops.render.render(write_still=True)
            files.append(path)
    return files


# ---------------------------------------------------------------- the Warden (phase 1)
#
#   g["build_warden"]()   -> assets/models/warden.glb
#
# One armature ("wd_rig", bones as HM_BONES) and two skinned outfits on it:
#   wd_base   the Warden in linen (nothing worn on the body)
#   wd_gear   gambeson with the painted tabard, hood, pauldrons, cape (any body armour)
# Vertex colour R holds a hero colour slot ((slot + 0.5) / 16, HERO_SLOTS in hero.py and
# src/view/hero.js), G the baked shade; src/view/heroskin.js paints them per gear look.
# Sword and shield stay the hero's own pieces, carried on the hand and forearm bones.

WD_SLOT_HEX = {
    "skin": HM_SKIN + [shade(HM_SKIN[0], 0.96), shade(HM_SKIN[0], 0.92)],
    "hair": HM_HAIR,
    "linen": HM_LINEN + [0xf4f0e8, 0xf2ece0],
    "linenDark": HM_LINEN_D,
    "trousers": HM_TROUSERS,
    "wraps": HM_WRAPS,
    "eye": HM_EYE,
    "lip": HM_LIP + [shade(HM_LIP[0], 0.62)],
    "cloth": HM_CLOTH,
    "dark": HM_CLOTH_D,
    "trim": HM_TRIM,
    "steel": HM_STEEL + [shade(HM_STEEL[0], 0.8)],
    "leather": HM_LEATHER + [shade(HM_LEATHER[0], 0.7)],
    "boot": HM_BOOT + [shade(HM_BOOT[0], 0.7)],
}


def wd_slot_lookup():
    exact = {}
    refs = []
    for name, hexes in WD_SLOT_HEX.items():
        for hx in hexes:
            c = hexc(hx)
            exact[tuple(round(v, 5) for v in c)] = name
            refs.append((c, name))
    def slot_of(c):
        c = hexc(c) if isinstance(c, int) else c
        key = tuple(round(v, 5) for v in c[:3])
        if key in exact:
            return exact[key]
        return min(refs, key=lambda r: sum((a - b) ** 2 for a, b in zip(r[0], c)))[1]
    return slot_of


def hm_armature(fig, name, coll):
    for o in (bpy.data.objects.get(name),):
        if o is not None:
            bpy.data.objects.remove(o, do_unlink=True)
    arm = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm)
    coll.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for bname, h, t, par in HM_BONES:
        b = arm.edit_bones.new(bname)
        b.head = hm_g2b(fig.j[h])
        b.tail = hm_g2b(fig.j[t])
        b.roll = 0.0
        if par:
            b.parent = eb[par]
            b.use_connect = False
        eb[bname] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def hm_mesh(fig, name, coll, rig, slots=False):
    """The figure as one mesh weighted to `rig`. slots=True writes colour-slot codes into
    the "base" attribute (for bake_slot_ao); otherwise plain colours into "Col"."""
    children = {}
    for bn in HM_BONES:
        if bn[3]:
            children.setdefault(bn[3], []).append(bn)
    slot_of = wd_slot_lookup() if slots else None
    verts, faces, cols, groups = [], [], [], []
    for part in fig.parts:
        base = len(verts)
        for p in part["v"]:
            verts.append(hm_g2b(p))
            groups.append(hm_weights(fig, p, part["rule"], HM_BONES, children))
        for f, c in zip(part["f"], part["c"]):
            faces.append(tuple(base + i for i in f))
            cols.append(c)
    stale = bpy.data.objects.get(name)
    if stale is not None:
        bpy.data.objects.remove(stale, do_unlink=True)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    attr = me.color_attributes.new("base" if slots else "Col", 'FLOAT_COLOR', 'CORNER')
    flat = []
    for poly in me.polygons:
        c = cols[poly.index]
        if slots:
            rgb = ((HERO_SLOTS.index(slot_of(c)) + 0.5) / 16, 1.0, 0.0)
        else:
            rgb = hexc(c) if isinstance(c, int) else c
        for _ in poly.loop_indices:
            flat += (rgb[0], rgb[1], rgb[2], 1.0)
    attr.data.foreach_set("color", flat)
    me.color_attributes.active_color = attr
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    for bname, *_ in HM_BONES:
        ob.vertex_groups.new(name=bname)
    for i, w in enumerate(groups):
        for bname, wt in w.items():
            if wt > 1e-4:
                ob.vertex_groups[bname].add([i], wt, 'REPLACE')
    mod = ob.modifiers.new("rig", 'ARMATURE')
    mod.object = rig
    ob.parent = rig
    return ob


def build_warden(export=True, bake=True, samples=64, style="warden"):
    keep = bpy.context.window.scene
    scn = scene_for("warden")
    bpy.context.window.scene = scn
    base = HmFig(HM_STYLES[style])
    hm_body(base)
    hm_head(base, hood=False)
    hm_clothes_base(base)
    gear = HmFig(HM_STYLES[style])
    hm_body(gear)
    hm_head(gear, hood=True)
    hm_heirloom(gear)
    rig = hm_armature(base, "wd_rig", scn.collection)
    objs = [hm_mesh(base, "wd_base", scn.collection, rig, slots=True),
            hm_mesh(gear, "wd_gear", scn.collection, rig, slots=True)]
    bpy.context.view_layer.update()
    if bake:
        for o in objs:
            for o2 in objs:
                o2.hide_render = o2 is not o
            bake_slot_ao(scn, o, samples)
        for o in objs:
            o.hide_render = False
    scn.render.fps = WD_FPS
    line = {"id": "warden", "tris": {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs},
            "clips": wd_clips(rig)}
    if export:
        path = os.path.join(REPO, "assets", "models", "warden.glb")
        for o in scn.collection.all_objects:
            o.select_set(False)
        for o in [rig] + objs:
            o.select_set(True)
        import contextlib, io
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            _gltf(filepath=path, export_format='GLB', use_selection=True, use_active_scene=True, export_yup=True,
                  export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_materials='PLACEHOLDER',
                  export_normals=False, export_texcoords=False, export_apply=False,
                  export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                  export_meshopt_compression_enable=True)
        line["kb"] = round(os.path.getsize(path) / 1024)
    bpy.context.window.scene = keep
    return line



# ---------------------------------------------------------------- clips
#
# Poses as rotations about armature axes (Blender: X across, Y forward, Z up), in
# order, on top of WD_REST (the arms lowered from the A-pose). Positive X swings a
# hanging limb forward and tips an upright bone back; Z turns toward the left.
# Every key writes every bone, so a clip always sets the whole skeleton.

WD_FPS = 30
WD_AX = {"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}
WD_REST = {"upperArm.L": [("Y", -34)], "upperArm.R": [("Y", 34)], "forearm.L": [("X", 14)], "forearm.R": [("X", 14)]}


# Elbows and wrists hinge about their own axis: their rest pose is the A-pose, so the
# body's X would swing the hand outward instead of folding the joint. "X" on them is the
# bone's local X (its hinge with roll 0), signed so positive folds forward on both sides.
WD_HINGED = {"forearm.L": -1, "forearm.R": -1, "hand.L": -1, "hand.R": -1}


def wd_q(rig, name, steps):
    inv = rig.data.bones[name].matrix_local.to_3x3().inverted()
    q = Quaternion()
    for axis, deg in steps:
        if axis == "X" and name in WD_HINGED:
            ax = Vector((WD_HINGED[name], 0, 0))
        else:
            ax = (inv @ Vector(WD_AX[axis])).normalized()
        q = Quaternion(ax, math.radians(deg)) @ q
    return q


def wd_mirror(pose):
    """Left/right swapped, twists and sideways moves negated."""
    out = {}
    for b, steps in pose.items():
        nb = b.replace(".L", ".#").replace(".R", ".L").replace(".#", ".R")
        out[nb] = [(a, -d if a in ("Y", "Z") else d) for a, d in steps]
    return out


def wd_action(rig, name, keys):
    act = bpy.data.actions.get(name)
    if act is not None:
        bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    for frame, pose in keys:
        for b in rig.pose.bones:
            b.rotation_mode = 'QUATERNION'
            b.rotation_quaternion = wd_q(rig, b.name, WD_REST.get(b.name, []) + pose.get(b.name, []))
            b.keyframe_insert("rotation_quaternion", frame=frame, group=b.name)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, int(keys[0][0]), act)
    rig.animation_data.action = None
    return act


def wd_clips(rig):
    if rig.animation_data:
        for t in list(rig.animation_data.nla_tracks):
            rig.animation_data.nla_tracks.remove(t)
    # idle: a slow breath, a small weight shift and a glance (3 s)
    wd_action(rig, "idle", [
        (0, {}),
        (45, {"chest": [("X", 2.5)], "spine": [("Z", 1.5)], "head": [("Z", 4), ("X", 1.5)],
              "upperArm.L": [("Y", -3)], "upperArm.R": [("Y", 3)], "cape.1": [("X", -3)]}),
        (90, {}),
    ])
    # walk: one step cycle over 24 frames, scrubbed from the movement phase. Frame 0 is
    # the left leg passing forward, 6 the left heel down, 12 the right passing.
    passL = {"shin.L": [("X", -36)], "foot.L": [("X", 10)], "shin.R": [("X", -5)], "cape.1": [("X", -6)], "cape.2": [("X", -4)]}
    strideL = {"thigh.L": [("X", 30)], "shin.L": [("X", -6)], "foot.L": [("X", -8)],
               "thigh.R": [("X", -24)], "shin.R": [("X", -24)], "foot.R": [("X", 14)],
               "upperArm.L": [("X", -24)], "forearm.L": [("X", 8)], "upperArm.R": [("X", 26)], "forearm.R": [("X", 26)],
               "spine": [("Z", 2)], "chest": [("Z", 5)], "head": [("Z", -4)], "cape.1": [("X", -10)], "cape.2": [("X", -8)]}
    wd_action(rig, "walk", [(0, passL), (6, strideL), (12, wd_mirror(passL)), (18, wd_mirror(strideL)), (24, passL)])
    # run: the same cycle, deeper, leaning in (16 frames)
    passR = {"thigh.L": [("X", 10)], "shin.L": [("X", -80)], "foot.L": [("X", 15)], "shin.R": [("X", -12)],
             "spine": [("X", -10)], "head": [("X", 8)], "cape.1": [("X", -22)], "cape.2": [("X", -12)],
             "upperArm.L": [("X", -5)], "upperArm.R": [("X", 5)], "forearm.L": [("X", 75)], "forearm.R": [("X", 75)]}
    strideR = {"thigh.L": [("X", 48)], "shin.L": [("X", -14)], "foot.L": [("X", -6)],
               "thigh.R": [("X", -32)], "shin.R": [("X", -42)], "foot.R": [("X", 22)],
               "upperArm.L": [("X", -45)], "forearm.L": [("X", 65)], "upperArm.R": [("X", 48)], "forearm.R": [("X", 90)],
               "spine": [("X", -10), ("Z", 3)], "chest": [("Z", 8)], "head": [("X", 8), ("Z", -6)], "cape.1": [("X", -30)], "cape.2": [("X", -16)]}
    wd_action(rig, "run", [(0, passR), (4, strideR), (8, wd_mirror(passR)), (12, wd_mirror(strideR)), (16, passR)])
    # strike: 0.46 s like rt.strikeInfo (wind-up to 0.18, hit at 0.23, settled at 0.46);
    # the body's turn, lean and lunge come from the code rig
    wind = {"upperArm.R": [("X", 150), ("Y", -10)], "forearm.R": [("X", 55)], "hand.R": [("X", -25)],
            "upperArm.L": [("X", 55)], "forearm.L": [("X", 65)], "chest": [("Z", -12), ("X", 3)], "spine": [("Z", -6)],
            "head": [("Z", 10)], "thigh.R": [("X", -10)], "thigh.L": [("X", 14)], "shin.L": [("X", -10)], "cape.1": [("X", -8)]}
    hit = {"upperArm.R": [("X", 60), ("Y", 22)], "forearm.R": [("X", 12)], "hand.R": [("X", 10)],
           "upperArm.L": [("X", 25)], "forearm.L": [("X", 50)], "chest": [("Z", 14), ("X", -6)], "spine": [("Z", 8), ("X", -4)],
           "head": [("Z", -8)], "thigh.R": [("X", 30)], "shin.R": [("X", -16)], "thigh.L": [("X", -18)], "cape.1": [("X", -16)]}
    wd_action(rig, "strike", [(0, {}), (5.4, wind), (6.9, hit), (9, hit), (13.8, {})])
    # hearth: both arms to the sky, the head lifted, a slow sway (2 s loop)
    sky = {"upperArm.L": [("X", 165), ("Y", -10)], "upperArm.R": [("X", 165), ("Y", 10)], "forearm.L": [("X", 6)], "forearm.R": [("X", 6)],
           "hand.L": [("X", 20)], "hand.R": [("X", 20)], "head": [("X", 16)], "chest": [("X", 5)], "cape.1": [("X", -6)]}
    sky2 = {"upperArm.L": [("X", 170), ("Y", -14)], "upperArm.R": [("X", 170), ("Y", 14)], "forearm.L": [("X", 2)], "forearm.R": [("X", 2)],
            "hand.L": [("X", 26)], "hand.R": [("X", 26)], "head": [("X", 20)], "chest": [("X", 7)], "cape.1": [("X", -10)]}
    wd_action(rig, "hearth", [(0, sky), (30, sky2), (60, sky)])
    # mend: hands drawn in to the chest, head bowed, breathing (1.6 s loop)
    pray = {"upperArm.L": [("X", 42), ("Y", -22)], "upperArm.R": [("X", 42), ("Y", 22)], "forearm.L": [("X", 100)], "forearm.R": [("X", 100)],
            "head": [("X", -16)], "spine": [("X", -5)], "chest": [("X", -3)]}
    pray2 = {"upperArm.L": [("X", 46), ("Y", -24)], "upperArm.R": [("X", 46), ("Y", 24)], "forearm.L": [("X", 106)], "forearm.R": [("X", 106)],
             "head": [("X", -19)], "spine": [("X", -6)], "chest": [("X", -1)]}
    wd_action(rig, "mend", [(0, pray), (24, pray2), (48, pray)])
    # flinch: knocked back from a hit and recovering (0.3 s)
    jolt = {"spine": [("X", 9)], "chest": [("X", 6)], "head": [("X", 14), ("Z", 6)], "upperArm.L": [("X", 22)], "upperArm.R": [("X", 18)],
            "forearm.L": [("X", 40)], "forearm.R": [("X", 35)], "thigh.L": [("X", -8)], "shin.L": [("X", -12)], "cape.1": [("X", -14)]}
    wd_action(rig, "flinch", [(0, {}), (2, jolt), (9, {})])
    for b in rig.pose.bones:
        b.rotation_quaternion = (1, 0, 0, 0)
    return [t.name for t in rig.animation_data.nla_tracks]


def render_clips(frames=None, out_dir=None, w=520, h=640):
    """Workbench renders of the Warden clips at chosen frames, for a contact sheet."""
    out_dir = out_dir or os.path.join(REPO, "shots", "heroes", "clips")
    os.makedirs(out_dir, exist_ok=True)
    frames = frames or [("idle", 45), ("walk", 6), ("walk", 12), ("run", 4), ("strike", 5), ("strike", 7),
                        ("hearth", 30), ("mend", 24), ("flinch", 2)]
    scn = bpy.data.scenes["gm_warden"]
    bpy.context.window.scene = scn
    rig = scn.objects["wd_rig"]
    gear = scn.objects["wd_gear"]
    scn.objects["wd_base"].hide_render = True
    rig.hide_render = True
    gear.data.color_attributes.active_color = gear.data.color_attributes["base"]
    # preview colours: paint the slot codes with the heirloom look
    pal = hero_palette(PREVIEW_OUTFITS[1][1])
    if "preview" in gear.data.color_attributes:
        gear.data.color_attributes.remove(gear.data.color_attributes["preview"])
    src = gear.data.color_attributes["Col"].data
    n = len(src)
    vals = [0.0] * (n * 4)
    src.foreach_get("color", vals)
    out = []
    for i in range(n):
        slot = HERO_SLOTS[min(15, int(vals[i * 4] * 16))]
        c = hexc(pal[slot])
        k = vals[i * 4 + 1]
        out += (c[0] * k, c[1] * k, c[2] * k, 1.0)
    pv = gear.data.color_attributes.new("preview", 'FLOAT_COLOR', 'CORNER')
    pv.data.foreach_set("color", out)
    gear.data.color_attributes.active_color = pv
    scn.render.engine = 'BLENDER_WORKBENCH'
    sh = scn.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'VERTEX'
    sh.show_shadows = True
    scn.render.resolution_x, scn.render.resolution_y = w, h
    if scn.world is None:
        scn.world = bpy.data.worlds.new("hm_world")
    scn.world.color = (0.08, 0.09, 0.1)
    cam = bpy.data.objects.get("wd_cam")
    if cam is None:
        cam = bpy.data.objects.new("wd_cam", bpy.data.cameras.new("wd_cam"))
        scn.collection.objects.link(cam)
    scn.camera = cam
    target = Vector((0, 0, 1.05))
    yaw = math.radians(230)
    cam.location = target + Vector((-math.sin(yaw) * 4.6, -math.cos(yaw) * 4.6, 0.6))
    cam.rotation_euler = (target - cam.location).normalized().to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 50
    rig.animation_data.use_nla = False
    files = []
    for name, f in frames:
        rig.animation_data.action = bpy.data.actions[name]
        scn.frame_set(int(f))
        path = os.path.join(out_dir, "%s-%02d.png" % (name, int(f)))
        scn.render.filepath = path
        bpy.ops.render.render(write_still=True)
        files.append(path)
    rig.animation_data.action = None
    rig.animation_data.use_nla = True
    gear.data.color_attributes.active_color = gear.data.color_attributes["Col"]
    return files
