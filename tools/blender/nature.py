# Nature library for view/town.js, exec'd into greenmere.py's namespace.
#
#   g["build_nature"]()      -> assets/models/nature.glb
#
# Each object "nat_<name>" replaces one instanced geometry of the town's scatter
# (instance tints still multiply its vertex colours). Pieces are centred like
# the code-built geometry they replace, so placement, scale and colliders hold:
#   rock0..2  boulders about 0.8 across, upright (mossy tops)
#   bush      a leafy clump about 1.8 x 0.9 x 1.7, centred on the origin
#   flower0..4, grass, mushroom    stand on y = 0

MOSS = [0x4f6b38, 0x5c7a3e, 0x46602f]
ROCK = [0x7d8288, 0x8a8f93, 0x72777c, 0x868a84, 0x6e7377]
LEAVES = [0x3f7a32, 0x4a8a38, 0x36692b, 0x548f3c, 0x2f5f28]

def icosphere(subdiv):
    t = (1 + 5 ** 0.5) / 2
    v = [Vector(p).normalized() for p in [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
                                           (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]]
    f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
         (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    for _ in range(subdiv):
        cache = {}
        def mid(a, b):
            key = (min(a, b), max(a, b))
            if key not in cache:
                v.append(((v[a] + v[b]) / 2).normalized())
                cache[key] = len(v) - 1
            return cache[key]
        nf = []
        for a, b, c in f:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        f = nf
    return v, f

def blob(kit, role, r, colfn, x, y, z, sx=1, sy=1, sz=1, noise=0.25, subdiv=1, flat=None, seed=0):
    """Closed, noisy icosphere. colfn(normal, pos) -> hex per face. flat: clamp y below this (local units)."""
    rr = random.Random(seed)
    v, f = icosphere(subdiv)
    pts = []
    for p in v:
        k = 1 + rr.uniform(-noise, noise)
        q = Vector((p.x * k * sx, p.y * k * sy, p.z * k * sz)) * r
        if flat is not None and q.y < flat * r * sy:
            q.y = flat * r * sy + (q.y - flat * r * sy) * 0.15
        pts.append(kit.frame @ Vector((q.x + x, q.y + y, q.z + z)))
    R = kit.role(role)
    base = len(R["v"])
    R["v"].extend(pts)
    for a, b, c in f:
        n = (pts[b] - pts[a]).cross(pts[c] - pts[a]).normalized()
        cen = (pts[a] + pts[b] + pts[c]) / 3
        R["f"].append((base + a, base + b, base + c))
        R["c"].append(hexc(colfn(n, cen)))

def rock_col(kit, moss_from=0.55):
    def fn(n, p):
        if n.y > moss_from and kit.r.random() < 0.85:
            return kit.pick(MOSS)
        return kit.pick(ROCK)
    return fn

def build_nature_parts(kit):
    # rock0: a rounded boulder
    blob(kit, "rock0", 0.8, rock_col(kit), 0, 0, 0, 1.0, 0.82, 0.95, noise=0.22, flat=-0.55, seed=1)
    # rock1: a split slab leaning on a smaller stone
    blob(kit, "rock1", 0.62, rock_col(kit, 0.6), -0.1, 0.05, 0, 1.15, 1.0, 0.75, noise=0.18, flat=-0.6, seed=2)
    blob(kit, "rock1", 0.36, rock_col(kit), 0.5, -0.12, 0.2, 1, 0.8, 1, noise=0.25, flat=-0.5, seed=3)
    # rock2: a low cluster of three
    for k, (x, z, r) in enumerate([(-0.3, -0.1, 0.5), (0.35, 0.05, 0.42), (0.0, 0.42, 0.3)]):
        blob(kit, "rock2", r, rock_col(kit), x, -0.15 + r * 0.3, z, 1, 0.75, 1, noise=0.28, flat=-0.45, seed=10 + k)
    # bush: leafy blobs, darker underneath, a few berries
    def leaf(n, p):
        c = kit.pick(LEAVES)
        return shade(c, 0.78) if n.y < -0.3 else c
    for k in range(7):
        a = k / 7 * math.pi * 2
        rr = 0.38 + (k % 3) * 0.06
        blob(kit, "bush", rr, leaf, math.cos(a) * 0.48, 0.02 + (k % 2) * 0.08, math.sin(a) * 0.42, 1.1, 0.8, 1.1, noise=0.3, seed=20 + k)
    blob(kit, "bush", 0.5, leaf, 0, 0.18, 0, 1.2, 0.85, 1.15, noise=0.3, seed=30)
    for k in range(9):
        a = kit.r.uniform(0, math.pi * 2)
        kit.ball("bush", 0.05, [0xc4473a, 0xe15a48, 0x7a4a8c], math.cos(a) * 0.62, kit.r.uniform(0.0, 0.32), math.sin(a) * 0.56)
    # flowers: stem, two leaves, five petals and a heart
    for i, hx in enumerate([0xffe14a, 0xfff6e4, 0xf2a3c2, 0xc7b0f0, 0xff8d6a]):
        role = "flower%d" % i
        kit.cylr(role, 0.018, 0.026, 0.3, 5, [0x2f7a32, 0x3d8f3a], 0, 0.15, 0)
        for s in (-1, 1):
            kit.box(role, 0.1, 0.012, 0.04, [0x3d8f3a], s * 0.05, 0.1 + (s > 0) * 0.05, 0, ry=s * 0.5, rz=s * 0.35)
        for k in range(5):
            a = k / 5 * math.pi * 2
            kit.box(role, 0.09, 0.02, 0.06, [hx, shade(hx, 0.92)], math.cos(a) * 0.06, 0.31, math.sin(a) * 0.06, ry=-a, rz=0.25)
        kit.cylr(role, 0.035, 0.035, 0.03, 6, [0xd4a03a if hx != 0xffe14a else 0xb87333], 0, 0.325, 0)
    # grass: nine tapered blades in a tuft
    for k in range(9):
        a = k / 9 * math.pi * 2 + kit.r.uniform(-0.2, 0.2)
        h = kit.r.uniform(0.3, 0.55)
        lean = kit.r.uniform(0.12, 0.35)
        kit.cone("grass", 0.04, h, 3, [0x67b84a, 0x8bc85a, 0x3e9a34, 0x7aa848],
                 math.cos(a) * 0.08, h / 2, math.sin(a) * 0.08, ry=-a, rz=lean)
    # mushroom: stem with a ring, a spotted cap
    kit.cylr("mushroom", 0.05, 0.07, 0.22, 6, [0xefe6d4], 0, 0.11, 0)
    kit.cylr("mushroom", 0.075, 0.075, 0.02, 6, [0xd9d0be], 0, 0.17, 0)
    kit.cylr("mushroom", 0.05, 0.19, 0.12, 8, [0xc4473a, 0xb63f33], 0, 0.27, 0)
    kit.cylr("mushroom", 0.19, 0.17, 0.03, 8, [0xefe6d4], 0, 0.205, 0)
    for k in range(5):
        a = k / 5 * math.pi * 2
        kit.box("mushroom", 0.035, 0.012, 0.035, [0xf4efe4], math.cos(a) * 0.1, 0.3, math.sin(a) * 0.1, rz=math.cos(a) * 0.5, rx=-math.sin(a) * 0.5)

def build_nature(export=True, bake=True, samples=128):
    kit = Kit(0)
    kit.r = random.Random(0x7a7)
    build_nature_parts(kit)
    build_glyphs_and_clouds(kit)
    build_trees(kit)
    scn = scene_for("nature")
    objs = []
    x = 0.0
    for role, R in kit.roles.items():
        if not R["f"]:
            continue
        o = to_object("nat_" + role, R, scn.collection)
        objs.append(o)
    if bake:
        # each piece alone on a ground plane, so it shades itself
        partner = {"nat_pineTrunk": "nat_pineCanopy", "nat_pineCanopy": "nat_pineTrunk",
                   "nat_decTrunk": "nat_decCanopy", "nat_decCanopy": "nat_decTrunk"}
        for o in objs:
            for o2 in objs:
                o2.hide_render = o2 is not o and partner.get(o.name) != o2.name
            tree = o.name in partner
            bake_ao(scn, o, None, strength=0.55 if tree else 0.45, gamma=0.8, distance=1.4 if tree else 0.6, samples=samples)
        for o in objs:
            o.hide_render = False
    else:
        for o in objs:
            o.data.color_attributes.active_color = o.data.color_attributes["base"]
    # lay them out for a look in the viewport (export uses object-local geometry)
    for i, o in enumerate(objs):
        o.location = ((i % 6) * 2.2 - 5.5, (i // 6) * 2.2, 0)
    line = {"id": "nature", "parts": len(objs), "faces": sum(len(o.data.polygons) for o in objs)}
    if export:
        for o in objs:
            o.location = (0, 0, 0)
        p, size = write_glb(scn, objs, "nature")
        line["kb"] = round(size / 1024)
        for i, o in enumerate(objs):
            o.location = ((i % 6) * 2.2 - 5.5, (i // 6) * 2.2, 0)
    return line

# ---------------------------------------------------------------- clouds and quest glyphs

def tube_arc(kit, role, R, r, a0, a1, segs, sides, col, cx, cy, cz=0.0):
    """A round tube bent along an arc in the xy plane, capped at both ends."""
    rings = []
    for i in range(segs + 1):
        a = a0 + (a1 - a0) * i / segs
        c = Vector((cx + math.cos(a) * R, cy + math.sin(a) * R, cz))
        out = Vector((math.cos(a), math.sin(a), 0))
        up = Vector((0, 0, 1))
        rings.append([kit.frame @ (c + out * (math.cos(2 * math.pi * k / sides) * r) + up * (math.sin(2 * math.pi * k / sides) * r)) for k in range(sides)])
    pts = [p for ring in rings for p in ring]
    faces = []
    for i in range(segs):
        for k in range(sides):
            a = i * sides + k
            b = i * sides + (k + 1) % sides
            faces.append((a, a + sides, b + sides, b))
    faces.append(tuple(range(sides)))
    faces.append(tuple(segs * sides + k for k in range(sides - 1, -1, -1)))
    kit._emit(role, pts, faces, col, ["side"] * len(faces), ())

def build_glyphs_and_clouds(kit):
    gold = [0xffd24a]
    # "!": a rounded, tapered bar over a round dot
    kit.cylr("qm_bang", 0.13, 0.075, 0.5, 8, gold, 0, 0.45, 0)
    blob(kit, "qm_bang", 0.13, lambda n, p: 0xffd24a, 0, 0.7, 0, 1, 0.55, 1, noise=0.0, subdiv=1)
    blob(kit, "qm_bang", 0.1, lambda n, p: 0xffd24a, 0, 0.0, 0, noise=0.0, subdiv=1)
    # "?": a smooth hook, a short tapered stem, a round dot
    tube_arc(kit, "qm_ask", 0.17, 0.065, -math.pi * 0.5, math.pi * 1.0, 12, 6, gold, 0, 0.55)
    kit.cylr("qm_ask", 0.06, 0.075, 0.22, 8, gold, 0, 0.31, 0)
    blob(kit, "qm_ask", 0.065, lambda n, p: 0xffd24a, -0.17, 0.55, 0, noise=0.0, subdiv=1)
    blob(kit, "qm_ask", 0.1, lambda n, p: 0xffd24a, 0, 0.0, 0, noise=0.0, subdiv=1)
    # clouds: overlapping puffs with a flat, shaded underside
    def sky(n, p):
        return 0xf7f8fb if n.y > -0.2 else 0xd9e0ea
    layouts = [
        [(-1.9, 0.0, 0.0, 1.0), (-0.7, 0.35, 0.2, 1.35), (0.7, 0.3, -0.1, 1.25), (1.9, 0.0, 0.1, 0.95), (0.0, 0.0, 0.6, 1.0)],
        [(-1.3, 0.0, 0.1, 1.05), (0.0, 0.4, 0.0, 1.4), (1.3, 0.05, -0.1, 1.1), (0.4, -0.05, 0.7, 0.85)],
    ]
    for i, lay in enumerate(layouts):
        for k, (x, y, z, r) in enumerate(lay):
            blob(kit, "cloud%d" % i, r, sky, x, y, z, 1.15, 0.8, 1.0, noise=0.12, subdiv=1, flat=-0.35, seed=60 + i * 10 + k)

# ---------------------------------------------------------------- trees

PINE = [0x1b5c32, 0x21743c, 0x2f8f45, 0x14532d, 0x256b38]
PINE_TIP = [0x3ea84a, 0x4fae4c]
BROAD = [0x2f8f45, 0x3ea84a, 0x4a9a3e, 0x67c85a, 0x21743c, 0x8ed15a]
BARK = [0x4a3020, 0x5a3a24, 0x3a2416]

def star_tier(kit, role, r, h, y, n, droop, colfn, seed):
    """A pine tier: a star-edged skirt (alternate long and short points), a cone to the top."""
    rr = random.Random(seed)
    ring = []
    for i in range(n * 2):
        a = i / (n * 2) * math.pi * 2 + rr.uniform(-0.05, 0.05)
        rad = r if i % 2 == 0 else r * 0.72
        ring.append(kit.frame @ Vector((math.cos(a) * rad, y - (droop if i % 2 == 0 else droop * 0.4), -math.sin(a) * rad)))
    apex = kit.frame @ Vector((rr.uniform(-0.04, 0.04), y + h, rr.uniform(-0.04, 0.04)))
    under = kit.frame @ Vector((0, y - droop * 0.2 + 0.18, 0))
    R = kit.role(role)
    base = len(R["v"])
    R["v"].extend(ring + [apex, under])
    m = len(ring)
    for i in range(m):
        j = (i + 1) % m
        for tri, up in (((i, j, m), True), ((j, i, m + 1), False)):
            p0, p1, p2 = (R["v"][base + k] for k in tri)
            nrm = (p1 - p0).cross(p2 - p0).normalized()
            R["f"].append(tuple(base + k for k in tri))
            R["c"].append(hexc(colfn(nrm, up)))

def build_trees(kit):
    # pine: four tiers on a straight trunk, the same height as the code pine (~5.3)
    def pine_col(n, up):
        if not up:
            return shade(kit.pick(PINE), 0.7)
        return kit.pick(PINE_TIP) if n.y > 0.6 and kit.r.random() < 0.35 else kit.pick(PINE)
    for k, (r, h, y) in enumerate([(1.75, 1.6, 1.55), (1.4, 1.5, 2.45), (1.05, 1.35, 3.3), (0.66, 1.2, 4.15)]):
        star_tier(kit, "pineCanopy", r, h, y, 7, 0.32 - k * 0.04, pine_col, 90 + k)
    kit.cylr("pineTrunk", 0.18, 0.4, 2.35, 7, BARK, 0, 1.175, 0)
    for k in range(4):
        a = k / 4 * math.pi * 2 + 0.3
        kit.box("pineTrunk", 0.16, 0.18, 0.5, BARK, math.cos(a) * 0.38, 0.06, -math.sin(a) * 0.38, ry=a + math.pi / 2, rx=0.25)
    # broadleaf: a crown of blobs over a flared trunk with two branch stubs
    def leaf_col(n, p):
        c = kit.pick(BROAD)
        if n.y < -0.35:
            return shade(c, 0.66)
        if n.y > 0.55 and kit.r.random() < 0.4:
            return mix(c, 0xb6e36a, 0.35)
        return c
    crown = [(0, 2.7, 0, 1.3, 1.3, 0.85, 1.15), (0.6, 3.35, 0.25, 0.9, 1, 1, 1), (-0.62, 3.15, -0.3, 0.78, 1, 0.95, 1),
             (0.15, 3.75, -0.45, 0.66, 1, 1, 1), (-0.35, 2.55, 0.65, 0.62, 1, 0.8, 1)]
    for k, (x, y, z, r, sx, sy, sz) in enumerate(crown):
        blob(kit, "decCanopy", r, leaf_col, x, y, z, sx, sy, sz, noise=0.2, subdiv=0 if k else 1, seed=120 + k)
    kit.cylr("decTrunk", 0.26, 0.5, 1.75, 7, BARK, 0, 0.875, 0)
    for k in range(5):
        a = k / 5 * math.pi * 2
        kit.box("decTrunk", 0.18, 0.2, 0.6, BARK, math.cos(a) * 0.45, 0.07, -math.sin(a) * 0.45, ry=a + math.pi / 2, rx=0.22)
    kit.cylr("decTrunk", 0.07, 0.14, 0.9, 6, BARK, 0.35, 1.85, 0.05, rz=-0.7)
    kit.cylr("decTrunk", 0.06, 0.12, 0.8, 6, BARK, -0.3, 1.8, -0.1, rz=0.65, rx=0.2)
