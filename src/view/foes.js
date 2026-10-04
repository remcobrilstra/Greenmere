import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { paintFacesWith, mergeParts, lambert } from "./materials.js";

// Underwood foes: geometry and motion for the five archetypes.
//
// Each biome has a Blender-built set (assets/models/foes-<key>.glb, tools/blender/foes.py):
// one creature per archetype, split into parts ("fo_<key>_<arch>_<part>") whose node
// origin is the joint the part swings about. The parts are merged into one geometry
// per archetype with a part index per vertex, so a whole pack is still one instanced
// mesh (one draw call, plus its shadow). The vertex shader swings every part about its
// pivot from four numbers per foe (aAnim): walk phase, walk amount, wind-up (+1 cocked,
// -1 at the end of the lunge) and flinch. "<part>Glow" pieces are self-lit (eyes,
// embers, the spitter's sac).
//
// Until a biome's file is in (or if it fails), the code-built bodies below stand in
// as one rigid part, and the same shader still leans, lunges and flinches them.

export const FOE_PARTS = ["body", "head", "jaw", "tail", "sac", "cloak", "legFL", "legFR", "legBL", "legBR", "armL", "armR", "legL", "legR"];
const PI = Math.PI;
// Per part: A = [walk swing, walk phase, pitch when cocked, pitch at the strike],
//           B = [pitch on a flinch, -, yaw sway while walking, swell when cocked].
// Pitch is about the pivot's x axis; positive lifts the -z end (nose up, limb forward).
const RULES = {
  body: [[0, 0, 0.16, -0.18], [0.22, 0, 0.05, 0]],
  head: [[0.08, 0.5, 0.3, -0.45], [0.3, 0, 0.12, 0]],
  jaw: [[0, 0, -0.55, -0.12], [-0.25, 0, 0, 0]],
  tail: [[0.15, 1, 0.35, -0.2], [0.2, 0, 0.5, 0]],
  sac: [[0, 0, 0, 0], [0, 0, 0, 0.6]],
  cloak: [[0.12, 0, -0.25, 0.35], [-0.3, 0, 0.12, 0]],
  legFL: [[0.6, 0, 0.55, 0.45], [0, 0, 0, 0]],
  legFR: [[0.6, PI, 0.55, 0.45], [0, 0, 0, 0]],
  legBL: [[0.6, PI, -0.2, -0.3], [0, 0, 0, 0]],
  legBR: [[0.6, 0, -0.2, -0.3], [0, 0, 0, 0]],
  armL: [[0.55, PI, 0.5, -0.2], [-0.4, 0, 0, 0]],
  armR: [[0.55, 0, 2.5, 0.6], [-0.4, 0, 0, 0]],
  legL: [[0.6, 0, -0.15, 0.35], [0, 0, 0, 0]],
  legR: [[0.6, PI, -0.15, -0.2], [0, 0, 0, 0]]
};
// Per archetype: body lunge on the strike (m), walk bob (m), stride (m per step cycle).
const MOTION = {
  skirmisher: { lunge: 0.45, bob: 0.05, stride: 1.1 },
  brute: { lunge: 0.35, bob: 0.06, stride: 1.8 },
  spitter: { lunge: 0.12, bob: 0.08, stride: 0.9 },
  shade: { lunge: 0.3, bob: 0.05, stride: 1.3 },
  boss: { lunge: 0.4, bob: 0.07, stride: 2.6 }
};

// ---------- Blender sets ----------

export const FOE_KEYS = ["cave", "temple", "root", "crypt", "forge"];
const sets = new Map();
let loader = null;

export function loadFoeSet(key) {
  if (!sets.has(key)) {
    if (!loader) loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const entry = { archs: null, ready: null };
    const prefix = "fo_" + key + "_";
    entry.ready = loader.loadAsync("./assets/models/foes-" + key + ".glb").then((gltf) => {
      const archs = {};
      gltf.scene.traverse((o) => {
        if (!o.isMesh || !o.name.startsWith(prefix)) return;
        const rest = o.name.slice(prefix.length);
        const cut = rest.indexOf("_");
        const arch = rest.slice(0, cut);
        let part = rest.slice(cut + 1);
        const glow = part.endsWith("Glow");
        if (glow) part = part.slice(0, -4);
        const index = FOE_PARTS.indexOf(part);
        if (index < 0) return;
        (archs[arch] || (archs[arch] = [])).push({ index, glow, pivot: o.position.clone(), geo: o.geometry });
      });
      entry.archs = archs;
      return entry;
    }).catch((err) => {
      console.warn("[dungeon] " + key + " foes did not load; keeping the code-built foes", err);
      return null;
    });
    sets.set(key, entry);
  }
  return sets.get(key).ready;
}

export function preloadFoeSets() {
  for (const key of FOE_KEYS) loadFoeSet(key);
}

export function foeSet(key) {
  const entry = sets.get(key);
  return entry && entry.archs ? entry : null;
}

// Merged, rigged geometry for one archetype of a loaded set, or null.
export function riggedFoeGeometry(set, arch) {
  const parts = set && set.archs[arch];
  if (!parts || !parts.length) return null;
  let count = 0;
  for (const p of parts) count += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const part = new Float32Array(count);
  const glow = new Float32Array(count);
  const pivots = new Float32Array(FOE_PARTS.length * 3);
  let o = 0;
  for (const p of parts) {
    const src = p.geo;
    const index = src.index;
    const n = index ? index.count : src.attributes.position.count;
    const sp = src.attributes.position;
    const sc = src.attributes.color;
    for (let i = 0; i < n; i++) {
      const v = index ? index.getX(i) : i;
      const k = o + i;
      pos[k * 3] = sp.getX(v) + p.pivot.x;
      pos[k * 3 + 1] = sp.getY(v) + p.pivot.y;
      pos[k * 3 + 2] = sp.getZ(v) + p.pivot.z;
      col[k * 3] = sc ? sc.getX(v) : 1;
      col[k * 3 + 1] = sc ? sc.getY(v) : 1;
      col[k * 3 + 2] = sc ? sc.getZ(v) : 1;
      part[k] = p.index;
      glow[k] = p.glow ? 1 : 0;
    }
    pivots[p.index * 3] = p.pivot.x;
    pivots[p.index * 3 + 1] = p.pivot.y;
    pivots[p.index * 3 + 2] = p.pivot.z;
    o += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aPart", new THREE.BufferAttribute(part, 1));
  geo.setAttribute("aGlow", new THREE.BufferAttribute(glow, 1));
  geo.computeVertexNormals();
  geo.userData.pivots = pivots;
  return geo;
}

// A code-built body as a single rigid "body" part pivoting at its feet.
export function rigidFoeGeometry(geo) {
  const n = geo.attributes.position.count;
  geo.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.setAttribute("aGlow", new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.userData.pivots = new Float32Array(FOE_PARTS.length * 3);
  return geo;
}

// ---------- Materials ----------

const RIG_COMMON = `
attribute float aPart;
attribute float aGlow;
attribute vec4 aAnim;
uniform vec3 uPivot[${FOE_PARTS.length}];
uniform vec4 uRuleA[${FOE_PARTS.length}];
uniform vec4 uRuleB[${FOE_PARTS.length}];
uniform vec3 uMotion;
varying float vGlow;
vec3 foeTurn(vec3 p, float pitch, float yaw) {
  float c = cos(pitch);
  float s = sin(pitch);
  p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
  c = cos(yaw);
  s = sin(yaw);
  return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}
`;
// Pitch is a plain x rotation: a positive angle lifts the -z end and swings a hanging limb forward.
const RIG_VERTEX = `
#include <begin_vertex>
{
  int k = int(aPart + 0.5);
  vec4 A = uRuleA[k];
  vec4 B = uRuleB[k];
  float cock = max(aAnim.z, 0.0);
  float strike = max(-aAnim.z, 0.0);
  float pitch = A.x * aAnim.y * sin(aAnim.x + A.y) + A.z * cock + A.w * strike + B.x * aAnim.w;
  float yaw = B.z * aAnim.y * sin(aAnim.x * 0.5 + A.y);
  vec3 piv = uPivot[k];
  vec3 p = (transformed - piv) * (1.0 + B.w * cock);
  p = foeTurn(p, pitch, yaw) + piv;
  p.y += uMotion.y * aAnim.y * abs(sin(aAnim.x));
  p.z += uMotion.x * (cock * 0.35 - strike) + aAnim.w * 0.12;
  transformed = p;
  vGlow = aGlow;
}
`;

function rigUniforms(pivots, arch) {
  const m = MOTION[arch] || MOTION.skirmisher;
  const piv = [];
  const ra = [];
  const rb = [];
  for (let i = 0; i < FOE_PARTS.length; i++) {
    piv.push(new THREE.Vector3(pivots[i * 3], pivots[i * 3 + 1], pivots[i * 3 + 2]));
    const r = RULES[FOE_PARTS[i]];
    ra.push(new THREE.Vector4(r[0][0], r[0][1], r[0][2], r[0][3]));
    rb.push(new THREE.Vector4(r[1][0], r[1][1], r[1][2], r[1][3]));
  }
  return {
    uPivot: { value: piv },
    uRuleA: { value: ra },
    uRuleB: { value: rb },
    uMotion: { value: new THREE.Vector3(m.lunge, m.bob, 0) }
  };
}

function patch(material, uniforms, lit) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\n" + RIG_COMMON)
      .replace("#include <begin_vertex>", RIG_VERTEX);
    if (lit) {
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vGlow;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vGlow * 1.1;");
    }
  };
  material.customProgramCacheKey = () => "foeRig" + (lit ? 1 : 0);
  return material;
}

// The lit material and the matching shadow-depth material for one rigged geometry.
export function foeMaterials(geo, arch) {
  const uniforms = rigUniforms(geo.userData.pivots, arch);
  const lit = patch(lambert(), uniforms, true);
  const depth = patch(new THREE.MeshDepthMaterial(), uniforms, false);
  return { lit, depth };
}

// Per-instance animation values; geometry must be the pack's own (it carries the buffer).
export function addAnimBuffer(geo, capacity) {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * 4), 4);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aAnim", attr);
  return attr;
}

// ---------- Motion ----------
// Reads only what combat already writes on a foe (x, z, state, telegraph, hp, stagger)
// and keeps its own per-foe memory, so it decides nothing.

const STRIKE_S = 0.3;

export function makeFoeAnimator() {
  const mem = new Map();
  function sample(e, arch, now, out) {
    let st = mem.get(e);
    if (!st) {
      st = { x: e.x, z: e.z, t: now, phase: (e.id || 0) * 1.7, amt: 0, hp: e.hp, flinch: 0, tell: 0, telling: false, strike: 0 };
      mem.set(e, st);
    }
    const dt = Math.min(0.1, Math.max(0, (now - st.t) / 1000));
    st.t = now;
    const moved = Math.hypot(e.x - st.x, e.z - st.z);
    st.x = e.x;
    st.z = e.z;
    const m = MOTION[arch] || MOTION.skirmisher;
    if (moved < 1.5) st.phase += (moved / m.stride) * Math.PI * 2;
    const walking = dt > 0 && moved / dt > 0.25 ? 1 : 0;
    if (dt > 0) st.amt += (walking - st.amt) * Math.min(1, dt * 8);
    if (e.hp < st.hp || e.stagger > 0.3) st.flinch = 1;
    st.hp = e.hp;
    st.flinch = Math.max(0, st.flinch - dt * 4);
    let wind = 0;
    if (e.hp > 0 && e.state === "telegraph" && e.telegraph > 0) {
      st.tell = Math.max(st.tell, e.telegraph);
      const u = 1 - e.telegraph / st.tell;
      wind = u * u * (3 - 2 * u);
      st.telling = true;
    } else {
      if (st.telling && e.hp > 0) st.strike = 1;
      st.telling = false;
      st.tell = 0;
      st.strike = Math.max(0, st.strike - dt / STRIKE_S);
      if (st.strike > 0) {
        // Cocked → snap through to the full lunge in the first 30%, then ease home.
        const u = 1 - st.strike;
        wind = u < 0.3 ? 1 - (u / 0.3) * 2 : -1 + (u - 0.3) / 0.7;
      }
    }
    out[0] = st.phase;
    out[1] = st.amt;
    out[2] = wind;
    out[3] = st.flinch * st.flinch;
    return out;
  }
  return { sample, forget: (e) => mem.delete(e) };
}

// ---------- Code-built bodies (the fallback) ----------

// Rootdeep's palette is the original Underwood beast; other biomes pass their own.
export const FOE_DEFAULT = {
  body: [0x3a2416, 0x5a3a24, 0x6b4428],
  skin: [0x8e2e28, 0x6e2e28, 0xa34a3a],
  muzzle: [0xe0a878, 0xd4a03a],
  sac: [0x8fb84a, 0xc6d46a, 0x6a9a32],
  crest: "antlers",
  crestHex: [0x5a3a24, 0x6b4428]
};

// Biome crest on the back or head: the quickest read of "this is a temple beast".
// (x, y, z) is the crest anchor; local −z is the face.
function addCrest(parts, f, rand, y, z, s) {
  const hex = f.crestHex;
  function cone(r, h, x, py, pz, tiltX, tiltZ, sides) {
    const g = new THREE.ConeGeometry(r * s, h * s, sides || 5);
    g.rotateX(tiltX || 0);
    g.rotateZ(tiltZ || 0);
    g.translate(x * s, py, pz);
    parts.push(paintFacesWith(g, hex, rand));
  }
  if (f.crest === "tuft") {
    for (let i = 0; i < 3; i++) cone(0.07, 0.22, 0, y + 0.06, z + (i - 1) * 0.13 * s, -0.5, 0, 4);
  } else if (f.crest === "horns") {
    cone(0.06, 0.3, -0.14, y + 0.14 * s, z - 0.04 * s, -0.35, 0.55);
    cone(0.06, 0.3, 0.14, y + 0.14 * s, z - 0.04 * s, -0.35, -0.55);
  } else if (f.crest === "antlers") {
    for (let side = -1; side <= 1; side += 2) {
      const g = new THREE.CylinderGeometry(0.025 * s, 0.035 * s, 0.32 * s, 4);
      g.rotateZ(side * -0.5);
      g.translate(side * 0.12 * s, y + 0.14 * s, z);
      parts.push(paintFacesWith(g, hex, rand));
      cone(0.03, 0.16, side * 0.2, y + 0.24 * s, z - 0.06 * s, -0.6, side * -0.2, 4);
    }
  } else if (f.crest === "spines") {
    for (let i = 0; i < 4; i++) cone(0.045, 0.26, 0, y + 0.08, z + (i - 1.5) * 0.12 * s, 0.35, 0, 4);
  } else if (f.crest === "embers") {
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BoxGeometry(0.12 * s, 0.16 * s, 0.1 * s);
      g.rotateY(0.6);
      g.translate((i - 1) * 0.12 * s, y + 0.08, z + (i - 1) * 0.06 * s);
      parts.push(paintFacesWith(g, hex, rand));
    }
  }
}

function makeSkirmisherGeo(rand, f) {
  const parts = [];
  const body = new THREE.BoxGeometry(0.72, 0.34, 0.48);
  body.translate(0, 0.42, 0);
  parts.push(paintFacesWith(body, f.body, rand));
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.CylinderGeometry(0.07, 0.09, 0.26, 5);
    const sx = (i & 1) ? 0.22 : -0.22;
    const sz = (i & 2) ? 0.14 : -0.16;
    leg.translate(sx, 0.13, sz);
    parts.push(paintFacesWith(leg, [0x241c18, 0x3a2a22], rand));
  }
  const head = new THREE.IcosahedronGeometry(0.2, 0);
  head.translate(0, 0.74, -0.02);
  parts.push(paintFacesWith(head, f.skin, rand));
  // Local −z is the face. The muzzle sits on that axis by construction.
  const muzzle = new THREE.BoxGeometry(0.1, 0.08, 0.16);
  muzzle.translate(0, 0.7, -0.24);
  parts.push(paintFacesWith(muzzle, f.muzzle, rand));
  addCrest(parts, f, rand, f.crest === "horns" || f.crest === "antlers" ? 0.8 : 0.59, f.crest === "horns" || f.crest === "antlers" ? -0.02 : 0.08, 1);
  return mergeParts(parts);
}

function makeBruteGeo(rand, f) {
  const parts = [];
  const body = new THREE.BoxGeometry(1.15, 0.72, 0.78);
  body.translate(0, 0.78, 0);
  parts.push(paintFacesWith(body, f.body, rand));
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.CylinderGeometry(0.11, 0.14, 0.42, 5);
    const sx = (i & 1) ? 0.34 : -0.34;
    const sz = (i & 2) ? 0.18 : -0.2;
    leg.translate(sx, 0.2, sz);
    parts.push(paintFacesWith(leg, [0x241c18, 0x3a2a22], rand));
  }
  const head = new THREE.BoxGeometry(0.46, 0.36, 0.4);
  head.translate(0, 1.32, -0.04);
  parts.push(paintFacesWith(head, f.skin, rand));
  const muzzle = new THREE.BoxGeometry(0.28, 0.14, 0.22);
  muzzle.translate(0, 1.22, -0.32);
  parts.push(paintFacesWith(muzzle, f.muzzle, rand));
  addCrest(parts, f, rand, f.crest === "horns" || f.crest === "antlers" ? 1.42 : 1.14, f.crest === "horns" || f.crest === "antlers" ? -0.04 : 0.12, 1.7);
  return mergeParts(parts);
}

function makeSpitterGeo(rand, f) {
  const parts = [];
  const body = new THREE.BoxGeometry(0.7, 0.4, 0.55);
  body.translate(0, 0.46, 0.06);
  parts.push(paintFacesWith(body, f.skin, rand));
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.CylinderGeometry(0.06, 0.08, 0.24, 5);
    const sx = (i & 1) ? 0.22 : -0.22;
    const sz = (i & 2) ? 0.16 : -0.08;
    leg.translate(sx, 0.12, sz);
    parts.push(paintFacesWith(leg, [0x241c18, 0x3a2a22], rand));
  }
  const sac = new THREE.SphereGeometry(0.22, 6, 5);
  sac.translate(0, 0.48, -0.38);
  parts.push(paintFacesWith(sac, f.sac, rand));
  const muzzle = new THREE.BoxGeometry(0.1, 0.08, 0.16);
  muzzle.translate(0, 0.5, -0.58);
  parts.push(paintFacesWith(muzzle, f.muzzle, rand));
  addCrest(parts, f, rand, 0.66, 0.16, 0.9);
  return mergeParts(parts);
}

function makeShadeGeo(rand, f) {
  const parts = [];
  const slate = f.body;
  const leg = new THREE.CylinderGeometry(0.12, 0.13, 0.44, 5);
  const boot = new THREE.BoxGeometry(0.18, 0.12, 0.28);
  const leftLeg = leg.clone();
  leftLeg.translate(-0.16, 0.36, 0);
  const rightLeg = leg.clone();
  rightLeg.translate(0.16, 0.36, 0);
  parts.push(paintFacesWith(leftLeg, slate, rand));
  parts.push(paintFacesWith(rightLeg, [0x241c18, 0x3a2a22], rand));
  const leftBoot = boot.clone();
  leftBoot.translate(-0.16, 0.1, -0.04);
  const rightBoot = boot.clone();
  rightBoot.translate(0.16, 0.1, -0.04);
  parts.push(paintFacesWith(leftBoot, [0x241c18], rand));
  parts.push(paintFacesWith(rightBoot, [0x241c18], rand));
  const tunic = new THREE.BoxGeometry(0.86, 0.66, 0.44);
  tunic.translate(0, 0.96, 0);
  parts.push(paintFacesWith(tunic, slate, rand));
  const belt = new THREE.BoxGeometry(0.9, 0.1, 0.48);
  belt.translate(0, 0.66, 0);
  parts.push(paintFacesWith(belt, [0xd4a03a, 0xe2ba60], rand));
  const head = new THREE.IcosahedronGeometry(0.26, 0);
  head.translate(0, 1.48, 0);
  parts.push(paintFacesWith(head, [0x8d93a0, 0x6e7882], rand));
  const muzzle = new THREE.BoxGeometry(0.1, 0.1, 0.14);
  muzzle.translate(0, 1.44, -0.28);
  parts.push(paintFacesWith(muzzle, [0xd4a03a], rand));
  const geo = mergeParts(parts);
  geo.scale(0.85, 0.85, 0.85);
  return geo;
}

function makeBossGeo(rand, f) {
  const parts = [];
  const moss = f.body;
  const body = new THREE.BoxGeometry(1.45, 0.95, 0.9);
  body.translate(0, 1.05, 0);
  parts.push(paintFacesWith(body, moss, rand));
  const band = new THREE.BoxGeometry(1.5, 0.14, 0.96);
  band.translate(0, 0.72, 0);
  parts.push(paintFacesWith(band, [0xd4a03a, 0xe2ba60], rand));
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.CylinderGeometry(0.16, 0.2, 0.55, 5);
    const sx = (i & 1) ? 0.42 : -0.42;
    const sz = (i & 2) ? 0.22 : -0.24;
    leg.translate(sx, 0.28, sz);
    parts.push(paintFacesWith(leg, [0x241c18, 0x3a2416], rand));
  }
  const head = new THREE.BoxGeometry(0.62, 0.48, 0.52);
  head.translate(0, 1.78, -0.06);
  parts.push(paintFacesWith(head, f.skin, rand));
  const muzzle = new THREE.BoxGeometry(0.36, 0.16, 0.28);
  muzzle.translate(0, 1.66, -0.42);
  parts.push(paintFacesWith(muzzle, f.muzzle, rand));
  addCrest(parts, f, rand, 2.0, -0.06, 2.4);
  return mergeParts(parts);
}

// The code-built body for an archetype, as one rigid part.
export function codeFoeGeometry(arch, rand, pal) {
  const make = { skirmisher: makeSkirmisherGeo, brute: makeBruteGeo, spitter: makeSpitterGeo, shade: makeShadeGeo, boss: makeBossGeo }[arch] || makeSkirmisherGeo;
  return rigidFoeGeometry(make(rand, pal));
}
