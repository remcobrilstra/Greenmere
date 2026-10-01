// Town ambience meshes: chimney smoke and the animals. Code-built, flat-shaded
// Lambert. Smoke is one InstancedMesh; each puff swells, drifts, and shrinks away.

import * as THREE from "three";
import { mulberry32 } from "../sim/rng.js";
import { paintFaces, mergeParts, lambert } from "./materials.js";

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
  head.add(meshOf(h));
  root.add(head);
  return { root, body: bodyMesh, head, kind: "hen" };
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
    g.add(meshOf(l));
    bodyGroup.add(g);
    legs.push(g);
  }
  const tail = new THREE.Group();
  tail.position.set(0, legH + hgt * 0.8, len / 2);
  const t = [];
  part(t, new THREE.CylinderGeometry(0.025, 0.035, kind === "cat" ? 0.42 : 0.3, 5), coat, 0, kind === "cat" ? 0.21 : 0.15, 0, 0, 0, 0, rand);
  tail.add(meshOf(t));
  tail.rotation.x = kind === "cat" ? 0.5 : 0.9;
  bodyGroup.add(tail);
  root.scale.setScalar(size);
  return { root, body: bodyGroup, legs, tail, kind };
}

export function buildCat(seed, coat) {
  return buildQuadruped(seed, coat, 1, "cat");
}
export function buildDog(seed, coat) {
  return buildQuadruped(seed, coat, 1.1, "dog");
}

// Pose an animal. moving 0..1, phase for gait, time for idle, rest: sit/sleep.
export function poseAnimal(a, phase, moving, time, rest) {
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
