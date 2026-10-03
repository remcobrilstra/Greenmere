// Villagers: one merged body (torso, head, hair, hat, apron) and four limb
// pivots, all on one vertex-colour Lambert material. Local forward is −z, like
// the hero. They are built from code first; once the Blender part library
// (assets/models/villager.glb, tools/blender/villagers.py) loads, every
// villager is re-skinned from it, painted from their own `look`. The rig,
// pivots and poses are the same either way.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mulberry32 } from "../sim/rng.js";
import { paintFaces, mergeParts, lambert } from "./materials.js";

let _mat = null;

// ---------- Blender part library ----------

// Vertex colour R carries a slot ((slot + 0.5) / 16), G a baked shade.
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
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("./assets/models/villager.glb").then((gltf) => {
    gltf.scene.updateMatrixWorld(true);
    const lib = {};
    gltf.scene.traverse((o) => {
      if (!o.isMesh || !o.name.startsWith("vp_")) return;
      const src = o.geometry;
      const index = src.index;
      const n = index ? index.count : src.attributes.position.count;
      const pos = new Float32Array(n * 3);
      const code = new Float32Array(n * 2);
      const p = src.attributes.position;
      const c = src.attributes.color;
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const k = index ? index.getX(i) : i;
        v.set(p.getX(k), p.getY(k), p.getZ(k)).applyMatrix4(o.matrixWorld);
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        code[i * 2] = c ? c.getX(k) : 0;
        code[i * 2 + 1] = c ? c.getY(k) : 1;
      }
      lib[o.name.slice(3)] = { pos, code };
    });
    library = lib;
    partMat = lambert({ side: THREE.DoubleSide });
    for (const v of waiting.splice(0)) reskin(v);
    markReady(true);
  }).catch((err) => {
    console.warn("[townfolk] villager parts did not load; keeping the code-built villagers", err);
    markReady(false);
  });
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

// Painted, non-indexed geometry for the named parts, shifted by (dx, dy).
function paintParts(names, pal, dx, dy) {
  let count = 0;
  for (const n of names) if (library[n]) count += library[n].pos.length;
  const pos = new Float32Array(count);
  const col = new Float32Array(count);
  let o = 0;
  for (const n of names) {
    const part = library[n];
    if (!part) continue;
    const vc = part.pos.length / 3;
    for (let i = 0; i < vc; i++) {
      pos[o + i * 3] = part.pos[i * 3] + dx;
      pos[o + i * 3 + 1] = part.pos[i * 3 + 1] + dy;
      pos[o + i * 3 + 2] = part.pos[i * 3 + 2];
      const c = pal[Math.min(15, Math.max(0, Math.floor(part.code[i * 2] * 16)))];
      const k = part.code[i * 2 + 1];
      col[o + i * 3] = c.r * k;
      col[o + i * 3 + 1] = c.g * k;
      col[o + i * 3 + 2] = c.b * k;
    }
    o += vc * 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function swapGeometry(mesh, geo) {
  const old = mesh.geometry;
  mesh.geometry = geo;
  mesh.material = partMat;
  old.dispose();
}

function reskin(v) {
  const pal = lookPalette(v.look);
  swapGeometry(v.torso, paintParts(partsFor(v.look), pal, 0, 0));
  const limbs = [["arm_l", v.leftArm], ["arm_r", v.rightArm], ["leg_l", v.leftLeg], ["leg_r", v.rightLeg]];
  for (const [name, group] of limbs) {
    const [px, py] = PIVOTS[name];
    swapGeometry(group.children[0], paintParts([name], pal, -px, -py));
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
  const v = { root, body, leftLeg, rightLeg, leftArm, rightArm, torso, look, reskinned: false };
  if (library) reskin(v);
  else {
    waiting.push(v);
    requestLibrary();
  }
  return v;
}

// Pose one villager. phase: walk cycle; blend 0..1 walking; work: arm loop name.
export function poseVillager(v, phase, blend, time, work) {
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
