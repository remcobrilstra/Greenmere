import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

// Skinned kits: a .glb with one rig per species and its slot-coded pieces, named
// `${prefix}${species}_${piece}`, and clips named `${species}_${clip}` (tools/blender
// critters.py). buildSkinned() gives one actor its own copy of the skeleton and one
// skinned mesh merged from the pieces, painted from a palette (vertex colour R holds the
// slot, G a baked shade); play() sets clip weights and times for a frame.

let loader = null;

export function loadSkinKits(url, prefix) {
  if (!loader) loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync(url).then((gltf) => {
    gltf.scene.updateMatrixWorld(true);
    const kits = {};
    gltf.scene.traverse((o) => {
      if (!o.isSkinnedMesh || !o.name.startsWith(prefix)) return;
      const rest = o.name.slice(prefix.length);
      const cut = rest.indexOf("_");
      const species = rest.slice(0, cut);
      let kit = kits[species];
      if (!kit) {
        const bones = o.skeleton.bones;
        kit = kits[species] = {
          pieces: {},
          bones,
          rootBone: bones.find((b) => !b.parent || !b.parent.isBone),
          inverses: o.skeleton.boneInverses,
          bindMatrix: o.bindMatrix.clone(),
          clips: {}
        };
      }
      kit.pieces[rest.slice(cut + 1)] = o.geometry;
    });
    for (const clip of gltf.animations || []) {
      const cut = clip.name.indexOf("_");
      const kit = kits[clip.name.slice(0, cut)];
      if (kit) kit.clips[clip.name.slice(cut + 1)] = clip;
    }
    return kits;
  });
}

// One actor: names = pieces to merge, pal = THREE.Color per slot.
export function buildSkinned(kit, names, pal, material) {
  const list = names.map((n) => kit.pieces[n]).filter(Boolean);
  let count = 0;
  for (const g of list) count += g.index ? g.index.count : g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const si = new Uint16Array(count * 4);
  const sw = new Float32Array(count * 4);
  let o = 0;
  for (const g of list) {
    const idx = g.index;
    const n = idx ? idx.count : g.attributes.position.count;
    const P = g.attributes.position;
    const C = g.attributes.color;
    const I = g.attributes.skinIndex;
    const W = g.attributes.skinWeight;
    for (let i = 0; i < n; i++) {
      const v = idx ? idx.getX(i) : i;
      const k = o + i;
      pos[k * 3] = P.getX(v);
      pos[k * 3 + 1] = P.getY(v);
      pos[k * 3 + 2] = P.getZ(v);
      const c = pal[Math.min(pal.length - 1, Math.floor((C ? C.getX(v) : 0) * 16))];
      const shade = C ? C.getY(v) : 1;
      col[k * 3] = c.r * shade;
      col[k * 3 + 1] = c.g * shade;
      col[k * 3 + 2] = c.b * shade;
      si[k * 4] = I.getX(v); si[k * 4 + 1] = I.getY(v); si[k * 4 + 2] = I.getZ(v); si[k * 4 + 3] = I.getW(v);
      sw[k * 4] = W.getX(v); sw[k * 4 + 1] = W.getY(v); sw[k * 4 + 2] = W.getZ(v); sw[k * 4 + 3] = W.getW(v);
    }
    o += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
  geo.computeVertexNormals();
  const root = kit.rootBone.clone(true);
  const byName = {};
  root.traverse((b) => { if (b.isBone) byName[b.name] = b; });
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(kit.bones.map((b) => byName[b.name]), kit.inverses), kit.bindMatrix);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return { mesh, kit, mixer: new THREE.AnimationMixer(mesh), acts: {}, on: new Set() };
}

// weights: [[clip, weight, time], ...]; clips not listed are switched off.
export function play(sk, weights) {
  const want = new Set();
  for (const [name, w, t] of weights) {
    if (!(w > 0.001) || !sk.kit.clips[name]) continue;
    let a = sk.acts[name];
    if (!a) {
      a = sk.acts[name] = sk.mixer.clipAction(sk.kit.clips[name]);
      a.play();
    }
    a.enabled = true;
    a.setEffectiveWeight(w);
    a.time = t;
    want.add(name);
  }
  for (const name of sk.on) if (!want.has(name)) sk.acts[name].enabled = false;
  sk.on = want;
  sk.mixer.update(0);
}

export function clipLength(sk, name) {
  const c = sk.kit.clips[name];
  return c ? c.duration : 1;
}
