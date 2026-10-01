import * as THREE from "three";
import { makeMat } from "./materials.js";

export function buildHero(scene) {
  const matSkin = makeMat(0xe0a878, { roughness: 0.86 });
  const matTunic = makeMat(0x2d62c8, { roughness: 0.74 });
  const matTunicDark = makeMat(0x1c3f8c, { roughness: 0.8 });
  const matGold = makeMat(0xd4a03a, { roughness: 0.42, metalness: 0.42 });
  const matCloth = makeMat(0x3a2a22, { roughness: 0.9 });
  const matBoot = makeMat(0x241c18, { roughness: 0.88 });
  const matSteel = makeMat(0xc5d0dc, { roughness: 0.32, metalness: 0.55 });
  const matEye = makeMat(0x1a1a1a, { roughness: 0.5 });

  const player = new THREE.Group();
  const body = new THREE.Group();
  player.add(body);
  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftLeg.position.set(-0.2, 0.7, 0);
  rightLeg.position.set(0.2, 0.7, 0);
  leftArm.position.set(-0.62, 1.46, 0);
  rightArm.position.set(0.62, 1.46, 0);
  body.add(leftLeg, rightLeg, leftArm, rightArm);

  function addPart(parent, geo, mat, x, y, z, cast) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast !== false;
    parent.add(mesh);
    return mesh;
  }
  const legGeo = new THREE.CylinderGeometry(0.15, 0.16, 0.52, 6);
  const bootGeo = new THREE.BoxGeometry(0.22, 0.16, 0.34);
  addPart(leftLeg, legGeo, matCloth, 0, -0.26, 0);
  addPart(rightLeg, legGeo, matCloth, 0, -0.26, 0);
  addPart(leftLeg, bootGeo, matBoot, 0, -0.62, -0.03);
  const rightBoot = addPart(rightLeg, bootGeo, matBoot, 0, -0.62, -0.03);
  // Toe of the right boot sits on local −z — an independent front cue from the parent's heading.
  const toe = addPart(rightBoot, new THREE.BoxGeometry(0.12, 0.08, 0.12), matBoot, 0, -0.02, -0.2);
  toe.name = "toe";

  const torso = addPart(body, new THREE.BoxGeometry(1.02, 0.78, 0.52), matTunic, 0, 1.14, 0);
  addPart(body, new THREE.BoxGeometry(1.06, 0.12, 0.56), matGold, 0, 0.78, 0);
  addPart(body, new THREE.BoxGeometry(0.22, 0.1, 0.08), matGold, 0, 0.78, -0.28);
  addPart(body, new THREE.SphereGeometry(0.2, 6, 5), matGold, -0.58, 1.48, 0);
  addPart(body, new THREE.SphereGeometry(0.2, 6, 5), matGold, 0.58, 1.48, 0);
  addPart(body, new THREE.BoxGeometry(0.7, 0.12, 0.56), matTunicDark, 0, 1.5, 0);

  const head = new THREE.Group();
  head.position.set(0, 1.78, 0);
  head.name = "head";
  body.add(head);
  addPart(head, new THREE.IcosahedronGeometry(0.3, 0), matSkin, 0, 0, 0);
  const nose = addPart(head, new THREE.BoxGeometry(0.1, 0.12, 0.14), matSkin, 0, -0.02, -0.32);
  nose.name = "nose";
  addPart(head, new THREE.BoxGeometry(0.07, 0.06, 0.06), matEye, -0.1, 0.05, -0.26);
  addPart(head, new THREE.BoxGeometry(0.07, 0.06, 0.06), matEye, 0.1, 0.05, -0.26);
  addPart(head, new THREE.BoxGeometry(0.16, 0.05, 0.05), matCloth, 0, -0.12, -0.28);
  const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.045, 4, 8), matGold);
  circlet.rotation.x = Math.PI / 2;
  circlet.position.y = 0.12;
  circlet.castShadow = true;
  head.add(circlet);
  addPart(head, new THREE.OctahedronGeometry(0.08, 0), matGold, 0, 0.34, 0);
  const hood = addPart(head, new THREE.ConeGeometry(0.34, 0.42, 6), matTunicDark, 0, 0.16, 0.06);

  addPart(leftArm, new THREE.CylinderGeometry(0.11, 0.12, 0.48, 6), matTunic, 0, -0.24, 0);
  addPart(rightArm, new THREE.CylinderGeometry(0.11, 0.12, 0.48, 6), matTunic, 0, -0.24, 0);
  addPart(leftArm, new THREE.BoxGeometry(0.16, 0.14, 0.16), matSkin, 0, -0.52, 0);
  addPart(rightArm, new THREE.BoxGeometry(0.16, 0.14, 0.16), matSkin, 0, -0.52, 0);

  const cape = addPart(body, new THREE.BoxGeometry(0.78, 0.95, 0.06), matTunicDark, 0, 1.12, 0.3);
  cape.rotation.x = 0.22;
  const shield = addPart(body, new THREE.CylinderGeometry(0.28, 0.28, 0.08, 6), matTunic, -0.12, 1.28, 0.36);
  shield.rotation.x = Math.PI / 2;
  const boss = addPart(shield, new THREE.OctahedronGeometry(0.08, 0), matGold, 0, 0.06, 0);
  const blade = addPart(body, new THREE.BoxGeometry(0.07, 0.78, 0.035), matSteel, 0.22, 1.32, 0.34);
  blade.rotation.z = 0.18;
  blade.rotation.x = 0.12;
  addPart(body, new THREE.BoxGeometry(0.22, 0.06, 0.06), matGold, 0.2, 1.0, 0.32);

  scene.add(player);
  hood.rotation.x = -0.15;

  return { player, body, leftLeg, rightLeg, leftArm, rightArm, torso, cape, head, nose };
}
