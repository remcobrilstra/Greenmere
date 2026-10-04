import * as THREE from "three";
import { makeMat, mergeParts } from "./materials.js";
import { gearLook } from "./gearlook.js";
import { loadPartLibrary, paintParts } from "./partlib.js";
import { loadWardenSkin, attachWardenSkin } from "./heroskin.js";

// The Warden, code-built. Local forward is −z. Groups keep the pivots that
// movement and combat animate (legs at the hips, arms at the shoulders, the
// cape at the collar). `nose` and `toe` stay separate named meshes: they are
// the facing oracles of the self-test.
//
// What is worn shapes the Warden: hero.dress(equipped) rebuilds one layer per
// slot from view/gearlook.js (theme colours the cloth, rarity the trim, rare
// pieces glow, epic relics get their own shapes and drifting motes). With
// nothing worn the Warden is in linen. Parts are painted with vertex colours on
// three shared materials (matte, metal, glow) and merged per rig group and
// material, so a fully dressed Warden stays a handful of draw calls.
// hero.tick(dt) animates the relic extras (orbiting charm, motes, glow pulse).
//
// Blender-built pieces: once assets/models/hero.glb (tools/blender/hero.py)
// loads, the base and every gear layer are built from it instead, painted from
// the same looks (slot-coded vertex colours with baked shading), on the same rig
// groups, buckets and materials. `nose` and `toe` stay code-built. hero.ready
// resolves after the switch (or if the library fails, keeping the code pieces).

const LINEN = 0xcfc3a4;
const LINEN_DARK = 0xa89878;
const TROUSERS = 0x3a2a22;
const WRAPS = 0x6b4a32;
const HAIR = 0x4a3020;
const HERO_SLOTS = ["skin", "skinShade", "hair", "linen", "linenDark", "trousers", "wraps", "eye",
  "cloth", "dark", "leather", "trim", "steel", "glow", "boot", "lip"];

function darker(hex, k) {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return c.getHex();
}

export function buildHero(scene) {
  const matMatte = makeMat(0xffffff, { roughness: 0.82, vertexColors: true, side: THREE.DoubleSide });
  const matMetal = makeMat(0xffffff, { roughness: 0.36, metalness: 0.5, vertexColors: true });
  const matGlow = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false });
  matGlow.flatShading = true;
  const MATS = { matte: matMatte, metal: matMetal, glow: matGlow };
  const matSkin = makeMat(0xe0a878, { roughness: 0.86 });
  const matToe = makeMat(0x241c18, { roughness: 0.88 });

  const buckets = new Map();
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _c = new THREE.Color();
  function put(group, geo, kind, hex, x, y, z, rx, ry, rz, sx, sy, sz) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _e.set(rx || 0, ry || 0, rz || 0);
    _q.setFromEuler(_e);
    _p.set(x || 0, y || 0, z || 0);
    _s.set(sx || 1, sy || 1, sz || 1);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    _c.setHex(hex);
    for (let i = 0; i < n; i++) {
      cols[i * 3] = _c.r;
      cols[i * 3 + 1] = _c.g;
      cols[i * 3 + 2] = _c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const key = group.uuid + "|" + kind;
    let b = buckets.get(key);
    if (!b) buckets.set(key, b = { group, mat: MATS[kind], parts: [] });
    b.parts.push(g);
  }
  function flush(tag) {
    for (const b of buckets.values()) {
      const mesh = new THREE.Mesh(mergeParts(b.parts), b.mat);
      mesh.castShadow = b.mat !== matGlow;
      mesh.userData.layer = tag;
      b.group.add(mesh);
    }
    buckets.clear();
  }
  // ---- Blender library pieces ----
  let lib = null;
  let lastEquipped = null;
  function libPalette(k) {
    const hex = {
      skin: 0xe0a878, skinShade: darker(0xe0a878, 0.86), hair: HAIR, linen: LINEN, linenDark: LINEN_DARK, trousers: TROUSERS,
      wraps: WRAPS, eye: 0x1a1a1a, lip: 0xa0584a,
      cloth: k ? k.cloth : LINEN, dark: k ? k.dark : LINEN_DARK, leather: k ? k.leather : WRAPS, trim: k ? k.trim : 0x7d838a,
      steel: k ? k.steel : 0xa9b2bc, glow: (k && k.glow) || 0xffffff,
      boot: k ? (k.tier === "heirloom" ? 0x241c18 : darker(k.leather, 0.6)) : WRAPS
    };
    return HERO_SLOTS.map((s) => new THREE.Color(hex[s]));
  }
  // Once the skinned Warden is on (view/heroskin.js) it wears the body, head and legs;
  // only what is carried (sword, shield, the orbiting charm) is still built from pieces.
  let skin = null;
  function carried(group) {
    return group === sword || group === shield || group === orbit;
  }
  // One piece into its group's buckets; glowMode paints it all in the glow colour on the glow material.
  function piece(group, name, k, glowMode) {
    if (skin && !carried(group)) return;
    const pal = libPalette(k);
    const glowPal = glowMode ? HERO_SLOTS.map(() => new THREE.Color((k && k.glow) || 0xffffff)) : null;
    for (const kind of ["matte", "metal", "glow"]) {
      const key = name + "__" + kind;
      if (!lib[key]) continue;
      const bucket = glowMode ? "glow" : kind;
      const geo = paintParts(lib, [key], glowMode || kind === "glow" ? (glowPal || HERO_SLOTS.map(() => new THREE.Color((k && k.glow) || 0xffffff))) : pal, 0, 0, 0);
      const bk = group.uuid + "|" + bucket;
      let b = buckets.get(bk);
      if (!b) buckets.set(bk, b = { group, mat: MATS[bucket], parts: [] });
      b.parts.push(geo);
    }
  }
  function libBase() {
    for (const leg of [leftLeg, rightLeg]) piece(leg, "leg_base", null, false);
    piece(torso, "torso_base", null, false);
    piece(body, "body_base", null, false);
    for (const arm of [leftArm, rightArm]) piece(arm, "arm_base", null, false);
    piece(head, "head_base", null, false);
  }
  function libDress(looks) {
    const k = looks.body;
    if (k) {
      const relic = k.tier === "relic";
      const heir = k.tier === "heirloom";
      piece(body, "body_tunic", k, false);
      piece(body, "body_hem", k, relic);
      piece(torso, "torso_tunic", k, false);
      piece(torso, relic ? "torso_gem_big" : "torso_gem", k, !!k.glow);
      if (relic) piece(torso, "torso_runes", k, true);
      for (const arm of [leftArm, rightArm]) piece(arm, "arm_tunic", k, false);
      if (heir || k.rarity >= 1) {
        const sfx = relic ? "big_" : "";
        piece(body, "pauldron_" + sfx + "l", k, false);
        piece(body, "pauldron_" + sfx + "r", k, false);
        if (relic) {
          piece(body, "pauldron_relic_l", k, false);
          piece(body, "pauldron_relic_r", k, false);
        }
        piece(cape, "cape_upper", k, false);
        piece(capeLow, relic ? "cape_lower_long" : "cape_lower", k, false);
        piece(capeLow, relic ? "cape_hem_long" : "cape_hem", k, relic);
      }
      piece(body, "mantle", k, false);
      piece(head, "head_cowl", k, false);
    }
    const h = looks.head;
    if (h) {
      if (h.tier === "heirloom") piece(head, "head_heir", h, false);
      else {
        const sfx = k ? "_hood" : "";
        piece(head, "circlet" + sfx, h, false);
        if (h.rarity >= 1) piece(head, "circlet_gem" + sfx, h, !!h.glow);
        if (h.tier === "relic") {
          piece(head, "crown" + sfx, h, false);
          piece(head, "halo" + sfx, h, true);
        }
      }
    }
    const f = looks.feet;
    matToe.color.setHex(f ? (f.tier === "heirloom" ? 0x241c18 : darker(f.leather, 0.6)) : WRAPS);
    if (f) {
      for (const [leg, side] of [[leftLeg, "l"], [rightLeg, "r"]]) {
        piece(leg, "boot", f, false);
        if (f.tier === "heirloom" || f.rarity >= 1) piece(leg, "kneecop", f, false);
        if (f.rarity >= 2) {
          piece(leg, "greave", f, false);
          piece(leg, "greave_ring", f, !!f.glow);
        }
        if (f.tier === "relic") piece(leg, "relic_spikes_" + side, f, false);
      }
    }
    const w = looks.weapon;
    if (w) {
      if (w.tier === "heirloom") piece(sword, "sword_heir", w, false);
      else if (w.tier === "relic") {
        piece(sword, "sword_relic", w, false);
        piece(sword, "sword_relic_glow", w, true);
      } else {
        piece(sword, "sword_r" + w.rarity, w, false);
        if (w.rarity >= 1) piece(sword, "sword_fuller_r" + w.rarity, w, !!w.glow);
      }
    }
    const o = looks.offhand;
    if (o) piece(shield, o.tier === "plain" ? "shield_plain" : o.tier === "rare" ? "shield_rare" : o.tier === "relic" ? "shield_relic" : "shield_heater", o, false);
    const t = looks.trinket;
    if (t) {
      if (t.tier === "relic") piece(orbit, "orbit_charm", t, false);
      else {
        piece(torso, "necklace", t, false);
        piece(torso, t.rarity >= 1 ? "pendant_big" : "pendant", t, !!t.glow);
      }
    }
  }

  function named(parent, geo, mat, x, y, z, name) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.name = name;
    parent.add(mesh);
    return mesh;
  }

  // ---- rig ----
  const player = new THREE.Group();
  const body = new THREE.Group();
  player.add(body);
  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftLeg.position.set(-0.2, 0.7, 0);
  rightLeg.position.set(0.2, 0.7, 0);
  leftArm.position.set(-0.6, 1.44, 0);
  rightArm.position.set(0.6, 1.44, 0);
  body.add(leftLeg, rightLeg, leftArm, rightArm);
  const torso = new THREE.Group();
  torso.position.set(0, 1.16, 0);
  body.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 1.8, 0);
  head.name = "head";
  body.add(head);
  const cape = new THREE.Group();
  cape.position.set(0, 1.52, 0.28);
  cape.rotation.x = 0.22;
  body.add(cape);
  const capeLow = new THREE.Group();
  capeLow.position.set(0, -0.6, 0);
  capeLow.rotation.x = -0.08;
  cape.add(capeLow);
  const sword = new THREE.Group();
  sword.position.set(0, -0.6, 0);
  sword.rotation.x = -0.32;
  rightArm.add(sword);
  const shield = new THREE.Group();
  shield.position.set(-0.13, -0.42, 0);
  leftArm.add(shield);
  // The relic charm circles the Warden; it hangs off the player, not the body.
  const orbit = new THREE.Group();
  orbit.name = "charmOrbit";
  orbit.position.y = 1.25;
  player.add(orbit);
  const rigGroups = [body, leftLeg, rightLeg, leftArm, rightArm, torso, head, cape, capeLow, sword, shield, orbit];

  // ---- base: the Warden in linen ----
  for (const leg of [leftLeg, rightLeg]) {
    put(leg, new THREE.CylinderGeometry(0.15, 0.13, 0.36, 7), "matte", TROUSERS, 0, -0.18, 0);
    put(leg, new THREE.CylinderGeometry(0.125, 0.11, 0.3, 7), "matte", TROUSERS, 0, -0.48, 0);
    put(leg, new THREE.BoxGeometry(0.18, 0.1, 0.3), "matte", WRAPS, 0, -0.65, -0.04);
  }
  const toe = named(rightLeg, new THREE.BoxGeometry(0.12, 0.08, 0.1), matToe, 0, -0.65, -0.24, "toe");
  // Undershirt and skirt, a little inside where the tunic sits.
  put(torso, new THREE.CylinderGeometry(0.47, 0.4, 0.58, 8), "matte", LINEN, 0, 0, 0, 0, Math.PI / 8, 0, 1, 1, 0.64);
  put(body, new THREE.CylinderGeometry(0.4, 0.47, 0.32, 8), "matte", LINEN, 0, 0.72, 0, 0, Math.PI / 8, 0, 1, 1, 0.76);
  put(body, new THREE.CylinderGeometry(0.42, 0.42, 0.08, 8), "matte", LINEN_DARK, 0, 0.88, 0, 0, Math.PI / 8, 0, 1, 1, 0.77);
  put(body, new THREE.CylinderGeometry(0.22, 0.3, 0.12, 8), "matte", LINEN, 0, 1.52, 0, 0, Math.PI / 8, 0, 1, 1, 0.8);
  for (const arm of [leftArm, rightArm]) {
    put(arm, new THREE.CylinderGeometry(0.1, 0.09, 0.3, 7), "matte", LINEN, 0, -0.17, 0);
    put(arm, new THREE.CylinderGeometry(0.085, 0.08, 0.26, 7), "matte", 0xe0a878, 0, -0.43, 0);
    put(arm, new THREE.BoxGeometry(0.14, 0.13, 0.15), "matte", WRAPS, 0, -0.6, 0);
  }
  // Face, hair cap (hidden under a cowl when a tunic is worn).
  put(head, new THREE.IcosahedronGeometry(0.27, 1), "matte", 0xe0a878, 0, 0, 0, 0, 0, 0, 0.95, 1.05, 1);
  const nose = named(head, new THREE.BoxGeometry(0.08, 0.11, 0.1), matSkin, 0, -0.03, -0.28, "nose");
  put(head, new THREE.BoxGeometry(0.06, 0.055, 0.04), "matte", 0x1a1a1a, -0.09, 0.04, -0.235);
  put(head, new THREE.BoxGeometry(0.06, 0.055, 0.04), "matte", 0x1a1a1a, 0.09, 0.04, -0.235);
  put(head, new THREE.BoxGeometry(0.11, 0.03, 0.04), "matte", HAIR, -0.09, 0.105, -0.24, 0, 0, 0.12);
  put(head, new THREE.BoxGeometry(0.11, 0.03, 0.04), "matte", HAIR, 0.09, 0.105, -0.24, 0, 0, -0.12);
  put(head, new THREE.BoxGeometry(0.12, 0.03, 0.03), "matte", TROUSERS, 0, -0.14, -0.235);
  put(head, new THREE.SphereGeometry(0.29, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.42), "matte", HAIR, 0, 0.04, 0.03, -0.35, 0, 0, 1, 1, 1.05);
  flush("base");

  // ---- slot layers ----
  function dressBody(k) {
    if (!k) return;
    const relic = k.tier === "relic";
    const heir = k.tier === "heirloom";
    // Hips: skirt, hem, belt, buckle, pouch.
    put(body, new THREE.CylinderGeometry(0.42, 0.5, 0.34, 8), "matte", k.cloth, 0, 0.72, 0, 0, Math.PI / 8, 0, 1, 1, 0.78);
    put(body, new THREE.CylinderGeometry(0.505, 0.505, 0.04, 8), relic ? "glow" : "metal", relic ? k.glow : k.trim, 0, 0.56, 0, 0, Math.PI / 8, 0, 1, 1, 0.78);
    put(body, new THREE.CylinderGeometry(0.44, 0.44, 0.1, 8), "matte", k.leather, 0, 0.88, 0, 0, Math.PI / 8, 0, 1, 1, 0.78);
    put(body, new THREE.BoxGeometry(0.15, 0.12, 0.05), "metal", k.trim, 0, 0.88, -0.35);
    put(body, new THREE.BoxGeometry(0.15, 0.17, 0.11), "matte", k.leather, 0.31, 0.8, -0.24, 0, -0.5, 0);
    // Chest.
    put(torso, new THREE.CylinderGeometry(0.5, 0.42, 0.6, 8), "matte", k.cloth, 0, 0, 0, 0, Math.PI / 8, 0, 1, 1, 0.66);
    put(torso, new THREE.BoxGeometry(0.46, 0.56, 0.05), "matte", k.dark, 0, -0.02, -0.29);
    put(torso, new THREE.BoxGeometry(0.04, 0.58, 0.06), "metal", k.trim, -0.24, -0.02, -0.29);
    put(torso, new THREE.BoxGeometry(0.04, 0.58, 0.06), "metal", k.trim, 0.24, -0.02, -0.29);
    put(torso, new THREE.OctahedronGeometry(relic ? 0.12 : 0.09, 0), k.glow ? "glow" : "metal", k.glow || k.trim, 0, 0.06, -0.33, 0, 0, 0, 1, 1.25, 0.45);
    put(torso, new THREE.CylinderGeometry(0.25, 0.33, 0.12, 8), "metal", k.trim, 0, 0.34, 0, 0, Math.PI / 8, 0, 1, 1, 0.8);
    if (relic) {
      // Rune strips down the chest panel.
      put(torso, new THREE.BoxGeometry(0.03, 0.4, 0.02), "glow", k.glow, -0.12, -0.08, -0.32);
      put(torso, new THREE.BoxGeometry(0.03, 0.4, 0.02), "glow", k.glow, 0.12, -0.08, -0.32);
    }
    // Sleeves and bracers.
    for (const arm of [leftArm, rightArm]) {
      put(arm, new THREE.CylinderGeometry(0.11, 0.1, 0.3, 7), "matte", k.cloth, 0, -0.17, 0);
      put(arm, new THREE.CylinderGeometry(0.105, 0.09, 0.26, 7), "matte", k.leather, 0, -0.43, 0);
      put(arm, new THREE.CylinderGeometry(0.108, 0.108, 0.04, 7), "metal", k.trim, 0, -0.32, 0);
      put(arm, new THREE.BoxGeometry(0.15, 0.14, 0.16), "matte", k.leather, 0, -0.6, 0);
    }
    // Pauldrons on all but the plainest tunic; relics wear heavy layered ones.
    if (heir || k.rarity >= 1) {
      const s = relic ? 1.3 : 1;
      for (const side of [-1, 1]) {
        put(body, new THREE.SphereGeometry(0.23, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), "metal", k.steel, side * 0.56, 1.48, 0, 0, 0, side * 0.35, 1.1 * s, 0.8 * s, s);
        put(body, new THREE.TorusGeometry(0.235, 0.032, 4, 10), "metal", k.trim, side * 0.56, 1.475, 0, Math.PI / 2, 0, side * 0.35, s, s, s);
        put(body, new THREE.SphereGeometry(0.19, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), "matte", k.dark, side * 0.6, 1.36, 0, 0, 0, side * 0.6, 1.05, 0.7, 0.95);
        put(body, new THREE.IcosahedronGeometry(0.035, 0), "metal", k.trim, side * 0.6, 1.62, -0.05);
        if (relic) {
          put(body, new THREE.SphereGeometry(0.2, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), "metal", k.trim, side * 0.62, 1.38, 0, 0, 0, side * 0.75, 1.1, 0.7, 1);
          for (const dz of [-0.12, 0.1]) put(body, new THREE.ConeGeometry(0.05, 0.22, 4), "metal", k.trim, side * 0.62, 1.7, dz, 0, 0, side * -0.5);
        }
      }
    }
    // Mantle, cowl, drape, peak.
    put(body, new THREE.CylinderGeometry(0.3, 0.46, 0.16, 8), "matte", k.dark, 0, 1.56, 0.04, 0, Math.PI / 8, 0, 1, 1, 0.8);
    const gap = 0.46 * Math.PI;
    put(head, new THREE.SphereGeometry(0.35, 10, 7, 1.5 * Math.PI + gap / 2, 2 * Math.PI - gap, 0, 0.66 * Math.PI), "matte", k.dark, 0, 0.0, 0.05, 0, 0, 0, 1, 1.12, 1.1);
    put(head, new THREE.BoxGeometry(0.46, 0.32, 0.08), "matte", k.dark, 0, -0.26, 0.3, 0.25, 0, 0);
    put(head, new THREE.ConeGeometry(0.13, 0.32, 6), "matte", k.dark, 0, 0.34, 0.14, -0.55, 0, 0);
    // Cape from fine up (and on the heirloom); a relic's sweeps long with a glowing hem.
    if (heir || k.rarity >= 1) {
      put(cape, new THREE.BoxGeometry(0.8, 0.62, 0.05), "matte", k.dark, 0, -0.31, 0);
      const len = relic ? 1.5 : 1;
      put(capeLow, new THREE.BoxGeometry(0.84, 0.48 * len, 0.05), "matte", k.dark, 0, -0.24 * len, 0);
      put(capeLow, new THREE.BoxGeometry(0.86, 0.05, 0.06), relic ? "glow" : "metal", relic ? k.glow : k.trim, 0, -0.48 * len, 0);
      put(capeLow, new THREE.ConeGeometry(0.09, 0.12, 4), "matte", k.dark, -0.3, -0.48 * len - 0.06, 0, Math.PI, Math.PI / 4, 0, 1, 1, 0.4);
      put(capeLow, new THREE.ConeGeometry(0.09, 0.12, 4), "matte", k.dark, 0.3, -0.48 * len - 0.06, 0, Math.PI, Math.PI / 4, 0, 1, 1, 0.4);
    }
  }

  function dressHead(k, hooded) {
    if (!k) return;
    if (k.tier === "heirloom") {
      // The cowl's gold-rimmed opening and the brow gem.
      put(head, new THREE.TorusGeometry(0.255, 0.028, 4, 14), "metal", k.trim, 0, 0.0, -0.21, 0, 0, 0, 1, 1.15, 1);
      put(head, new THREE.OctahedronGeometry(0.05, 0), "metal", k.trim, 0, 0.18, -0.24);
      return;
    }
    const r = hooded ? 0.36 : 0.29;
    const y = hooded ? 0.16 : 0.12;
    put(head, new THREE.TorusGeometry(r, 0.03, 4, 18), "metal", k.trim, 0, y, 0.02, Math.PI / 2 + 0.12, 0, 0);
    if (k.rarity >= 1) put(head, new THREE.OctahedronGeometry(k.rarity >= 2 ? 0.06 : 0.045, 0), k.glow ? "glow" : "metal", k.glow || k.trim, 0, y + 0.02, -r - 0.01);
    if (k.tier === "relic") {
      // A crown of points and a halo hanging above it.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        put(head, new THREE.ConeGeometry(0.045, i === 0 ? 0.22 : 0.15, 4), "metal", k.trim, Math.sin(a) * r, y + 0.1, -Math.cos(a) * r + 0.02);
      }
      put(head, new THREE.TorusGeometry(0.22, 0.018, 4, 20), "glow", k.glow, 0, y + 0.42, 0.04, Math.PI / 2, 0, 0);
    }
  }

  function dressFeet(k) {
    if (!k) {
      matToe.color.setHex(WRAPS);
      return;
    }
    const boot = k.tier === "heirloom" ? 0x241c18 : darker(k.leather, 0.6);
    matToe.color.setHex(boot);
    for (const leg of [leftLeg, rightLeg]) {
      put(leg, new THREE.CylinderGeometry(0.135, 0.12, 0.24, 7), "matte", k.leather, 0, -0.48, 0);
      put(leg, new THREE.CylinderGeometry(0.15, 0.15, 0.05, 7), "matte", boot, 0, -0.37, 0);
      put(leg, new THREE.BoxGeometry(0.2, 0.14, 0.34), "matte", boot, 0, -0.63, -0.05);
      if (k.tier === "heirloom" || k.rarity >= 1) put(leg, new THREE.IcosahedronGeometry(0.085, 0), "metal", k.steel, 0, -0.36, -0.1, 0, 0, 0, 1.1, 0.85, 0.6);
      if (k.rarity >= 2) {
        put(leg, new THREE.BoxGeometry(0.16, 0.22, 0.04), "metal", k.steel, 0, -0.5, -0.13);
        put(leg, new THREE.TorusGeometry(0.14, 0.02, 4, 10), k.glow ? "glow" : "metal", k.glow || k.trim, 0, -0.58, 0, Math.PI / 2, 0, 0);
      }
      if (k.tier === "relic") {
        const side = leg === leftLeg ? -1 : 1;
        put(leg, new THREE.ConeGeometry(0.06, 0.3, 3), "metal", k.trim, side * 0.15, -0.46, 0.05, 0.5, 0, side * 0.9, 1, 1, 0.4);
        put(leg, new THREE.ConeGeometry(0.045, 0.22, 3), "metal", k.trim, side * 0.14, -0.56, 0.1, 0.8, 0, side * 0.9, 1, 1, 0.4);
      }
    }
  }

  function dressWeapon(k) {
    if (!k) return;
    if (k.tier === "heirloom") {
      put(sword, new THREE.CylinderGeometry(0.032, 0.032, 0.22, 6), "matte", k.leather, 0, 0, 0, Math.PI / 2, 0, 0);
      put(sword, new THREE.IcosahedronGeometry(0.048, 0), "metal", k.trim, 0, 0, 0.14);
      put(sword, new THREE.BoxGeometry(0.3, 0.05, 0.06), "metal", k.trim, 0, 0, -0.13);
      put(sword, new THREE.BoxGeometry(0.095, 0.03, 0.82), "metal", k.steel, 0, 0, -0.57);
      put(sword, new THREE.BoxGeometry(0.03, 0.034, 0.6), "metal", k.trim, 0, 0, -0.45);
      put(sword, new THREE.ConeGeometry(0.048, 0.14, 4), "metal", k.steel, 0, 0, -1.05, -Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.33);
      return;
    }
    const relic = k.tier === "relic";
    const len = [0.7, 0.82, 0.9, 1.1][k.rarity];
    const w = relic ? 0.13 : 0.09;
    put(sword, new THREE.CylinderGeometry(0.032, 0.032, relic ? 0.3 : 0.22, 6), "matte", k.leather, 0, 0, relic ? 0.03 : 0, Math.PI / 2, 0, 0);
    if (relic) put(sword, new THREE.OctahedronGeometry(0.075, 0), "glow", k.glow, 0, 0, 0.22, 0, 0, 0, 1, 1, 1.4);
    else put(sword, new THREE.IcosahedronGeometry(0.048, 0), "metal", k.trim, 0, 0, 0.14);
    const guard = [0.24, 0.3, 0.34, 0.42][k.rarity];
    put(sword, new THREE.BoxGeometry(guard, 0.05, 0.06), "metal", k.trim, 0, 0, -0.13);
    if (k.rarity >= 2) {
      // Swept guard tips.
      for (const side of [-1, 1]) put(sword, new THREE.ConeGeometry(0.03, 0.14, 4), "metal", k.trim, side * (guard / 2 + 0.03), 0, -0.18, Math.PI / 2 + 0.5, 0, 0);
    }
    const mid = -0.16 - len / 2;
    put(sword, new THREE.BoxGeometry(w, 0.03, len), "metal", k.steel, 0, 0, mid);
    if (k.rarity >= 1) put(sword, new THREE.BoxGeometry(0.026, 0.034, len * 0.72), k.glow ? "glow" : "metal", k.glow || k.trim, 0, 0, mid + len * 0.08);
    if (relic) {
      // Glowing edges.
      put(sword, new THREE.BoxGeometry(0.014, 0.022, len * 0.94), "glow", k.glow, -w / 2 - 0.004, 0, mid);
      put(sword, new THREE.BoxGeometry(0.014, 0.022, len * 0.94), "glow", k.glow, w / 2 + 0.004, 0, mid);
      put(sword, new THREE.OctahedronGeometry(0.05, 0), "glow", k.glow, 0, 0.0, -0.13, 0, 0, 0, 1, 1, 0.7);
    }
    put(sword, new THREE.ConeGeometry(w / 2, 0.16, 4), "metal", k.steel, 0, 0, -0.16 - len - 0.08, -Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.33);
  }

  function heaterShape(sx, sy) {
    const s = new THREE.Shape();
    s.moveTo(-0.27 * sx, 0.3 * sy);
    s.lineTo(0.27 * sx, 0.3 * sy);
    s.lineTo(0.27 * sx, 0.0);
    s.quadraticCurveTo(0.24 * sx, -0.25 * sy, 0, -0.42 * sy);
    s.quadraticCurveTo(-0.24 * sx, -0.25 * sy, -0.27 * sx, 0.0);
    s.lineTo(-0.27 * sx, 0.3 * sy);
    return s;
  }
  function slab(shape, depth) {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 3 });
    g.rotateY(Math.PI / 2);
    return g;
  }
  function dressOffhand(k) {
    if (!k) return;
    if (k.tier === "plain") {
      // A round wooden buckler with an iron boss.
      put(shield, new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12), "matte", darker(k.leather, 1.35), -0.06, -0.02, 0, 0, 0, Math.PI / 2);
      put(shield, new THREE.TorusGeometry(0.3, 0.025, 4, 14), "metal", k.trim, -0.06, -0.02, 0, 0, Math.PI / 2, 0);
      put(shield, new THREE.IcosahedronGeometry(0.07, 0), "metal", k.trim, -0.1, -0.02, 0, 0, 0, 0, 0.6, 1, 1);
      return;
    }
    const relic = k.tier === "relic";
    const sx = relic ? 1.12 : 1;
    const sy = relic ? 1.35 : 1;
    const face = k.tier === "rare" ? k.steel : k.tier === "relic" ? k.dark : k.cloth;
    put(shield, slab(heaterShape(sx, sy), 0.05), k.tier === "rare" ? "metal" : "matte", face, -0.06, 0, 0);
    put(shield, slab(heaterShape(sx, sy), 0.04), "metal", k.trim, -0.02, 0, 0, 0, 0, 0, 1, 1.08, 1.08);
    if (k.tier === "rare") {
      // A theme-coloured lozenge on the steel and a glowing boss.
      put(shield, new THREE.OctahedronGeometry(0.17, 0), "matte", k.cloth, -0.075, -0.02, 0, 0, 0, 0, 0.25, 1.3, 1);
      put(shield, new THREE.IcosahedronGeometry(0.06, 0), "glow", k.glow, -0.1, -0.02, 0, 0, 0, 0, 0.6, 1, 1);
    } else if (relic) {
      // A glowing sigil: a ring with a bar through it, and studs at the corners.
      put(shield, new THREE.TorusGeometry(0.13, 0.022, 4, 16), "glow", k.glow, -0.085, 0.02, 0, 0, Math.PI / 2, 0);
      put(shield, new THREE.BoxGeometry(0.02, 0.5, 0.03), "glow", k.glow, -0.085, -0.06, 0);
      for (const z of [-0.22, 0.22]) put(shield, new THREE.ConeGeometry(0.035, 0.12, 4), "metal", k.trim, -0.12, 0.34, z, 0, 0, Math.PI / 2);
    } else {
      put(shield, new THREE.BoxGeometry(0.02, 0.62 * sy, 0.07), "metal", k.trim, -0.075, -0.04, 0);
      put(shield, new THREE.BoxGeometry(0.02, 0.07, 0.48 * sx), "metal", k.trim, -0.075, 0.12, 0);
      put(shield, new THREE.IcosahedronGeometry(0.07, 0), "metal", k.trim, -0.09, 0.12, 0, 0, 0, 0, 0.6, 1, 1);
    }
  }

  function dressTrinket(k) {
    if (!k) return;
    if (k.tier === "relic") {
      // The charm leaves the chest and circles the Warden.
      put(orbit, new THREE.OctahedronGeometry(0.1, 0), "glow", k.glow, 0.85, 0, 0, 0, 0, 0, 1, 1.4, 1);
      put(orbit, new THREE.TorusGeometry(0.15, 0.015, 4, 14), "metal", k.trim, 0.85, 0, 0, 0, 0, 0);
      return;
    }
    put(torso, new THREE.TorusGeometry(0.2, 0.012, 3, 12), "matte", k.leather, 0, 0.16, -0.12, Math.PI / 2 - 0.5, 0, 0, 1, 1.25, 1);
    put(torso, new THREE.OctahedronGeometry(k.rarity >= 1 ? 0.06 : 0.045, 0), k.glow ? "glow" : "metal", k.glow || k.trim, 0, 0.0, -0.36, 0, 0, 0, 1, 1.3, 0.6);
  }

  // ---- relic motes ----
  const MOTE_MAX = 30;
  const moteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false });
  moteMat.flatShading = true;
  const motes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.035, 0), moteMat, MOTE_MAX);
  motes.frustumCulled = false;
  motes.count = 0;
  motes.name = "relicMotes";
  player.add(motes);
  const moteSeeds = [];
  for (let i = 0; i < MOTE_MAX; i++) moteSeeds.push({ a: i * 2.39996, r: 0.55 + (i % 5) * 0.08, speed: 0.6 + (i % 7) * 0.12, phase: (i * 0.37) % 1 });

  let worn = { orbit: false, glowing: false };

  function clearLayer() {
    for (const g of rigGroups) {
      for (let i = g.children.length - 1; i >= 0; i--) {
        const c = g.children[i];
        if (c.userData.layer === "gear") {
          g.remove(c);
          c.geometry.dispose();
        }
      }
    }
  }

  function dress(equipped) {
    lastEquipped = equipped;
    const eq = equipped || {};
    clearLayer();
    const looks = {};
    for (const slot of ["weapon", "offhand", "head", "body", "feet", "trinket"]) looks[slot] = gearLook(eq[slot]);
    if (lib) libDress(looks);
    if (skin) skin.paint(libPalette(looks.body), !!looks.body);
    if (!lib) {
      dressBody(looks.body);
      dressHead(looks.head, !!looks.body);
      dressFeet(looks.feet);
      dressWeapon(looks.weapon);
      dressOffhand(looks.offhand);
      dressTrinket(looks.trinket);
    }
    flush("gear");
    // Motes: five per relic, in its colour.
    let n = 0;
    const c = new THREE.Color();
    for (const slot in looks) {
      const k = looks[slot];
      if (!k || !k.motes) continue;
      for (let i = 0; i < k.motes && n < MOTE_MAX; i++, n++) motes.setColorAt(n, c.setHex(k.glow));
    }
    motes.count = n;
    if (motes.instanceColor) motes.instanceColor.needsUpdate = true;
    worn = {
      orbit: !!(looks.trinket && looks.trinket.tier === "relic"),
      glowing: Object.values(looks).some((k) => k && k.glow)
    };
    return looks;
  }

  let clock = 0;
  const _mm = new THREE.Matrix4();
  const _mp = new THREE.Vector3();
  const _ms = new THREE.Vector3();
  const _mq = new THREE.Quaternion();
  // motion: rt.heroMotion (play/move.js, play/heroanim.js, play/herolook.js) for the clips.
  function tick(dt, motion) {
    clock += dt || 0;
    if (skin) skin.update(dt || 0, motion);
    if (worn.orbit) {
      orbit.rotation.y = clock * 1.6;
      orbit.position.y = 1.25 + Math.sin(clock * 2.2) * 0.12;
    }
    if (worn.glowing) {
      const k = 0.85 + 0.25 * Math.sin(clock * 3.1);
      matGlow.color.setRGB(k, k, k);
    }
    for (let i = 0; i < motes.count; i++) {
      const s = moteSeeds[i];
      const u = (clock * s.speed * 0.35 + s.phase) % 1;
      const a = s.a + clock * s.speed;
      _mp.set(Math.cos(a) * s.r, 0.2 + u * 2.0, Math.sin(a) * s.r);
      const sc = Math.sin(u * Math.PI);
      _ms.set(sc, sc, sc);
      _mm.compose(_mp, _mq, _ms);
      motes.setMatrixAt(i, _mm);
    }
    if (motes.count) motes.instanceMatrix.needsUpdate = true;
  }

  dress(null);
  scene.add(player);
  void toe;

  // Switch to the Blender pieces once they load: rebuild the base, re-dress what is worn.
  const ready = loadPartLibrary("./assets/models/hero.glb", "hp_").then((parts) => {
    lib = parts;
    for (const g of rigGroups) {
      for (let i = g.children.length - 1; i >= 0; i--) {
        const c = g.children[i];
        if (c.userData.layer === "base") {
          g.remove(c);
          c.geometry.dispose();
        }
      }
    }
    libBase();
    flush("base");
    dress(lastEquipped);
    return true;
  }).catch((err) => {
    console.warn("[hero] Warden parts did not load; keeping the code-built Warden", err);
    return false;
  }).then((ok) => {
    if (!ok) return false;
    // The skinned Warden takes over the body once assets/models/warden.glb loads; the
    // code rig keeps animating and drives its bones. Without it the pieces stay.
    return loadWardenSkin().then((gltf) => {
      skin = attachWardenSkin({ player, body, leftLeg, rightLeg, leftArm, rightArm, torso, head, cape, sword, shield }, gltf, matMatte);
      for (const g of rigGroups) {
        if (carried(g)) continue;
        for (let i = g.children.length - 1; i >= 0; i--) {
          const c = g.children[i];
          if (c.userData.layer === "base" || c.userData.layer === "gear") {
            g.remove(c);
            c.geometry.dispose();
          }
        }
      }
      // the facing oracles stay for the self-test, unseen
      nose.visible = false;
      toe.visible = false;
      dress(lastEquipped);
      return true;
    }).catch((err) => {
      console.warn("[hero] skinned Warden did not load; keeping the pieces", err);
      return true;
    });
  });

  return { player, body, leftLeg, rightLeg, leftArm, rightArm, torso, cape, head, nose, sword, shield, dress, tick, ready, skin: () => skin };
}
