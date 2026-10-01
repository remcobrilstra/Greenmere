// Code-built villagers in the Warden's language, but cheaper: one merged body
// (torso, head, hair, hat, apron) and four limb pivots, all on one shared
// vertex-colour Lambert material. Local forward is −z, like the hero.

import * as THREE from "three";
import { mulberry32 } from "../sim/rng.js";
import { paintFaces, mergeParts, lambert } from "./materials.js";

let _mat = null;

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
    mesh.castShadow = true;
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
  return { root, body, leftLeg, rightLeg, leftArm, rightArm, torso };
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
