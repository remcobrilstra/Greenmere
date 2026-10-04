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
      const key = o.name.startsWith("wd_gear") ? "gear" : o.name.startsWith("wd_base") ? "base" : null;
      if (!key) return;
      o.material = material;
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
  const skeleton = (meshes.base || meshes.gear).skeleton;
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

  function pose(link, rot) {
    // bone = l0 · w0⁻¹ · rot · w0
    _q.copy(link.w0i).multiply(rot).multiply(link.w0);
    link.b.quaternion.copy(link.l0).multiply(_q);
  }
  function retarget() {
    for (let i = 0; i < links.length; i++) {
      const [group, link, c, after] = links[i];
      _r.copy(group.quaternion);
      if (after) _r.multiply(after);
      if (c) _r.multiply(c);
      pose(link, _r);
    }
    for (let i = 0; i < fixed.length; i++) pose(fixed[i][0], fixed[i][1]);
    chest.b.scale.set(chest.s0.x, chest.s0.y * hero.torso.scale.y, chest.s0.z);
    root.updateMatrixWorld(true);
    // the renderer refreshed the skeletons before this hook; refresh them for this pose
    for (const k in meshes) meshes[k].skeleton.update();
  }

  // The sword and shield groups move from the code arms onto the hand and forearm
  // bones, keeping the orientation they have in the code rig's neutral pose.
  function carry(group, codeArm, boneName, offset) {
    const saved = codeArm.quaternion.clone();
    codeArm.quaternion.identity();
    hero.player.updateMatrixWorld(true);
    retarget();
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

  let active = null;
  function show(key) {
    if (active === key) return;
    for (const k in meshes) meshes[k].visible = k === key;
    active = key;
  }
  function paint(pal, worn) {
    const key = worn && meshes.gear ? "gear" : "base";
    const m = meshes[key];
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
    show(key);
  }

  hero.body.add(root);
  // retarget before every draw of either outfit (and their shadows): the play code,
  // the death fall and the portrait all pose the code rig and then render.
  for (const k in meshes) {
    meshes[k].onBeforeRender = retarget;
    meshes[k].onBeforeShadow = retarget;
  }
  carry(hero.sword, hero.rightArm, "hand.R", new THREE.Vector3(0, -0.04, 0));
  carry(hero.shield, hero.leftArm, "forearm.L", new THREE.Vector3(-0.1, -0.12, 0));
  retarget();
  return { root, meshes, paint, retarget, bone };
}
