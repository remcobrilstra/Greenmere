# Villager part library for view/townfolk.js, exec'd into greenmere.py's namespace.
#
#   g["build_villagers"]()      -> assets/models/villager.glb
#
# Every part is authored once in villager body space (y up, forward -z, feet at
# y = 0, the rig of view/townfolk.js: legs pivot at (+-0.15, 0.53), arms at
# (+-0.4, 1.33)). Vertex colour R holds a colour *slot* ((slot + 0.5) / 16) and
# G a baked shade (ambient occlusion), so one library paints every villager
# from their `look`. Objects are "vp_<part>".

SLOTS = ["tunic", "tunicDark", "trim", "skin", "hair", "leather", "boots", "eye", "linen", "apron",
         "trousers", "hat", "gold", "lip", "skinShade", "white"]

class Raw(tuple):
    pass

def slot(name):
    return Raw(((SLOTS.index(name) + 0.5) / 16, 1.0, 0.0))

_pick = Kit.pick
def _pick_raw(self, pal):
    if isinstance(pal, Raw):
        return pal
    return _pick(self, pal)
Kit.pick = _pick_raw

_emit = Kit._emit
def _emit_raw(self, role, pts, faces, col, labels, skip):
    if isinstance(col, Raw):
        R = self.role(role)
        base = len(R["v"])
        R["v"].extend(pts)
        for f, lab in zip(faces, labels):
            if lab in skip:
                continue
            R["f"].append(tuple(base + i for i in f))
            R["c"].append(list(col))
        return
    _emit(self, role, pts, faces, col, labels, skip)
Kit._emit = _emit_raw

def sphere(kit, role, r, col, x, y, z, sx=1, sy=1, sz=1, seg=10, rings=7, lon=None, lat=None, rx=0):
    """UV sphere; lon=(a0, a1) keeps a longitude range (radians, 0 = +x, pi/2 = -z), lat=(t0, t1) a latitude band (0 top .. 1 bottom)."""
    m = kit.xf(x, y, z, 0, rx) @ Matrix.Diagonal((sx * r, sy * r, sz * r, 1))
    a0, a1 = lon or (0, 2 * math.pi)
    t0, t1 = lat or (0, 1)
    full = lon is None
    nl = seg if full else max(2, round(seg * (a1 - a0) / (2 * math.pi)))
    verts = []
    for j in range(rings + 1):
        t = t0 + (t1 - t0) * j / rings
        ph = t * math.pi
        for i in range(nl + (0 if full else 1)):
            a = a0 + (a1 - a0) * i / nl
            verts.append(m @ Vector((math.sin(ph) * math.cos(a), math.cos(ph), -math.sin(ph) * math.sin(a))))
    cols = nl if full else nl + 1
    faces = []
    for j in range(rings):
        for i in range(nl):
            a = j * cols + i
            b = j * cols + (i + 1) % cols if full else j * cols + i + 1
            c = b + cols
            d = a + cols
            faces.append((a, d, c, b))
    kit._emit(role, verts, faces, col, ["side"] * len(faces), ())

def oval(kit, role, rt, rb, h, col, y, sz=0.68, seg=10, x=0.0, z=0.0, rx=0.0):
    old = kit.frame
    kit.frame = old @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Diagonal((1, 1, sz, 1))
    kit.cylr(role, rt, rb, h, seg, col, 0, 0, 0)
    kit.frame = old

S = slot

def part_body(kit):
    # Torso: an oval taper, broader at the shoulders, a collar and a laced front.
    oval(kit, "torso", 0.33, 0.27, 0.62, S("tunic"), 1.08, 0.66)
    for s in (-1, 1):
        sphere(kit, "torso", 0.15, S("tunic"), s * 0.3, 1.3, 0.0, 1, 0.8, 1, seg=8, rings=5)
    oval(kit, "torso", 0.2, 0.25, 0.07, S("trim"), 1.415, 0.8)
    kit.prism("torso", [(0.07, 1.39), (-0.07, 1.39), (0.0, 1.27)], -0.215, -0.2, S("skinShade"))
    for k in range(3):
        kit.box("torso", 0.09, 0.015, 0.02, S("leather"), 0, 1.24 - k * 0.07, -0.205)
    # Lower tunic, flaring over the hips, with a hem band.
    oval(kit, "torso", 0.29, 0.37, 0.3, S("tunic"), 0.63, 0.72)
    oval(kit, "torso", 0.375, 0.38, 0.05, S("trim"), 0.495, 0.72)
    # Belt, buckle and pouch.
    oval(kit, "torso", 0.3, 0.3, 0.075, S("leather"), 0.78, 0.7)
    kit.box("torso", 0.09, 0.08, 0.02, S("gold"), 0, 0.78, -0.215)
    kit.box("torso", 0.12, 0.13, 0.08, S("leather"), 0.26, 0.69, -0.1, ry=0.5)
    # Neck and head.
    kit.cylr("torso", 0.085, 0.095, 0.14, 8, S("skinShade"), 0, 1.47, 0)
    sphere(kit, "torso", 0.25, S("skin"), 0, 1.68, 0, 1, 1.04, 0.96)
    kit.box("torso", 0.07, 0.1, 0.09, S("skinShade"), 0, 1.65, -0.245, rx=0.25)
    kit.box("torso", 0.06, 0.03, 0.05, S("skin"), 0, 1.6, -0.27)
    for s in (-1, 1):
        sphere(kit, "torso", 0.055, S("skinShade"), s * 0.245, 1.67, 0.01, 0.6, 1, 0.9, seg=6, rings=4)
        kit.box("torso", 0.045, 0.055, 0.03, S("eye"), s * 0.085, 1.705, -0.226)
        kit.box("torso", 0.016, 0.016, 0.01, S("white"), s * 0.085 + 0.01, 1.715, -0.242)
        kit.box("torso", 0.09, 0.022, 0.03, S("hair"), s * 0.09, 1.77, -0.222, rz=-s * 0.12)
    kit.box("torso", 0.08, 0.016, 0.02, S("lip"), 0, 1.565, -0.228)

def part_hair_short(kit, role="hair_short"):
    sphere(kit, role, 0.265, S("hair"), 0, 1.71, 0.035, 1, 0.92, 1, lat=(0, 0.58))
    for k in range(4):
        kit.box(role, 0.12, 0.06, 0.07, S("hair"), -0.15 + k * 0.1, 1.84 - abs(k - 1.5) * 0.015, -0.17 + abs(k - 1.5) * 0.025, rz=(k - 1.5) * 0.2, rx=0.5)
    for s in (-1, 1):
        kit.box(role, 0.035, 0.1, 0.07, S("hair"), s * 0.228, 1.69, -0.06, rz=s * 0.1)
    sphere(kit, role, 0.24, S("hair"), 0, 1.62, 0.07, 1, 0.9, 1, lat=(0.45, 0.75))

def part_hair_long(kit):
    part_hair_short(kit, "hair_long")
    for s in (-1, 1):
        kit.box("hair_long", 0.09, 0.42, 0.14, S("hair"), s * 0.22, 1.5, 0.08, rz=s * 0.05)
    kit.box("hair_long", 0.4, 0.5, 0.1, S("hair"), 0, 1.44, 0.18, rx=0.12)
    kit.box("hair_long", 0.3, 0.1, 0.08, S("hair"), 0, 1.2, 0.2, rx=0.2)

def part_hair_bun(kit):
    part_hair_short(kit, "hair_bun")
    sphere(kit, "hair_bun", 0.12, S("hair"), 0, 1.88, 0.16, seg=8, rings=5)
    kit.cylr("hair_bun", 0.08, 0.08, 0.04, 8, S("trim"), 0, 1.84, 0.14, rx=-0.6)

def part_beard(kit):
    pts = [(-0.19, 1.6), (-0.1, 1.55), (0.1, 1.55), (0.19, 1.6), (0.14, 1.47), (0.05, 1.37), (-0.05, 1.37), (-0.14, 1.47)]
    kit.prism("beard", list(reversed(pts)), -0.235, -0.05, S("hair"))
    for s in (-1, 1):
        kit.box("beard", 0.12, 0.04, 0.05, S("hair"), s * 0.07, 1.585, -0.245, rz=s * 0.25)

def part_hat_cap(kit):
    oval(kit, "hat_cap", 0.24, 0.275, 0.11, S("trim"), 1.9, 1.0, seg=12, z=0.02)
    sphere(kit, "hat_cap", 0.24, S("trim"), 0, 1.94, 0.02, 1, 0.35, 1, lat=(0, 0.5))
    kit.box("hat_cap", 0.28, 0.025, 0.14, S("trim"), 0, 1.86, -0.27, rx=0.15)
    kit.box("hat_cap", 0.02, 0.05, 0.02, S("tunicDark"), 0, 2.03, 0.02)

def part_hat_brim(kit):
    kit.cylr("hat_brim", 0.44, 0.44, 0.035, 14, S("hat"), 0, 1.86, 0.01)
    kit.cylr("hat_brim", 0.19, 0.23, 0.24, 10, S("hat"), 0, 1.99, 0.01)
    kit.cylr("hat_brim", 0.235, 0.235, 0.05, 10, S("trim"), 0, 1.9, 0.01)
    kit.box("hat_brim", 0.05, 0.12, 0.02, S("gold"), 0.12, 1.9, -0.19, ry=0.5)

def part_hat_hood(kit):
    # Cowl round the back and sides of the head, a point that falls back, a mantle on the shoulders.
    sphere(kit, "hat_hood", 0.31, S("tunic"), 0, 1.7, 0.05, 1, 1.02, 1.02, lon=(math.pi * 0.75, math.pi * 2.25), lat=(0.02, 0.72))
    kit.cone("hat_hood", 0.16, 0.34, 6, S("tunic"), 0, 1.9, 0.27, rx=1.1)
    sphere(kit, "hat_hood", 0.315, S("tunicDark"), 0, 1.7, 0.05, 1, 1.02, 1.02, lon=(math.pi * 0.73, math.pi * 0.8), lat=(0.02, 0.72))
    sphere(kit, "hat_hood", 0.315, S("tunicDark"), 0, 1.7, 0.05, 1, 1.02, 1.02, lon=(math.pi * 2.2, math.pi * 2.27), lat=(0.02, 0.72))
    oval(kit, "hat_hood", 0.24, 0.42, 0.18, S("tunic"), 1.36, 0.72, seg=12)
    oval(kit, "hat_hood", 0.425, 0.43, 0.04, S("trim"), 1.27, 0.72, seg=12)

def part_hat_kerchief(kit):
    sphere(kit, "hat_kerchief", 0.275, S("trim"), 0, 1.73, 0.04, 1, 0.95, 1.02, lat=(0, 0.4))
    # a band in the tunic colour where the cloth folds over the brow
    sphere(kit, "hat_kerchief", 0.282, S("tunic"), 0, 1.73, 0.04, 1, 0.95, 1.02, lat=(0.36, 0.44))
    kit.box("hat_kerchief", 0.46, 0.05, 0.05, S("tunic"), 0, 1.835, -0.18, rx=0.35)
    for s in (-1, 1):
        kit.box("hat_kerchief", 0.08, 0.16, 0.03, S("trim"), s * 0.05, 1.6, 0.27, rz=s * 0.35, rx=-0.3)
    sphere(kit, "hat_kerchief", 0.05, S("trim"), 0, 1.7, 0.27, seg=6, rings=4)
    for k in range(5):
        kit.box("hat_kerchief", 0.03, 0.03, 0.01, S("linen"), -0.16 + k * 0.08, 1.88 - abs(k - 2) * 0.03, -0.16 + abs(k - 2) * 0.03)

def part_dress(kit):
    oval(kit, "dress", 0.36, 0.5, 0.52, S("tunic"), 0.36, 0.8, seg=12)
    oval(kit, "dress", 0.5, 0.51, 0.06, S("trim"), 0.12, 0.8, seg=12)
    oval(kit, "dress", 0.505, 0.505, 0.02, S("tunicDark"), 0.17, 0.8, seg=12)

def part_apron(kit):
    kit.prism("apron", [(-0.2, 0.42), (0.2, 0.42), (0.21, 0.8), (-0.21, 0.8)], -0.268, -0.248, S("apron"))
    kit.box("apron", 0.4, 0.03, 0.025, S("tunicDark"), 0, 0.44, -0.26)
    kit.box("apron", 0.16, 0.1, 0.012, S("tunicDark"), 0.07, 0.66, -0.272)
    kit.prism("apron", [(-0.13, 0.8), (0.13, 0.8), (0.15, 1.3), (-0.15, 1.3)], -0.236, -0.22, S("apron"))
    for s in (-1, 1):
        kit.box("apron", 0.04, 0.32, 0.03, S("apron"), s * 0.13, 1.37, -0.12, rx=0.6)
        kit.box("apron", 0.04, 0.12, 0.02, S("apron"), s * 0.1, 0.72, 0.24, rz=s * 0.3)

def part_arm(kit, s):
    role = "arm_" + ("l" if s < 0 else "r")
    x = s * 0.4
    kit.cylr(role, 0.1, 0.09, 0.3, 8, S("tunic"), x, 1.2, 0)
    kit.cylr(role, 0.1, 0.1, 0.06, 8, S("trim"), x, 1.04, 0)
    kit.cylr(role, 0.07, 0.065, 0.2, 8, S("skin"), x, 0.94, 0)
    kit.box(role, 0.1, 0.13, 0.12, S("skin"), x, 0.8, -0.01)
    kit.box(role, 0.04, 0.07, 0.05, S("skin"), x - s * 0.06, 0.83, -0.05, rz=-s * 0.3)
    kit.box(role, 0.09, 0.04, 0.11, S("skinShade"), x, 0.73, -0.01)

def part_leg(kit, s):
    role = "leg_" + ("l" if s < 0 else "r")
    x = s * 0.15
    kit.cylr(role, 0.12, 0.105, 0.3, 8, S("trousers"), x, 0.39, 0)
    kit.cylr(role, 0.115, 0.115, 0.04, 8, S("boots"), x, 0.23, 0)
    kit.cylr(role, 0.105, 0.1, 0.18, 8, S("boots"), x, 0.13, 0)
    kit.box(role, 0.17, 0.09, 0.28, S("boots"), x, 0.045, -0.04)
    sphere(kit, role, 0.085, S("boots"), x, 0.06, -0.17, 1, 0.6, 1, seg=8, rings=4)
    kit.box(role, 0.18, 0.025, 0.3, S("leather"), x, 0.012, -0.04)

VILLAGER_PARTS = {
    "torso": (part_body, None),
    "hair_short": (part_hair_short, "hair"), "hair_long": (part_hair_long, "hair"), "hair_bun": (part_hair_bun, "hair"),
    "beard": (part_beard, "beard"),
    "hat_cap": (part_hat_cap, "hat"), "hat_brim": (part_hat_brim, "hat"), "hat_hood": (part_hat_hood, "hat"),
    "hat_kerchief": (part_hat_kerchief, "hat"),
    "dress": (part_dress, "dress"), "apron": (part_apron, "apron"),
}

def generate_villager_parts():
    kit = Kit(0)
    kit.r = random.Random(0x5eed)
    for name, (fn, _) in VILLAGER_PARTS.items():
        kit.frame = Matrix.Identity(4)
        fn(kit)
    for s in (-1, 1):
        part_arm(kit, s)
        part_leg(kit, s)
    return kit

def build_villagers(export=True, bake=True, samples=128):
    kit = generate_villager_parts()
    scn = scene_for("villager")
    objs = {}
    for role, R in kit.roles.items():
        if R["f"]:
            objs[role] = to_object("vp_" + role, R, scn.collection)
    groups = {name: grp for name, (_, grp) in VILLAGER_PARTS.items()}
    base = {"torso", "arm_l", "arm_r", "leg_l", "leg_r"}
    if bake:
        for role, ob in objs.items():
            # Bake each part on the bare body, with only itself from its group present.
            for r2, o2 in objs.items():
                show = r2 in base or r2 == role or (r2 == "hair_short" and groups.get(role) == "hat")
                o2.hide_render = not show
            bake_slot_ao(scn, ob, samples)
        for o in objs.values():
            o.hide_render = False
    else:
        for o in objs.values():
            o.data.color_attributes.active_color = o.data.color_attributes["base"]
    line = {"id": "villager", "parts": len(objs), "faces": sum(len(o.data.polygons) for o in objs.values())}
    if export:
        p, size = write_glb(scn, list(objs.values()), "villager")
        line["kb"] = round(size / 1024)
    return line

def bake_slot_ao(scn, ob, samples):
    """AO into G of the slot colours (R slot, G shade, B 0)."""
    bpy.context.window.scene = scn
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
    scn.world.light_settings.distance = 0.25
    for o in scn.collection.all_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    n = len(me.color_attributes["base"].data)
    bc = [0.0] * (n * 4); me.color_attributes["base"].data.foreach_get("color", bc)
    ac = [0.0] * (n * 4); me.color_attributes["ao"].data.foreach_get("color", ac)
    out = [0.0] * (n * 4)
    for i in range(n):
        out[i * 4] = bc[i * 4]
        out[i * 4 + 1] = 0.5 + 0.5 * (max(0.0, ac[i * 4]) ** 0.8)
        out[i * 4 + 3] = 1.0
    if "Col" in me.color_attributes:
        me.color_attributes.remove(me.color_attributes["Col"])
    col = me.color_attributes.new("Col", 'FLOAT_COLOR', 'CORNER')
    col.data.foreach_set("color", out)
    me.color_attributes.active_color = col

# ---------------------------------------------------------------- preview

PREVIEW_LOOKS = [
    dict(tunic=0x7a4a8c, trim=0xe7d7b4, skin=0xe0a878, hair=0x8a5a3a, hat="kerchief", apron=0xe7d7b4, height=0.94),
    dict(tunic=0x5a3a24, trim=0x2c3036, skin=0xc68a5c, hair=0x2a1c14, hat="none", apron=0x3a2416, beard=True, height=1.04),
    dict(tunic=0x3e6e4a, trim=0xd4a03a, skin=0xe8b88a, hair=0xd8d0c0, hat="hood", height=0.92),
    dict(tunic=0x2f363e, trim=0xd4a03a, skin=0xe8b88a, hair=0xb8b2a4, hat="cap", height=0.97),
    dict(tunic=0x3e9a36, trim=0xd4a03a, skin=0xf0c49a, hair=0x1c1410, hat="long", dress=True, height=0.95),
    dict(tunic=0x6b4428, trim=0x3a2416, skin=0xc68a5c, hair=0x2a1c14, hat="brim", beard=True, height=1.03),
    dict(tunic=0x7a4a8c, trim=0xd4a03a, skin=0xb07a50, hair=0x1c1410, hat="bun", dress=True, height=0.92),
    dict(tunic=0xd4a03a, trim=0x6b4428, skin=0xe8b88a, hair=0xb06a2a, hat="none", height=0.66),
]

def look_parts(look):
    """Part list for a look; mirrors partsFor() in view/townfolk.js."""
    hat = look.get("hat", "none")
    parts = ["torso", "arm_l", "arm_r", "leg_l", "leg_r"]
    parts.append({"long": "hair_long", "bun": "hair_bun", "hood": None}.get(hat, "hair_short"))
    if hat in ("cap", "brim", "hood", "kerchief"):
        parts.append("hat_" + hat)
    for k in ("dress", "apron", "beard"):
        if look.get(k):
            parts.append(k)
    return [p for p in parts if p]

def look_palette(look):
    def sh(h, k):
        return shade(h, k)
    skin = look["skin"]
    return {
        "tunic": look["tunic"], "tunicDark": sh(look["tunic"], 0.7), "trim": look["trim"], "skin": skin,
        "hair": look["hair"], "leather": 0x5a3a24, "boots": 0x2e2420, "eye": 0x1a1a1a, "linen": 0xf4e7c8,
        "apron": look.get("apron") or 0xe7d7b4, "trousers": sh(look["tunic"], 0.45), "hat": 0x5a3a24,
        "gold": 0xd4a03a, "lip": mix(skin, 0x8e3a2e, 0.35), "skinShade": sh(skin, 0.88), "white": 0xf4f0e8,
    }

def preview_villagers(looks=None):
    looks = looks or PREVIEW_LOOKS
    src = bpy.data.scenes["gm_villager"]
    scn = scene_for("villager_preview")
    for i, look in enumerate(looks):
        pal = {k: hexc(v) for k, v in look_palette(look).items()}
        for p in look_parts(look):
            ob = bpy.data.objects["vp_" + p]
            me = ob.data.copy()
            col = me.color_attributes.active_color
            n = len(col.data)
            buf = [0.0] * (n * 4)
            col.data.foreach_get("color", buf)
            for j in range(n):
                sl = SLOTS[min(15, int(buf[j * 4] * 16))]
                c = pal[sl]
                k = buf[j * 4 + 1]
                buf[j * 4], buf[j * 4 + 1], buf[j * 4 + 2] = c[0] * k, c[1] * k, c[2] * k
            col.data.foreach_set("color", buf)
            o = bpy.data.objects.new("pv_%d_%s" % (i, p), me)
            o.location = ((i - len(looks) / 2) * 0.9, 0, 0)
            s = look.get("height", 1)
            o.scale = (s, s, s)
            scn.collection.objects.link(o)
    bpy.context.window.scene = scn
    return scn
