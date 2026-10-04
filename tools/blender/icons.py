# Item and ability icons, rendered from the same part library the Warden wears
# (hero.py) plus small props for supplies, materials and abilities. Exec'd into
# greenmere.py's namespace after hero.py.
#
#   g["build_icons"]()                 -> tools/blender/icons_out/<name>.png (every icon)
#   g["build_icons"](["weapon-r2-t1"]) -> just these
#   g["icon_names"]()                  -> the list of names
#
# Then `python tools/icons_pack.py` outlines them and packs assets/icons/icons.webp
# plus assets/icons/icons.json (name -> cell). src/ui/gearui.js draws from that sheet.
#
# Gear icons are named <slot>-heir, <slot>-r<rarity>-t<theme> (rarity 0-2), and
# <slot>-r3-t<theme>-g<relic> for relics; colours follow view/gearlook.js.

ICON_PX = 192
ICON_DIR = os.path.join(HERE, "icons_out")
ICON_SLOTS = ["weapon", "offhand", "head", "body", "feet", "trinket"]

# view/gearlook.js, kept in step by hand
GL_THEMES = [
    dict(cloth=0x3f7a3a, dark=0x284f26, leather=0x5a4a2a, glow=0x9be86a),
    dict(cloth=0x8a5230, dark=0x5a321c, leather=0x4a2c1a, glow=0xffb060),
    dict(cloth=0x51657c, dark=0x334152, leather=0x3c3c44, glow=0x8cc8ff),
    dict(cloth=0xa23c28, dark=0x6a2216, leather=0x4a2418, glow=0xff6a3a),
]
GL_TRIM = [0x7d838a, 0xb57d3e, 0xdde6ee, 0xffc84a]
GL_RELIC = [0x8ed15a, 0xb48cff, 0xffa040, 0x5ad8d0]
GL_HEIR = dict(tier="heirloom", rarity=0, cloth=0x2d62c8, dark=0x1c3f8c, leather=0x5a3a24, trim=0xd4a03a, steel=0xc5d0dc, glow=0)

def gear_look(rarity, theme, relic=0):
    t = GL_THEMES[theme]
    k = dict(tier=["plain", "fine", "rare", "relic"][rarity], rarity=rarity, cloth=t["cloth"], dark=t["dark"], leather=t["leather"],
             trim=GL_TRIM[rarity], steel=0xd8e2ec if rarity >= 2 else 0xa9b2bc, glow=t["glow"] if rarity >= 2 else 0)
    if rarity >= 3:
        k["glow"] = GL_RELIC[relic]
    return k

def gear_icon_specs():
    out = []
    for slot in ICON_SLOTS:
        out.append((slot + "-heir", slot, GL_HEIR))
        for r in range(3):
            for t in range(4):
                out.append(("%s-r%d-t%d" % (slot, r, t), slot, gear_look(r, t)))
        for t in range(4):
            for g in range(4):
                out.append(("%s-r3-t%d-g%d" % (slot, t, g), slot, gear_look(3, t, g)))
    return out

# Which outfit pieces make each slot's icon, and their pose (game space, y up, front -z).
SLOT_GROUPS = {"weapon": {"sword"}, "offhand": {"shield"}, "head": {"head"}, "feet": {"leg_l", "leg_r"},
               "body": {"body", "torso", "cape", "capeLow"}, "trinket": {"torso", "orbit"}}
SLOT_SKIP = {"head_base", "leg_base", "torso_base", "body_base", "arm_base", "head_cowl", "cape_upper", "cape_lower",
             "cape_lower_long", "cape_hem", "cape_hem_long", "arm_tunic"}

def T(x, y, z):
    return Matrix.Translation((x, y, z))
def Rx(a):
    return Matrix.Rotation(a, 4, 'X')
def Ry(a):
    return Matrix.Rotation(a, 4, 'Y')
def Rz(a):
    return Matrix.Rotation(a, 4, 'Z')

def slot_pieces(slot, k):
    """(piece, game matrix, glow) for one slot's icon."""
    rig = _rig()
    out = []
    for piece, group, glow in outfit_pieces(k):
        if piece in SLOT_SKIP or group not in SLOT_GROUPS[slot]:
            continue
        if slot == "body" and piece in ("necklace", "pendant", "pendant_big"):
            continue
        if slot == "trinket" and piece not in ("necklace", "pendant", "pendant_big", "orbit_charm"):
            continue
        if slot == "head":
            piece = piece.replace("_hood", "")
        if slot in ("weapon", "offhand", "head", "trinket"):
            M = Matrix.Identity(4)
            if piece in ("pendant", "pendant_big"):
                M = T(0, 0, -0.36) @ Matrix.Diagonal((2.4, 2.4, 2.4, 1)) @ T(0, 0, 0.36)
        else:
            M = rig[group]
        out.append((piece, M, glow))
    return out

# The whole icon's pose, applied over the pieces (game space).
SLOT_POSE = {
    "weapon": Ry(0.35) @ Rz(-math.pi / 4) @ Rx(math.pi / 2),
    "offhand": Ry(-0.45) @ Rx(0.12) @ Ry(-math.pi / 2),
    "head": Ry(0.4) @ Rx(0.55),
    "body": Ry(0.45) @ Rx(0.12),
    "feet": Ry(0.75) @ Rx(0.12),
    "trinket": Ry(0.25) @ Rx(-0.85),
}

# ---------------------------------------------------------------- props

def _flask(kit, name, liquid, glass=0xd8e6ee):
    m, g, gl = name + "__matte", name + "__glass", name + "__glow"
    sphere(kit, g, 0.36, glass, 0, 0.34, 0, seg=14, rings=9)
    sphere(kit, gl, 0.31, liquid, 0, 0.32, 0, seg=14, rings=9, sy=0.92)
    kit.cylr(g, 0.11, 0.13, 0.28, 10, glass, 0, 0.78, 0)
    kit.cylr(m, 0.15, 0.15, 0.05, 10, 0xb08a4a, 0, 0.66, 0)
    kit.cylr(m, 0.1, 0.085, 0.16, 8, 0x8a6a44, 0, 0.98, 0)
    ring(kit, m, 0.12, 0.018, 0xc89b48, 0, 0.9, 0, rx=math.pi / 2, segs=14, sides=4)

def _coins(kit, name):
    m = name + "__metal"
    r = random.Random(7)
    for i, (x, z, n) in enumerate([(0, 0, 6), (0.34, 0.12, 4), (-0.3, 0.16, 3)]):
        for j in range(n):
            kit.cylr(m, 0.22, 0.22, 0.06, 14, [0xffc84a, 0xe8b33a, 0xf6d36a][j % 3], x + r.uniform(-0.02, 0.02), 0.03 + j * 0.065, z + r.uniform(-0.02, 0.02))
    kit.cylr(m, 0.22, 0.22, 0.06, 14, 0xffc84a, 0.05, 0.05, -0.36, rx=1.2)

def _log(kit, name):
    m = name + "__matte"
    kit.cylr(m, 0.3, 0.32, 0.9, 9, 0x6b4428, 0, 0, 0, rz=math.pi / 2)
    kit.cylr(m, 0.27, 0.27, 0.02, 9, 0xb4542e, 0.46, 0, 0, rz=math.pi / 2)
    ring(kit, m, 0.16, 0.025, 0x8a3a20, 0.47, 0, 0, ry=math.pi / 2, segs=12, sides=4)
    kit.cylr(m, 0.05, 0.05, 0.02, 6, 0x5a2414, 0.475, 0, 0, rz=math.pi / 2)
    for a in (0.6, 2.4, 4.1):
        kit.box(m, 0.7, 0.04, 0.06, 0x52331e, -0.05, 0.3 * math.sin(a), 0.3 * math.cos(a), rx=a)

def _roots(kit, name):
    # A coil of twisted root cord, tied off.
    m = name + "__matte"
    cols = [0xa07a48, 0x8a6a3c, 0xb48a52]
    for i in range(5):
        restore = at(kit, 0, 0.06 * i, 0, rx=math.pi / 2)
        tube_arc(kit, m, 0.42 - 0.035 * (i % 2), 0.055, 0, 2 * math.pi, 20, 5, cols[i % 3], 0.02 * (i % 2), 0, 0)
        restore()
    kit.box(m, 0.16, 0.36, 0.16, 0x5a7a3a, 0.42, 0.12, 0)
    restore = at(kit, 0.5, -0.1, 0, rz=-0.5)
    tube_arc(kit, m, 0.3, 0.045, math.pi, math.pi * 1.6, 8, 5, 0x8a6a3c, 0.3, 0, 0)
    restore()

def _slag(kit, name):
    blob(kit, name + "__matte", 0.42, lambda n, p: 0x5a4a42 if n.y > 0 else 0x463a34, 0, 0, 0, sx=1.25, sy=0.8, noise=0.3, subdiv=1, seed=3)
    r = random.Random(11)
    for i in range(9):
        x, y = r.uniform(-0.38, 0.38), r.uniform(-0.16, 0.2)
        kit.box(name + "__glow", r.uniform(0.08, 0.22), 0.022, 0.05, [0xff7a2a, 0xffa040, 0xe8502a][i % 3], x, y, -0.47 + abs(x) * 0.3 + abs(y) * 0.2, rz=r.uniform(-1.4, 1.4))

def _emberglass(kit, name):
    g = name + "__glow"
    octa(kit, g, 0.32, 0xff8a3a, 0, 0.3, 0, 0.7, 1.6, 0.7)
    octa(kit, g, 0.2, 0xffb060, 0.3, 0.12, 0.05, 0.7, 1.4, 0.7, rz=-0.5)
    octa(kit, g, 0.18, 0xe8602a, -0.28, 0.08, 0.02, 0.7, 1.3, 0.7, rz=0.6)
    blob(kit, name + "__matte", 0.36, lambda *a: 0x3a3430, 0, -0.18, 0, sx=1.3, sy=0.45, noise=0.3, seed=5)

def _oil(kit, name):
    m, g, gl = name + "__matte", name + "__glass", name + "__glow"
    kit.cylr(g, 0.2, 0.24, 0.6, 10, 0xd8e6ee, 0, 0.3, 0)
    kit.cylr(gl, 0.18, 0.21, 0.42, 10, 0xe0a030, 0, 0.23, 0)
    kit.cylr(g, 0.1, 0.18, 0.12, 10, 0xd8e6ee, 0, 0.66, 0)
    kit.cylr(g, 0.09, 0.09, 0.18, 8, 0xd8e6ee, 0, 0.8, 0)
    kit.cylr(m, 0.085, 0.07, 0.16, 8, 0x8a6a44, 0, 0.94, 0)
    ring(kit, m, 0.235, 0.02, 0x6b4428, 0, 0.42, 0, rx=math.pi / 2, segs=14, sides=4)
    ring(kit, m, 0.235, 0.02, 0x6b4428, 0, 0.18, 0, rx=math.pi / 2, segs=14, sides=4)

def _kit(kit, name):
    m, me = name + "__matte", name + "__metal"
    kit.box(m, 0.9, 0.42, 0.5, 0x6b4a32, 0, 0.21, 0)
    kit.box(m, 0.92, 0.1, 0.52, 0x4a3020, 0, 0.44, 0)
    for x in (-0.25, 0.25):
        kit.box(m, 0.06, 0.45, 0.52, 0x3a2418, x, 0.22, 0)
    kit.box(me, 0.14, 0.12, 0.04, 0xd4a03a, 0, 0.32, -0.27)
    kit.cylr(m, 0.035, 0.035, 0.7, 6, 0x8a6a44, 0.1, 0.62, 0.05, rz=1.1)
    kit.box(me, 0.22, 0.1, 0.1, 0xa9b2bc, -0.2, 0.78, 0.05, rz=1.1)

def _flame(kit, name):
    m, g = name + "__matte", name + "__glow"
    for a in (0.0, 2.1, 4.2):
        kit.cylr(m, 0.07, 0.08, 0.8, 7, 0x6b4428, 0.12 * math.cos(a), 0.1, 0.12 * math.sin(a), ry=a, rz=1.25)
    for i in range(7):
        a = i / 7 * 2 * math.pi
        kit.box(m, 0.14, 0.1, 0.1, 0x8c8a84, 0.42 * math.cos(a), 0.0, 0.42 * math.sin(a), ry=a)
    kit.cone(g, 0.2, 0.62, 6, 0xffa040, 0, 0.45, 0)
    kit.cone(g, 0.12, 0.44, 6, 0xffe08a, 0.08, 0.38, -0.08)
    kit.cone(g, 0.11, 0.38, 6, 0xff6a2a, -0.1, 0.33, 0.05)

def _leaf(kit, name):
    g, m = name + "__glow", name + "__matte"
    pts = [(0, -0.5), (0.22, -0.25), (0.28, 0.05), (0.18, 0.32), (0, 0.55), (-0.18, 0.32), (-0.28, 0.05), (-0.22, -0.25)]
    kit.prism(g, pts, -0.03, 0.03, 0x7ad04a)
    kit.box(m, 0.03, 0.9, 0.08, 0x3c7a2a, 0, 0.0, -0.035)
    for s in (-1, 1):
        for k in range(3):
            kit.box(m, 0.2, 0.02, 0.07, 0x3c7a2a, s * 0.09, -0.15 + k * 0.18, -0.035, rz=s * 0.6)
    kit.cylr(m, 0.025, 0.025, 0.3, 5, 0x5a4a2a, 0, -0.6, 0)

def _crystal(kit, name):
    g = name + "__glow"
    octa(kit, g, 0.3, 0x6fb0ff, 0, 0, 0, 0.8, 1.4, 0.8)
    ring(kit, name + "__metal", 0.46, 0.03, 0xd4a03a, 0, 0, 0, rx=math.pi / 2 - 0.3, segs=20, sides=4)
    ring(kit, name + "__metal", 0.46, 0.03, 0xd4a03a, 0, 0, 0, rx=math.pi / 2 + 0.3, ry=1.2, segs=20, sides=4)

def _scroll(kit, name):
    m = name + "__matte"
    kit.box(m, 0.7, 0.9, 0.02, 0xe8d9b0, 0, 0, 0)
    for y in (0.47, -0.47):
        kit.cylr(m, 0.07, 0.07, 0.82, 8, 0xd8c8a0, 0, y, 0, rz=math.pi / 2)
        for s in (-1, 1):
            kit.cylr(m, 0.05, 0.05, 0.06, 8, 0x6b4428, s * 0.44, y, 0, rz=math.pi / 2)
    for k in range(4):
        kit.box(m, 0.5 - (k % 2) * 0.12, 0.03, 0.01, 0x5a4632, -0.03, 0.25 - k * 0.15, -0.015)
    sphere(kit, name + "__glow", 0.08, 0xb4402a, 0.18, -0.3, -0.02, sz=0.4)

def _candle(kit, name):
    m, me, g = name + "__matte", name + "__metal", name + "__glow"
    kit.cylr(me, 0.42, 0.36, 0.06, 16, 0xb57d3e, 0, 0.03, 0)
    ring(kit, me, 0.42, 0.03, 0xd4a03a, 0, 0.06, 0, rx=math.pi / 2, segs=20, sides=4)
    tube_arc(kit, me, 0.14, 0.03, -math.pi / 2, math.pi / 2, 8, 4, 0xd4a03a, 0.46, 0.18, 0)
    kit.cylr(m, 0.13, 0.14, 0.56, 10, 0xf0e4c4, 0, 0.34, 0)
    kit.cylr(m, 0.15, 0.13, 0.06, 10, 0xe4d4b0, 0.0, 0.6, 0)
    kit.box(m, 0.04, 0.16, 0.05, 0xf0e4c4, 0.12, 0.5, -0.08)
    kit.cylr(m, 0.01, 0.01, 0.06, 4, 0x2a1c12, 0, 0.66, 0)
    kit.cone(g, 0.07, 0.24, 6, 0xffc860, 0, 0.8, 0)
    kit.cone(g, 0.035, 0.12, 6, 0xfff0c0, 0, 0.75, 0)

PROPS = {
    "draught-hp": lambda kit, n: _flask(kit, n, 0xd8423a),
    "draught-mp": lambda kit, n: _flask(kit, n, 0x3b6fd0),
    "oil": _oil, "kit": _kit, "gold": _coins, "heartwood": _log, "rootfiber": _roots, "slag": _slag,
    "emberglass": _emberglass, "hearth": _flame, "mend": _leaf, "focus": _crystal, "quest": _scroll, "rest": _candle,
}
PROP_POSE = {
    "draught-hp": Ry(0.4) @ Rx(0.2), "draught-mp": Ry(0.4) @ Rx(0.2), "oil": Ry(0.5) @ Rx(0.25), "kit": Ry(0.6) @ Rx(0.4),
    "gold": Ry(0.3) @ Rx(0.45), "heartwood": Ry(0.9) @ Rx(0.3), "slag": Ry(0.5) @ Rx(0.4),
    "emberglass": Ry(0.4) @ Rx(0.2), "hearth": Ry(0.3) @ Rx(0.5), "mend": Ry(0.3) @ Rz(-0.35), "focus": Ry(0.4) @ Rx(0.15),
    "quest": Ry(0.35) @ Rz(0.18) @ Rx(0.2), "rest": Ry(0.3) @ Rx(0.2), "rootfiber": Ry(0.3) @ Rx(0.5),
}
# Ability icons that are worn pieces in a fixed look.
ABILITY_GEAR = {
    "strike": ("weapon", GL_HEIR),
    "ward": ("offhand", gear_look(2, 2)),
    "sprint": ("feet", GL_HEIR),
}

def icon_names():
    return [n for n, _, _ in gear_icon_specs()] + list(PROPS) + list(ABILITY_GEAR)

# ---------------------------------------------------------------- render stage

def _icon_materials():
    mats = {}
    for kind in ("matte", "metal", "glow", "glass"):
        name = "ic_" + kind
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "base"
        if kind == "glow":
            em = nt.nodes.new("ShaderNodeEmission")
            em.inputs["Strength"].default_value = 2.2
            nt.links.new(vc.outputs["Color"], em.inputs["Color"])
            nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
        else:
            bs = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None) or nt.nodes.new("ShaderNodeBsdfPrincipled")
            nt.links.new(vc.outputs["Color"], bs.inputs["Base Color"])
            bs.inputs["Roughness"].default_value = {"matte": 0.75, "metal": 0.32, "glass": 0.08}[kind]
            bs.inputs["Metallic"].default_value = {"matte": 0.0, "metal": 0.75, "glass": 0.0}[kind]
            if kind == "glass":
                if hasattr(mat, "surface_render_method"):
                    mat.surface_render_method = "BLENDED"
                bs.inputs["Alpha"].default_value = 0.45
            nt.links.new(bs.outputs["BSDF"], out.inputs["Surface"])
        mats[kind] = mat
    return mats

def _icon_scene():
    scn = scene_for("icons")
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scn.render.engine = eng
            break
        except TypeError:
            continue
    scn.render.resolution_x = scn.render.resolution_y = ICON_PX
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = True
    scn.render.image_settings.file_format = "PNG"
    scn.render.image_settings.color_mode = "RGBA"
    try:
        scn.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    if hasattr(scn, "eevee"):
        try:
            scn.eevee.taa_render_samples = 32
        except AttributeError:
            pass
    world = bpy.data.worlds.get("ic_world") or bpy.data.worlds.new("ic_world")
    world.use_nodes = True
    bg = next((n for n in world.node_tree.nodes if n.type == "BACKGROUND"), None)
    if bg:
        bg.inputs["Color"].default_value = (0.32, 0.27, 0.22, 1)
        bg.inputs["Strength"].default_value = 0.9
    scn.world = world
    cam_data = bpy.data.cameras.get("ic_cam") or bpy.data.cameras.new("ic_cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("ic_cam", cam_data)
    scn.collection.objects.link(cam)
    scn.camera = cam
    lights = []
    for name, kind, energy, color, rot in (("ic_key", "SUN", 3.6, (1.0, 0.9, 0.76), (0.85, 0.15, 0.7)),
                                           ("ic_rim", "SUN", 2.4, (0.6, 0.78, 1.0), (-1.0, 0.0, -2.6)),
                                           ("ic_fill", "SUN", 0.8, (1.0, 0.95, 0.9), (1.3, 0.0, -0.6))):
        ld = bpy.data.lights.get(name) or bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        lo.rotation_euler = rot
        scn.collection.objects.link(lo)
        lights.append(lo)
    return scn, cam

def _painted_copy(src, pal, glow_mode, kind, scn, M, mats):
    me = src.data.copy()
    col = me.color_attributes["base"]
    n = len(col.data)
    buf = [0.0] * (n * 4)
    col.data.foreach_get("color", buf)
    for j in range(n):
        sl = HERO_SLOTS[min(15, int(buf[j * 4] * 16))]
        c = pal["glow"] if (glow_mode or kind == "glow") else pal.get(sl, (1, 0, 1))
        buf[j * 4], buf[j * 4 + 1], buf[j * 4 + 2] = c[0], c[1], c[2]
    col.data.foreach_set("color", buf)
    me.materials.clear()
    me.materials.append(mats["glow" if (glow_mode or kind == "glow") else kind])
    o = bpy.data.objects.new("ic_" + src.name, me)
    scn.collection.objects.link(o)
    o.matrix_world = M
    return o

def _frame_and_render(scn, cam, objs, path, pad=1.04):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    # Camera on blender +y (game front), looking back along -y.
    cam.location = (c.x, c.y + 20, c.z)
    cam.rotation_euler = (math.pi / 2, 0, math.pi)
    cam.data.ortho_scale = max(hi.x - lo.x, hi.z - lo.z) * pad
    cam.data.clip_end = 100
    scn.render.filepath = path
    bpy.context.window.scene = scn
    bpy.ops.render.render(write_still=True, scene=scn.name)

def _clear(scn, keep):
    for o in list(scn.collection.objects):
        if o.name in keep:
            continue
        me = o.data if o.type == "MESH" else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)

def _hero_sources():
    """Unpainted, unbaked hero pieces as objects in a hidden scene (built once)."""
    scn = bpy.data.scenes.get("gm_icon_parts")
    if scn and len(scn.collection.objects):
        return {o.name: o for o in scn.collection.objects}
    kit = generate_hero_parts()
    scn = scene_for("icon_parts")
    out = {}
    for role, Rr in kit.roles.items():
        if Rr["f"]:
            o = to_object("hp_" + role, Rr, scn.collection)
            out[o.name] = o
    return out

def build_icons(names=None):
    os.makedirs(ICON_DIR, exist_ok=True)
    keep_scene = bpy.context.window.scene
    src = _hero_sources()
    mats = _icon_materials()
    scn, cam = _icon_scene()
    keep = {o.name for o in scn.collection.objects}
    done = []
    t0 = time.time()

    def render_gear(name, slot, k):
        pal = {key: hexc(v) for key, v in hero_palette(k).items()}
        pose = SLOT_POSE[slot]
        objs = []
        for piece, M, glow in slot_pieces(slot, k):
            for kind in ("matte", "metal", "glow"):
                s = src.get("hp_" + piece + "__" + kind)
                if s is None:
                    continue
                objs.append(_painted_copy(s, pal, glow, kind, scn, C_GAME @ pose @ M @ C_GAME.inverted(), mats))
        if objs:
            _frame_and_render(scn, cam, objs, os.path.join(ICON_DIR, name + ".png"))
            done.append(name)
        _clear(scn, keep)

    for name, slot, k in gear_icon_specs():
        if names and name not in names:
            continue
        render_gear(name, slot, k)
    for name, (slot, k) in ABILITY_GEAR.items():
        if names and name not in names:
            continue
        render_gear(name, slot, k)
    for name, fn in PROPS.items():
        if names and name not in names:
            continue
        kit = Kit(0)
        kit.r = random.Random(0x1c0)
        fn(kit, name)
        objs = []
        pose = PROP_POSE.get(name, Matrix.Identity(4))
        for role, Rr in kit.roles.items():
            if not Rr["f"]:
                continue
            o = to_object("ic_" + role, Rr, scn.collection)
            kind = role.split("__")[1]
            o.data.materials.append(mats[kind])
            o.matrix_world = C_GAME @ pose @ C_GAME.inverted()
            objs.append(o)
        _frame_and_render(scn, cam, objs, os.path.join(ICON_DIR, name + ".png"))
        done.append(name)
        _clear(scn, keep)
    bpy.context.window.scene = keep_scene
    return {"icons": len(done), "seconds": round(time.time() - t0, 1), "dir": ICON_DIR}
