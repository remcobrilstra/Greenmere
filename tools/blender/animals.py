# Animal part library for view/ambience.js, exec'd into greenmere.py's namespace
# after villagers.py (uses Raw, sphere, oval).
#
#   g["build_animals"]()      -> assets/models/animals.glb
#
# Parts are authored in the rig spaces of view/ambience.js (forward -z):
#   hen_body   hen root (feet at y 0)          hen_head  head pivot (0, 0.34, -0.14)
#   cat_torso  cat body group                  cat_leg   leg pivot, hangs down to -0.18
#   cat_tail   tail pivot, grows along +y      dog_*     same for the dog (legs 0.3)
# Vertex colour R = slot, G = baked shade, like the villager library.

ANIMAL_SLOTS = ["coat", "coatDark", "coatLight", "beak", "comb", "eye", "eyeCat", "nose", "pink", "white",
                "collar", "gold", "claw"]

def A(name):
    return Raw(((ANIMAL_SLOTS.index(name) + 0.5) / 16, 1.0, 0.0))

CAT = dict(len=0.5, hgt=0.2, legH=0.18)
DOG = dict(len=0.7, hgt=0.28, legH=0.3)

def part_hen(kit):
    r = "hen_body"
    sphere(kit, r, 0.17, A("coat"), 0, 0.25, 0.02, 1, 0.88, 1.25)
    sphere(kit, r, 0.12, A("coatLight"), 0, 0.22, -0.1, 1, 0.9, 0.8, seg=8, rings=5)
    for s in (-1, 1):
        sphere(kit, r, 0.1, A("coatDark"), s * 0.13, 0.27, 0.05, 0.45, 0.75, 1.35, seg=8, rings=5)
    for k in range(3):
        kit.box(r, 0.03, 0.2, 0.1, A("coatDark") if k % 2 else A("coat"), (k - 1) * 0.04, 0.38, 0.22, rx=-0.5, rz=(k - 1) * 0.3)
    sphere(kit, r, 0.09, A("coat"), 0, 0.33, -0.1, seg=8, rings=5)
    for s in (-1, 1):
        kit.cylr(r, 0.014, 0.012, 0.13, 5, A("beak"), s * 0.05, 0.075, 0)
        for t in (-0.5, 0, 0.5):
            kit.box(r, 0.014, 0.012, 0.07, A("beak"), s * 0.05 + t * 0.04, 0.006, -0.03, ry=t)
    h = "hen_head"
    sphere(kit, h, 0.08, A("coat"), 0, 0.04, 0, seg=8, rings=5)
    for k in range(3):
        kit.box(h, 0.025, 0.05 + 0.02 * (k == 1), 0.035, A("comb"), 0, 0.12 + 0.01 * (k == 1), -0.03 + k * 0.03)
    kit.cone(h, 0.026, 0.07, 4, A("beak"), 0, 0.03, -0.09, rx=-math.pi / 2)
    kit.box(h, 0.022, 0.05, 0.025, A("comb"), 0, -0.025, -0.06)
    for s in (-1, 1):
        kit.box(h, 0.012, 0.022, 0.022, A("eye"), s * 0.07, 0.055, -0.03)

def part_quad(kit, kind):
    P = CAT if kind == "cat" else DOG
    L, H, legH = P["len"], P["hgt"], P["legH"]
    t = kind + "_torso"
    cy = legH + H / 2
    # body: a long oval, a deeper chest, a rounded rump
    sphere(kit, t, H * 0.55, A("coat"), 0, cy, 0, 1.0, 0.95, L / H * 0.95, seg=10, rings=7)
    sphere(kit, t, H * 0.5, A("coatLight"), 0, cy - H * 0.12, -L * 0.22, 0.95, 0.9, 1.2, seg=8, rings=5)
    sphere(kit, t, H * 0.52, A("coat"), 0, cy + H * 0.02, L * 0.3, 1.0, 0.95, 1.0, seg=8, rings=5)
    hz = -L / 2 - H * 0.2
    hy = legH + H * 0.95
    if kind == "cat":
        sphere(kit, t, 0.1, A("coat"), 0, hy, hz, 1.05, 0.95, 0.95, seg=10, rings=6)
        sphere(kit, t, 0.05, A("coatLight"), 0, hy - 0.035, hz - 0.075, 1.2, 0.8, 0.8, seg=8, rings=4)
        kit.box(t, 0.025, 0.02, 0.02, A("pink"), 0, hy - 0.012, hz - 0.11)
        for s in (-1, 1):
            kit.cone(t, 0.045, 0.1, 4, A("coat"), s * 0.06, hy + 0.1, hz + 0.01, rz=-s * 0.2)
            kit.cone(t, 0.028, 0.065, 4, A("pink"), s * 0.06, hy + 0.09, hz - 0.005, rz=-s * 0.2)
            kit.box(t, 0.032, 0.03, 0.02, A("eyeCat"), s * 0.045, hy + 0.02, hz - 0.088)
            kit.box(t, 0.008, 0.024, 0.022, A("eye"), s * 0.045, hy + 0.02, hz - 0.092)
            for k in (-1, 1):
                kit.box(t, 0.08, 0.005, 0.005, A("white"), s * 0.07, hy - 0.03 + k * 0.012, hz - 0.08, rz=s * k * 0.15)
    else:
        sphere(kit, t, 0.13, A("coat"), 0, hy, hz, 1.0, 0.95, 1.0, seg=10, rings=6)
        kit.box(t, 0.12, 0.1, 0.16, A("coatLight"), 0, hy - 0.05, hz - 0.13)
        kit.box(t, 0.06, 0.05, 0.04, A("nose"), 0, hy - 0.02, hz - 0.215)
        kit.box(t, 0.1, 0.02, 0.1, A("coatDark"), 0, hy - 0.1, hz - 0.12)
        for s in (-1, 1):
            kit.box(t, 0.05, 0.16, 0.08, A("coatDark"), s * 0.12, hy - 0.02, hz + 0.02, rz=s * 0.35)
            kit.box(t, 0.03, 0.03, 0.02, A("eye"), s * 0.055, hy + 0.04, hz - 0.12)
            kit.box(t, 0.012, 0.012, 0.01, A("white"), s * 0.055 + 0.008, hy + 0.048, hz - 0.131)
        # collar and tag
        oval(kit, t, 0.11, 0.115, 0.04, A("collar"), hy - 0.1, 1.0, seg=10, z=hz + 0.1)
        kit.cylr(t, 0.022, 0.022, 0.012, 6, A("gold"), 0, hy - 0.145, hz - 0.01, rx=math.pi / 2)
    # leg: tapered, with a paw
    g = kind + "_leg"
    kit.cylr(g, 0.035 if kind == "cat" else 0.045, 0.028 if kind == "cat" else 0.036, legH - 0.02, 6, A("coatDark"), 0, -legH / 2, 0)
    sphere(kit, g, 0.034 if kind == "cat" else 0.045, A("coatLight"), 0, -legH + 0.02, -0.012, 1, 0.7, 1.25, seg=6, rings=4)
    # tail: three tapering segments curving back
    tl = kind + "_tail"
    ln = 0.42 if kind == "cat" else 0.3
    r0 = 0.03 if kind == "cat" else 0.045
    y = 0.0
    z = 0.0
    for k in range(3):
        seg_len = ln / 3
        bend = k * (0.25 if kind == "cat" else 0.1)
        kit.cylr(tl, r0 * (1 - (k + 1) * 0.18), r0 * (1 - k * 0.18), seg_len + 0.02, 6,
                 A("coat") if k < 2 or kind == "dog" else A("coatDark"), 0, y + seg_len / 2, z, rx=-bend)
        y += seg_len * math.cos(bend)
        z -= seg_len * math.sin(bend) * 0.0
    sphere(kit, tl, r0 * 0.6, A("coatLight" if kind == "dog" else "coatDark"), 0, y, z, seg=6, rings=4)

def generate_animal_parts():
    kit = Kit(0)
    kit.r = random.Random(0xa11)
    part_hen(kit)
    part_quad(kit, "cat")
    part_quad(kit, "dog")
    return kit

def build_animals(export=True, bake=True, samples=128):
    kit = generate_animal_parts()
    scn = scene_for("animals")
    objs = {}
    for role, R in kit.roles.items():
        if R["f"]:
            objs[role] = to_object("ap_" + role, R, scn.collection)
    if bake:
        for role, ob in objs.items():
            for r2, o2 in objs.items():
                o2.hide_render = r2 != role and not (role == "hen_head" and r2 == "hen_body")
            bake_slot_ao(scn, ob, samples)
        for o in objs.values():
            o.hide_render = False
    else:
        for o in objs.values():
            o.data.color_attributes.active_color = o.data.color_attributes["base"]
    line = {"id": "animals", "parts": len(objs), "faces": sum(len(o.data.polygons) for o in objs.values())}
    if export:
        p, size = write_glb(scn, list(objs.values()), "animals")
        line["kb"] = round(size / 1024)
    return line

ANIMAL_PREVIEW = [("hen", 0xf4efe4, 0xe7d7b4), ("hen", 0x8d5b34, 0x6b4428), ("cat", 0x6e7377, None),
                  ("cat", 0xd08a3a, None), ("dog", 0x8d5b34, None), ("dog", 0x2a2624, None)]

def animal_palette(coat, dark=None):
    return {"coat": coat, "coatDark": dark or shade(coat, 0.75), "coatLight": mix(coat, 0xf4efe4, 0.35),
            "beak": 0xd4a03a, "comb": 0xc4473a, "eye": 0x1a1a1a, "eyeCat": 0x8ed15a, "nose": 0x1a1a1a,
            "pink": 0xd88a8a, "white": 0xf4f0e8, "collar": 0x8e3a2e, "gold": 0xd4a03a, "claw": 0x3a3434}

def preview_animals():
    scn = scene_for("animals_preview")
    for i, (kind, coat, dark) in enumerate(ANIMAL_PREVIEW):
        pal = {k: hexc(v) for k, v in animal_palette(coat, dark).items()}
        P = CAT if kind == "cat" else DOG
        if kind == "hen":
            pieces = [("hen_body", (0, 0, 0)), ("hen_head", (0, 0.34, -0.14))]
        else:
            L, H, legH = P["len"], P["hgt"], P["legH"]
            pieces = [(kind + "_torso", (0, 0, 0)), (kind + "_tail", (0, legH + H * 0.8, L / 2))]
            for lx, lz in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
                pieces.append((kind + "_leg", (lx * H * 0.35, legH, lz * (L / 2 - 0.06))))
        for name, off in pieces:
            src = bpy.data.objects["ap_" + name]
            me = src.data.copy()
            col = me.color_attributes.active_color
            n = len(col.data)
            buf = [0.0] * (n * 4)
            col.data.foreach_get("color", buf)
            for j in range(n):
                sl = ANIMAL_SLOTS[min(len(ANIMAL_SLOTS) - 1, int(buf[j * 4] * 16))]
                c = pal[sl]
                k = buf[j * 4 + 1]
                buf[j * 4], buf[j * 4 + 1], buf[j * 4 + 2] = c[0] * k, c[1] * k, c[2] * k
            col.data.foreach_set("color", buf)
            o = bpy.data.objects.new("pa_%d_%s" % (i, name), me)
            # game (x, y, z) -> blender (x, -z, y)
            o.location = ((i - 2.5) * 0.9 + off[0], -off[2], off[1])
            if kind == "dog":
                o.scale = (1.1, 1.1, 1.1)
                o.location = ((i - 2.5) * 0.9 + off[0] * 1.1, -off[2] * 1.1, off[1] * 1.1)
            if name.endswith("_tail"):
                o.rotation_euler = ((0.5 if kind == "cat" else 0.9), 0, 0)
            scn.collection.objects.link(o)
    bpy.context.window.scene = scn
    return scn
