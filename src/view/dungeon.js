import * as THREE from "three";
import { mulberry32, hash2 } from "../sim/rng.js";
import { mixSeed, tileToWorld } from "../sim/floorgen.js";
import { paintFacesWith, mergeParts, lambert } from "./materials.js";
import { dungeonTheme } from "./lights.js";
import { makeBuilder, writeProp, pick, preloadDungeonKits, loadDungeonKit, dungeonKit, kitVariants, stampPiece } from "./dungeonkit.js";

// The biome kits load in the background from the start, so the first delve has them.
preloadDungeonKits();

const TILE = 4;
// Rootdeep's palette is the original Underwood beast; other biomes pass their own.
const FOE_DEFAULT = {
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

const _dummy = new THREE.Object3D();
const _nearWhite = new THREE.Color(0xffffff);
const _overlayMat = new THREE.LineBasicMaterial({ color: 0xe2ba60, fog: false });
_overlayMat.flatShading = true;

// A saturated instance color multiplies the vertex color and muddies it.
function nearWhiteInstances(mesh) {
  if (!mesh || !mesh.isInstancedMesh) return;
  for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, _nearWhite);
  mesh.instanceColor.needsUpdate = true;
}
let _townBox = null;
let _townRing = null;
let _tileEdges = null;

function disposeObject(root) {
  const geos = new Set();
  const mats = new Set();
  root.traverse((o) => {
    if (o.geometry && !geos.has(o.geometry)) {
      geos.add(o.geometry);
      o.geometry.dispose();
    }
    if (!o.material) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < list.length; i++) {
      if (!mats.has(list[i])) {
        mats.add(list[i]);
        list[i].dispose();
      }
    }
  });
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

function telegraphMat(color) {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.75,
    flatShading: true,
    side: THREE.DoubleSide
  });
}

function makeWedge(range) {
  const half = 35 * Math.PI / 180;
  const seg = 6;
  const positions = [];
  for (let i = 0; i < seg; i++) {
    const t0 = -half + (2 * half) * (i / seg);
    const t1 = -half + (2 * half) * ((i + 1) / seg);
    positions.push(
      0, 0.05, 0,
      Math.sin(t0) * range, 0.05, -Math.cos(t0) * range,
      Math.sin(t1) * range, 0.05, -Math.cos(t1) * range
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function makeRing(inner, outer) {
  const ring = new THREE.RingGeometry(inner, outer, 8);
  ring.rotateX(-Math.PI / 2);
  return ring;
}

// A treasure chest, front on local −z. The lid is its own group hinged on the
// back top edge: rotation.x from 0 (shut) to about 1.9 (thrown open). A small gold
// gem hovers over a chest that has not been opened.
export function buildChest(theme) {
  const wood = [0x6b4428, 0x5a3a24, 0x7a5030];
  const band = theme && theme.trim ? theme.trim : [0xd4a03a, 0xe2ba60];
  const group = new THREE.Group();
  group.name = "chest";
  const base = makeBuilder();
  base.box(0, 0.26, 0, 1.0, 0.52, 0.62, wood[0], wood[1]);
  base.box(0, 0.05, 0, 1.06, 0.1, 0.68, 0x3a2416);
  for (const x of [-0.36, 0.36]) base.box(x, 0.27, 0, 0.09, 0.54, 0.66, band[0], band[0]);
  base.box(0, 0.4, -0.315, 0.16, 0.18, 0.04, band[1] || band[0]);
  base.box(0, 0.36, -0.34, 0.06, 0.07, 0.03, 0x241c18);
  const baseMesh = new THREE.Mesh(base.geometry(), lambert({ side: THREE.FrontSide }));
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);
  // Hinge on the back top edge; the lid geometry runs forward (−z) from it.
  const lid = new THREE.Group();
  lid.position.set(0, 0.52, 0.31);
  const top = makeBuilder();
  top.box(0, 0.09, -0.31, 1.02, 0.18, 0.64, wood[2], wood[0]);
  top.box(0, 0.2, -0.31, 1.0, 0.06, 0.5, wood[1], wood[2]);
  for (const x of [-0.36, 0.36]) top.box(x, 0.13, -0.31, 0.09, 0.2, 0.66, band[0], band[0]);
  top.box(0, 0.06, -0.635, 0.18, 0.12, 0.04, band[1] || band[0]);
  const lidMesh = new THREE.Mesh(top.geometry(), lambert({ side: THREE.FrontSide }));
  lidMesh.castShadow = true;
  lidMesh.receiveShadow = true;
  lid.add(lidMesh);
  group.add(lid);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.11, 0),
    new THREE.MeshLambertMaterial({ color: 0xffd27a, emissive: 0xe2ba60, emissiveIntensity: 0.9, flatShading: true })
  );
  gem.position.set(0, 1.25, 0);
  gem.castShadow = false;
  group.add(gem);
  // Glow inside the chest, seen once the lid lifts.
  const hoard = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.06, 0.46),
    new THREE.MeshLambertMaterial({ color: 0xffd27a, emissive: 0xd4a03a, emissiveIntensity: 0.8, flatShading: true })
  );
  hoard.position.set(0, 0.5, 0);
  hoard.visible = false;
  group.add(hoard);
  group.userData = { lid, gem, hoard };
  return group;
}

// The sword's swept arc: a flat ribbon in front of the Warden, tilted along the
// diagonal slash. Play fades it through material.opacity.
export function buildStrikeCrescent() {
  const group = new THREE.Group();
  group.name = "strikeCrescent";
  const mat = new THREE.MeshLambertMaterial({
    color: 0xf4e7c8,
    emissive: 0xffe9b0,
    emissiveIntensity: 0.9,
    flatShading: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  // Ring in XY, laid flat so angle π/2 points down local −z (the Warden's front).
  const arc = new THREE.RingGeometry(0.55, 1.5, 14, 1, Math.PI / 2 - 1.25, 2.5);
  arc.rotateX(-Math.PI / 2);
  const ribbon = new THREE.Mesh(arc, mat);
  ribbon.rotation.z = 0.55;
  ribbon.position.set(0, 1.12, -0.1);
  ribbon.castShadow = false;
  ribbon.receiveShadow = false;
  group.add(ribbon);
  group.userData.material = mat;
  group.visible = false;
  return group;
}

// Hearth channel around the Warden while Extract is held: a rune ring on the
// floor, petals that light up with progress, motes rising in a spiral, and a
// faint column of light. Play drives every value each frame.
// `tint` recolours it: the Hearth is gold (default); Mend passes greens.
export function buildHearthChannel(tint) {
  const c = Object.assign({ name: "hearthChannel", lit: 0xffd27a, glow: 0xe2ba60, dim: 0x8d6a2a, dimGlow: 0x5a3a14, column: 0xffe6a8, columnGlow: 0xffd27a }, tint || {});
  const group = new THREE.Group();
  group.name = c.name;
  const gold = new THREE.MeshLambertMaterial({ color: c.lit, emissive: c.glow, emissiveIntensity: 0.9, flatShading: true });
  const dim = new THREE.MeshLambertMaterial({ color: c.dim, emissive: c.dimGlow, emissiveIntensity: 0.4, flatShading: true });
  const ringGeo = new THREE.RingGeometry(0.95, 1.08, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, gold);
  ring.position.y = 0.04;
  group.add(ring);
  const petals = [];
  const petalGeo = new THREE.BoxGeometry(0.1, 0.03, 0.3);
  const PETALS = 20;
  for (let i = 0; i < PETALS; i++) {
    const a = (i / PETALS) * Math.PI * 2;
    const petal = new THREE.Mesh(petalGeo, dim);
    // Petal 0 sits at the Warden's front (−z) and the ring fills clockwise from above.
    petal.position.set(Math.sin(a) * 1.3, 0.045, -Math.cos(a) * 1.3);
    petal.rotation.y = -a;
    group.add(petal);
    petals.push(petal);
  }
  const motes = [];
  const moteGeo = new THREE.OctahedronGeometry(0.06, 0);
  for (let i = 0; i < 14; i++) {
    const mote = new THREE.Mesh(moteGeo, gold);
    group.add(mote);
    motes.push(mote);
  }
  const columnGeo = new THREE.CylinderGeometry(0.8, 1.0, 3.4, 12, 1, true);
  columnGeo.translate(0, 1.7, 0);
  const columnMat = new THREE.MeshLambertMaterial({
    color: c.column,
    emissive: c.columnGlow,
    emissiveIntensity: 0.7,
    flatShading: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const column = new THREE.Mesh(columnGeo, columnMat);
  group.add(column);
  group.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  group.visible = false;
  group.userData = { ring, petals, motes, column, gold, dim };
  return group;
}

export function buildFloorMesh(plan) {
  const rand = mulberry32(mixSeed(plan.runSeed || 1, (plan.floorIndex || 1) + 0x5a17));
  const theme = dungeonTheme(plan.themeId);
  const key = plan.biomeKey || "cave";
  const organic = key === "cave" || key === "root";
  const cols = plan.cols;
  const rows = plan.rows;
  const tiles = plan.tiles;
  const root = new THREE.Group();
  root.name = "dungeonRoot";
  const H = TILE / 2;
  const baseH = organic ? 3.3 : 3.6;
  const extentX = (cols / 2) * TILE;
  const extentZ = (rows / 2) * TILE;

  function isFloor(c, r) {
    return c >= 0 && r >= 0 && c < cols && r < rows && tiles[r * cols + c] === 1;
  }

  // Rock heights per solid cell. Organic biomes step their tops; built ones stay level.
  const heights = new Float32Array(cols * rows);
  for (let i = 0; i < heights.length; i++) heights[i] = organic ? baseH + rand() * 1.3 : baseH;
  // Rock three or more cells from any floor is only ever seen from above, through fog:
  // it gets one flat slab at rim height instead of a dressed top.
  const near = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r * cols + c] !== 1) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) near[nr * cols + nc] = 1;
        }
      }
    }
  }
  for (let i = 0; i < heights.length; i++) if (!near[i]) heights[i] = baseH;

  // Organic walls and floors share one jittered 2 m lattice, keyed by world position,
  // so every shared vertex moves together and nothing cracks. The outer rim stays put.
  const J = organic ? 0.42 : 0;
  const salt = ((plan.runSeed || 1) % 997) * 0.013 + (plan.floorIndex || 1) * 0.071;
  function P(x, y, z) {
    if (!J || Math.abs(x) >= extentX - 1e-3 || Math.abs(z) >= extentZ - 1e-3) return [x, y, z];
    return [
      x + (hash2(x * 0.731 + salt, z * 1.37) - 0.5) * 2 * J,
      y,
      z + (hash2(x * 1.913, z * 0.517 + salt) - 0.5) * 2 * J
    ];
  }

  // ---------- Floor ----------
  const fb = makeBuilder();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isFloor(c, r)) continue;
      const w = tileToWorld(c, r, cols, rows);
      if (organic) {
        for (let q = 0; q < 4; q++) {
          const ax = w.x - H + (q & 1) * H;
          const az = w.z - H + (q >> 1) * H;
          const hex = rand() < 0.16 ? pick(theme.floorAlt, rand) : pick(theme.floor, rand);
          fb.quad(P(ax, 0, az), P(ax + H, 0, az), P(ax + H, 0, az + H), P(ax, 0, az + H), hex, w.x, -1, w.z);
        }
      } else {
        fb.quad([w.x - H, 0, w.z - H], [w.x + H, 0, w.z - H], [w.x + H, 0, w.z + H], [w.x - H, 0, w.z + H], theme.grout, w.x, -1, w.z);
        const g = 0.045;
        for (let q = 0; q < 4; q++) {
          const ax = w.x - H + (q & 1) * H + g;
          const az = w.z - H + (q >> 1) * H + g;
          const bx = ax + H - 2 * g;
          const bz = az + H - 2 * g;
          const hex = rand() < 0.12 ? pick(theme.floorAlt, rand) : pick(theme.floor, rand);
          fb.quad([ax, 0.02, az], [bx, 0.02, az], [bx, 0.02, bz], [ax, 0.02, bz], hex, w.x, -1, w.z);
        }
      }
    }
  }
  // Under-sheet: catches any sliver between floor and rock.
  fb.quad([-extentX - 4, -0.05, -extentZ - 4], [extentX + 4, -0.05, -extentZ - 4], [extentX + 4, -0.05, extentZ + 4], [-extentX - 4, -0.05, extentZ + 4], theme.grout, 0, -1, 0);
  const floorGeo = fb.geometry();
  // The floor keeps the PR-03 convention: geometry in the XY plane, mesh rotated −90° on X.
  floorGeo.rotateX(Math.PI / 2);
  const floorMat = lambert({ side: THREE.FrontSide });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  floorMesh.castShadow = false;
  floorMesh.name = "dungeonFloor";
  root.add(floorMesh);

  // ---------- Rock / masonry ----------
  // Solid cells form a heightfield: a top for each, and a side wherever the
  // neighbour is floor or lower rock. This mesh is also the camera occluder.
  const wb = makeBuilder();
  const db = makeBuilder();
  const gb = makeBuilder();
  const goldB = makeBuilder();
  const rimH = baseH;
  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  // Edge of a cell toward direction d: three lattice points, start → mid → end.
  function edgePoints(w, d) {
    const x0 = w.x - H;
    const x1 = w.x + H;
    const z0 = w.z - H;
    const z1 = w.z + H;
    if (d === 0) return [[x1, z0], [x1, w.z], [x1, z1]];
    if (d === 1) return [[x0, z1], [x0, w.z], [x0, z0]];
    if (d === 2) return [[x1, z1], [w.x, z1], [x0, z1]];
    return [[x0, z0], [w.x, z0], [x1, z0]];
  }
  const floorFaces = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (tiles[i] === 1) continue;
      const w = tileToWorld(c, r, cols, rows);
      const h = heights[i];
      if (!near[i]) {
        // Oversized by 0.45 so it tucks under the jittered rim of its dressed neighbours.
        const o = H + 0.45;
        wb.quad([w.x - o, h - 0.01, w.z - o], [w.x + o, h - 0.01, w.z - o], [w.x + o, h - 0.01, w.z + o], [w.x - o, h - 0.01, w.z + o], theme.wallTop[0], w.x, h - 5, w.z);
        continue;
      }
      const ring = [
        [w.x - H, w.z - H], [w.x, w.z - H], [w.x + H, w.z - H], [w.x + H, w.z],
        [w.x + H, w.z + H], [w.x, w.z + H], [w.x - H, w.z + H], [w.x - H, w.z]
      ];
      const top = pick(theme.wallTop, rand);
      const peak = P(w.x, h + (organic ? rand() * 0.35 : 0), w.z);
      for (let k = 0; k < 8; k++) {
        const a = ring[k];
        const b = ring[(k + 1) % 8];
        wb.tri(peak, P(a[0], h, a[1]), P(b[0], h, b[1]), top, w.x, h - 5, w.z);
      }
      for (let d = 0; d < 4; d++) {
        const nc = c + DIRS[d][0];
        const nr = r + DIRS[d][1];
        const outside = nc < 0 || nr < 0 || nc >= cols || nr >= rows;
        let y0;
        if (outside) y0 = rimH;
        else if (tiles[nr * cols + nc] === 1) y0 = 0;
        else y0 = heights[nr * cols + nc];
        if (y0 >= h - 1e-3) continue;
        const e = edgePoints(w, d);
        const hex = pick(theme.wall, rand);
        for (let s = 0; s < 2; s++) {
          const a = e[s];
          const b = e[s + 1];
          wb.quad(P(a[0], y0, a[1]), P(b[0], y0, b[1]), P(b[0], h, b[1]), P(a[0], h, a[1]), hex, w.x, (y0 + h) / 2, w.z);
        }
        if (y0 === 0) floorFaces.push({ c, r, d, w, h, e });
      }
    }
  }
  // Rim: the rock shelf beyond the grid, out into the fog.
  const far = 90;
  const rimHex = theme.wallTop[0];
  wb.quad([-extentX - far, rimH, -extentZ - far], [extentX + far, rimH, -extentZ - far], [extentX + far, rimH, -extentZ], [-extentX - far, rimH, -extentZ], rimHex, 0, rimH - 1, -extentZ - 1);
  wb.quad([-extentX - far, rimH, extentZ], [extentX + far, rimH, extentZ], [extentX + far, rimH, extentZ + far], [-extentX - far, rimH, extentZ + far], rimHex, 0, rimH - 1, extentZ + 1);
  wb.quad([-extentX - far, rimH, -extentZ], [-extentX, rimH, -extentZ], [-extentX, rimH, extentZ], [-extentX - far, rimH, extentZ], rimHex, -extentX - 1, rimH - 1, 0);
  wb.quad([extentX, rimH, -extentZ], [extentX + far, rimH, -extentZ], [extentX + far, rimH, extentZ], [extentX, rimH, extentZ], rimHex, extentX + 1, rimH - 1, 0);

  // ---------- Dressing: wall faces, corners, floor scatter, plan props ----------
  // None of it collides (props collide through propColliders) and none of it occludes.
  // Blender kit pieces when the biome's file is in, else the code-built writers; a kit
  // that lands after the floor is built swaps in place (same seed, same colliders).
  const propColliders = [];
  const props = plan.props || [];
  const glowSpots = [];
  for (let i = 0; i < props.length; i++) {
    const prop = props[i];
    const w = tileToWorld(prop.col, prop.row, cols, rows);
    const x = w.x + prop.ox;
    const z = w.z + prop.oz;
    propColliders.push({ x, z, r: prop.r || 0.45, tileX: w.x, tileZ: w.z });
    if (prop.kind === "brazier" || prop.kind === "crystal" || prop.kind === "candle" || prop.kind === "mushroom" || prop.kind === "slag") {
      glowSpots.push({ x, z });
    }
  }

  function dressCode(kb, kg, rand) {
    // ---------- Wall dressing (no collision, not an occluder) ----------
    for (let f = 0; f < floorFaces.length; f++) {
      const face = floorFaces[f];
      const nx = DIRS[face.d][0];
      const nz = DIRS[face.d][1];
      // Yaw that turns local +z into the face normal (out of the rock, into the room).
      const yaw = Math.atan2(nx, nz);
      const ex = (face.e[0][0] + face.e[2][0]) / 2;
      const ez = (face.e[0][1] + face.e[2][1]) / 2;
      const h = face.h;
      if (organic) {
        const n = rand() < 0.6 ? 1 : 2;
        for (let k = 0; k < n; k++) {
          const along = (rand() - 0.5) * 2.6;
          const depth = 0.9 + rand() * 0.5;
          const tall = 0.9 + rand() * 1.9;
          kb.at(ex, 0, ez, yaw, 1);
          kb.lump(along, tall / 2, -depth / 2 + 0.28, 1.3 + rand() * 0.8, tall, depth, 0.14, rand, theme.rock, pick(theme.wallTop, rand));
        }
        if (key === "root" && rand() < 0.45) {
          kb.at(ex, 0, ez, yaw, 1);
          kb.lump((rand() - 0.5) * 1.6, 0.22, 0.05, 3.2, 0.4, 0.45, 0.1, rand, theme.root);
          const tx = (rand() - 0.5) * 2.4;
          kb.lathe(tx, 0.08, [[0, h - 2.4 - rand()], [0.14, h - 0.6], [0.2, h + 0.05]], 5, theme.root, rand);
        }
        if (rand() < 0.14) {
          const a = (rand() - 0.5) * 2.2;
          const mx = ex + nx * 0.55 + nz * a;
          const mz = ez + nz * 0.55 + nx * a;
          const spin = rand() * 6;
          kb.at(mx, 0, mz, spin, 0.8);
          kg.at(mx, 0, mz, spin, 0.8);
          writeProp(key === "cave" && rand() < 0.3 ? "crystal" : "mushroom", kb, kg, theme, rand, baseH);
        }
        continue;
      }
      // Built biomes: plinth, cornice, a pilaster on every edge start.
      kb.at(ex, 0, ez, yaw, 1);
      kb.box(0, 0.22, 0.1, 4, 0.44, 0.36, theme.trim[1] || theme.trim[0], theme.trim[0]);
      kb.box(0, h - 0.16, 0.12, 4.1, 0.32, 0.44, theme.trim[0], pick(theme.wallTop, rand));
      kb.box(-1.85, h / 2, 0.14, 0.5, h - 0.3, 0.42, theme.wall[2] || theme.wall[0]);
      const roll = rand();
      if ((key === "temple" || key === "crypt") && roll < 0.16) {
        const cloth = pick(theme.cloth, rand);
        kb.box(0.15, h - 1.45, 0.08, 1.2, 1.9, 0.06, cloth);
        kb.box(0.15, h - 2.43, 0.09, 1.25, 0.1, 0.07, theme.trim[0]);
      } else if (key === "temple" && roll < 0.42) {
        const n = 2 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) {
          const len = 0.8 + rand() * 1.8;
          kb.box(-1.4 + rand() * 2.8, h - len / 2 - 0.3, 0.05, 0.14, len, 0.06, pick(theme.root, rand));
        }
      } else if (key === "forge" && roll < 0.35) {
        kg.at(ex, 0, ez, yaw, 1);
        kg.box((rand() - 0.5) * 1.6, 0.025, 0.42, 2.4, 0.03, 0.22, 0);
        kg.box((rand() - 0.5) * 2.4, 0.9 + rand() * 0.8, 0.02, 0.1, 1.2 + rand(), 0.05, 0);
      } else if (key === "crypt" && roll < 0.3) {
        kg.at(ex, 0, ez, yaw, 1);
        kb.box(0.6, 1.25, 0.15, 0.5, 0.08, 0.3, theme.trim[0]);
        kb.lathe(0.6, 0.15, [[0.04, 1.29], [0.04, 1.5]], 5, [0xe7d7b4], rand);
        kg.lathe(0.6, 0.15, [[0.035, 1.5], [0, 1.62]], 4, [0], rand);
      }
    }

    // ---------- Floor scatter (no collision) ----------
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!isFloor(c, r)) continue;
        if ((c === plan.entrance.col && r === plan.entrance.row) || (c === plan.stairs.col && r === plan.stairs.row)) continue;
        const w = tileToWorld(c, r, cols, rows);
        const roll = rand();
        if (roll < 0.3) {
          kb.at(w.x, 0, w.z, 0, 1);
          const n = 2 + Math.floor(rand() * 3);
          const hexes = key === "forge" ? [0x241c18, 0x2f363e] : organic ? theme.rock : theme.floorAlt;
          for (let k = 0; k < n; k++) {
            const s = 0.12 + rand() * 0.16;
            kb.lump((rand() - 0.5) * 3.2, s * 0.3, (rand() - 0.5) * 3.2, s * 1.4, s * 0.6, s, 0.2, rand, hexes);
          }
        } else if (key === "crypt" && roll < 0.38) {
          kb.at(w.x + (rand() - 0.5) * 2.6, 0, w.z + (rand() - 0.5) * 2.6, rand() * 6, 1);
          kb.box(0, 0.04, 0, 0.5, 0.06, 0.07, 0xe7d7b4);
          kb.box(0.1, 0.04, 0.12, 0.07, 0.06, 0.36, 0xd8c8a0);
          kb.lump(-0.28, 0.1, 0.05, 0.18, 0.18, 0.2, 0.1, rand, [0xe7d7b4]);
        }
      }
    }
    writePlanProps(null, kb, kg, rand);
  }

  // Yaw that puts a corner piece's local +z on face a's room normal and local +x on
  // face b's (local +x lands on (cos, -sin) of the yaw), whichever order fits.
  function cornerYaw(ax, az, bx, bz) {
    return bx === az && bz === -ax ? Math.atan2(ax, az) : Math.atan2(bx, bz);
  }

  function dressKit(kit, kb, kg, rand) {
    // Walls: half the faces get the plain segment, the rest share the dressed ones.
    const walls = kitVariants(kit, "wall");
    for (let f = 0; f < floorFaces.length && walls.length; f++) {
      const face = floorFaces[f];
      const nx = DIRS[face.d][0];
      const nz = DIRS[face.d][1];
      const ex = (face.e[0][0] + face.e[2][0]) / 2;
      const ez = (face.e[0][1] + face.e[2][1]) / 2;
      const roll = rand();
      const name = walls.length > 1 && roll >= 0.5 ? walls[1 + Math.min(walls.length - 2, Math.floor(((roll - 0.5) / 0.5) * (walls.length - 1)))] : walls[0];
      const s = organic ? 0.92 + rand() * 0.16 : 1;
      kb.at(ex, 0, ez, Math.atan2(nx, nz), s);
      kg.at(ex, 0, ez, Math.atan2(nx, nz), s);
      stampPiece(kit, name, kb, kg);
    }
    // Corners: convex where a rock cell shows two perpendicular faces to the room,
    // concave where a floor cell has rock on two perpendicular sides.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const floor = isFloor(c, r);
        if (!floor && !near[r * cols + c]) continue;
        const w = tileToWorld(c, r, cols, rows);
        for (let d = 0; d < 2; d++) {
          for (let e = 2; e < 4; e++) {
            const ax = DIRS[d][0];
            const az = DIRS[d][1];
            const bx = DIRS[e][0];
            const bz = DIRS[e][1];
            const fa = isFloor(c + ax, r + az);
            const fb = isFloor(c + bx, r + bz);
            const fd = isFloor(c + ax + bx, r + az + bz);
            let name;
            let yaw;
            if (!floor && fa && fb && fd) {
              name = "cornerOut";
              yaw = cornerYaw(ax, az, bx, bz);
            } else if (floor && !fa && !fb && !fd) {
              name = "cornerIn";
              yaw = cornerYaw(-ax, -az, -bx, -bz);
            } else continue;
            const vx = w.x + (ax + bx) * H;
            const vz = w.z + (az + bz) * H;
            const s = organic ? 0.9 + rand() * 0.2 : 1;
            kb.at(vx, 0, vz, yaw, s);
            kg.at(vx, 0, vz, yaw, s);
            stampPiece(kit, name, kb, kg);
          }
        }
      }
    }
    // Floor scatter.
    const scatter = kitVariants(kit, "scatter");
    for (let r = 0; r < rows && scatter.length; r++) {
      for (let c = 0; c < cols; c++) {
        if (!isFloor(c, r)) continue;
        if ((c === plan.entrance.col && r === plan.entrance.row) || (c === plan.stairs.col && r === plan.stairs.row)) continue;
        if (rand() >= 0.32) continue;
        const w = tileToWorld(c, r, cols, rows);
        const x = w.x + (rand() - 0.5) * 2.6;
        const z = w.z + (rand() - 0.5) * 2.6;
        const yaw = rand() * Math.PI * 2;
        kb.at(x, 0, z, yaw, 1);
        kg.at(x, 0, z, yaw, 1);
        stampPiece(kit, pick(scatter, rand), kb, kg);
      }
    }
    writePlanProps(kit, kb, kg, rand);
  }

  function writePlanProps(kit, kb, kg, rand) {
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      const w = tileToWorld(prop.col, prop.row, cols, rows);
      const x = w.x + prop.ox;
      const z = w.z + prop.oz;
      const pillar = prop.kind === "pillar";
      const s = pillar ? 1 : 0.85 + rand() * 0.3;
      const yaw = pillar ? 0 : rand() * Math.PI * 2;
      kb.at(x, 0, z, yaw, s);
      kg.at(x, 0, z, yaw, s);
      const variants = kit ? kitVariants(kit, prop.kind) : [];
      if (variants.length) stampPiece(kit, pick(variants, rand), kb, kg);
      else writeProp(prop.kind, kb, kg, theme, rand, baseH);
    }
  }

  const dressSeed = mixSeed(plan.runSeed || 1, (plan.floorIndex || 1) + 0x6b1d);
  function dressGeometry(kit) {
    const kb = makeBuilder();
    const kg = makeBuilder();
    const drand = mulberry32(dressSeed);
    if (kit) dressKit(kit, kb, kg, drand);
    else dressCode(kb, kg, drand);
    return { solid: kb.count() ? kb.geometry() : null, glow: kg.count() ? kg.geometry() : null };
  }

  // ---------- Treasure chests ----------
  const chests = [];
  const planChests = plan.chests || [];
  for (let i = 0; i < planChests.length; i++) {
    const c = planChests[i];
    const w = tileToWorld(c.col, c.row, cols, rows);
    const x = w.x + c.ox;
    const z = w.z + c.oz;
    const chest = buildChest(theme);
    chest.position.set(x, 0, z);
    chest.rotation.y = c.yaw || 0;
    chest.name = "chest:" + c.id;
    root.add(chest);
    propColliders.push({ x, z, r: c.r || 0.55, tileX: w.x, tileZ: w.z });
    chests.push({ id: c.id, x, z, group: chest, lid: chest.userData.lid, gem: chest.userData.gem, hoard: chest.userData.hoard, open: 0, opened: false });
  }

  // ---------- Arrival landing ----------
  const ent = tileToWorld(plan.entrance.col, plan.entrance.row, cols, rows);
  db.at(0, 0, 0, 0, 1);
  goldB.at(0, 0, 0, 0, 1);
  db.disc(ent.x, 0.03, ent.z, 1.3, 14, theme.trim[1] || theme.trim[0]);
  goldB.ring(ent.x, 0.045, ent.z, 1.3, 1.46, 20, 0);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    goldB.at(ent.x + Math.cos(a) * 0.85, 0.05, ent.z + Math.sin(a) * 0.85, -a, 1);
    goldB.box(0, 0, 0, 0.1, 0.02, 0.36, 0);
  }
  const postX = ent.x + 1.45;
  const postZ = ent.z + 1.45;
  db.at(postX, 0, postZ, 0, 1);
  goldB.at(postX, 0, postZ, 0, 1);
  db.lathe(0, 0, [[0.16, 0], [0.07, 0.2], [0.06, 2.1]], 5, [0x241c18, 0x3a2416], rand);
  db.box(0, 2.12, 0, 0.36, 0.06, 0.36, 0x241c18);
  db.box(0, 2.62, 0, 0.36, 0.06, 0.36, 0x241c18);
  goldB.box(0, 2.37, 0, 0.24, 0.44, 0.24, 0);
  propColliders.push({ x: postX, z: postZ, r: 0.25, tileX: ent.x, tileZ: ent.z });

  // ---------- Stair well ----------
  const st = tileToWorld(plan.stairs.col, plan.stairs.row, cols, rows);
  const wellHexes = [theme.wall[1] || theme.wall[0], theme.grout, 0x241c18, 0x140e0a];
  db.at(0, 0, 0, 0, 1);
  db.ring(st.x, 0.03, st.z, 1.35, 1.6, 20, theme.trim[1] || theme.trim[0]);
  for (let k = 0; k < 3; k++) db.ring(st.x, 0.032 + k * 0.002, st.z, 1.35 - (k + 1) * 0.3, 1.35 - k * 0.3, 16, wellHexes[k]);
  db.disc(st.x, 0.04, st.z, 0.45, 12, wellHexes[3]);
  goldB.at(0, 0, 0, 0, 1);
  goldB.ring(st.x, 0.05, st.z, 1.6, 1.74, 24, 0);
  const corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let k = 0; k < corners.length; k++) {
    const ox = st.x + corners[k][0] * 1.45;
    const oz = st.z + corners[k][1] * 1.45;
    db.at(ox, 0, oz, Math.PI / 4, 1);
    db.lathe(0, 0, [[0.36, 0], [0.28, 1.7], [0, 2.25]], 4, [theme.wall[0], theme.trim[0]], rand);
    goldB.at(ox, 0, oz, Math.atan2(-corners[k][0], -corners[k][1]), 1);
    goldB.box(0, 1.15, 0.27, 0.12, 0.5, 0.04, 0);
    propColliders.push({ x: ox, z: oz, r: 0.35, tileX: st.x, tileZ: st.z });
  }

  const wallGeo = wb.geometry();
  const wallMesh = new THREE.Mesh(wallGeo, lambert({ side: THREE.DoubleSide }));
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  wallMesh.name = "dungeonWalls";
  root.add(wallMesh);

  if (db.count()) {
    const detail = new THREE.Mesh(db.geometry(), lambert({ side: THREE.DoubleSide }));
    detail.castShadow = true;
    detail.receiveShadow = true;
    detail.name = "dungeonDetail";
    root.add(detail);
  }
  function glowMesh(builder, hex, strength, name) {
    if (!builder.count()) return null;
    const mesh = new THREE.Mesh(builder.geometry(), new THREE.MeshLambertMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: strength,
      flatShading: true,
      side: THREE.DoubleSide
    }));
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = name;
    root.add(mesh);
    return mesh;
  }
  glowMesh(gb, theme.accent, 0.9, "dungeonGlow");
  glowMesh(goldB, 0xe2ba60, 0.85, "dungeonRunes");

  const dressMat = lambert({ side: THREE.DoubleSide });
  const dressGlowMat = new THREE.MeshLambertMaterial({
    color: theme.accent,
    emissive: theme.accent,
    emissiveIntensity: 0.9,
    flatShading: true,
    side: THREE.DoubleSide
  });
  const dressSolid = new THREE.Mesh(new THREE.BufferGeometry(), dressMat);
  dressSolid.castShadow = true;
  dressSolid.receiveShadow = true;
  dressSolid.name = "dungeonDressing";
  const dressGlow = new THREE.Mesh(new THREE.BufferGeometry(), dressGlowMat);
  dressGlow.castShadow = false;
  dressGlow.receiveShadow = false;
  dressGlow.name = "dungeonDressingGlow";
  root.add(dressSolid, dressGlow);
  let disposed = false;
  function applyDressing(kit) {
    const geo = dressGeometry(kit);
    dressSolid.geometry.dispose();
    dressSolid.geometry = geo.solid || new THREE.BufferGeometry();
    dressGlow.geometry.dispose();
    dressGlow.geometry = geo.glow || new THREE.BufferGeometry();
    root.userData.dressedWithKit = !!kit;
  }
  const kitNow = dungeonKit(key);
  applyDressing(kitNow);
  if (!kitNow) {
    loadDungeonKit(key).then((kit) => {
      if (kit && !disposed) applyDressing(kit);
    });
  }

  function beam(x, z, r0, r1, height, hex, opacity, name) {
    const geo = new THREE.CylinderGeometry(r1, r0, height, 10, 1, true);
    geo.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 0.8,
      flatShading: true,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide
    }));
    mesh.position.set(x, 0, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = name;
    root.add(mesh);
    return mesh;
  }
  beam(ent.x, ent.z, 1.2, 1.9, 16, 0xfff4d8, 0.07, "arrivalShaft");
  const bossFloor = (plan.floorIndex || 1) % 5 === 0;
  // The beacon over the stair well shows the way across a big floor; it burns red
  // while a boss still holds the stairs.
  const beacon = beam(st.x, st.z, 0.8, 0.8, 40, bossFloor ? 0xb64034 : 0xe2ba60, 0.2, "stairsBeacon");

  // Point lights: arrival, stairs, then up to two glowing props far from both. Four at most.
  function pointLight(x, y, z, hex, strength, dist, name) {
    const light = new THREE.PointLight(hex, strength, dist, 2);
    light.castShadow = false;
    light.position.set(x, y, z);
    light.name = name;
    root.add(light);
    return light;
  }
  pointLight(ent.x + 1.45, 2.4, ent.z + 1.45, 0xffd9a0, 7, 12, "arrivalLight");
  const stairsLight = pointLight(st.x, 2.2, st.z, bossFloor ? 0xff6a4a : 0xe2ba60, 8, 11, "stairsLight");
  const used = [ent, st];
  for (let n = 0; n < 2; n++) {
    let best = null;
    let bestD = 14 * 14;
    for (let i = 0; i < glowSpots.length; i++) {
      const g = glowSpots[i];
      let d = Infinity;
      for (let k = 0; k < used.length; k++) d = Math.min(d, (g.x - used[k].x) ** 2 + (g.z - used[k].z) ** 2);
      if (d > bestD) {
        bestD = d;
        best = g;
      }
    }
    if (!best) break;
    used.push(best);
    pointLight(best.x, 1.6, best.z, theme.accent, 5, 9, "featureLight");
  }

  const actors = [];
  const buckets = { skirmisher: [], brute: [], spitter: [], shade: [], boss: [] };
  const spawns = plan.spawns || [];
  const entranceW = tileToWorld(plan.entrance.col, plan.entrance.row, cols, rows);
  for (let i = 0; i < spawns.length; i++) {
    const s = spawns[i];
    const name = s.boss ? "boss" : (buckets[s.archetype] ? s.archetype : "skirmisher");
    const w = tileToWorld(s.col, s.row, cols, rows);
    const dx = entranceW.x - w.x;
    const dz = entranceW.z - w.z;
    const bucket = buckets[name];
    const actor = {
      id: s.id,
      archetype: name,
      eliteAffix: s.eliteAffix || null,
      boss: !!s.boss,
      x: w.x,
      z: w.z,
      spawnX: w.x,
      spawnZ: w.z,
      hp: 1,
      hpMax: 1,
      hurt: name === "boss" ? 0.9 : name === "brute" ? 0.55 : 0.45,
      speed: 4.6,
      range: 1.5,
      yaw: (dx * dx + dz * dz) > 1e-6 ? Math.atan2(-dx, -dz) : 0,
      state: "idle",
      telegraph: 0,
      slot: bucket.length
    };
    bucket.push(actor);
    actors.push(actor);
  }

  const packs = {};
  const foePal = theme.foe || FOE_DEFAULT;
  function addPack(name, geo, muzzle, ringGeo, capacity) {
    if (!(capacity > 0)) return;
    const body = new THREE.InstancedMesh(geo, lambert(), capacity);
    body.castShadow = true;
    body.receiveShadow = true;
    body.frustumCulled = false;
    body.name = name;
    body.userData.muzzleLocal = muzzle;
    root.add(body);
    let ring = null;
    if (ringGeo) {
      ring = new THREE.InstancedMesh(ringGeo, telegraphMat(name === "boss" ? 0xe2ba60 : 0xb64034), capacity);
      ring.frustumCulled = false;
      ring.receiveShadow = false;
      ring.castShadow = false;
      ring.name = name + "Telegraph";
      root.add(ring);
    }
    nearWhiteInstances(body);
    nearWhiteInstances(ring);
    const used = [];
    for (let i = 0; i < capacity; i++) used.push(i < buckets[name].length);
    packs[name] = { body, ring, capacity, used };
  }

  const skirmCap = buckets.skirmisher.length + (bossFloor ? 16 : 0);
  addPack("skirmisher", makeSkirmisherGeo(rand, foePal), new THREE.Vector3(0, 0.7, -0.24), makeRing(0.35, 1.15), skirmCap);
  addPack("brute", makeBruteGeo(rand, foePal), new THREE.Vector3(0, 1.22, -0.32), makeWedge(2), buckets.brute.length);
  addPack("spitter", makeSpitterGeo(rand, foePal), new THREE.Vector3(0, 0.5, -0.58), makeRing(0.3, 1.05), buckets.spitter.length);
  addPack("shade", makeShadeGeo(rand, foePal), new THREE.Vector3(0, 1.44 * 0.85, -0.28 * 0.85), makeRing(0.3, 1.15), buckets.shade.length);
  addPack("boss", makeBossGeo(rand, foePal), new THREE.Vector3(0, 1.66, -0.42), makeWedge(2.4), buckets.boss.length);

  let bossDonut = null;
  if (buckets.boss.length) {
    const donut = new THREE.RingGeometry(2, 5, 20);
    donut.rotateX(-Math.PI / 2);
    bossDonut = new THREE.InstancedMesh(donut, telegraphMat(0xe2ba60), 1);
    bossDonut.frustumCulled = false;
    bossDonut.receiveShadow = false;
    bossDonut.castShadow = false;
    bossDonut.name = "bossRing";
    nearWhiteInstances(bossDonut);
    root.add(bossDonut);
  }

  let orbMesh = null;
  const orbs = [];
  if (buckets.spitter.length) {
    const orbGeo = new THREE.IcosahedronGeometry(0.25, 0);
    orbMesh = new THREE.InstancedMesh(orbGeo, new THREE.MeshLambertMaterial({
      color: 0x8fb84a,
      emissive: 0x6a9a32,
      emissiveIntensity: 0.35,
      flatShading: true
    }), Math.max(8, buckets.spitter.length));
    orbMesh.frustumCulled = false;
    orbMesh.castShadow = false;
    orbMesh.receiveShadow = false;
    orbMesh.name = "spitterOrbs";
    nearWhiteInstances(orbMesh);
    root.add(orbMesh);
  }

  const enemyMesh = packs.skirmisher ? packs.skirmisher.body : null;
  const telegraphMesh = packs.skirmisher ? packs.skirmisher.ring : null;

  function writeInstance(mesh, slot, x, y, z, yaw, scale) {
    _dummy.position.set(x, y, z);
    _dummy.rotation.set(0, yaw || 0, 0);
    _dummy.scale.setScalar(scale);
    _dummy.updateMatrix();
    mesh.setMatrixAt(slot, _dummy.matrix);
  }

  function hideMesh(mesh) {
    if (!mesh) return;
    for (let i = 0; i < mesh.count; i++) writeInstance(mesh, i, 0, 0, 0, 0, 0);
    mesh.instanceMatrix.needsUpdate = true;
  }

  // Foe deaths: a foe seen alive and then at 0 hp topples backward, bounces,
  // and sinks into the floor while wisps in the floor's accent rise from it
  // (bosses fall slower and give off more). Foes already dead when the floor
  // is built (a resumed run) just stay hidden. Wall-clock timed: it is only a look.
  const dying = new Map();
  let primed = false;
  const WISP_MAX = 48;
  const wispMat = new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  wispMat.flatShading = true;
  const wispMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.08, 0), wispMat, WISP_MAX);
  wispMesh.name = "foeWisps";
  wispMesh.frustumCulled = false;
  root.add(wispMesh);
  const wisps = [];
  let wispNext = 0;
  hideMesh(wispMesh);
  function spawnWisps(e, n, now) {
    for (let i = 0; i < n; i++) {
      // A fixed spread (no Math.random: the self-test counts its calls).
      const j = ((wispNext * 7 + i * 13) % 17) / 17;
      const a = (i / n) * Math.PI * 2 + j * 0.6;
      wisps[wispNext] = { x: e.x, z: e.z, a, r: 0.25 + j * 0.3, t0: now + i * 40, life: 0.9 + j * 0.5 };
      wispNext = (wispNext + 1) % WISP_MAX;
    }
  }
  function writeDying(mesh, slot, e, age, dur) {
    const fallT = Math.min(1, age / (dur * 0.37));
    const fall = fallT * fallT;
    const after = Math.max(0, age - dur * 0.37);
    const bounce = after > 0 ? Math.sin(Math.min(1, after / 0.25) * Math.PI) * 0.14 * Math.max(0, 1 - after / 0.25) : 0;
    const sinkU = Math.max(0, Math.min(1, (age - dur * 0.55) / (dur * 0.45)));
    const sink = sinkU * sinkU * (3 - 2 * sinkU);
    _dummy.position.set(e.x, -0.9 * sink, e.z);
    _dummy.rotation.set(1.45 * fall - bounce, e.yaw || 0, 0, "YXZ");
    _dummy.scale.setScalar(1 - 0.4 * sink);
    _dummy.updateMatrix();
    mesh.setMatrixAt(slot, _dummy.matrix);
    _dummy.rotation.order = "XYZ";
  }
  function syncWisps(now) {
    let any = false;
    for (let i = 0; i < WISP_MAX; i++) {
      const w = wisps[i];
      if (!w) {
        writeInstance(wispMesh, i, 0, 0, 0, 0, 0);
        continue;
      }
      const u = (now - w.t0) / 1000 / w.life;
      if (u >= 1) {
        wisps[i] = null;
        writeInstance(wispMesh, i, 0, 0, 0, 0, 0);
        continue;
      }
      if (u < 0) {
        writeInstance(wispMesh, i, 0, 0, 0, 0, 0);
        any = true;
        continue;
      }
      any = true;
      const a = w.a + u * 4;
      const r = w.r * (1 - u * 0.5);
      writeInstance(wispMesh, i, w.x + Math.cos(a) * r, 0.3 + u * 2.4, w.z + Math.sin(a) * r, a, Math.sin(u * Math.PI) * 1.2);
    }
    wispMesh.instanceMatrix.needsUpdate = true;
    return any;
  }

  let beaconHeld = bossFloor;
  function syncActors(list) {
    const now = performance.now();
    const names = ["skirmisher", "brute", "spitter", "shade", "boss"];
    for (let n = 0; n < names.length; n++) {
      const pack = packs[names[n]];
      if (!pack) continue;
      hideMesh(pack.body);
      hideMesh(pack.ring);
    }
    hideMesh(bossDonut);
    hideMesh(orbMesh);
    const foes = list || [];
    for (let i = 0; i < foes.length; i++) {
      const e = foes[i];
      if (!e || e.slot == null) continue;
      const pack = packs[e.archetype];
      if (!pack || e.slot >= pack.capacity) continue;
      const alive = e.hp > 0 ? 1 : 0;
      writeInstance(pack.body, e.slot, e.x, 0, e.z, e.yaw || 0, alive);
      if (alive) dying.delete(e);
      else if (!dying.has(e)) {
        dying.set(e, primed ? now : -1);
        if (primed) spawnWisps(e, e.boss ? 14 : 6, now);
      }
      const t0 = alive ? -1 : dying.get(e);
      if (t0 >= 0) {
        const dur = e.boss ? 1.7 : 0.95;
        const age = (now - t0) / 1000;
        if (age < dur) writeDying(pack.body, e.slot, e, age, dur);
        else dying.set(e, -1);
      }
      const showTell = alive && e.telegraph > 0;
      if (e.boss && e.attack === "ring" && bossDonut) {
        writeInstance(bossDonut, 0, e.markX || e.x, 0.05, e.markZ || e.z, 0, showTell ? 1 : 0);
      } else if (pack.ring) {
        writeInstance(pack.ring, e.slot, e.x, 0.05, e.z, e.lockYaw || e.attack === "arc" || e.attack === "cleave" ? (e.yaw || 0) : 0, showTell ? 1 : 0);
      }
    }
    for (let n = 0; n < names.length; n++) {
      const pack = packs[names[n]];
      if (!pack) continue;
      pack.body.instanceMatrix.needsUpdate = true;
      if (pack.ring) pack.ring.instanceMatrix.needsUpdate = true;
    }
    if (bossDonut) bossDonut.instanceMatrix.needsUpdate = true;
    syncWisps(now);
    if (bossFloor) {
      let held = false;
      for (let i = 0; i < foes.length; i++) if (foes[i] && foes[i].boss && foes[i].hp > 0) held = true;
      if (held !== beaconHeld) {
        beaconHeld = held;
        const hex = held ? 0xb64034 : 0xe2ba60;
        beacon.material.color.setHex(hex);
        beacon.material.emissive.setHex(hex);
        stairsLight.color.setHex(held ? 0xff6a4a : 0xe2ba60);
      }
    }
    if (orbMesh) {
      for (let i = 0; i < orbs.length && i < orbMesh.count; i++) {
        const o = orbs[i];
        writeInstance(orbMesh, i, o.x, 0.45, o.z, 0, 1);
      }
      orbMesh.instanceMatrix.needsUpdate = true;
    }
  }
  syncActors(actors);
  primed = true;

  function claimSlot(name) {
    const pack = packs[name];
    if (!pack) return -1;
    for (let i = 0; i < pack.capacity; i++) {
      if (!pack.used[i]) {
        pack.used[i] = true;
        return i;
      }
    }
    return -1;
  }

  root.userData.plan = plan;
  root.userData.floorMesh = floorMesh;
  root.userData.wallMesh = wallMesh;
  root.userData.occluders = wallMesh ? [wallMesh] : [];
  root.userData.propColliders = propColliders;
  root.userData.chests = chests;
  root.userData.actors = actors;
  root.userData.enemyMesh = enemyMesh;
  root.userData.telegraphMesh = telegraphMesh;
  root.userData.orbMesh = orbMesh;
  root.userData.orbs = orbs;
  root.userData.claimSlot = claimSlot;
  root.userData.syncActors = syncActors;
  root.userData.dispose = function () {
    disposed = true;
    if (root.parent) root.parent.remove(root);
    disposeObject(root);
  };
  return root;
}

const LOOT_HEX = { gold: 0xd4a03a, heartwood: 0x8d5b34, rootfiber: 0x8ed15a, slag: 0x6e7882, emberglass: 0xff8a2a };

// Gold: a small coin stack. Materials: a chunk in the material's colour.
export function buildLootMesh(kind, key) {
  const hex = LOOT_HEX[kind === "gold" ? "gold" : key] || 0xe7d7b4;
  const geo = kind === "gold" ? new THREE.CylinderGeometry(0.13, 0.15, 0.12, 7) : new THREE.IcosahedronGeometry(0.15, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: key === "emberglass" ? 0.6 : 0.25,
    flatShading: true
  }));
  mesh.name = kind === "gold" ? "loot:gold" : "loot:" + key;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

// Gear on the ground, coloured by rarity (the character sheet's colours).
// Uncommon and up stand in a light beam, taller with rarity; rare and epic get
// a ring on the ground. Children sit below the gem by REST_Y (gear rests at
// 0.46). play/lootfx.js bobs, spins and pulses them.
export const RARITY_HEX = [0xe7d7b4, 0x8ed15a, 0x7eb6ef, 0xf0b040];
const GLINT_REST_Y = 0.46;
export function buildGlint(rarity) {
  const r = Math.max(0, Math.min(3, Math.floor(Number(rarity) || 0)));
  const hex = RARITY_HEX[r];
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.16 + 0.02 * r, 0),
    new THREE.MeshLambertMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 0.4 + 0.15 * r,
      flatShading: true
    })
  );
  mesh.name = "glint";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.rarity = r;
  if (r >= 1) {
    const h = [0, 1.3, 2.4, 3.8][r];
    const geo = new THREE.CylinderGeometry(0.12, 0.2, h, 8, 1, true);
    geo.translate(0, h / 2 - GLINT_REST_Y, 0);
    const beam = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      color: 0x000000,
      emissive: hex,
      flatShading: true,
      transparent: true,
      opacity: 0.22 + 0.06 * r,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    }));
    beam.name = "glintBeam";
    mesh.add(beam);
  }
  if (r >= 2) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 20), new THREE.MeshLambertMaterial({
      color: 0x000000,
      emissive: hex,
      flatShading: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04 - GLINT_REST_Y;
    ring.name = "glintRing";
    mesh.add(ring);
  }
  return mesh;
}

export function buildColliderOverlay(space, colliders, plan) {
  const group = new THREE.Group();
  group.name = "colliderOverlay";
  if (space === "dungeon" && plan) {
    if (!_tileEdges) _tileEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(TILE, 2.6, TILE));
    const cols = plan.cols;
    const rows = plan.rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (plan.tiles[r * cols + c] === 1) continue;
        const w = tileToWorld(c, r, cols, rows);
        const line = new THREE.LineSegments(_tileEdges, _overlayMat);
        line.position.set(w.x, 1.3, w.z);
        line.castShadow = false;
        group.add(line);
      }
    }
    return group;
  }
  if (!_townRing) {
    _townRing = new THREE.EdgesGeometry(new THREE.CylinderGeometry(1, 1, 0.15, 12, 1, true));
  }
  if (!_townBox) _townBox = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 1.1, 2));
  const list = colliders || [];
  for (let i = 0; i < list.length; i++) {
    const col = list[i];
    if (col.kind === "box") {
      // Oriented town box (building walls, furniture): one wire box per collider.
      const box = new THREE.LineSegments(_townBox, _overlayMat);
      // Upstairs colliders draw on the upstairs floor.
      box.position.set(col.x, col.level === 1 ? 4.3 : 0.55, col.z);
      box.rotation.y = col.yaw || 0;
      box.scale.set(col.hx, 1, col.hz);
      box.castShadow = false;
      group.add(box);
      continue;
    }
    const line = new THREE.LineSegments(_townRing, _overlayMat);
    line.position.set(col.x, col.level === 1 ? 4.3 : 0.55, col.z);
    line.scale.set(col.r, 1, col.r);
    line.castShadow = false;
    group.add(line);
  }
  return group;
}
