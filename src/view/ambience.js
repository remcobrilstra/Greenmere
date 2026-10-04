// Town ambience meshes: chimney smoke and the animals, flat-shaded Lambert.
// Smoke is one InstancedMesh; each puff swells, drifts, and shrinks away.
// Animals are built from code first, then skinned from assets/models/critters.glb
// (tools/blender/critters.py, view/skinkit.js) with authored clips (walk, idle, sit,
// sleep; the hen pecks), painted from each animal's coat. Without it, the part
// library (assets/models/animals.glb, tools/blender/animals.py) re-skins the code rig.

import * as THREE from "three";
import { mulberry32 } from "../sim/rng.js";
import { paintFaces, mergeParts, lambert } from "./materials.js";
import { loadPartLibrary, paintParts, swapGeometry } from "./partlib.js";
import { loadSkinKits, buildSkinned, play as playSkin, clipLength } from "./skinkit.js";

const PUFFS_PER_CHIMNEY = 7;
const PUFF_LIFE = 6.5;
const WIND = { x: 0.32, z: 0.14 };

export function buildSmoke(parent, chimneys) {
  const count = chimneys.length * PUFFS_PER_CHIMNEY;
  const geo = new THREE.DodecahedronGeometry(0.5, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  mesh.name = "chimneySmoke";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  parent.add(mesh);
  const rand = mulberry32(0x5a0c3);
  const puffs = [];
  for (let c = 0; c < chimneys.length; c++) {
    for (let k = 0; k < PUFFS_PER_CHIMNEY; k++) {
      puffs.push({
        src: chimneys[c],
        age: (k / PUFFS_PER_CHIMNEY) * PUFF_LIFE,
        spin: rand() * Math.PI * 2,
        jitter: (rand() - 0.5) * 0.4
      });
    }
  }
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const pale = new THREE.Color(0xe8e6e2);
  function tick(dt, fogColor) {
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      p.age += dt;
      if (p.age > PUFF_LIFE) p.age -= PUFF_LIFE;
      const t = p.age / PUFF_LIFE;
      const big = p.src.big ? 1.4 : 1;
      const rise = p.age * 0.9;
      const s = big * (0.35 + t * 1.3) * (t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1);
      dummy.position.set(
        p.src.x + WIND.x * p.age * 1.4 + Math.sin(p.age * 1.3 + p.spin) * 0.15 + p.jitter,
        p.src.y + rise,
        p.src.z + WIND.z * p.age * 1.4
      );
      dummy.rotation.set(p.spin, p.spin + p.age * 0.4, 0);
      dummy.scale.setScalar(Math.max(0.001, s));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.copy(pale);
      if (p.src.big) color.multiplyScalar(0.72);
      if (fogColor) color.lerp(fogColor, Math.min(1, t * 0.9));
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  tick(0, null);
  return { mesh, tick, count };
}

// ---------- animals ----------

const ANIMAL_SLOTS = ["coat", "coatDark", "coatLight", "beak", "comb", "eye", "eyeCat", "nose", "pink", "white",
  "collar", "gold", "claw"];
let animalLib = null;
let animalAsked = false;
let animalMat = null;
const animalWaiting = [];
let animalMarkReady = null;
const animalReady = new Promise((res) => { animalMarkReady = res; });

// Resolves once the animal parts have loaded (or failed) and every animal built so far is re-skinned.
export function animalPartsReady() {
  requestAnimalLib();
  return animalReady;
}

// Skinned animals (tools/blender/critters.py, assets/models/critters.glb): one rig and
// body per species with clips; each animal gets its own skeleton copy and mixer. The
// part library below is the fallback.
let critters = null;

function requestAnimalLib() {
  if (animalAsked) return;
  animalAsked = true;
  loadSkinKits("./assets/models/critters.glb", "cr_").then((kits) => {
    if (!kits.cat || !kits.dog || !kits.hen) throw new Error("critters.glb is missing a species");
    critters = kits;
    animalMat = lambert({ side: THREE.DoubleSide });
    for (const a of animalWaiting.splice(0)) skinAnimal(a);
    animalMarkReady(true);
  }).catch((err) => {
    console.warn("[ambience] critters.glb did not load; using the animal parts", err);
    loadAnimalParts();
  });
}

function skinAnimal(a) {
  const sk = buildSkinned(critters[a.kind], ["body"], animalPalette(a.coat, a.coatDark), animalMat);
  sk.mesh.name = "critterSkin";
  if (a.kind === "hen") {
    a.root.add(sk.mesh);
    a.body.visible = false;
    a.head.visible = false;
  } else {
    a.body.add(sk.mesh);
    a.body.children[0].visible = false;
    for (const leg of a.legs) leg.children[0].visible = false;
    a.tail.children[0].visible = false;
  }
  a.skin = sk;
}

function loadAnimalParts() {
  loadPartLibrary("./assets/models/animals.glb", "ap_").then((lib) => {
    animalLib = lib;
    animalMat = lambert({ side: THREE.DoubleSide });
    for (const a of animalWaiting.splice(0)) reskinAnimal(a);
    animalMarkReady(true);
  }).catch((err) => {
    console.warn("[ambience] animal parts did not load; keeping the code-built animals", err);
    animalMarkReady(false);
  });
}

function animalPalette(coat, dark) {
  const c = new THREE.Color(coat);
  const hex = {
    coat, coatDark: dark || c.clone().multiplyScalar(0.75).getHex(), coatLight: c.clone().lerp(new THREE.Color(0xf4efe4), 0.35).getHex(),
    beak: 0xd4a03a, comb: 0xc4473a, eye: 0x1a1a1a, eyeCat: 0x8ed15a, nose: 0x1a1a1a, pink: 0xd88a8a,
    white: 0xf4f0e8, collar: 0x8e3a2e, gold: 0xd4a03a, claw: 0x3a3434
  };
  return ANIMAL_SLOTS.map((k) => new THREE.Color(hex[k]));
}

function reskinAnimal(a) {
  const pal = animalPalette(a.coat, a.coatDark);
  const paint = (name) => paintParts(animalLib, [name], pal, 0, 0, 0);
  if (a.kind === "hen") {
    swapGeometry(a.body, paint("hen_body"), animalMat);
    swapGeometry(a.head.children[0], paint("hen_head"), animalMat);
  } else {
    swapGeometry(a.body.children[0], paint(a.kind + "_torso"), animalMat);
    for (const leg of a.legs) swapGeometry(leg.children[0], paint(a.kind + "_leg"), animalMat);
    swapGeometry(a.tail.children[0], paint(a.kind + "_tail"), animalMat);
  }
}

function dress(a) {
  if (critters) skinAnimal(a);
  else if (animalLib) reskinAnimal(a);
  else {
    animalWaiting.push(a);
    requestAnimalLib();
  }
  return a;
}

let _mat = null;
function mat() {
  if (!_mat) _mat = lambert();
  return _mat;
}
function part(list, geo, hex, x, y, z, rx, ry, rz, rand, sx, sy, sz) {
  const g = paintFaces(geo, Array.isArray(hex) ? hex : [hex], rand);
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
    new THREE.Vector3(sx || 1, sy || 1, sz || 1)
  ));
  list.push(g);
}
function meshOf(list, cast) {
  const m = new THREE.Mesh(mergeParts(list), mat());
  m.castShadow = cast !== false;
  return m;
}

// Local forward is −z for every animal, like the villagers.
export function buildHen(seed) {
  const rand = mulberry32(seed >>> 0);
  const coat = [[0xf4efe4, 0xe7d7b4], [0x8d5b34, 0x6b4428], [0x3a2416, 0x5a3a24]][Math.floor(rand() * 3)];
  const root = new THREE.Group();
  const body = [];
  part(body, new THREE.IcosahedronGeometry(0.17, 0), coat, 0, 0.24, 0.02, 0, 0, 0, rand, 1, 0.85, 1.25);
  part(body, new THREE.ConeGeometry(0.1, 0.2, 4), coat, 0, 0.34, 0.2, -0.7, 0, 0, rand);
  part(body, new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4), 0xd4a03a, -0.05, 0.07, 0, 0, 0, 0, rand);
  part(body, new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4), 0xd4a03a, 0.05, 0.07, 0, 0, 0, 0, rand);
  const bodyMesh = meshOf(body);
  root.add(bodyMesh);
  const head = new THREE.Group();
  head.position.set(0, 0.34, -0.14);
  const h = [];
  part(h, new THREE.IcosahedronGeometry(0.08, 0), coat, 0, 0.04, 0, 0, 0, 0, rand);
  part(h, new THREE.BoxGeometry(0.03, 0.07, 0.08), 0xc4473a, 0, 0.12, 0, 0, 0, 0, rand);
  part(h, new THREE.ConeGeometry(0.025, 0.07, 4), 0xd4a03a, 0, 0.03, -0.09, -Math.PI / 2, 0, 0, rand);
  part(h, new THREE.BoxGeometry(0.025, 0.05, 0.03), 0xc4473a, 0, -0.03, -0.06, 0, 0, 0, rand);
  head.add(meshOf(h, false));
  root.add(head);
  return dress({ root, body: bodyMesh, head, kind: "hen", coat: coat[0], coatDark: coat[1] });
}

function buildQuadruped(seed, coat, size, kind) {
  const rand = mulberry32(seed >>> 0);
  const dark = new THREE.Color(coat).multiplyScalar(0.75).getHex();
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);
  const b = [];
  const len = kind === "cat" ? 0.5 : 0.7;
  const hgt = kind === "cat" ? 0.2 : 0.28;
  const legH = kind === "cat" ? 0.18 : 0.3;
  part(b, new THREE.BoxGeometry(hgt * 1.05, hgt, len), [coat, dark], 0, legH + hgt / 2, 0, 0, 0, 0, rand);
  part(b, new THREE.BoxGeometry(hgt * 1.1, hgt * 0.95, hgt * 0.95), coat, 0, legH + hgt * 0.95, -len / 2 - hgt * 0.2, 0, 0, 0, rand);
  if (kind === "cat") {
    part(b, new THREE.ConeGeometry(0.045, 0.1, 4), coat, -0.07, legH + hgt * 1.5, -len / 2 - 0.05, 0, 0, 0, rand);
    part(b, new THREE.ConeGeometry(0.045, 0.1, 4), coat, 0.07, legH + hgt * 1.5, -len / 2 - 0.05, 0, 0, 0, rand);
  } else {
    part(b, new THREE.BoxGeometry(0.08, 0.14, 0.05), dark, -0.11, legH + hgt * 1.25, -len / 2 - 0.02, 0, 0, 0.3, rand);
    part(b, new THREE.BoxGeometry(0.08, 0.14, 0.05), dark, 0.11, legH + hgt * 1.25, -len / 2 - 0.02, 0, 0, -0.3, rand);
    part(b, new THREE.BoxGeometry(hgt * 0.6, hgt * 0.5, 0.16), coat, 0, legH + hgt * 0.8, -len / 2 - hgt * 0.75, 0, 0, 0, rand);
    part(b, new THREE.BoxGeometry(0.06, 0.05, 0.04), 0x1a1a1a, 0, legH + hgt * 0.9, -len / 2 - hgt * 0.75 - 0.09, 0, 0, 0, rand);
  }
  part(b, new THREE.BoxGeometry(0.03, 0.03, 0.02), kind === "cat" ? 0x8ed15a : 0x1a1a1a, -0.06, legH + hgt * 1.05, -len / 2 - hgt * 0.68, 0, 0, 0, rand);
  part(b, new THREE.BoxGeometry(0.03, 0.03, 0.02), kind === "cat" ? 0x8ed15a : 0x1a1a1a, 0.06, legH + hgt * 1.05, -len / 2 - hgt * 0.68, 0, 0, 0, rand);
  const torso = meshOf(b);
  bodyGroup.add(torso);
  const legs = [];
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const g = new THREE.Group();
    g.position.set(lx * hgt * 0.35, legH, lz * (len / 2 - 0.06));
    const l = [];
    part(l, new THREE.BoxGeometry(0.06, legH, 0.06), dark, 0, -legH / 2, 0, 0, 0, 0, rand);
    g.add(meshOf(l, false));
    bodyGroup.add(g);
    legs.push(g);
  }
  const tail = new THREE.Group();
  tail.position.set(0, legH + hgt * 0.8, len / 2);
  const t = [];
  part(t, new THREE.CylinderGeometry(0.025, 0.035, kind === "cat" ? 0.42 : 0.3, 5), coat, 0, kind === "cat" ? 0.21 : 0.15, 0, 0, 0, 0, rand);
  tail.add(meshOf(t, false));
  tail.rotation.x = kind === "cat" ? 0.5 : 0.9;
  bodyGroup.add(tail);
  root.scale.setScalar(size);
  return dress({ root, body: bodyGroup, legs, tail, kind, coat, coatDark: null });
}

export function buildCat(seed, coat) {
  return buildQuadruped(seed, coat, 1, "cat");
}
export function buildDog(seed, coat) {
  return buildQuadruped(seed, coat, 1.1, "dog");
}

// Pose an animal. moving 0..1, phase for gait, time for idle, rest: sit/sleep.
export function poseAnimal(a, phase, moving, time, rest) {
  poseAnimalParts(a, phase, moving, time, rest);
  const sk = a.skin;
  if (!sk) return;
  const m = Math.max(0, Math.min(1, moving));
  const cyc = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  const resting = a.kind !== "hen" && rest && m < 0.5 ? (rest === "sleep" ? "sleep" : "sit") : null;
  playSkin(sk, [
    ["walk", m, cyc * clipLength(sk, "walk")],
    [resting || "idle", 1 - m, time % clipLength(sk, resting || "idle")]
  ]);
  // the hen's bob lives on its (hidden) body mesh
  if (a.kind === "hen") sk.mesh.position.y = a.body.position.y;
}

function poseAnimalParts(a, phase, moving, time, rest) {
  if (a.kind === "hen") {
    const peck = moving < 0.5 ? Math.max(0, Math.sin(time * 4.5)) : 0;
    a.head.rotation.x = peck * 0.9;
    a.head.position.y = 0.34 - peck * 0.08;
    a.body.position.y = Math.abs(Math.sin(phase)) * 0.03 * moving;
    a.root.rotation.z = Math.sin(phase) * 0.08 * moving;
    return;
  }
  const swing = Math.sin(phase) * 0.6 * moving;
  a.legs[0].rotation.x = swing;
  a.legs[3].rotation.x = swing;
  a.legs[1].rotation.x = -swing;
  a.legs[2].rotation.x = -swing;
  a.body.position.y = 0;
  a.body.rotation.x = 0;
  if (a.kind === "dog") a.tail.rotation.z = Math.sin(time * (moving > 0.5 ? 10 : 6)) * 0.5;
  else a.tail.rotation.z = Math.sin(time * 1.3) * 0.25;
  if (rest && moving < 0.5) {
    const k = 1 - moving;
    // Settle down: back legs folded, body low.
    a.body.position.y = -0.12 * k;
    a.legs[2].rotation.x = -1.2 * k;
    a.legs[3].rotation.x = -1.2 * k;
    if (rest === "sleep") {
      a.body.position.y = -0.17 * k;
      for (const l of a.legs) l.rotation.x = -1.4 * k;
    }
  }
}
