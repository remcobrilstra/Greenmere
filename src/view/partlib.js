// Blender part libraries for rigged characters (villagers, animals). A library
// is a .glb of meshes named "<prefix><part>" whose vertex colour R holds a
// colour slot ((slot + 0.5) / 16) and G a baked shade. paintParts() turns a
// list of parts into an ordinary vertex-colour geometry for one palette, so a
// single library dresses every villager or animal from its own colours.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

let loader = null;

// Resolves to { [part]: { pos: Float32Array, code: Float32Array } } (de-indexed, world-baked).
export function loadPartLibrary(url, prefix) {
  if (!loader) loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync(url).then((gltf) => {
    gltf.scene.updateMatrixWorld(true);
    const lib = {};
    const v = new THREE.Vector3();
    gltf.scene.traverse((o) => {
      if (!o.isMesh || !o.name.startsWith(prefix)) return;
      const src = o.geometry;
      const index = src.index;
      const n = index ? index.count : src.attributes.position.count;
      const pos = new Float32Array(n * 3);
      const code = new Float32Array(n * 2);
      const p = src.attributes.position;
      const c = src.attributes.color;
      for (let i = 0; i < n; i++) {
        const k = index ? index.getX(i) : i;
        v.set(p.getX(k), p.getY(k), p.getZ(k)).applyMatrix4(o.matrixWorld);
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        code[i * 2] = c ? c.getX(k) : 0;
        code[i * 2 + 1] = c ? c.getY(k) : 1;
      }
      lib[o.name.slice(prefix.length)] = { pos, code };
    });
    return lib;
  });
}

// Painted, non-indexed geometry for the named parts, shifted by (dx, dy, dz).
// `pal` is an array of THREE.Color indexed by slot.
export function paintParts(lib, names, pal, dx, dy, dz) {
  let count = 0;
  for (const n of names) if (lib[n]) count += lib[n].pos.length;
  const pos = new Float32Array(count);
  const col = new Float32Array(count);
  let o = 0;
  for (const n of names) {
    const part = lib[n];
    if (!part) continue;
    const vc = part.pos.length / 3;
    for (let i = 0; i < vc; i++) {
      pos[o + i * 3] = part.pos[i * 3] + (dx || 0);
      pos[o + i * 3 + 1] = part.pos[i * 3 + 1] + (dy || 0);
      pos[o + i * 3 + 2] = part.pos[i * 3 + 2] + (dz || 0);
      const c = pal[Math.min(pal.length - 1, Math.max(0, Math.floor(part.code[i * 2] * 16)))];
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

export function swapGeometry(mesh, geo, material) {
  const old = mesh.geometry;
  mesh.geometry = geo;
  if (material) mesh.material = material;
  old.dispose();
}
