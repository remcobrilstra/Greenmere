# The Warden's part library for view/hero.js, exec'd into greenmere.py's namespace
# after villagers.py and nature.py (uses Raw, sphere, oval, tube_arc, blob).
#
#   g["build_hero"]()        -> assets/models/hero.glb
#   g["preview_hero"]()      -> a lineup of outfits in Blender
#
# Every piece is authored in its rig group's own space, exactly where hero.js's
# code-built piece sits (legs at the hip pivot, arms at the shoulder, the cape at
# the collar, the sword in the hand...). Pieces split by material into objects
# "hp_<piece>__<matte|metal|glow>". Vertex colour R holds a colour slot, G a
# baked shade; hero.js paints them from the gear look (cloth, dark, leather,
# trim, steel, glow). For the bake the pieces stand at their rig offsets; they
# are moved back to the origin for export, so the file holds group-local shapes.

HERO_SLOTS = ["skin", "skinShade", "hair", "linen", "linenDark", "trousers", "wraps", "eye",
              "cloth", "dark", "leather", "trim", "steel", "glow", "boot", "lip"]

def HS(name):
    return Raw(((HERO_SLOTS.index(name) + 0.5) / 16, 1.0, 0.0))

def R(piece, kind="matte"):
    return piece + "__" + kind

def ring(kit, role, Rr, r, col, x, y, z, rx=0.0, ry=0.0, rz=0.0, sx=1, sy=1, sz=1, segs=16, sides=5):
    old = kit.frame
    kit.frame = old @ kit_xf(x, y, z, rx, ry, rz) @ Matrix.Diagonal((sx, sy, sz, 1))
    tube_arc(kit, role, Rr, r, 0, 2 * math.pi, segs, sides, col, 0, 0)
    kit.frame = old

def kit_xf(x, y, z, rx=0.0, ry=0.0, rz=0.0):
    return (Matrix.Translation((x, y, z)) @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rz, 4, 'Z'))

def octa(kit, role, r, col, x, y, z, sx=1, sy=1, sz=1, rx=0.0, ry=0.0, rz=0.0):
    m = kit.frame @ kit_xf(x, y, z, rx, ry, rz) @ Matrix.Diagonal((sx * r, sy * r, sz * r, 1))
    v = [m @ Vector(p) for p in [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]]
    f = [(2, 4, 0), (2, 0, 5), (2, 5, 1), (2, 1, 4), (3, 0, 4), (3, 5, 0), (3, 1, 5), (3, 4, 1)]
    kit._emit(role, v, f, col, ["side"] * 8, ())

def at(kit, x, y, z, rx=0.0, ry=0.0, rz=0.0, sx=1, sy=1, sz=1):
    """Temporarily move the frame (returns a restore callable)."""
    old = kit.frame
    kit.frame = old @ kit_xf(x, y, z, rx, ry, rz) @ Matrix.Diagonal((sx, sy, sz, 1))
    return lambda: setattr(kit, "frame", old)

# ---------------------------------------------------------------- base: the Warden in linen

def p_leg_base(kit):
    m = R("leg_base")
    kit.cylr(m, 0.15, 0.13, 0.36, 9, HS("trousers"), 0, -0.18, 0)
    kit.cylr(m, 0.13, 0.13, 0.05, 9, HS("trousers"), 0, -0.34, -0.005)
    kit.cylr(m, 0.125, 0.11, 0.3, 9, HS("trousers"), 0, -0.48, 0)
    kit.box(m, 0.18, 0.1, 0.3, HS("wraps"), 0, -0.65, -0.04)
    for k in range(3):
        kit.cylr(m, 0.118 - k * 0.004, 0.118 - k * 0.004, 0.025, 9, HS("linenDark"), 0, -0.56 + k * 0.05, 0, rx=0.08 * (k - 1))

def p_torso_base(kit):
    m = R("torso_base")
    oval(kit, m, 0.47, 0.4, 0.58, HS("linen"), 0, 0.64, seg=12)
    for k in range(4):
        kit.box(m, 0.08, 0.012, 0.02, HS("wraps"), 0, 0.2 - k * 0.09, -0.3, rz=0.5 if k % 2 else -0.5)
    kit.box(m, 0.012, 0.36, 0.015, HS("linenDark"), 0, 0.08, -0.302)

def p_body_base(kit):
    m = R("body_base")
    oval(kit, m, 0.4, 0.47, 0.32, HS("linen"), 0.72, 0.76, seg=12)
    oval(kit, m, 0.42, 0.42, 0.08, HS("linenDark"), 0.88, 0.77, seg=12)
    oval(kit, m, 0.22, 0.3, 0.12, HS("linen"), 1.52, 0.8, seg=12)

def p_arm_base(kit):
    m = R("arm_base")
    kit.cylr(m, 0.1, 0.09, 0.3, 9, HS("linen"), 0, -0.17, 0)
    kit.cylr(m, 0.095, 0.095, 0.04, 9, HS("linenDark"), 0, -0.31, 0)
    kit.cylr(m, 0.085, 0.08, 0.26, 9, HS("skin"), 0, -0.43, 0)
    kit.box(m, 0.14, 0.13, 0.15, HS("wraps"), 0, -0.6, 0)
    kit.box(m, 0.05, 0.08, 0.06, HS("wraps"), 0.0, -0.57, -0.08, rx=0.3)

def p_head_base(kit):
    m = R("head_base")
    sphere(kit, m, 0.27, HS("skin"), 0, 0, 0, 0.95, 1.05, 1, seg=12, rings=8)
    for s in (-1, 1):
        kit.box(m, 0.06, 0.06, 0.04, HS("eye"), s * 0.09, 0.04, -0.235)
        kit.box(m, 0.018, 0.018, 0.01, HS("lip"), s * 0.09 + 0.012, 0.055, -0.256)
        kit.box(m, 0.11, 0.03, 0.04, HS("hair"), s * 0.09, 0.105, -0.24, rz=-s * 0.12)
        sphere(kit, m, 0.06, HS("skinShade"), s * 0.255, 0.0, 0.02, 0.55, 1, 0.9, seg=6, rings=4)
    kit.box(m, 0.12, 0.025, 0.03, HS("lip"), 0, -0.14, -0.235)
    # hair: a cap swept back, a fringe, the nape
    restore = at(kit, 0, 0.04, 0.03, rx=-0.35, sz=1.05)
    sphere(kit, m, 0.29, HS("hair"), 0, 0, 0, lat=(0, 0.42), seg=12, rings=5)
    restore()
    for k in range(5):
        kit.box(m, 0.1, 0.06, 0.06, HS("hair"), -0.16 + k * 0.08, 0.2 - abs(k - 2) * 0.02, -0.2 + abs(k - 2) * 0.02, rz=(k - 2) * 0.25, rx=0.45)
    sphere(kit, m, 0.26, HS("hair"), 0, -0.05, 0.07, 1, 0.9, 1, lat=(0.45, 0.7), seg=10, rings=3)

# ---------------------------------------------------------------- body slot

def p_body_tunic(kit):
    m, me = R("body_tunic"), R("body_tunic", "metal")
    oval(kit, m, 0.42, 0.5, 0.34, HS("cloth"), 0.72, 0.78, seg=12)
    for s in (-1, 1):
        kit.box(m, 0.02, 0.3, 0.02, HS("dark"), s * 0.12, 0.7, -0.39, rz=s * 0.12)
    oval(kit, m, 0.44, 0.44, 0.1, HS("leather"), 0.88, 0.78, seg=12)
    for k in range(3):
        kit.box(m, 0.02, 0.02, 0.01, HS("dark"), 0.12 + k * 0.05, 0.88, -0.345)
    kit.box(me, 0.15, 0.12, 0.05, HS("trim"), 0, 0.88, -0.35)
    kit.box(m, 0.08, 0.05, 0.055, HS("dark"), 0, 0.88, -0.352)
    restore = at(kit, 0.31, 0.8, -0.24, ry=-0.5)
    kit.box(m, 0.15, 0.17, 0.11, HS("leather"), 0, 0, 0)
    kit.box(m, 0.16, 0.07, 0.12, HS("dark"), 0, 0.06, -0.005, rx=-0.15)
    kit.box(me, 0.03, 0.03, 0.02, HS("trim"), 0, 0.03, -0.065)
    restore()

def p_body_hem(kit):
    oval(kit, R("body_hem", "metal"), 0.505, 0.505, 0.04, HS("trim"), 0.56, 0.78, seg=12)

def p_torso_tunic(kit):
    m, me = R("torso_tunic"), R("torso_tunic", "metal")
    oval(kit, m, 0.5, 0.42, 0.6, HS("cloth"), 0, 0.66, seg=12)
    kit.box(m, 0.46, 0.56, 0.05, HS("dark"), 0, -0.02, -0.29)
    for s in (-1, 1):
        kit.box(me, 0.04, 0.58, 0.06, HS("trim"), s * 0.24, -0.02, -0.29)
        for k in range(4):
            kit.ball(me, 0.018, HS("trim"), s * 0.24, -0.24 + k * 0.15, -0.325)
    oval(kit, me, 0.25, 0.33, 0.12, HS("trim"), 0.34, 0.8, seg=12)
    for k in range(5):
        kit.box(m, 0.36, 0.01, 0.01, HS("cloth"), 0, -0.22 + k * 0.1, -0.317)

def p_torso_gem(kit, big=False):
    name = "torso_gem_big" if big else "torso_gem"
    octa(kit, R(name, "metal"), 0.12 if big else 0.09, HS("trim"), 0, 0.06, -0.33, 1, 1.25, 0.45)

def p_torso_runes(kit):
    g = R("torso_runes", "glow")
    for s in (-1, 1):
        kit.box(g, 0.03, 0.4, 0.02, HS("glow"), s * 0.12, -0.08, -0.32)
        for k in range(3):
            kit.box(g, 0.08, 0.02, 0.02, HS("glow"), s * 0.12 + s * 0.03, -0.2 + k * 0.12, -0.32, rz=s * 0.6)

def p_arm_tunic(kit):
    m, me = R("arm_tunic"), R("arm_tunic", "metal")
    kit.cylr(m, 0.11, 0.1, 0.3, 9, HS("cloth"), 0, -0.17, 0)
    kit.cylr(m, 0.105, 0.09, 0.26, 9, HS("leather"), 0, -0.43, 0)
    for k in range(3):
        kit.box(m, 0.06, 0.01, 0.012, HS("dark"), 0, -0.36 - k * 0.07, -0.1, rz=0.5 if k % 2 else -0.5)
    kit.cylr(me, 0.108, 0.108, 0.04, 9, HS("trim"), 0, -0.32, 0)
    kit.box(m, 0.15, 0.14, 0.16, HS("leather"), 0, -0.6, 0)
    kit.box(m, 0.055, 0.09, 0.07, HS("leather"), 0, -0.57, -0.085, rx=0.3)
    kit.box(m, 0.155, 0.03, 0.165, HS("dark"), 0, -0.535, 0)

def p_pauldron(kit, s, big=False):
    k = 1.3 if big else 1.0
    name = ("pauldron_big_" if big else "pauldron_") + ("l" if s < 0 else "r")
    m, me = R(name), R(name, "metal")
    restore = at(kit, s * 0.56, 1.48, 0, rz=s * 0.35, sx=1.1 * k, sy=0.8 * k, sz=k)
    sphere(kit, me, 0.23, HS("steel"), 0, 0, 0, lat=(0, 0.5), seg=12, rings=4)
    restore()
    ring(kit, me, 0.235, 0.032, HS("trim"), s * 0.56, 1.475, 0, rx=math.pi / 2, rz=s * 0.35, sx=k, sy=k, sz=k)
    restore = at(kit, s * 0.6, 1.36, 0, rz=s * 0.6, sx=1.05, sy=0.7, sz=0.95)
    sphere(kit, m, 0.19, HS("dark"), 0, 0, 0, lat=(0, 0.5), seg=10, rings=3)
    restore()
    kit.ball(me, 0.035, HS("trim"), s * 0.6, 1.62, -0.05)
    for j in range(4):
        a = j / 4 * math.pi * 2 + 0.4
        kit.ball(me, 0.016, HS("trim"), s * 0.56 + math.cos(a) * 0.17 * k, 1.53, math.sin(a) * 0.17 * k)

def p_pauldron_relic(kit, s):
    name = "pauldron_relic_" + ("l" if s < 0 else "r")
    me = R(name, "metal")
    restore = at(kit, s * 0.62, 1.38, 0, rz=s * 0.75, sx=1.1, sy=0.7, sz=1.0)
    sphere(kit, me, 0.2, HS("trim"), 0, 0, 0, lat=(0, 0.5), seg=10, rings=3)
    restore()
    for dz in (-0.12, 0.1):
        kit.cone(me, 0.05, 0.22, 5, HS("trim"), s * 0.62, 1.7, dz, rz=-s * 0.5)

def p_mantle(kit):
    oval(kit, R("mantle"), 0.3, 0.46, 0.16, HS("dark"), 1.56, 0.8, seg=12, z=0.04)
    for k in range(6):
        a = k / 6 * math.pi + math.pi
        kit.box(R("mantle"), 0.02, 0.15, 0.02, HS("cloth"), math.cos(a) * 0.4, 1.53, -math.sin(a) * 0.3 + 0.04)

def p_head_cowl(kit):
    m = R("head_cowl")
    gap = 0.46 * math.pi
    restore = at(kit, 0, 0, 0.05, sy=1.12, sz=1.1)
    sphere(kit, m, 0.35, HS("dark"), 0, 0, 0, lon=(math.pi / 2 + gap / 2, math.pi / 2 + 2 * math.pi - gap / 2), lat=(0, 0.66), seg=14, rings=7)
    sphere(kit, m, 0.33, HS("cloth"), 0, 0, 0, lon=(math.pi / 2 + gap / 2 - 0.06, math.pi / 2 + gap / 2 + 0.05), lat=(0.05, 0.66), seg=14, rings=6)
    sphere(kit, m, 0.33, HS("cloth"), 0, 0, 0, lon=(math.pi / 2 + 2 * math.pi - gap / 2 - 0.05, math.pi / 2 + 2 * math.pi - gap / 2 + 0.06), lat=(0.05, 0.66), seg=14, rings=6)
    restore()
    kit.box(m, 0.46, 0.32, 0.08, HS("dark"), 0, -0.26, 0.3, rx=0.25)
    kit.cone(m, 0.13, 0.32, 7, HS("dark"), 0, 0.34, 0.14, rx=-0.55)

def p_cape(kit):
    m = R("cape_upper")
    # four strips at small angles read as folds
    for k in range(4):
        x = -0.3 + k * 0.2
        kit.box(m, 0.21, 0.62, 0.05, HS("dark"), x, -0.31, 0.012 * (k % 2), ry=(0.08 if k % 2 else -0.08))
    for long in (False, True):
        ln = 1.5 if long else 1.0
        name = "cape_lower_long" if long else "cape_lower"
        mm = R(name)
        for k in range(4):
            x = -0.315 + k * 0.21
            kit.box(mm, 0.22, 0.48 * ln, 0.05, HS("dark"), x, -0.24 * ln, 0.012 * (k % 2), ry=(0.08 if k % 2 else -0.08))
        for s in (-1, 1):
            kit.cone(mm, 0.09, 0.12, 4, HS("dark"), s * 0.3, -0.48 * ln - 0.06, 0, rx=math.pi, ry=math.pi / 4)
        hem = R("cape_hem_long" if long else "cape_hem", "metal")
        kit.box(hem, 0.86, 0.05, 0.065, HS("trim"), 0, -0.48 * ln, 0)

# ---------------------------------------------------------------- head slot

def p_head_gear(kit):
    me = R("head_heir", "metal")
    ring(kit, me, 0.255, 0.028, HS("trim"), 0, 0.0, -0.21, sx=1, sy=1.15, sz=1, segs=18)
    octa(kit, me, 0.05, HS("trim"), 0, 0.18, -0.24)
    for hooded in (False, True):
        sfx = "_hood" if hooded else ""
        r = 0.36 if hooded else 0.29
        y = 0.16 if hooded else 0.12
        me = R("circlet" + sfx, "metal")
        ring(kit, me, r, 0.03, HS("trim"), 0, y, 0.02, rx=math.pi / 2 + 0.12, segs=22)
        for k in range(8):
            a = k / 8 * math.pi * 2
            kit.ball(me, 0.02, HS("trim"), math.sin(a) * r, y + 0.03, -math.cos(a) * r + 0.02)
        octa(kit, R("circlet_gem" + sfx, "metal"), 0.055, HS("trim"), 0, y + 0.02, -r - 0.01)
        mc = R("crown" + sfx, "metal")
        for i in range(7):
            a = i / 7 * math.pi * 2
            kit.cone(mc, 0.045, 0.22 if i == 0 else 0.15, 5, HS("trim"), math.sin(a) * r, y + 0.1, -math.cos(a) * r + 0.02)
        ring(kit, R("halo" + sfx, "glow"), 0.22, 0.018, HS("glow"), 0, y + 0.42, 0.04, rx=math.pi / 2, segs=22, sides=4)

# ---------------------------------------------------------------- feet slot

def p_feet(kit):
    m = R("boot")
    kit.cylr(m, 0.135, 0.12, 0.24, 9, HS("leather"), 0, -0.48, 0)
    kit.cylr(m, 0.15, 0.15, 0.05, 9, HS("boot"), 0, -0.37, 0)
    kit.box(m, 0.2, 0.14, 0.34, HS("boot"), 0, -0.63, -0.05)
    kit.box(m, 0.21, 0.03, 0.35, HS("dark"), 0, -0.695, -0.05)
    for k in range(3):
        kit.box(m, 0.1, 0.012, 0.012, HS("dark"), 0, -0.44 - k * 0.05, -0.13, rz=0.4 if k % 2 else -0.4)
    restore = at(kit, 0, -0.36, -0.1, sx=1.1, sy=0.85, sz=0.6)
    sphere(kit, R("kneecop", "metal"), 0.085, HS("steel"), 0, 0, 0, seg=8, rings=5)
    restore()
    kit.box(R("greave", "metal"), 0.16, 0.22, 0.04, HS("steel"), 0, -0.5, -0.13)
    kit.box(R("greave", "metal"), 0.02, 0.2, 0.045, HS("trim"), 0, -0.5, -0.135)
    ring(kit, R("greave_ring", "metal"), 0.14, 0.02, HS("trim"), 0, -0.58, 0, rx=math.pi / 2, segs=14, sides=4)
    for s in (-1, 1):
        me = R("relic_spikes_" + ("l" if s < 0 else "r"), "metal")
        restore = at(kit, s * 0.15, -0.46, 0.05, rx=0.5, rz=s * 0.9, sz=0.4)
        kit.cone(me, 0.06, 0.3, 4, HS("trim"), 0, 0, 0)
        restore()
        restore = at(kit, s * 0.14, -0.56, 0.1, rx=0.8, rz=s * 0.9, sz=0.4)
        kit.cone(me, 0.045, 0.22, 4, HS("trim"), 0, 0, 0)
        restore()

# ---------------------------------------------------------------- weapon

def sword_core(kit, name, length, w, guard, grip=0.22, grip_z=0.0, tips=False, pommel=True, steel_kind="metal"):
    m, me = R(name), R(name, "metal")
    kit.cylr(m, 0.032, 0.032, grip, 7, HS("leather"), 0, 0, grip_z, rx=math.pi / 2)
    for k in range(4):
        kit.cylr(m, 0.036, 0.036, 0.015, 7, HS("dark"), 0, 0, grip_z - grip / 2 + 0.03 + k * (grip - 0.06) / 3, rx=math.pi / 2)
    if pommel:
        kit.ball(me, 0.05, HS("trim"), 0, 0, 0.14)
    kit.box(me, guard, 0.05, 0.06, HS("trim"), 0, 0, -0.13)
    for s in (-1, 1):
        kit.ball(me, 0.03, HS("trim"), s * guard / 2, 0, -0.13)
    if tips:
        for s in (-1, 1):
            kit.cone(me, 0.03, 0.14, 4, HS("trim"), s * (guard / 2 + 0.03), 0, -0.18, rx=math.pi / 2 + 0.5)
    mid = -0.16 - length / 2
    # blade: a flat core with bevelled edges, a point
    kit.box(me, w * 0.6, 0.03, length, HS("steel"), 0, 0, mid)
    for s in (-1, 1):
        kit.box(me, w * 0.22, 0.018, length, HS("steel"), s * w * 0.38, 0, mid)
    restore = at(kit, 0, 0, -0.16 - length - 0.08, rx=-math.pi / 2, ry=math.pi / 4, sz=0.33)
    kit.cone(me, w / 2 * 1.4, 0.16, 4, HS("steel"), 0, 0, 0)
    restore()
    return mid

def p_weapons(kit):
    # heirloom: the Warden's own sword
    mid = sword_core(kit, "sword_heir", 0.82, 0.095, 0.3)
    kit.box(R("sword_heir", "metal"), 0.03, 0.034, 0.6, HS("trim"), 0, 0, -0.45)
    for r, (length, guard) in enumerate(zip([0.7, 0.82, 0.9, 1.1], [0.24, 0.3, 0.34, 0.42])):
        name = "sword_r%d" % r
        mid = sword_core(kit, name, length, 0.09, guard, tips=r >= 2)
        if r >= 1:
            kit.box(R("sword_fuller_r%d" % r, "metal"), 0.026, 0.034, length * 0.72, HS("trim"), 0, 0, mid + length * 0.08)
    length = 1.1
    mid = sword_core(kit, "sword_relic", length, 0.13, 0.42, grip=0.3, grip_z=0.03, tips=True, pommel=False)
    g = R("sword_relic_glow", "glow")
    octa(kit, g, 0.075, HS("glow"), 0, 0, 0.22, 1, 1, 1.4)
    for s in (-1, 1):
        kit.box(g, 0.014, 0.022, length * 0.94, HS("glow"), s * (0.13 / 2 + 0.004), 0, mid)
    octa(kit, g, 0.05, HS("glow"), 0, 0.0, -0.13, 1, 1, 0.7)
    kit.box(g, 0.026, 0.034, length * 0.72, HS("glow"), 0, 0, mid + length * 0.08)

# ---------------------------------------------------------------- offhand

def heater_pts(sx, sy, n=5):
    pts = [(-0.27 * sx, 0.3 * sy), (0.27 * sx, 0.3 * sy), (0.27 * sx, 0.0)]
    # quadratic curves to the point and back, as in hero.js heaterShape
    def quad(p0, c, p1):
        out = []
        for i in range(1, n + 1):
            t = i / n
            out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]))
        return out
    pts += quad((0.27 * sx, 0.0), (0.24 * sx, -0.25 * sy), (0.0, -0.42 * sy))
    pts += quad((0.0, -0.42 * sy), (-0.24 * sx, -0.25 * sy), (-0.27 * sx, 0.0))[:-1]
    return pts

def slab(kit, role, pts, depth, col, x, sy=1.0, sz=1.0):
    """hero.js slab(): the 2D shape extruded along +x by `depth`, starting at x."""
    old = kit.frame
    kit.frame = old @ Matrix.Translation((x, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Diagonal((sz, sy, 1, 1))
    kit.prism(role, list(reversed(pts)), 0, depth, col)
    kit.frame = old

def p_shields(kit):
    # plain: a round planked buckler with an iron rim and boss
    m, me = R("shield_plain"), R("shield_plain", "metal")
    restore = at(kit, -0.06, -0.02, 0, rz=math.pi / 2)
    kit.cylr(m, 0.3, 0.3, 0.05, 14, HS("leather"), 0, 0, 0)
    for k in range(4):
        kit.box(m, 0.012, 0.052, 0.56 - abs(k - 1.5) * 0.12, HS("dark"), -0.21 + k * 0.14, 0, 0)
    restore()
    ring(kit, me, 0.3, 0.025, HS("trim"), -0.06, -0.02, 0, ry=math.pi / 2, segs=18, sides=4)
    restore = at(kit, -0.1, -0.02, 0, sx=0.6)
    sphere(kit, me, 0.07, HS("trim"), 0, 0, 0, seg=8, rings=5)
    restore()
    for variant, (sx, sy) in (("shield_heater", (1, 1)), ("shield_rare", (1, 1)), ("shield_relic", (1.12, 1.35))):
        m, me, g = R(variant), R(variant, "metal"), R(variant, "glow")
        pts = heater_pts(sx, sy)
        face_role = me if variant == "shield_rare" else m
        face_slot = {"shield_heater": "cloth", "shield_rare": "steel", "shield_relic": "dark"}[variant]
        slab(kit, face_role, pts, 0.05, HS(face_slot), -0.06)
        slab(kit, me, pts, 0.04, HS("trim"), -0.02, sy=1.08, sz=1.08)
        # rivets round the rim
        for i, (pz, py) in enumerate(pts[::2]):
            kit.ball(me, 0.016, HS("trim"), -0.065, py * 0.93, pz * 0.93)
        if variant == "shield_heater":
            kit.box(me, 0.02, 0.62 * sy, 0.07, HS("trim"), -0.075, -0.04, 0)
            kit.box(me, 0.02, 0.07, 0.48 * sx, HS("trim"), -0.075, 0.12, 0)
            restore = at(kit, -0.09, 0.12, 0, sx=0.6)
            sphere(kit, me, 0.07, HS("trim"), 0, 0, 0, seg=8, rings=5)
            restore()
        elif variant == "shield_rare":
            octa(kit, m, 0.17, HS("cloth"), -0.075, -0.02, 0, 0.25, 1.3, 1)
            restore = at(kit, -0.1, -0.02, 0, sx=0.6)
            sphere(kit, g, 0.06, HS("glow"), 0, 0, 0, seg=8, rings=5)
            restore()
        else:
            ring(kit, g, 0.13, 0.022, HS("glow"), -0.085, 0.02, 0, ry=math.pi / 2, segs=18, sides=4)
            kit.box(g, 0.02, 0.5, 0.03, HS("glow"), -0.085, -0.06, 0)
            for z in (-0.22, 0.22):
                kit.cone(me, 0.035, 0.12, 4, HS("trim"), -0.12, 0.34, z, rz=math.pi / 2)

# ---------------------------------------------------------------- trinket

def p_trinkets(kit):
    ring(kit, R("necklace"), 0.2, 0.012, HS("leather"), 0, 0.16, -0.12, rx=math.pi / 2 - 0.5, sy=1.25, segs=18, sides=4)
    octa(kit, R("pendant", "metal"), 0.045, HS("trim"), 0, 0.0, -0.36, 1, 1.3, 0.6)
    octa(kit, R("pendant_big", "metal"), 0.06, HS("trim"), 0, 0.0, -0.36, 1, 1.3, 0.6)
    octa(kit, R("orbit_charm", "glow"), 0.1, HS("glow"), 0.85, 0, 0, 1, 1.4, 1)
    ring(kit, R("orbit_charm", "metal"), 0.15, 0.015, HS("trim"), 0.85, 0, 0, segs=18, sides=4)

# ---------------------------------------------------------------- build

# Rig rest pose (hero.js), game space: where each group sits for the AO bake.
def _rig():
    I = Matrix.Identity(4)
    T = lambda x, y, z: Matrix.Translation((x, y, z))
    Rx = lambda a: Matrix.Rotation(a, 4, 'X')
    cape = T(0, 1.52, 0.28) @ Rx(0.22)
    arm_r = T(0.6, 1.44, 0)
    arm_l = T(-0.6, 1.44, 0)
    return {
        "body": I, "leg_l": T(-0.2, 0.7, 0), "leg_r": T(0.2, 0.7, 0), "arm_l": arm_l, "arm_r": arm_r,
        "torso": T(0, 1.16, 0), "head": T(0, 1.8, 0), "cape": cape, "capeLow": cape @ T(0, -0.6, 0) @ Rx(-0.08),
        "sword": arm_r @ T(0, -0.6, 0) @ Rx(-0.32), "shield": arm_l @ T(-0.13, -0.42, 0), "orbit": T(0, 1.25, 0),
    }

PIECE_GROUP = {
    "leg_base": "leg_r", "torso_base": "torso", "body_base": "body", "arm_base": "arm_r", "head_base": "head",
    "body_tunic": "body", "body_hem": "body", "torso_tunic": "torso", "torso_gem": "torso", "torso_gem_big": "torso",
    "torso_runes": "torso", "arm_tunic": "arm_r", "pauldron_l": "body", "pauldron_r": "body", "pauldron_big_l": "body",
    "pauldron_big_r": "body", "pauldron_relic_l": "body", "pauldron_relic_r": "body", "mantle": "body", "head_cowl": "head",
    "cape_upper": "cape", "cape_lower": "capeLow", "cape_lower_long": "capeLow", "cape_hem": "capeLow", "cape_hem_long": "capeLow",
    "head_heir": "head", "circlet": "head", "circlet_hood": "head", "circlet_gem": "head", "circlet_gem_hood": "head",
    "crown": "head", "crown_hood": "head", "halo": "head", "halo_hood": "head",
    "boot": "leg_r", "kneecop": "leg_r", "greave": "leg_r", "greave_ring": "leg_r", "relic_spikes_l": "leg_l", "relic_spikes_r": "leg_r",
    "necklace": "torso", "pendant": "torso", "pendant_big": "torso", "orbit_charm": "orbit",
}
BASE_PIECES = {"leg_base", "torso_base", "body_base", "arm_base", "head_base"}

def piece_group(piece):
    if piece.startswith("sword"):
        return "sword"
    if piece.startswith("shield"):
        return "shield"
    return PIECE_GROUP[piece]

C_GAME = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))

def generate_hero_parts():
    kit = Kit(0)
    kit.r = random.Random(0x4e20)
    for fn in (p_leg_base, p_torso_base, p_body_base, p_arm_base, p_head_base, p_body_tunic, p_body_hem, p_torso_tunic,
               p_torso_runes, p_arm_tunic, p_mantle, p_head_cowl, p_cape, p_head_gear, p_feet, p_weapons, p_shields, p_trinkets):
        kit.frame = Matrix.Identity(4)
        fn(kit)
    p_torso_gem(kit)
    p_torso_gem(kit, big=True)
    for s in (-1, 1):
        p_pauldron(kit, s)
        p_pauldron(kit, s, big=True)
        p_pauldron_relic(kit, s)
    return kit

def place_at_rig(objs, rig):
    for o in objs:
        piece = o.name[3:].split("__")[0]
        Mg = rig[piece_group(piece)]
        o.matrix_world = C_GAME @ Mg @ C_GAME.inverted()

def build_hero(export=True, bake=True, samples=96):
    kit = generate_hero_parts()
    scn = scene_for("hero")
    objs = []
    for role, Rr in kit.roles.items():
        if Rr["f"]:
            objs.append(to_object("hp_" + role, Rr, scn.collection))
    rig = _rig()
    place_at_rig(objs, rig)
    bpy.context.view_layer.update()
    if bake:
        for o in objs:
            piece = o.name[3:].split("__")[0]
            for o2 in objs:
                p2 = o2.name[3:].split("__")[0]
                o2.hide_render = not (o2 is o or (p2 in BASE_PIECES and piece not in BASE_PIECES) or (piece in BASE_PIECES and p2 in BASE_PIECES) or p2 == piece)
            if o.name.endswith("__glow"):
                o.data.color_attributes.active_color = o.data.color_attributes["base"]
                continue
            bake_slot_ao(scn, o, samples)
        for o in objs:
            o.hide_render = False
    else:
        for o in objs:
            o.data.color_attributes.active_color = o.data.color_attributes["base"]
    line = {"id": "hero", "objects": len(objs), "faces": sum(len(o.data.polygons) for o in objs)}
    if export:
        for o in objs:
            o.matrix_world = Matrix.Identity(4)
        bpy.context.view_layer.update()
        p, size = write_glb(scn, objs, "hero")
        line["kb"] = round(size / 1024)
        place_at_rig(objs, rig)
    return line

# ---------------------------------------------------------------- preview

def hero_palette(k):
    base = {"skin": 0xe0a878, "skinShade": shade(0xe0a878, 0.86), "hair": 0x4a3020, "linen": 0xcfc3a4, "linenDark": 0xa89878,
            "trousers": 0x3a2a22, "wraps": 0x6b4a32, "eye": 0x1a1a1a, "lip": 0xa0584a}
    if not k:
        k = {"cloth": 0xcfc3a4, "dark": 0xa89878, "leather": 0x6b4a32, "trim": 0x7d838a, "steel": 0xa9b2bc, "glow": 0xffffff, "tier": "plain"}
    boot = 0x241c18 if k.get("tier") == "heirloom" else shade(k["leather"], 0.6)
    base.update({"cloth": k["cloth"], "dark": k["dark"], "leather": k["leather"], "trim": k["trim"], "steel": k["steel"],
                 "glow": k.get("glow") or 0xffffff, "boot": boot, "white": 0xf4f0e8})
    return base

PREVIEW_OUTFITS = [
    ("linen", None),
    ("heirloom", dict(tier="heirloom", rarity=0, cloth=0x2d62c8, dark=0x1c3f8c, leather=0x5a3a24, trim=0xd4a03a, steel=0xc5d0dc, glow=0)),
    ("fine moss", dict(tier="fine", rarity=1, cloth=0x3f7a3a, dark=0x284f26, leather=0x5a4a2a, trim=0xb57d3e, steel=0xa9b2bc, glow=0)),
    ("rare slate", dict(tier="rare", rarity=2, cloth=0x51657c, dark=0x334152, leather=0x3c3c44, trim=0xdde6ee, steel=0xd8e2ec, glow=0x8cc8ff)),
    ("relic ember", dict(tier="relic", rarity=3, cloth=0xa23c28, dark=0x6a2216, leather=0x4a2418, trim=0xffc84a, steel=0xd8e2ec, glow=0xffa040)),
]

def outfit_pieces(k):
    """(piece, group, glowMode) for one look on every slot; mirrors hero.js dressFromLibrary."""
    out = [("leg_base", "leg_l", False), ("leg_base", "leg_r", False), ("torso_base", "torso", False), ("body_base", "body", False),
           ("arm_base", "arm_l", False), ("arm_base", "arm_r", False), ("head_base", "head", False)]
    if not k:
        return out
    t, r = k["tier"], k["rarity"]
    relic, heir = t == "relic", t == "heirloom"
    glow = bool(k.get("glow"))
    out += [("body_tunic", "body", False), ("body_hem", "body", relic), ("torso_tunic", "torso", False),
            ("torso_gem_big" if relic else "torso_gem", "torso", glow), ("arm_tunic", "arm_l", False), ("arm_tunic", "arm_r", False),
            ("mantle", "body", False), ("head_cowl", "head", False)]
    if relic:
        out.append(("torso_runes", "torso", True))
    if heir or r >= 1:
        sfx = "big_" if relic else ""
        out += [("pauldron_" + sfx + "l", "body", False), ("pauldron_" + sfx + "r", "body", False), ("cape_upper", "cape", False)]
        if relic:
            out += [("pauldron_relic_l", "body", False), ("pauldron_relic_r", "body", False), ("cape_lower_long", "capeLow", False), ("cape_hem_long", "capeLow", True)]
        else:
            out += [("cape_lower", "capeLow", False), ("cape_hem", "capeLow", False)]
    hood = "_hood"
    if heir:
        out.append(("head_heir", "head", False))
    else:
        out.append(("circlet" + hood, "head", False))
        if r >= 1:
            out.append(("circlet_gem" + hood, "head", glow))
        if relic:
            out += [("crown" + hood, "head", False), ("halo" + hood, "head", True)]
    for side in ("l", "r"):
        out.append(("boot", "leg_" + side, False))
        if heir or r >= 1:
            out.append(("kneecop", "leg_" + side, False))
        if r >= 2:
            out += [("greave", "leg_" + side, False), ("greave_ring", "leg_" + side, glow)]
        if relic:
            out.append(("relic_spikes_" + side, "leg_" + side, False))
    if heir:
        out.append(("sword_heir", "sword", False))
    elif relic:
        out += [("sword_relic", "sword", False), ("sword_relic_glow", "sword", True)]
    else:
        out.append(("sword_r%d" % r, "sword", False))
        if r >= 1:
            out.append(("sword_fuller_r%d" % r, "sword", glow))
    out.append(({"plain": "shield_plain", "rare": "shield_rare", "relic": "shield_relic"}.get(t, "shield_heater"), "shield", False))
    if relic:
        out.append(("orbit_charm", "orbit", False))
    else:
        out += [("necklace", "torso", False), ("pendant_big" if r >= 1 else "pendant", "torso", glow)]
    return out

def preview_hero():
    scn = scene_for("hero_preview")
    rig = _rig()
    for i, (label, k) in enumerate(PREVIEW_OUTFITS):
        pal = {key: hexc(v) for key, v in hero_palette(k).items()}
        for piece, group, glow_mode in outfit_pieces(k):
            for kind in ("matte", "metal", "glow"):
                src = bpy.data.objects.get("hp_" + piece + "__" + kind)
                if not src:
                    continue
                me = src.data.copy()
                col = me.color_attributes.active_color
                n = len(col.data)
                buf = [0.0] * (n * 4)
                col.data.foreach_get("color", buf)
                for j in range(n):
                    sl = HERO_SLOTS[min(15, int(buf[j * 4] * 16))]
                    c = pal["glow"] if (glow_mode or kind == "glow") else pal.get(sl, (1, 0, 1))
                    kk = 1.0 if kind == "glow" else buf[j * 4 + 1]
                    buf[j * 4], buf[j * 4 + 1], buf[j * 4 + 2] = c[0] * kk, c[1] * kk, c[2] * kk
                col.data.foreach_set("color", buf)
                o = bpy.data.objects.new("pv_%d_%s_%s_%s" % (i, piece, group, kind), me)
                scn.collection.objects.link(o)
                o.matrix_world = Matrix.Translation(((i - 2) * 1.6, 0, 0)) @ C_GAME @ rig[group] @ C_GAME.inverted()
    bpy.context.window.scene = scn
    return scn
