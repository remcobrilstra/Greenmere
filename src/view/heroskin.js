import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

// The skinned Warden (docs/characters.md, phase 1): assets/models/warden.glb from
// tools/blender/humans.py build_warden(). One skeleton and two outfits on it,
// wd_base (linen) and wd_gear (gambeson, tabard, hood, pauldrons, cape). Vertex
// colour R holds a hero colour slot, G the baked shade; paint() fills them from a
// palette (view/hero.js libPalette), so the worn gear's colours still show.
//
// The code rig in view/hero.js stays the animation source: movement, strikes, the
// hearth, the death fall and the portrait keep writing rotations on its groups.
// The model hangs under `body` (so whole-body moves just work), the code meshes are
// hidden, and before each render retarget() turns each group's rotation into its
// bone's: bone = rest * W0⁻¹ (R · C) W0, where W0 is the bone's rest orientation in
// model space, R the group rotation and C the bind correction (the A-pose arms).

const A_POSE = (40 * Math.PI) / 180;
const FOREARM_BEND = 0.28;

let loader = null;
export function loadWardenSkin() {
  if (!loader) loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync("./assets/models/warden.glb");
}

const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _r2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

// hero: the buildHero handles. material: the hero's matte material (vertex colours).
export function attachWardenSkin(hero, gltf, material) {
  const root = gltf.scene;
  root.name = "wardenSkin";
  const meshes = {};
  root.traverse((o) => {
    if (o.isSkinnedMesh) {
      if (!o.name.startsWith("wd_")) return;
      const key = o.name.slice(3);
      o.material = material;
      o.visible = false;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      o.userData.layer = "skin";
      // keep the slot codes; `color` is rewritten per look
      const c = o.geometry.attributes.color;
      const n = c.count;
      const code = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        code[i * 2] = c.getX(i);
        code[i * 2 + 1] = c.getY(i);
      }
      o.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      o.userData.code = code;
      meshes[key] = o;
    }
  });
  const skeleton = (meshes.core || Object.values(meshes)[0]).skeleton;
  // GLTFLoader sanitizes node names ("thigh.L" arrives as "thighL"); accept either.
  const bone = (name) => skeleton.bones.find((b) => b.name === name || b.name === name.replace(/[.[\]:/]/g, ""));
  root.updateMatrixWorld(true);
  function rest(name) {
    const b = bone(name);
    const w0 = new THREE.Quaternion();
    b.getWorldQuaternion(w0);
    return { b, l0: b.quaternion.clone(), w0, w0i: w0.clone().invert(), s0: b.scale.clone() };
  }
  const corr = (axis, a) => new THREE.Quaternion().setFromAxisAngle(axis, a);
  const capeRest = corr(X, -0.22);
  // [code group, bone, bind correction applied before the group's rotation]
  const links = [
    [hero.leftLeg, rest("thigh.L"), null],
    [hero.rightLeg, rest("thigh.R"), null],
    [hero.leftArm, rest("upperArm.L"), corr(Z, A_POSE)],
    [hero.rightArm, rest("upperArm.R"), corr(Z, -A_POSE)],
    [hero.head, rest("head"), null],
    [hero.cape, rest("cape.1"), null, capeRest]
  ];
  const fixed = [
    [rest("forearm.L"), corr(X, FOREARM_BEND)],
    [rest("forearm.R"), corr(X, FOREARM_BEND)]
  ];
  const chest = rest("chest");

  // Every bone the clips move, for blending back toward the code pose.
  const all = skeleton.bones.map((b) => ({ b, l0: b.quaternion.clone() }));
  const coded = new Set();
  function pose(link, rot, w) {
    // bone = l0 · w0⁻¹ · rot · w0, blended in by w over what is there
    _q.copy(link.w0i).multiply(rot).multiply(link.w0);
    const target = _r2.copy(link.l0).multiply(_q);
    if (w >= 1) link.b.quaternion.copy(target);
    else link.b.quaternion.slerp(target, w);
    coded.add(link.b);
  }
  // The code rig's pose onto the bones; w < 1 blends it over the clip pose.
  function retarget(w) {
    w = typeof w === "number" ? w : 1;
    coded.clear();
    for (let i = 0; i < links.length; i++) {
      const [group, link, c, after] = links[i];
      _r.copy(group.quaternion);
      if (after) _r.multiply(after);
      if (c) _r.multiply(c);
      pose(link, _r, w);
    }
    for (let i = 0; i < fixed.length; i++) pose(fixed[i][0], fixed[i][1], w);
    if (w < 1) {
      for (let i = 0; i < all.length; i++) if (!coded.has(all[i].b)) all[i].b.quaternion.slerp(all[i].l0, w);
    }
    chest.b.scale.set(chest.s0.x, chest.s0.y * hero.torso.scale.y, chest.s0.z);
    root.updateMatrixWorld(true);
    // the renderer refreshed the skeletons before this hook; refresh them for this pose
    for (const k in meshes) if (meshes[k].visible) meshes[k].skeleton.update();
  }

  // The sword and shield groups move from the code arms onto the hand and forearm
  // bones, keeping the orientation they have in the code rig's neutral pose.
  function carry(group, codeArm, boneName, offset) {
    const saved = codeArm.quaternion.clone();
    codeArm.quaternion.identity();
    hero.player.updateMatrixWorld(true);
    restPose();
    const b = bone(boneName);
    // the group's neutral world rotation, the bone's world position plus an offset in model space
    group.updateMatrixWorld(true);
    const want = new THREE.Quaternion();
    group.getWorldQuaternion(want);
    const at = new THREE.Vector3();
    b.getWorldPosition(at);
    const bq = new THREE.Quaternion();
    b.getWorldQuaternion(bq);
    at.add(offset.clone().applyQuaternion(hero.body.getWorldQuaternion(new THREE.Quaternion())));
    b.add(group);
    const inv = new THREE.Matrix4().copy(b.matrixWorld).invert();
    group.position.copy(at.applyMatrix4(inv));
    group.quaternion.copy(bq.invert().multiply(want));
    codeArm.quaternion.copy(saved);
  }

  // ---- dressing ----
  // Which pieces show, and in whose colours, from the worn looks (view/gearlook.js),
  // mirroring the tiers of the piece-built Warden (view/hero.js libDress). Glowing
  // pieces take the glow material and the slot's glow colour.
  const GLOW_ALWAYS = new Set(["cape_hem", "runes", "halo", "halo_hood", "sword_relic_glow", "shield_relic_glow"]);
  const GLOW_IF = new Set(["gem", "gem_big", "circlet_gem", "circlet_gem_hood", "greave_rings", "pendant", "pendant_big",
    "sword_rare_glow", "shield_kite_glow"]);
  const painted = new Map();
  function paintPiece(m, pal, key) {
    if (painted.get(m) === key) return;
    painted.set(m, key);
    const code = m.userData.code;
    const col = m.geometry.attributes.color;
    const arr = col.array;
    for (let i = 0; i < col.count; i++) {
      const c = pal[Math.min(pal.length - 1, Math.floor(code[i * 2] * 16))];
      const k = code[i * 2 + 1];
      arr[i * 3] = c.r * k;
      arr[i * 3 + 1] = c.g * k;
      arr[i * 3 + 2] = c.b * k;
    }
    col.needsUpdate = true;
  }
  // looks: { body, head, feet, trinket } (gear looks or null); palette(look) -> slot colours;
  // mats: { matte, glow }.
  function dress(looks, palette, mats) {
    const show = new Map();
    const put = (name, look) => show.set(name, look || null);
    const k = looks.body;
    const h = looks.head;
    const f = looks.feet;
    const t = looks.trinket;
    put("core");
    put("trousers");
    put("gloves");
    const helm = !!(h && h.tier === "heirloom");
    const hood = !!k && !helm;
    if (k) {
      const relic = k.tier === "relic";
      put("coat", k);
      put("mantle", k);
      if (hood) put("hood", k);
      if (k.tier === "heirloom" || k.rarity >= 1) {
        if (relic) {
          put("pauldrons_big", k);
          put("horns", k);
          put("cape_long", k);
          put("cape_hem", k);
        } else {
          put("pauldrons", k);
          put("cape", k);
        }
      }
      put(relic ? "gem_big" : "gem", k);
      if (relic) put("runes", k);
    } else put("linen");
    if (!hood && !helm) put("hair");
    if (h) {
      if (helm) put("helm", h);
      else {
        const sfx = hood ? "_hood" : "";
        put("circlet" + sfx, h);
        if (h.rarity >= 1) put("circlet_gem" + sfx, h);
        if (h.tier === "relic") {
          put("crown" + sfx, h);
          put("halo" + sfx, h);
        }
      }
    }
    if (f) {
      put("boots", f);
      if (f.tier === "heirloom" || f.rarity >= 1) put("kneecops", f);
      if (f.rarity >= 2) {
        put("greaves", f);
        put("greave_rings", f);
      }
      if (f.tier === "relic") put("spikes", f);
    } else put("wraps");
    if (t && t.tier !== "relic") {
      put("necklace", t);
      put(t.rarity >= 1 ? "pendant_big" : "pendant", t);
    }
    // held gear, when the file has it (older warden.glb files leave it to the pieces)
    const w = looks.weapon;
    if (w && meshes.sword_plain) {
      const kind = w.tier === "heirloom" ? "heir" : w.tier === "relic" ? "relic" : w.tier === "rare" ? "rare" : w.tier === "fine" ? "fine" : "plain";
      put("sword_" + kind, w);
      if (kind === "rare" || kind === "relic") put("sword_" + kind + "_glow", w);
    }
    const o = looks.offhand;
    if (o && meshes.shield_round) {
      const kind = o.tier === "plain" ? "round" : o.tier === "rare" ? "kite" : o.tier === "relic" ? "relic" : "heater";
      put("shield_" + kind, o);
      if (kind === "kite" || kind === "relic") put("shield_" + kind + "_glow", o);
    }
    for (const name in meshes) {
      const m = meshes[name];
      const on = show.has(name);
      m.visible = on;
      if (!on) continue;
      const look = show.get(name);
      const glow = GLOW_ALWAYS.has(name) || (GLOW_IF.has(name) && !!(look && look.glow));
      m.material = glow ? mats.glow : mats.matte;
      m.castShadow = !glow;
      const hex = glow ? (look && look.glow) || 0xffffff : 0;
      const pal = glow ? palette(look).map(() => new THREE.Color(hex)) : palette(look);
      paintPiece(m, pal, glow ? "g" + hex : JSON.stringify(look || 0));
    }
  }

  // ---- clips (tools/blender/humans.py wd_clips) ----
  // Gameplay timing stays in charge: walk and run are scrubbed from the movement phase,
  // the strike from rt.strikeInfo; idle, hearth and mend loop on their own clock; the
  // flinch plays when hp drops. While the Warden is dying the code rig takes over again.
  const clips = {};
  for (const c of gltf.animations || []) clips[c.name] = c;
  const mixer = clips.idle ? new THREE.AnimationMixer(root) : null;
  const acts = {};
  if (mixer) {
    for (const name of ["idle", "walk", "run", "strike", "hearth", "mend", "flinch"]) {
      if (!clips[name]) continue;
      const a = mixer.clipAction(clips[name]);
      a.play();
      a.setEffectiveWeight(0);
      acts[name] = a;
    }
  }
  const STRIKE_END = 0.46;
  const FLINCH_S = 0.3;
  let clock = 0;
  let codeMix = 1;
  let flinchT = -1;
  let lastHp = null;
  let clipsOn = false;
  function weigh(name, w, t) {
    const a = acts[name];
    if (!a) return;
    a.setEffectiveWeight(w);
    a.time = t;
  }
  function update(dt, m) {
    if (!mixer || !m) {
      clipsOn = false;
      return;
    }
    clock += dt;
    codeMix += ((m.dying ? 1 : 0) - codeMix) * Math.min(1, dt * 10);
    if (codeMix > 0.995) {
      clipsOn = false;
      return;
    }
    if (lastHp != null && m.hp < lastHp - 0.5 && !(m.strike >= 0)) flinchT = 0;
    lastHp = m.hp;
    // overlays by priority, each taking its share of what is left
    const s = m.strike;
    const ws = s >= 0 ? Math.min(1, s / 0.05, (STRIKE_END - s) / 0.1) : 0;
    let wf = 0;
    if (flinchT >= 0) {
      wf = Math.min(1, flinchT / 0.04, (FLINCH_S - flinchT) / 0.12);
      flinchT += dt;
      if (flinchT > FLINCH_S) flinchT = -1;
    }
    let left = 1;
    const take = (w) => {
      const e = Math.max(0, Math.min(1, w)) * left;
      left -= e;
      return e;
    };
    const eStrike = take(ws);
    const eFlinch = take(wf);
    const eHearth = take(m.hearth || 0);
    const eMend = take(m.mend || 0);
    const move = Math.max(0, Math.min(1, m.move || 0));
    const sprint = Math.max(0, Math.min(1, m.sprint || 0));
    const cyc = (((m.phase || 0) / (Math.PI * 2)) % 1 + 1) % 1;
    const dur = (n) => (acts[n] ? acts[n].getClip().duration : 1);
    weigh("idle", left * (1 - move), clock % dur("idle"));
    weigh("walk", left * move * (1 - sprint), cyc * dur("walk"));
    weigh("run", left * move * sprint, cyc * dur("run"));
    weigh("strike", eStrike, Math.max(0, Math.min(1, s / STRIKE_END)) * dur("strike"));
    weigh("flinch", eFlinch, Math.max(0, flinchT));
    weigh("hearth", eHearth, clock % dur("hearth"));
    weigh("mend", eMend, clock % dur("mend"));
    mixer.update(0);
    if (codeMix > 0.005) retarget(codeMix);
    clipsOn = true;
  }

  // The pose carried gear is fitted against: the idle clip's first frame when there are
  // clips (that is how the hand holds things most of the time), else the code rig's.
  function restPose() {
    if (!mixer || !acts.idle) {
      retarget(1);
      return;
    }
    for (const k in acts) acts[k].setEffectiveWeight(0);
    acts.idle.setEffectiveWeight(1);
    acts.idle.time = 0;
    mixer.update(0);
    root.updateMatrixWorld(true);
  }

  hero.body.add(root);
  // Without clips (or while dying) the code rig poses the bones before every draw of
  // either outfit and their shadows: the death fall and the portrait pose the code rig
  // and then render.
  const codeDraw = () => {
    if (!clipsOn) retarget(1);
  };
  for (const k in meshes) {
    meshes[k].onBeforeRender = codeDraw;
    meshes[k].onBeforeShadow = codeDraw;
  }
  carry(hero.sword, hero.rightArm, "hand.R", new THREE.Vector3(0, -0.04, 0));
  carry(hero.shield, hero.leftArm, "forearm.L", new THREE.Vector3(-0.1, -0.12, 0));
  // the gear pieces were sized for the code rig's long arms
  hero.sword.scale.setScalar(0.78);
  // and held lower at rest: the blade hangs forward and down instead of level
  hero.sword.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(X, -0.55));
  hero.shield.scale.setScalar(0.85);
  retarget();
  return { root, meshes, dress, retarget, update, bone, clips: Object.keys(acts), holds: !!meshes.sword_plain };
}
