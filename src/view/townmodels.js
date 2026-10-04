// The Blender-built town (tools/blender/greenmere.py): one .glb per building in
// building-local space (+z is the door side, y = 0 is the ground) and town.glb
// in world space. Vertex colours carry baked ambient occlusion, so the parts
// drop into the same flat-shaded Lambert materials, clipping and cutaway as the
// code-built town they replace (view/buildings.js swaps them in).
//
// Objects are matched by name, "<file id>_<part>":
//   shell     walls, roof, chimneys, sign, upstairs room: the clipped shell
//   glass     window glass: the building's window glow
//   lamp      door lantern glass
//   interior  floors, stairs, furniture, yard: the interior mesh
//   glowFire, glowPotion, glowLamp   pieces for the town's glow meshes
//   tier1..3  depth-tier dressing
//   cap, cap1 the wall section shown on the cut line indoors (ground floor, upstairs)
//   ground, props, hearth            (town.glb) square and roads, street props, fire pit
//   gate, gateGlow                   (town.glb, gate-local) Delve Gate stonework and its runes

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const PARTS = ["shell", "glass", "lamp", "interior", "glowFire", "glowPotion", "glowLamp",
  "tier1", "tier2", "tier3", "ground", "props", "hearth", "gate", "gateGlow", "cap", "cap1"];

let loader = null;

// Resolves to { [part]: BufferGeometry | null } for one file.
export function loadModel(id) {
  if (!loader) loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync("./assets/models/" + id + ".glb").then((gltf) => {
    gltf.scene.updateMatrixWorld(true);
    const parts = {};
    for (const k of PARTS) parts[k] = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const kind = PARTS.find((k) => o.name === id + "_" + k || o.name.startsWith(id + "_" + k + "_"));
      if (kind) parts[kind].push(plainGeometry(o.geometry, o.matrixWorld));
    });
    const out = {};
    for (const k of PARTS) out[k] = parts[k].length ? concat(parts[k]) : null;
    return out;
  });
}

// A library of loose pieces, "<prefix><name>" -> { [name]: BufferGeometry } (local space).
// Loaded once per file; callers share the geometries.
const libraries = new Map();
export function loadLibrary(id, prefix) {
  const key = id + "|" + prefix;
  if (!libraries.has(key)) libraries.set(key, fetchLibrary(id, prefix));
  return libraries.get(key);
}

function fetchLibrary(id, prefix) {
  if (!loader) loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync("./assets/models/" + id + ".glb").then((gltf) => {
    const out = {};
    gltf.scene.traverse((o) => {
      if (o.isMesh && o.name.startsWith(prefix)) out[o.name.slice(prefix.length)] = plainGeometry(o.geometry, new THREE.Matrix4());
    });
    return out;
  });
}

// Every building's file plus town.glb; rejects if any one fails.
export function loadTownModels(ids) {
  const all = ids.concat(["town"]);
  return Promise.all(all.map(loadModel)).then((list) => {
    const out = {};
    all.forEach((id, i) => { out[id] = list[i]; });
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
