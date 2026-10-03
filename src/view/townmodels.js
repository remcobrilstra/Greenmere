// Blender-built building exteriors (tools/blender/greenmere.py). A model
// replaces the code-built shell of one building after it loads; until then (or
// if it fails) the code-built shell stands. Models are authored in
// building-local space (+z is the door side, y = 0 is the ground) with baked
// vertex colours, so they drop into the same flat-shaded Lambert materials,
// clipping plane and cutaway as the rest.
//
// Objects in the .glb are matched by name prefix:
//   <id>_shell  walls, roof, chimney, dressing: the clipped shell material
//   <id>_glass  window glass: the building's window glow material
//   <id>_lamp   lantern glass: the town's lamp glow

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const MODEL_IDS = [
  "smith", "store", "still", "trainer", "inn", "bank",
  "cottage-0", "cottage-1", "cottage-2", "cottage-3", "cottage-4", "cottage-5"
];
export const BUILDING_MODELS = Object.fromEntries(MODEL_IDS.map((id) => [id, "./assets/models/" + id + ".glb"]));

let loader = null;

// Resolves to { shell, glass, lamp } BufferGeometries (non-indexed float
// position, normal, rgb colour) in building-local space; missing parts are null.
export function loadBuildingModel(id) {
  const url = BUILDING_MODELS[id];
  if (!url) return Promise.resolve(null);
  if (!loader) loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync(url).then((gltf) => {
    gltf.scene.updateMatrixWorld(true);
    const parts = { shell: [], glass: [], lamp: [] };
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const kind = Object.keys(parts).find((k) => o.name.startsWith(id + "_" + k));
      if (kind) parts[kind].push(plainGeometry(o.geometry, o.matrixWorld));
    });
    const out = {};
    for (const k of Object.keys(parts)) out[k] = parts[k].length ? concat(parts[k]) : null;
    return out;
  });
}

// Float copies through getX (which undoes any quantization), de-indexed, baked to `m`.
function plainGeometry(src, m) {
  const index = src.index;
  const n = index ? index.count : src.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const p = src.attributes.position;
  const c = src.attributes.color;
  for (let i = 0; i < n; i++) {
    const v = index ? index.getX(i) : i;
    pos[i * 3] = p.getX(v); pos[i * 3 + 1] = p.getY(v); pos[i * 3 + 2] = p.getZ(v);
    col[i * 3] = c ? c.getX(v) : 1; col[i * 3 + 1] = c ? c.getY(v) : 1; col[i * 3 + 2] = c ? c.getZ(v) : 1;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.applyMatrix4(m);
  out.computeVertexNormals();
  return out;
}

function concat(list) {
  if (list.length === 1) return list[0];
  const geo = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "color"]) {
    let count = 0;
    for (const g of list) count += g.attributes[name].array.length;
    const arr = new Float32Array(count);
    let o = 0;
    for (const g of list) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    geo.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return geo;
}
