# Skinned animals for view/ambience.js, exec'd into greenmere.py's namespace after
# humans.py (uses its skin shells, weights, armature, mesh and clip writers).
#
#   g["build_critters"]()   -> assets/models/critters.glb
#
# One rig per species ("cr_<species>_rig") and one mesh each ("cr_<species>_body"),
# coloured with the animal slots (ANIMAL_SLOTS, animals.py and view/ambience.js):
# the coat colours come from each animal. Clips are tracks "<species>_<clip>":
#   cat, dog   idle, walk, sit, sleep        hen   idle (pecking), walk
# Game space, forward -z, feet on y = 0. The game lowers the body to sit or sleep.

CR_HEX = {
    "coat": [0x907060], "coatDark": [0x604838], "coatLight": [0xd8c8b0], "beak": [0xd4a03a], "comb": [0xc4473a],
    "eye": [0x1a1a1a], "eyeCat": [0x8ed15a], "nose": [0x2a2020], "pink": [0xd88a8a], "white": [0xf4f0e8],
    "collar": [0x8e3a2e], "gold": [0xd4a03b], "claw": [0x3a3434],
}
C = {k: v[0] for k, v in CR_HEX.items()}


class CrFig(HmFig):
    def __init__(self, joints, seed=5):
        self.S = {}
        self.j = {k: Vector(v) for k, v in joints.items()}
        self.parts = []
        self.rnd = random.Random(seed)


def cr_quad_joints(k, cat):
    """Quadruped joints scaled by k (cat 1.0)."""
    j = {
        "pelvis": (0, 0.29, 0.17), "mid": (0, 0.3, 0.0), "chest": (0, 0.31, -0.14), "neckTop": (0, 0.39, -0.23),
        "nose": (0, 0.42, -0.36), "tailBase": (0, 0.31, 0.23),
        "tailMid": (0, 0.42, 0.37) if cat else (0, 0.38, 0.32), "tailTip": (0, 0.57, 0.42) if cat else (0, 0.46, 0.4),
    }
    for t, s in (("L", -1), ("R", 1)):
        j["sh" + t] = (s * 0.07, 0.27, -0.14)
        j["el" + t] = (s * 0.075, 0.15, -0.15)
        j["pw" + t] = (s * 0.075, 0.03, -0.155)
        j["ft" + t] = (s * 0.075, 0.015, -0.2)
        j["hp" + t] = (s * 0.07, 0.27, 0.16)
        j["kn" + t] = (s * 0.075, 0.16, 0.12)
        j["hk" + t] = (s * 0.075, 0.07, 0.19)
        j["bt" + t] = (s * 0.075, 0.015, 0.15)
    if not cat:
        j["nose"] = (0, 0.4, -0.4)
    return {n: (x * k, y * k, z * k) for n, (x, y, z) in j.items()}


def cr_quad_bones():
    b = [("hips", "pelvis", "mid", None), ("spine", "mid", "chest", "hips"), ("neck", "chest", "neckTop", "spine"),
         ("head", "neckTop", "nose", "neck"), ("tail.1", "tailBase", "tailMid", "hips"), ("tail.2", "tailMid", "tailTip", "tail.1")]
    for t in "LR":
        b += [("legF%s.1" % t, "sh" + t, "el" + t, "spine"), ("legF%s.2" % t, "el" + t, "pw" + t, "legF%s.1" % t),
              ("legF%s.3" % t, "pw" + t, "ft" + t, "legF%s.2" % t),
              ("legB%s.1" % t, "hp" + t, "kn" + t, "hips"), ("legB%s.2" % t, "kn" + t, "hk" + t, "legB%s.1" % t),
              ("legB%s.3" % t, "hk" + t, "bt" + t, "legB%s.2" % t)]
    return b


def cr_quad(fig, cat, k):
    j, rnd = fig.j, fig.rnd
    J = {n: j[n] for n in ("pelvis", "mid", "chest", "neckTop", "tailBase", "tailMid", "tailTip")}
    R = {"pelvis": (0.1 * k, 0.09 * k), "mid": (0.092 * k, 0.085 * k), "chest": (0.1 * k, 0.095 * k), "neckTop": 0.058 * k,
         "tailBase": 0.032 * k, "tailMid": (0.026 if cat else 0.03) * k, "tailTip": 0.012 * k}
    E = [("pelvis", "mid"), ("mid", "chest"), ("chest", "neckTop"), ("pelvis", "tailBase"), ("tailBase", "tailMid"), ("tailMid", "tailTip")]
    for t in "LR":
        for n in ("sh", "el", "pw", "ft", "hp", "kn", "hk", "bt"):
            J[n + t] = j[n + t]
        R.update({"sh" + t: 0.048 * k, "el" + t: 0.03 * k, "pw" + t: 0.026 * k, "ft" + t: (0.03 * k, 0.016 * k),
                  "hp" + t: 0.06 * k, "kn" + t: 0.042 * k, "hk" + t: 0.026 * k, "bt" + t: (0.03 * k, 0.016 * k)})
        E += [("chest", "sh" + t), ("sh" + t, "el" + t), ("el" + t, "pw" + t), ("pw" + t, "ft" + t),
              ("pelvis", "hp" + t), ("hp" + t, "kn" + t), ("kn" + t, "hk" + t), ("hk" + t, "bt" + t)]
    v, f = hm_skin_shell("quad", J, E, R, "pelvis", levels=1)
    def coat(c, n):
        if n.y < -0.45 and c.y > 0.12 * k:
            return C["coatLight"]
        if c.y < 0.07 * k:
            return C["coatDark"]
        return C["coat"]
    fig.add(v, f, hm_paint(fig, v, f, coat), ("auto", None))
    # head
    kit = Kit(0)
    kit.r = rnd
    hc = Vector(j["neckTop"]).lerp(Vector(j["nose"]), 0.42) + Vector((0, 0.045 * k, 0))
    blob(kit, "h", 0.075 * k * (1.0 if cat else 1.15), lambda n, p: C["coat"] if n.y > -0.4 else C["coatLight"],
         hc.x, hc.y, hc.z, 1.05, 0.92, 1.0 if cat else 1.1, noise=0.03, subdiv=1, seed=3)
    sn = Vector(j["nose"]) + Vector((0, 0.005 * k, 0.025 * k if cat else 0.03 * k))
    blob(kit, "h", (0.042 if cat else 0.05) * k, lambda n, p: C["coatLight"], sn.x, sn.y, sn.z, 1.0, 0.8, 1.2 if cat else 1.5,
         noise=0.02, subdiv=1, seed=4)
    nz = sn.z - (0.045 if cat else 0.07) * k
    kit.box("h", 0.022 * k, 0.016 * k, 0.014 * k, [C["pink"] if cat else C["nose"]], 0, sn.y + 0.012 * k, nz)
    for s_ in (-1, 1):
        ex = s_ * 0.038 * k
        kit.ball("h", 0.017 * k, [C["eyeCat"] if cat else C["eye"]], ex, hc.y + 0.015 * k, hc.z - 0.068 * k * (1.0 if cat else 1.1), 1, 1, 0.5)
        if cat:
            kit.box("h", 0.006 * k, 0.022 * k, 0.006 * k, [C["eye"]], ex, hc.y + 0.015 * k, hc.z - 0.077 * k)
            kit.cone("h", 0.03 * k, 0.07 * k, 4, [C["coat"]], s_ * 0.045 * k, hc.y + 0.08 * k, hc.z + 0.005 * k, rz=-s_ * 0.25)
            kit.cone("h", 0.016 * k, 0.04 * k, 4, [C["pink"]], s_ * 0.045 * k, hc.y + 0.075 * k, hc.z - 0.006 * k, rz=-s_ * 0.25)
        else:
            kit.box("h", 0.03 * k, 0.11 * k, 0.06 * k, [C["coatDark"]], s_ * 0.085 * k, hc.y - 0.005 * k, hc.z + 0.01 * k, rz=s_ * 0.35)
    fig.from_kit(kit, ("rigid", "head"))
    if not cat:
        ring(kit, "collar", 0.062 * k, 0.012 * k, [C["collar"]], j["chest"][0], j["chest"][1] + 0.05 * k, j["chest"][2] - 0.06 * k,
             rx=math.pi / 2 - 0.9, segs=12, sides=4)
        kit.ball("collar", 0.014 * k, [C["gold"]], 0, j["chest"][1] - 0.005 * k, j["chest"][2] - 0.1 * k)
        fig.from_kit(kit, ("rigid", "neck"))


HEN_J = {"tailRoot": (0, 0.24, 0.14), "breast": (0, 0.27, -0.08), "neckBase": (0, 0.3, -0.1), "neckTop": (0, 0.37, -0.14),
         "beak": (0, 0.4, -0.22), "tailTip": (0, 0.42, 0.26)}
for _t, _s in (("L", -1), ("R", 1)):
    HEN_J["hip" + _t] = (_s * 0.05, 0.17, 0.0)
    HEN_J["knee" + _t] = (_s * 0.05, 0.09, 0.01)
    HEN_J["foot" + _t] = (_s * 0.05, 0.012, -0.02)
HEN_BONES = [("body", "tailRoot", "breast", None), ("neck", "neckBase", "neckTop", "body"), ("head", "neckTop", "beak", "neck"),
             ("tail", "tailRoot", "tailTip", "body"),
             ("legL.1", "hipL", "kneeL", "body"), ("legL.2", "kneeL", "footL", "legL.1"),
             ("legR.1", "hipR", "kneeR", "body"), ("legR.2", "kneeR", "footR", "legR.1")]


def cr_hen(fig):
    j, rnd = fig.j, fig.rnd
    kit = Kit(0)
    kit.r = rnd
    blob(kit, "b", 0.15, lambda n, p: C["coatLight"] if n.z < -0.5 and n.y < 0.3 else (C["coatDark"] if abs(n.x) > 0.75 else C["coat"]),
         0, 0.25, 0.02, 1.0, 0.9, 1.3, noise=0.05, subdiv=2, seed=1)
    for i in range(4):
        kit.box("b", 0.03, 0.2, 0.09, [C["coatDark"] if i % 2 else C["coat"]], (i - 1.5) * 0.035, 0.36, 0.2, rx=-0.55, rz=(i - 1.5) * 0.25)
    fig.from_kit(kit, ("rigid", "body"))
    blob(kit, "n", 0.07, lambda n, p: C["coat"], 0, 0.33, -0.12, 1, 1.15, 1, noise=0.04, subdiv=1, seed=2)
    fig.from_kit(kit, ("rigid", "neck"))
    blob(kit, "hd", 0.068, lambda n, p: C["coat"], 0, 0.405, -0.155, 1, 1, 1.05, noise=0.03, subdiv=1, seed=3)
    for i in range(3):
        kit.box("hd", 0.022, 0.05 + 0.018 * (i == 1), 0.032, [C["comb"]], 0, 0.475 + 0.01 * (i == 1), -0.18 + i * 0.03)
    kit.cone("hd", 0.022, 0.06, 4, [C["beak"]], 0, 0.4, -0.24, rx=-math.pi / 2)
    kit.box("hd", 0.018, 0.045, 0.02, [C["comb"]], 0, 0.355, -0.2)
    for s_ in (-1, 1):
        kit.ball("hd", 0.012, [C["eye"]], s_ * 0.045, 0.415, -0.19, 1, 1, 0.6)
    fig.from_kit(kit, ("rigid", "head"))
    for t in "LR":
        dk_tube(kit, "l", [j["hip" + t], j["knee" + t], j["foot" + t] + Vector((0, 0.01, 0))], [0.014, 0.012, 0.011], 5, [C["beak"]])
        fig.from_kit(kit, ("rigid", "leg%s.1" % t))
        f0 = j["foot" + t]
        for a in (-0.5, 0, 0.5):
            kit.box("f", 0.012, 0.01, 0.07, [C["beak"]], f0.x + math.sin(a) * 0.03, 0.006, f0.z - 0.03 * math.cos(a), ry=a)
        fig.from_kit(kit, ("rigid", "leg%s.2" % t))


def cr_quad_clips(rig, sp):
    T = lambda n: sp + "_" + n
    wag = sp == "dog"
    # idle: breathing, a glance; the dog wags
    keys = []
    for fr in range(0, 91, 6 if wag else 30):
        u = fr / 90
        keys.append((fr, {"spine": [("X", 1.5 * math.sin(u * math.pi * 2))], "head": [("Z", 10 * math.sin(u * math.pi * 2)), ("X", 3)],
                          "tail.1": [("Z", (24 if (fr // 6) % 2 else -24) if wag else 10 * math.sin(u * math.pi * 2)), ("X", -10 if wag else 0)],
                          "tail.2": [("Z", 8 * math.sin(u * math.pi * 4))]}))
    wd_action(rig, "idle", keys, track=T("idle"))
    # walk: diagonal pairs (front left with back right), one cycle over 24 frames; frame 6
    # has the front left and back right legs forward (the game's gait phase).
    def stride(m):
        return {"legF%s.1" % m[0]: [("X", 24)], "legF%s.2" % m[0]: [("X", -6)], "legB%s.1" % m[1]: [("X", 22)], "legB%s.2" % m[1]: [("X", 6)],
                "legF%s.1" % m[1]: [("X", -20)], "legF%s.2" % m[1]: [("X", 18)], "legB%s.1" % m[0]: [("X", -22)], "legB%s.2" % m[0]: [("X", -12)],
                "spine": [("Z", 3 if m[0] == "L" else -3)], "head": [("X", -3)], "tail.1": [("Z", 12 if m[0] == "L" else -12)]}
    def passing(m):
        return {"legF%s.2" % m[0]: [("X", -34)], "legF%s.3" % m[0]: [("X", 20)], "legB%s.2" % m[1]: [("X", -26)],
                "head": [("X", 3)], "tail.1": [("Z", 0)]}
    wd_action(rig, "walk", [(0, passing("LR")), (6, stride("LR")), (12, passing("RL")), (18, stride("RL")), (24, passing("LR"))], track=T("walk"))
    # sit: the hind legs folded under, the front straight, chest up
    sit = {"spine": [("X", 26)], "neck": [("X", -14)], "head": [("X", -10)],
           "legFL.1": [("X", -26)], "legFR.1": [("X", -26)],
           "legBL.1": [("X", 68)], "legBR.1": [("X", 68)], "legBL.2": [("X", -120)], "legBR.2": [("X", -120)], "legBL.3": [("X", 52)], "legBR.3": [("X", 52)],
           "tail.1": [("X", -50), ("Z", 20)], "tail.2": [("Z", 40)]}
    sit2 = dict(sit, head=[("X", -10), ("Z", 12)])
    wd_action(rig, "sit", [(0, sit), (45, sit2), (90, sit)], track=T("sit"))
    # sleep: curled up, nose to tail, slow breathing
    def sleep(b):
        return {"spine": [("X", -4 + b), ("Z", 14)], "neck": [("X", -30), ("Z", 30)], "head": [("X", -20), ("Z", 20)],
                "legFL.1": [("X", 78)], "legFR.1": [("X", 78)], "legFL.2": [("X", -12)], "legFR.2": [("X", -12)],
                "legBL.1": [("X", 62)], "legBR.1": [("X", 62)], "legBL.2": [("X", -118)], "legBR.2": [("X", -118)],
                "tail.1": [("Z", 70), ("X", -20)], "tail.2": [("Z", 60)]}
    wd_action(rig, "sleep", [(0, sleep(0)), (60, sleep(2.5)), (120, sleep(0))], track=T("sleep"))


def cr_hen_clips(rig):
    # idle: pecking at the ground now and then, a look around (1.5 s)
    look = {"head": [("Z", 22)]}
    peck = {"neck": [("X", -58)], "head": [("X", -32)], "body": [("X", -10)], "tail": [("X", 8)]}
    wd_action(rig, "idle", [(0, {}), (8, peck), (11, {"neck": [("X", -40)], "head": [("X", -20)]}), (14, peck), (20, {}), (32, look), (45, {})],
              track="hen_idle")
    # walk: legs in turn, the head bobbing back and forth (16 frames a cycle)
    def step(t, o):
        return {"leg%s.1" % t: [("X", 32)], "leg%s.2" % t: [("X", -10)], "leg%s.1" % o: [("X", -26)], "leg%s.2" % o: [("X", 22)],
                "neck": [("X", 12)], "body": [("Z", 4 if t == "L" else -4)], "tail": [("Z", 8 if t == "L" else -8)]}
    def mid(t):
        return {"leg%s.2" % t: [("X", -40)], "neck": [("X", -12)]}
    wd_action(rig, "walk", [(0, mid("L")), (4, step("L", "R")), (8, mid("R")), (12, step("R", "L")), (16, mid("L"))], track="hen_walk")


def build_critters(export=True, bake=True, samples=48):
    keep = bpy.context.window.scene
    scn = scene_for("critters")
    bpy.context.window.scene = scn
    objs = []
    for sp in ("cat", "dog", "hen"):
        if sp == "hen":
            fig = CrFig(HEN_J)
            bones = HEN_BONES
            cr_hen(fig)
        else:
            k = 1.0 if sp == "cat" else 1.45
            fig = CrFig(cr_quad_joints(k, sp == "cat"))
            bones = cr_quad_bones()
            cr_quad(fig, sp == "cat", k)
        rig = hm_armature(fig, "cr_%s_rig" % sp, scn.collection, bones=bones)
        ob = hm_mesh(fig, "cr_%s_body" % sp, scn.collection, rig, slots=True, slot_names=ANIMAL_SLOTS, slot_hex=CR_HEX, bones=bones)
        if bake:
            for o in objs:
                o.hide_render = True
            bake_slot_ao(scn, ob, samples)
        scn.render.fps = WD_FPS
        if rig.animation_data:
            for t in list(rig.animation_data.nla_tracks):
                rig.animation_data.nla_tracks.remove(t)
        if sp == "hen":
            cr_hen_clips(rig)
        else:
            cr_quad_clips(rig, sp)
        for b in rig.pose.bones:
            b.rotation_quaternion = (1, 0, 0, 0)
        rig.location.x = {"cat": -1.2, "dog": 0.0, "hen": 1.2}[sp]
        objs += [rig, ob]
    for o in objs:
        o.hide_render = False
    line = {"id": "critters", "tris": {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == 'MESH'}}
    if export:
        for o in objs:
            if o.type == 'ARMATURE':
                o.location.x = 0
        bpy.context.view_layer.update()
        path = os.path.join(REPO, "assets", "models", "critters.glb")
        for o in scn.collection.all_objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        import contextlib, io
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            _gltf(filepath=path, export_format='GLB', use_selection=True, use_active_scene=True, export_yup=True,
                  export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_materials='PLACEHOLDER',
                  export_normals=False, export_texcoords=False, export_apply=False,
                  export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                  export_meshopt_compression_enable=True)
        line["kb"] = round(os.path.getsize(path) / 1024)
        for o in objs:
            if o.type == 'ARMATURE':
                o.location.x = {"cat": -1.2, "dog": 0.0, "hen": 1.2}[o.name.split("_")[1]]
    bpy.context.window.scene = keep
    return line
