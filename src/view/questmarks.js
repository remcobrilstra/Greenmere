import * as THREE from "three";
import { loadLibrary } from "./townmodels.js";

// Floating quest marks over givers: a yellow "!" (a quest to take) and a yellow
// "?" (a finished quest to hand in). Chunky, flat-shaded, softly emissive so they
// read at dusk. Play decides which one shows; this file only builds them.

const YELLOW = 0xffd24a;
let _mat = null;

function mats() {
  if (!_mat) {
    _mat = new THREE.MeshLambertMaterial({ color: YELLOW, emissive: 0xffb820, emissiveIntensity: 0.75, flatShading: true, side: THREE.DoubleSide });
  }
  return { gold: _mat };
}

function part(group, geo, mat, x, y, z, rz) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (rz) mesh.rotation.z = rz;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

let _glyphs = null;
function glyphs() {
  if (!_glyphs) _glyphs = loadLibrary("nature", "nat_").catch(() => null);
  return _glyphs;
}

export function buildQuestMark() {
  const m = mats();
  const group = new THREE.Group();
  group.name = "questMark";

  // "!": a tapered bar over a dot.
  const bang = new THREE.Group();
  bang.name = "questBang";
  part(bang, new THREE.CylinderGeometry(0.13, 0.07, 0.55, 4), m.gold, 0, 0.42, 0);
  part(bang, new THREE.OctahedronGeometry(0.1, 0), m.gold, 0, 0, 0);
  group.add(bang);

  // "?": a three-quarter hook, a short stem, and the dot.
  const ask = new THREE.Group();
  ask.name = "questAsk";
  const hook = new THREE.TorusGeometry(0.17, 0.065, 4, 8, Math.PI * 1.5);
  hook.rotateZ(-Math.PI * 0.5);
  part(ask, hook, m.gold, 0, 0.55, 0);
  part(ask, new THREE.BoxGeometry(0.12, 0.2, 0.12), m.gold, 0, 0.3, 0);
  part(ask, new THREE.OctahedronGeometry(0.1, 0), m.gold, 0, 0, 0);
  group.add(ask);

  group.scale.setScalar(1.4);
  // Smoother Blender-built glyphs (nature.glb) replace the code-built ones once loaded.
  glyphs().then((lib) => {
    if (!lib) return;
    for (const [glyph, name] of [[bang, "qm_bang"], [ask, "qm_ask"]]) {
      if (!lib[name]) continue;
      for (const o of glyph.children.slice()) glyph.remove(o);
      part(glyph, lib[name], m.gold, 0, 0, 0);
    }
  });
  bang.visible = false;
  ask.visible = false;
  group.visible = false;
  return { group, bang, ask };
}
