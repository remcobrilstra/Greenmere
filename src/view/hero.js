import * as THREE from "three";
import { makeMat, mergeParts } from "./materials.js";

// The Warden, code-built. Local forward is −z. Groups keep the pivots that
// movement and combat animate (legs at the hips, arms at the shoulders, the
// cape at the collar); parts inside each group are merged per material so the
// hero stays cheap. `nose` and `toe` stay separate named meshes: they are the
// facing oracles of the self-test.
export function buildHero(scene) {
  const matSkin = makeMat(0xe0a878, { roughness: 0.86 });
  const matTunic = makeMat(0x2d62c8, { roughness: 0.74 });
  const matTunicDark = makeMat(0x1c3f8c, { roughness: 0.8 });
  const matHood = makeMat(0x1c3f8c, { roughness: 0.8, side: THREE.DoubleSide });
  const matGold = makeMat(0xd4a03a, { roughness: 0.42, metalness: 0.42 });
  const matCloth = makeMat(0x3a2a22, { roughness: 0.9 });
  const matLeather = makeMat(0x5a3a24, { roughness: 0.82 });
  const matBoot = makeMat(0x241c18, { roughness: 0.88 });
  const matSteel = makeMat(0xc5d0dc, { roughness: 0.32, metalness: 0.55 });
  const matEye = makeMat(0x1a1a1a, { roughness: 0.5 });
  const matBrow = makeMat(0x4a3020, { roughness: 0.9 });

  const buckets = new Map();
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  function put(group, geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _e.set(rx || 0, ry || 0, rz || 0);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx || 1, sy || 1, sz || 1);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    const key = group.uuid + "|" + mat.uuid;
    let b = buckets.get(key);
    if (!b) buckets.set(key, b = { group, mat, parts: [] });
    b.parts.push(g);
  }
  function flush() {
    for (const b of buckets.values()) {
      const mesh = new THREE.Mesh(mergeParts(b.parts), b.mat);
      mesh.castShadow = true;
      b.group.add(mesh);
    }
    buckets.clear();
  }
  function named(parent, geo, mat, x, y, z, name) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.name = name;
    parent.add(mesh);
    return mesh;
  }

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

  // ---- legs: trousers, knee guards, tall boots with cuffs ----
  for (const leg of [leftLeg, rightLeg]) {
    put(leg, new THREE.CylinderGeometry(0.15, 0.13, 0.36, 7), matCloth, 0, -0.18, 0);
    put(leg, new THREE.IcosahedronGeometry(0.085, 0), matSteel, 0, -0.36, -0.1, 0, 0, 0, 1.1, 0.85, 0.6);
    put(leg, new THREE.CylinderGeometry(0.135, 0.12, 0.24, 7), matLeather, 0, -0.48, 0);
    put(leg, new THREE.CylinderGeometry(0.15, 0.15, 0.05, 7), matBoot, 0, -0.37, 0);
    put(leg, new THREE.BoxGeometry(0.2, 0.14, 0.34), matBoot, 0, -0.63, -0.05);
  }
  // Toe of the right boot sits on local −z: an independent front cue from the parent's heading.
  const toe = named(rightLeg, new THREE.BoxGeometry(0.12, 0.08, 0.1), matBoot, 0, -0.65, -0.24, "toe");

  // ---- hips: tunic skirt, gold hem, belt, buckle, pouch ----
  put(body, new THREE.CylinderGeometry(0.42, 0.5, 0.34, 8), matTunic, 0, 0.72, 0, 0, Math.PI / 8, 0, 1, 1, 0.78);
  put(body, new THREE.CylinderGeometry(0.505, 0.505, 0.04, 8), matGold, 0, 0.56, 0, 0, Math.PI / 8, 0, 1, 1, 0.78);
  put(body, new THREE.CylinderGeometry(0.44, 0.44, 0.1, 8), matLeather, 0, 0.88, 0, 0, Math.PI / 8, 0, 1, 1, 0.78);
  put(body, new THREE.BoxGeometry(0.15, 0.12, 0.05), matGold, 0, 0.88, -0.35);
  put(body, new THREE.BoxGeometry(0.15, 0.17, 0.11), matLeather, 0.31, 0.8, -0.24, 0, -0.5, 0);

  // ---- torso (its own group so breathing scales about the chest) ----
  const torso = new THREE.Group();
  torso.position.set(0, 1.16, 0);
  body.add(torso);
  put(torso, new THREE.CylinderGeometry(0.5, 0.42, 0.6, 8), matTunic, 0, 0, 0, 0, Math.PI / 8, 0, 1, 1, 0.66);
  put(torso, new THREE.BoxGeometry(0.46, 0.56, 0.05), matTunicDark, 0, -0.02, -0.29);
  put(torso, new THREE.BoxGeometry(0.04, 0.58, 0.06), matGold, -0.24, -0.02, -0.29);
  put(torso, new THREE.BoxGeometry(0.04, 0.58, 0.06), matGold, 0.24, -0.02, -0.29);
  put(torso, new THREE.OctahedronGeometry(0.09, 0), matGold, 0, 0.06, -0.33, 0, 0, 0, 1, 1.25, 0.45);
  put(torso, new THREE.CylinderGeometry(0.25, 0.33, 0.12, 8), matGold, 0, 0.34, 0, 0, Math.PI / 8, 0, 1, 1, 0.8);

  // ---- pauldrons: steel domes with gold rims ----
  for (const side of [-1, 1]) {
    put(body, new THREE.SphereGeometry(0.23, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), matSteel, side * 0.56, 1.48, 0, 0, 0, side * 0.35, 1.1, 0.8, 1);
    put(body, new THREE.TorusGeometry(0.235, 0.032, 4, 10), matGold, side * 0.56, 1.475, 0, Math.PI / 2, 0, side * 0.35);
    put(body, new THREE.SphereGeometry(0.19, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), matTunicDark, side * 0.6, 1.36, 0, 0, 0, side * 0.6, 1.05, 0.7, 0.95);
    put(body, new THREE.IcosahedronGeometry(0.035, 0), matGold, side * 0.6, 1.62, -0.05);
  }

  // ---- arms: sleeves, gold-banded bracers, gloves ----
  for (const arm of [leftArm, rightArm]) {
    put(arm, new THREE.CylinderGeometry(0.11, 0.1, 0.3, 7), matTunic, 0, -0.17, 0);
    put(arm, new THREE.CylinderGeometry(0.105, 0.09, 0.26, 7), matLeather, 0, -0.43, 0);
    put(arm, new THREE.CylinderGeometry(0.108, 0.108, 0.04, 7), matGold, 0, -0.32, 0);
    put(arm, new THREE.BoxGeometry(0.15, 0.14, 0.16), matLeather, 0, -0.6, 0);
  }

  // ---- the blade, held in the right hand, tip forward and down ----
  const sword = new THREE.Group();
  sword.position.set(0, -0.6, 0);
  sword.rotation.x = -0.32;
  rightArm.add(sword);
  put(sword, new THREE.CylinderGeometry(0.032, 0.032, 0.22, 6), matLeather, 0, 0, 0, Math.PI / 2, 0, 0);
  put(sword, new THREE.IcosahedronGeometry(0.048, 0), matGold, 0, 0, 0.14);
  put(sword, new THREE.BoxGeometry(0.3, 0.05, 0.06), matGold, 0, 0, -0.13);
  put(sword, new THREE.BoxGeometry(0.095, 0.03, 0.82), matSteel, 0, 0, -0.57);
  put(sword, new THREE.BoxGeometry(0.03, 0.034, 0.6), matGold, 0, 0, -0.45);
  put(sword, new THREE.ConeGeometry(0.048, 0.14, 4), matSteel, 0, 0, -1.05, -Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.33);

  // ---- the shield, strapped to the left forearm, face outward ----
  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(-0.27, 0.3);
  shieldShape.lineTo(0.27, 0.3);
  shieldShape.lineTo(0.27, 0.0);
  shieldShape.quadraticCurveTo(0.24, -0.25, 0, -0.42);
  shieldShape.quadraticCurveTo(-0.24, -0.25, -0.27, 0.0);
  shieldShape.lineTo(-0.27, 0.3);
  const shield = new THREE.Group();
  shield.position.set(-0.13, -0.42, 0);
  leftArm.add(shield);
  const face = new THREE.ExtrudeGeometry(shieldShape, { depth: 0.05, bevelEnabled: false, curveSegments: 3 });
  face.rotateY(Math.PI / 2);
  put(shield, face, matTunic, -0.06, 0, 0);
  const rim = new THREE.ExtrudeGeometry(shieldShape, { depth: 0.04, bevelEnabled: false, curveSegments: 3 });
  rim.rotateY(Math.PI / 2);
  put(shield, rim, matGold, -0.02, 0, 0, 0, 0, 0, 1, 1.08, 1.08);
  put(shield, new THREE.BoxGeometry(0.02, 0.62, 0.07), matGold, -0.075, -0.04, 0);
  put(shield, new THREE.BoxGeometry(0.02, 0.07, 0.48), matGold, -0.075, 0.12, 0);
  put(shield, new THREE.IcosahedronGeometry(0.07, 0), matGold, -0.09, 0.12, 0, 0, 0, 0, 0.6, 1, 1);

  // ---- head: face, brows, eyes, cowl with a gold-trimmed opening ----
  const head = new THREE.Group();
  head.position.set(0, 1.8, 0);
  head.name = "head";
  body.add(head);
  put(head, new THREE.IcosahedronGeometry(0.27, 1), matSkin, 0, 0, 0, 0, 0, 0, 0.95, 1.05, 1);
  const nose = named(head, new THREE.BoxGeometry(0.08, 0.11, 0.1), matSkin, 0, -0.03, -0.28, "nose");
  put(head, new THREE.BoxGeometry(0.06, 0.055, 0.04), matEye, -0.09, 0.04, -0.235);
  put(head, new THREE.BoxGeometry(0.06, 0.055, 0.04), matEye, 0.09, 0.04, -0.235);
  put(head, new THREE.BoxGeometry(0.11, 0.03, 0.04), matBrow, -0.09, 0.105, -0.24, 0, 0, 0.12);
  put(head, new THREE.BoxGeometry(0.11, 0.03, 0.04), matBrow, 0.09, 0.105, -0.24, 0, 0, -0.12);
  put(head, new THREE.BoxGeometry(0.12, 0.03, 0.03), matCloth, 0, -0.14, -0.235);
  put(head, new THREE.OctahedronGeometry(0.05, 0), matGold, 0, 0.18, -0.24);
  // Cowl: a sphere shell open at the front (local −z), a peak, and a gold rim.
  const gap = 0.46 * Math.PI;
  put(head, new THREE.SphereGeometry(0.35, 10, 7, 1.5 * Math.PI + gap / 2, 2 * Math.PI - gap, 0, 0.66 * Math.PI), matHood, 0, 0.0, 0.05, 0, 0, 0, 1, 1.12, 1.1);
  // The cowl falls onto the back as a short drape.
  put(head, new THREE.BoxGeometry(0.46, 0.32, 0.08), matHood, 0, -0.26, 0.3, 0.25, 0, 0);
  put(head, new THREE.ConeGeometry(0.13, 0.32, 6), matHood, 0, 0.34, 0.14, -0.55, 0, 0);
  put(head, new THREE.TorusGeometry(0.255, 0.028, 4, 14), matGold, 0, 0.0, -0.21, 0, 0, 0, 1, 1.15, 1);
  // Mantle where the cowl meets the shoulders.
  put(body, new THREE.CylinderGeometry(0.3, 0.46, 0.16, 8), matTunicDark, 0, 1.56, 0.04, 0, Math.PI / 8, 0, 1, 1, 0.8);

  // ---- cape: two panels hinged at the collar, gold hem ----
  const cape = new THREE.Group();
  cape.position.set(0, 1.52, 0.28);
  body.add(cape);
  put(cape, new THREE.BoxGeometry(0.8, 0.62, 0.05), matTunicDark, 0, -0.31, 0);
  const capeLow = new THREE.Group();
  capeLow.position.set(0, -0.6, 0);
  capeLow.rotation.x = -0.08;
  cape.add(capeLow);
  put(capeLow, new THREE.BoxGeometry(0.84, 0.48, 0.05), matTunicDark, 0, -0.24, 0);
  put(capeLow, new THREE.BoxGeometry(0.86, 0.05, 0.06), matGold, 0, -0.48, 0);
  put(capeLow, new THREE.ConeGeometry(0.09, 0.12, 4), matTunicDark, -0.3, -0.54, 0, Math.PI, Math.PI / 4, 0, 1, 1, 0.4);
  put(capeLow, new THREE.ConeGeometry(0.09, 0.12, 4), matTunicDark, 0.3, -0.54, 0, Math.PI, Math.PI / 4, 0, 1, 1, 0.4);
  cape.rotation.x = 0.22;

  flush();
  scene.add(player);
  void toe;

  return { player, body, leftLeg, rightLeg, leftArm, rightArm, torso, cape, head, nose };
}
