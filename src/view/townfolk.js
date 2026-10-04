// Villagers: one merged body (torso, head, hair, hat, apron) and four limb
// pivots, all on one vertex-colour Lambert material. Local forward is −z, like
// the hero. They are built from code first, then dressed from Blender:
//
// - Skinned (docs/characters.md, phase 3): assets/models/folk.glb from
//   tools/blender/humans.py build_folk(), the human skeleton and its pieces (body,
//   hair styles, beard, tunic, dress, apron, trousers, shoes, hats). Each villager
//   gets its own copy of the skeleton and one skinned mesh merged from the pieces its
//   look calls for, painted from the look. poseVillager keeps posing the limb groups
//   and retargets them onto the bones.
// - Otherwise the older part library (assets/models/villager.glb,
//   tools/blender/villagers.py) re-skins the code-built body and limbs.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mulberry32 } from "../sim/rng.js";
import { paintFaces, mergeParts, lambert } from "./materials.js";
import { loadPartLibrary, paintParts, swapGeometry } from "./partlib.js";

let _mat = null;

// ---------- Blender part library ----------

const SLOTS = ["tunic", "tunicDark", "trim", "skin", "hair", "leather", "boots", "eye", "linen", "apron",
  "trousers", "hat", "gold", "lip", "skinShade", "white"];
const PIVOTS = { arm_l: [-0.4, 1.33], arm_r: [0.4, 1.33], leg_l: [-0.15, 0.53], leg_r: [0.15, 0.53] };
let library = null;
let libraryAsked = false;
let partMat = null;
const waiting = [];
let markReady = null;
const ready = new Promise((res) => { markReady = res; });

// Resolves once the part library has loaded (or failed) and every villager built so far is re-skinned.
export function villagerPartsReady() {
  requestLibrary();
  return ready;
}

function requestLibrary() {
  if (libraryAsked) return;
  libraryAsked = true;
  loadFolk().then((ok) => {
    if (ok) {
      partMat = lambert({ side: THREE.DoubleSide });
      for (const v of waiting.splice(0)) dressSkinned(v);
      markReady(true);
      return;
    }
    loadParts();
  });
}

function loadParts() {
  loadPartLibrary("./assets/models/villager.glb", "vp_").then((lib) => {
    library = lib;
    partMat = lambert({ side: THREE.DoubleSide });
    for (const v of waiting.splice(0)) reskin(v);
    markReady(true);
  }).catch((err) => {
    console.warn("[townfolk] villager parts did not load; keeping the code-built villagers", err);
    markReady(false);
  });
}


// ---------- skinned villagers (folk.glb) ----------

let folk = null;
const A_POSE = (40 * Math.PI) / 180;
const FOREARM_BEND = 0.28;

function loadFolk() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync("./assets/models/folk.glb").then((gltf) => {
    const pieces = {};
    let template = null;
    gltf.scene.traverse((o) => {
      if (!o.isSkinnedMesh || !o.name.startsWith("fk_")) return;
      pieces[o.name.slice(3)] = o.geometry;
      if (!template) template = o;
    });
    if (!template) return false;
    gltf.scene.updateMatrixWorld(true);
    const bones = template.skeleton.bones;
    const rootBone = bones.find((b) => !b.parent || !b.parent.isBone);
    // rest orientation of every bone in the skeleton's own space (above the root bone)
    const rest = {};
    for (const b of bones) {
      const w0 = b.quaternion.clone();
      for (let q = b.parent; q && q.isBone; q = q.parent) w0.premultiply(q.quaternion);
      if (rootBone.parent) w0.premultiply(rootBone.parent.quaternion);
      rest[b.name] = { l0: b.quaternion.clone(), w0, w0i: w0.clone().invert() };
    }
    const clips = {};
    for (const c of gltf.animations || []) clips[c.name] = c;
    folk = { pieces, bones, rootBone, inverses: template.skeleton.boneInverses, bindMatrix: template.bindMatrix.clone(), rest, clips };
    return true;
  }).catch((err) => {
    console.warn("[townfolk] folk.glb did not load; falling back to the villager parts", err);
    return false;
  });
}

function folkPieces(look) {
  const hat = look.hat || "none";
  const out = ["core", "tunic", "trousers", "shoes"];
  if (hat === "long") out.push("hair_long");
  else if (hat === "bun") out.push("hair_bun");
  else if (hat !== "hood") out.push("hair_short");
  if (hat === "cap" || hat === "brim" || hat === "hood" || hat === "kerchief") out.push("hat_" + hat);
  if (look.dress) out.push("dress");
  if (look.apron) out.push("apron");
  if (look.beard) out.push("beard");
  return out;
}

// One non-indexed geometry from the chosen pieces (they share the skeleton's joints).
function mergeFolk(names, pal) {
  const list = names.map((n) => folk.pieces[n]).filter(Boolean);
  let count = 0;
  for (const g of list) count += g.index ? g.index.count : g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const si = new Uint16Array(count * 4);
  const sw = new Float32Array(count * 4);
  let o = 0;
  for (const g of list) {
    const idx = g.index;
    const n = idx ? idx.count : g.attributes.position.count;
    const P = g.attributes.position;
    const C = g.attributes.color;
    const I = g.attributes.skinIndex;
    const W = g.attributes.skinWeight;
    for (let i = 0; i < n; i++) {
      const v = idx ? idx.getX(i) : i;
      const k = o + i;
      pos[k * 3] = P.getX(v);
      pos[k * 3 + 1] = P.getY(v);
      pos[k * 3 + 2] = P.getZ(v);
      const c = pal[Math.min(pal.length - 1, Math.floor((C ? C.getX(v) : 0) * 16))];
      const shadeK = C ? C.getY(v) : 1;
      col[k * 3] = c.r * shadeK;
      col[k * 3 + 1] = c.g * shadeK;
      col[k * 3 + 2] = c.b * shadeK;
      si[k * 4] = I.getX(v); si[k * 4 + 1] = I.getY(v); si[k * 4 + 2] = I.getZ(v); si[k * 4 + 3] = I.getW(v);
      sw[k * 4] = W.getX(v); sw[k * 4 + 1] = W.getY(v); sw[k * 4 + 2] = W.getZ(v); sw[k * 4 + 3] = W.getW(v);
    }
    o += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
  geo.computeVertexNormals();
  return geo;
}

const _fq = new THREE.Quaternion();
const _fr = new THREE.Quaternion();
const _corrL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), A_POSE);
const _corrR = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -A_POSE);
const _bend = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), FOREARM_BEND);

function dressSkinned(v) {
  const geo = mergeFolk(folkPieces(v.look), lookPalette(v.look));
  const root = folk.rootBone.clone(true);
  const byName = {};
  root.traverse((b) => { if (b.isBone) byName[b.name] = b; });
  const bones = folk.bones.map((b) => byName[b.name]);
  const mesh = new THREE.SkinnedMesh(geo, partMat);
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(bones, folk.inverses), folk.bindMatrix);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.name = "folkSkin";
  v.body.add(mesh);
  v.torso.visible = false;
  for (const g of [v.leftArm, v.rightArm, v.leftLeg, v.rightLeg]) g.children[0].visible = false;
  const find = (name) => byName[name] || byName[name.replace(/[.[\]:/]/g, "")];
  const link = (group, name, corr) => {
    const key = find(name) ? find(name).name : name;
    return { group, b: find(name), r: folk.rest[key], corr };
  };
  v.skin = {
    mesh,
    links: [link(v.leftLeg, "thigh.L", null), link(v.rightLeg, "thigh.R", null),
      link(v.leftArm, "upperArm.L", _corrL), link(v.rightArm, "upperArm.R", _corrR)],
    fixed: [link(null, "forearm.L", null), link(null, "forearm.R", null)],
    // authored clips (humans.py folk_clips): idle, walk and the work loops
    mixer: folk.clips.idle && folk.clips.walk ? new THREE.AnimationMixer(mesh) : null,
    acts: {},
    on: new Set()
  };
  v.reskinned = true;
}

// Clip weights from the same signals the code pose uses: walk by `blend`, the work loop
// only while mostly standing (as poseLimbs does), idle takes what is left.
function driveFolk(v, phase, blend, time, work) {
  const sk = v.skin;
  const want = new Map();
  const walkW = Math.max(0, Math.min(1, blend));
  const workW = work && folk.clips[work] && blend <= 0.5 ? 1 - walkW : 0;
  want.set("walk", walkW);
  if (workW > 0) want.set(work, workW);
  want.set("idle", Math.max(0, 1 - walkW - workW));
  for (const name of sk.on) {
    if (!want.has(name) || want.get(name) <= 0.001) {
      sk.acts[name].enabled = false;
      sk.on.delete(name);
    }
  }
  const cyc = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  for (const [name, w] of want) {
    if (w <= 0.001) continue;
    let a = sk.acts[name];
    if (!a) {
      a = sk.acts[name] = sk.mixer.clipAction(folk.clips[name]);
      a.play();
    }
    a.enabled = true;
    a.setEffectiveWeight(w);
    const dur = a.getClip().duration;
    a.time = name === "walk" ? cyc * dur : time % dur;
    sk.on.add(name);
  }
  sk.mixer.update(0);
}

// bone = rest · w0⁻¹ · (R · C) · w0: the code group's rotation onto its bone.
function retargetFolk(v) {
  for (const l of v.skin.links) {
    _fr.copy(l.group.quaternion);
    if (l.corr) _fr.multiply(l.corr);
    _fq.copy(l.r.w0i).multiply(_fr).multiply(l.r.w0);
    l.b.quaternion.copy(l.r.l0).multiply(_fq);
  }
  for (const l of v.skin.fixed) {
    _fq.copy(l.r.w0i).multiply(_bend).multiply(l.r.w0);
    l.b.quaternion.copy(l.r.l0).multiply(_fq);
  }
}

function partsFor(look) {
  const hat = look.hat || "none";
  const body = ["torso"];
  if (hat === "long") body.push("hair_long");
  else if (hat === "bun") body.push("hair_bun");
  else if (hat !== "hood") body.push("hair_short");
  if (hat === "cap" || hat === "brim" || hat === "hood" || hat === "kerchief") body.push("hat_" + hat);
  if (look.dress) body.push("dress");
  if (look.apron) body.push("apron");
  if (look.beard) body.push("beard");
  return body;
}

function lookPalette(look) {
  const skin = new THREE.Color(look.skin);
  const hex = {
    tunic: look.tunic, tunicDark: shade(look.tunic, 0.7), trim: look.trim, skin: look.skin, hair: look.hair,
    leather: 0x5a3a24, boots: 0x2e2420, eye: 0x1a1a1a, linen: 0xf4e7c8, apron: look.apron || 0xe7d7b4,
    trousers: shade(look.tunic, 0.45), hat: 0x5a3a24, gold: 0xd4a03a,
    lip: skin.clone().lerp(new THREE.Color(0x8e3a2e), 0.35).getHex(), skinShade: shade(look.skin, 0.88), white: 0xf4f0e8
  };
  return SLOTS.map((k) => new THREE.Color(hex[k]));
}

function reskin(v) {
  const pal = lookPalette(v.look);
  swapGeometry(v.torso, paintParts(library, partsFor(v.look), pal, 0, 0, 0), partMat);
  const limbs = [["arm_l", v.leftArm], ["arm_r", v.rightArm], ["leg_l", v.leftLeg], ["leg_r", v.rightLeg]];
  for (const [name, group] of limbs) {
    const [px, py] = PIVOTS[name];
    swapGeometry(group.children[0], paintParts(library, [name], pal, -px, -py, 0), partMat);
  }
  v.reskinned = true;
}

function part(list, geo, hex, x, y, z, rx, ry, rz, rand) {
  const g = paintFaces(geo, [hex], rand);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
    new THREE.Vector3(1, 1, 1)
  );
  g.applyMatrix4(m);
  list.push(g);
}

function shade(hex, k) {
  return new THREE.Color(hex).multiplyScalar(k).getHex();
}

export function buildVillager(look, seed) {
  if (!_mat) _mat = lambert();
  const rand = mulberry32(seed >>> 0);
  const s = look.height || 1;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const parts = [];
  const tunic = look.tunic;
  const dark = shade(tunic, 0.7);
  // Torso, belt, collar.
  part(parts, new THREE.BoxGeometry(0.62, 0.66, 0.38), tunic, 0, 1.05, 0, 0, 0, 0, rand);
  part(parts, new THREE.CylinderGeometry(0.34, 0.4, 0.34, 6), tunic, 0, 0.62, 0, 0, 0, 0, rand);
  part(parts, new THREE.BoxGeometry(0.66, 0.08, 0.42), look.trim, 0, 0.76, 0, 0, 0, 0, rand);
  part(parts, new THREE.BoxGeometry(0.42, 0.08, 0.36), dark, 0, 1.39, 0, 0, 0, 0, rand);
  if (look.dress) part(parts, new THREE.CylinderGeometry(0.36, 0.52, 0.5, 7), tunic, 0, 0.42, 0, 0, 0, 0, rand);
  if (look.apron) part(parts, new THREE.BoxGeometry(0.48, 0.72, 0.04), look.apron, 0, 0.82, -0.2, 0, 0, 0, rand);
  // Head.
  part(parts, new THREE.IcosahedronGeometry(0.24, 0), look.skin, 0, 1.64, 0, 0, 0, 0, rand);
  part(parts, new THREE.BoxGeometry(0.08, 0.09, 0.1), look.skin, 0, 1.62, -0.25, 0, 0, 0, rand);
  part(parts, new THREE.BoxGeometry(0.05, 0.05, 0.04), 0x1a1a1a, -0.08, 1.69, -0.21, 0, 0, 0, rand);
  part(parts, new THREE.BoxGeometry(0.05, 0.05, 0.04), 0x1a1a1a, 0.08, 1.69, -0.21, 0, 0, 0, rand);
  // Hair cap at the back and top.
  part(parts, new THREE.IcosahedronGeometry(0.23, 0), look.hair, 0, 1.72, 0.05, 0, 0, 0, rand);
  if (look.beard) part(parts, new THREE.ConeGeometry(0.16, 0.26, 5), look.hair, 0, 1.47, -0.15, Math.PI, 0, 0, rand);
  if (look.hat === "hood") {
    part(parts, new THREE.ConeGeometry(0.3, 0.42, 6), look.tunic, 0, 1.86, 0.04, -0.15, 0, 0, rand);
  } else if (look.hat === "cap") {
    part(parts, new THREE.CylinderGeometry(0.2, 0.25, 0.14, 7), look.trim, 0, 1.88, 0.02, 0, 0, 0, rand);
    part(parts, new THREE.BoxGeometry(0.22, 0.03, 0.14), look.trim, 0, 1.83, -0.22, 0, 0, 0, rand);
  } else if (look.hat === "brim") {
    part(parts, new THREE.CylinderGeometry(0.42, 0.42, 0.04, 8), 0x5a3a24, 0, 1.86, 0, 0, 0, 0, rand);
    part(parts, new THREE.CylinderGeometry(0.18, 0.22, 0.22, 7), 0x5a3a24, 0, 1.97, 0, 0, 0, 0, rand);
  } else if (look.hat === "bun") {
    part(parts, new THREE.IcosahedronGeometry(0.11, 0), look.hair, 0, 1.86, 0.14, 0, 0, 0, rand);
  } else if (look.hat === "long") {
    part(parts, new THREE.BoxGeometry(0.36, 0.42, 0.1), look.hair, 0, 1.52, 0.17, 0.12, 0, 0, rand);
  } else if (look.hat === "kerchief") {
    part(parts, new THREE.IcosahedronGeometry(0.255, 0), look.trim, 0, 1.76, 0.04, 0, 0, 0, rand);
  }
  const torso = new THREE.Mesh(mergeParts(parts), _mat);
  torso.castShadow = true;
  body.add(torso);

  function limb(geoList, x, y) {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    const mesh = new THREE.Mesh(mergeParts(geoList), _mat);
    // Limbs sit inside the body's shadow; skipping them halves the shadow draws.
    mesh.castShadow = false;
    g.add(mesh);
    body.add(g);
    return g;
  }
  const legParts = (side) => {
    const list = [];
    part(list, new THREE.CylinderGeometry(0.11, 0.12, 0.42, 6), shade(look.tunic, 0.45), 0, -0.21, 0, 0, 0, 0, rand);
    part(list, new THREE.BoxGeometry(0.17, 0.12, 0.27), 0x241c18, 0, -0.47, -0.03, 0, 0, 0, rand);
    return list;
  };
  const armParts = () => {
    const list = [];
    part(list, new THREE.CylinderGeometry(0.08, 0.09, 0.44, 6), tunic, 0, -0.22, 0, 0, 0, 0, rand);
    part(list, new THREE.BoxGeometry(0.12, 0.11, 0.12), look.skin, 0, -0.47, 0, 0, 0, 0, rand);
    return list;
  };
  const leftLeg = limb(legParts(-1), -0.15, 0.53);
  const rightLeg = limb(legParts(1), 0.15, 0.53);
  const leftArm = limb(armParts(), -0.4, 1.33);
  const rightArm = limb(armParts(), 0.4, 1.33);
  root.scale.setScalar(s);
  const v = { root, body, leftLeg, rightLeg, leftArm, rightArm, torso, look, reskinned: false, skin: null };
  if (folk && partMat) dressSkinned(v);
  else if (library) reskin(v);
  else {
    waiting.push(v);
    requestLibrary();
  }
  return v;
}

// Pose one villager. phase: walk cycle; blend 0..1 walking; work: arm loop name.
export function poseVillager(v, phase, blend, time, work) {
  poseLimbs(v, phase, blend, time, work);
  if (!v.skin) return;
  if (v.skin.mixer) driveFolk(v, phase, blend, time, work);
  else retargetFolk(v);
}

function poseLimbs(v, phase, blend, time, work) {
  const swing = Math.sin(phase) * 0.75 * blend;
  v.leftLeg.rotation.x = swing;
  v.rightLeg.rotation.x = -swing;
  v.leftArm.rotation.x = -swing * 0.6;
  v.rightArm.rotation.x = swing * 0.6;
  v.leftArm.rotation.z = 0.12;
  v.rightArm.rotation.z = -0.12;
  v.body.position.y = Math.abs(Math.sin(phase)) * 0.045 * blend + Math.sin(time * 1.7) * 0.01 * (1 - blend);
  v.body.rotation.z = 0;
  if (blend > 0.5 || !work) return;
  const k = 1 - blend;
  // Positive x rotation swings a limb forward (toward local −z).
  if (work === "hammer") {
    const beat = Math.max(0, Math.sin(time * 5.2));
    v.rightArm.rotation.x = (0.7 + beat * 1.4) * k;
    v.leftArm.rotation.x = 0.55 * k;
  } else if (work === "stir") {
    v.rightArm.rotation.x = 0.95 * k;
    v.rightArm.rotation.z = (-0.12 + Math.sin(time * 2.4) * 0.35) * k;
  } else if (work === "tally") {
    v.leftArm.rotation.x = 0.8 * k;
    v.rightArm.rotation.x = (0.7 + Math.sin(time * 6) * 0.08) * k;
  } else if (work === "wipe") {
    v.rightArm.rotation.x = 0.8 * k;
    v.rightArm.rotation.z = (-0.3 + Math.sin(time * 3) * 0.3) * k;
  } else if (work === "drill") {
    v.leftArm.rotation.x = (0.4 + Math.sin(time * 1.3) * 0.5) * k;
    v.rightArm.rotation.x = (0.4 - Math.sin(time * 1.3) * 0.5) * k;
  } else if (work === "chat") {
    v.rightArm.rotation.x = (0.35 + Math.sin(time * 3.1) * 0.25) * k;
    v.body.rotation.z = Math.sin(time * 1.1) * 0.04 * k;
  } else if (work === "rest") {
    v.leftLeg.rotation.x = 1.4 * k;
    v.rightLeg.rotation.x = 1.4 * k;
    v.body.position.y = -0.3 * k;
  } else if (work === "drink") {
    v.rightArm.rotation.x = (1.0 + Math.max(0, Math.sin(time * 0.9)) * 1.1) * k;
  } else if (work === "sit" || work === "sitdrink") {
    v.leftLeg.rotation.x = 1.45 * k;
    v.rightLeg.rotation.x = 1.45 * k;
    v.leftArm.rotation.x = 0.45 * k;
    v.rightArm.rotation.x = work === "sitdrink" ? (0.9 + Math.max(0, Math.sin(time * 0.8)) * 1.2) * k : 0.45 * k;
  } else if (work === "warm") {
    v.leftArm.rotation.x = 1.0 * k;
    v.rightArm.rotation.x = 1.0 * k;
  }
}
