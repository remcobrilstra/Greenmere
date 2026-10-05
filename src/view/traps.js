import * as THREE from "three";
import { tileToWorld } from "../sim/floorgen.js";
import { cycleStage, trapDef } from "../sim/traps.js";
import { lambert } from "./materials.js";
import { makeBuilder } from "./dungeonkit.js";

// Code-built trap meshes (docs/traps.md). Each trap is a group on its tile center
// whose local +x runs along the corridor. syncTrapView poses it from the live trap
// state in src/play/traps.js; nothing here decides a hit.

const IRON = [0x2a2826, 0x3a3734, 0x1c1a19];
const SPIKE = [0x8c9096, 0xb8bcc2];
const FLAME_CORE = 0xffd27a;
const FLAME_EDGE = 0xff6a1e;
const FLAME_ROOT = 0xd8381a;

function glowMat(color, intensity) {
  return new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity, flatShading: true });
}

function flameMat(color, emissive, opacity) {
  return new THREE.MeshLambertMaterial({
    color,
    emissive,
    emissiveIntensity: 1.0,
    flatShading: true,
    transparent: true,
    opacity,
    depthWrite: false
  });
}

// Fire in a band `across` metres wide: two rows of red-orange tongues with
// yellow cores between them. Each child is one tongue standing on y = 0 with unit
// height; syncTrapView stretches, sways and flickers them.
function buildTongues(across) {
  const group = new THREE.Group();
  const outer = new THREE.ConeGeometry(0.3, 1, 5, 1);
  outer.translate(0, 0.5, 0);
  const core = new THREE.ConeGeometry(0.16, 1, 5, 1);
  core.translate(0, 0.5, 0);
  const edgeMat = flameMat(FLAME_EDGE, FLAME_ROOT, 0.78);
  const coreMat = flameMat(FLAME_CORE, FLAME_CORE, 0.92);
  const n = Math.max(3, Math.round(across / 0.5));
  for (let row = 0; row < 3; row++) {
    const isCore = row === 1;
    const count = isCore ? n - 1 : n;
    for (let i = 0; i < count; i++) {
      const t = new THREE.Mesh(isCore ? core : outer, isCore ? coreMat : edgeMat);
      const z = -across / 2 + (i + (isCore ? 1 : 0.5)) * (across / n);
      t.position.set(row === 0 ? -0.2 : row === 2 ? 0.2 : 0, 0, z);
      t.rotation.y = (i * 1.3 + row) % 3;
      t.userData.seed = ((i * 7 + row * 13) % 11) / 11;
      t.userData.core = isCore;
      t.castShadow = false;
      group.add(t);
    }
  }
  return group;
}

// A grate across the corridor: iron frame, slats, an ember bed under them.
function buildGrate(along, across, ember) {
  const b = makeBuilder();
  b.box(0, 0.025, -across / 2 + 0.06, along * 2, 0.05, 0.12, IRON[0], IRON[1]);
  b.box(0, 0.025, across / 2 - 0.06, along * 2, 0.05, 0.12, IRON[0], IRON[1]);
  b.box(-along + 0.06, 0.025, 0, 0.12, 0.05, across, IRON[0], IRON[1]);
  b.box(along - 0.06, 0.025, 0, 0.12, 0.05, across, IRON[0], IRON[1]);
  for (let x = -along + 0.3; x < along - 0.15; x += 0.3) b.box(x, 0.035, 0, 0.07, 0.04, across - 0.2, IRON[2], IRON[1]);
  const frame = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  frame.receiveShadow = true;
  const bed = new THREE.Mesh(new THREE.BoxGeometry(along * 2 - 0.2, 0.02, across - 0.2), ember);
  bed.position.y = 0.012;
  return { frame, bed };
}

function buildSpikes(theme, def) {
  const group = new THREE.Group();
  const stone = theme.trim || [0x4c545e, 0x3e4650];
  const b = makeBuilder();
  const s = def.along * 2;
  // The plate sits 3 cm proud of the floor in nine slabs; the joints show between them.
  const slab = s / 3;
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 3; k++) {
      const x = -s / 2 + slab * (i + 0.5);
      const z = -s / 2 + slab * (k + 0.5);
      b.box(x, 0.03, z, slab - 0.07, 0.06, slab - 0.07, stone[1] || stone[0], stone[0]);
    }
  }
  const plate = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  plate.receiveShadow = true;
  group.add(plate);
  // The joints glow when the plate is sprung: the tell before the spikes.
  const joints = glowMat(0x3a1a12, 0);
  joints.emissive.setHex(0xff5a2a);
  const jb = new THREE.Group();
  for (let i = 1; i < 3; i++) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, s), joints);
    a.position.set(-s / 2 + slab * i, 0.012, 0);
    const c = new THREE.Mesh(new THREE.BoxGeometry(s, 0.02, 0.05), joints);
    c.position.set(0, 0.012, -s / 2 + slab * i);
    jb.add(a, c);
  }
  group.add(jb);
  const sb = makeBuilder();
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 4; k++) {
      const x = -s / 2 + (s / 4) * (i + 0.5);
      const z = -s / 2 + (s / 4) * (k + 0.5);
      sb.lathe(x, z, [[0.1, 0], [0.07, 0.3], [0, 0.72]], 4, SPIKE, null, 0.4);
    }
  }
  const spikes = new THREE.Mesh(sb.geometry(), lambert({ side: THREE.FrontSide }));
  spikes.castShadow = true;
  spikes.position.y = -0.8;
  spikes.visible = false;
  group.add(spikes);
  return { group, plate, joints, spikes };
}

function buildFlames(def, constant) {
  const group = new THREE.Group();
  const ember = glowMat(0x5a1c0c, 0.1);
  ember.emissive.setHex(FLAME_EDGE);
  const grate = buildGrate(def.along, def.across * 2 - 0.1, ember);
  group.add(grate.frame, grate.bed);
  if (constant) {
    // A fire wall burns out of a stone trough with a scorched lip.
    const b = makeBuilder();
    b.box(-def.along + 0.02, 0.09, 0, 0.14, 0.18, def.across * 2 - 0.1, 0x3a3230, 0x4a403a);
    b.box(def.along - 0.02, 0.09, 0, 0.14, 0.18, def.across * 2 - 0.1, 0x3a3230, 0x4a403a);
    const lip = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
    lip.receiveShadow = true;
    group.add(lip);
  }
  const tongues = buildTongues(def.across * 2 - 0.3);
  group.add(tongues);
  return { group, ember, tongues };
}

// The valve that puts a fire wall out: a post against the side wall with a brass
// wheel facing the corridor (local −z) and a red lamp while the wall burns.
function buildValve(theme) {
  const group = new THREE.Group();
  const brass = (theme.trim && theme.trim[1]) || 0xd4a03a;
  const b = makeBuilder();
  b.box(0, 0.6, 0.18, 0.22, 1.2, 0.22, IRON[1], IRON[0]);
  b.box(0, 1.08, 0.02, 0.12, 0.12, 0.34, IRON[0], IRON[1]);
  b.box(0, 0.12, 0.18, 0.5, 0.24, 0.4, IRON[2], IRON[1]);
  const body = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const wheel = new THREE.Group();
  wheel.position.set(0, 1.08, -0.17);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0xe2ba60, emissive: brass, emissiveIntensity: 0.15, flatShading: true });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 4, 10), wheelMat);
  wheel.add(rim);
  for (let k = 0; k < 3; k++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), wheelMat);
    spoke.rotation.z = (k / 3) * Math.PI;
    wheel.add(spoke);
  }
  group.add(wheel);
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), glowMat(0xff5a2a, 1.0));
  lamp.position.set(0, 1.42, 0.12);
  group.add(lamp);
  return { group, wheel, lamp, wheelMat };
}

// A small pressure plate with an arrow inlay pointing down the run.
function buildDartPlate(theme, def) {
  const group = new THREE.Group();
  const stone = theme.trim || [0x4c545e, 0x3e4650];
  const s = def.along * 2;
  const b = makeBuilder();
  b.box(0, 0.03, 0, s, 0.06, s, stone[1] || stone[0], stone[0]);
  const plate = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  plate.receiveShadow = true;
  group.add(plate);
  const joints = glowMat(0x3a1a12, 0);
  joints.emissive.setHex(0xff5a2a);
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.08), joints);
  shaft.position.set(-0.05, 0.065, 0);
  const headA = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.08), joints);
  headA.position.set(0.18, 0.065, 0.09);
  headA.rotation.y = 0.7;
  const headB = headA.clone();
  headB.position.z = -0.09;
  headB.rotation.y = -0.7;
  arrow.add(shaft, headA, headB);
  group.add(arrow);
  return { group, plate, joints, arrow };
}

// Two slotted blocks on the side walls at the launcher end of a dart run; the
// slots face local +x (down the run).
function buildLauncher(theme) {
  const group = new THREE.Group();
  const stone = theme.wall || [0x5e6771, 0x4c545e];
  const b = makeBuilder();
  for (const z of [-1.78, 1.78]) {
    b.box(0, 1.0, z, 0.7, 1.5, 0.44, stone[1] || stone[0], stone[0]);
    for (const y of [0.75, 1.0, 1.25]) b.box(0.36, y, z - Math.sign(z) * 0.02, 0.02, 0.07, 0.24, 0x15110f);
  }
  const mesh = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

// A bronze gong on a frame against one side wall, and a tripwire across the mouth.
function buildGong(theme, side) {
  const group = new THREE.Group();
  const wood = [0x5a3a24, 0x6b4428];
  const b = makeBuilder();
  const z = side * 1.45;
  b.box(-0.55, 0.95, z, 0.14, 1.9, 0.14, wood[0], wood[1]);
  b.box(0.55, 0.95, z, 0.14, 1.9, 0.14, wood[0], wood[1]);
  b.box(0, 1.9, z, 1.4, 0.14, 0.16, wood[1], wood[0]);
  // Pegs that hold the wire at the walls.
  b.box(0, 0.3, -1.92, 0.1, 0.16, 0.12, IRON[1], IRON[0]);
  b.box(0, 0.3, 1.92, 0.1, 0.16, 0.12, IRON[1], IRON[0]);
  const frame = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  frame.castShadow = true;
  group.add(frame);
  const hanger = new THREE.Group();
  hanger.position.set(0, 1.82, z);
  const discMat = new THREE.MeshLambertMaterial({ color: 0xc08a3a, emissive: 0x6a4010, emissiveIntensity: 0.25, flatShading: true });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.06, 14), discMat);
  disc.rotation.x = Math.PI / 2;
  disc.position.y = -0.62;
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.09, 10), discMat);
  boss.rotation.x = Math.PI / 2;
  boss.position.y = -0.62;
  hanger.add(disc, boss);
  group.add(hanger);
  const wireMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc2, emissive: 0xffe0a0, emissiveIntensity: 0, flatShading: true });
  const wire = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 3.84), wireMat);
  wire.position.y = 0.3;
  group.add(wire);
  return { group, hanger, wire, wireMat, discMat };
}

const DART_MAX = 24;

// Every dart in flight, one instanced mesh; syncDarts places them.
export function buildDartMesh() {
  const b = makeBuilder();
  b.box(0, 0, 0, 0.05, 0.05, 0.5, 0x3a3734);
  b.box(0, 0, 0.22, 0.14, 0.02, 0.1, 0xb64034);
  b.box(0, 0, -0.27, 0.03, 0.03, 0.08, 0xd8dce2);
  const mesh = new THREE.InstancedMesh(b.geometry(), lambert({ side: THREE.FrontSide }), DART_MAX);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.name = "darts";
  return mesh;
}

const _dart = new THREE.Object3D();
export function syncDarts(mesh, darts) {
  if (!mesh) return;
  let n = 0;
  for (let i = 0; i < darts.length && n < DART_MAX; i++) {
    const d = darts[i];
    if (d.delay > 0) continue;
    _dart.position.set(d.x, 1.0, d.z);
    // The tip is on local -z.
    _dart.rotation.set(0, Math.atan2(-d.dx, -d.dz), 0);
    _dart.updateMatrix();
    mesh.setMatrixAt(n++, _dart.matrix);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
}

// ---- Biome traps (docs/traps.md §3.2) ----

const SPORE = 0xb8d84a;
const CURSED = 0xa070ff;

function cloudMat(color, opacity) {
  return new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35, flatShading: true, transparent: true, opacity, depthWrite: false });
}

// Puffs of cloud spread over a band (rect) or a disc; syncTrapView scales them.
function buildCloud(color, count, spreadX, spreadZ, round) {
  const group = new THREE.Group();
  const mat = cloudMat(color, 0.42);
  const geo = new THREE.IcosahedronGeometry(0.55, 0);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 * 2.618;
    const r = round ? Math.sqrt((i + 0.5) / count) : 1;
    const p = new THREE.Mesh(geo, mat);
    p.position.set(round ? Math.cos(a) * r * spreadX : ((i % 3) - 1) * spreadX * 0.6, 0.5 + (i % 3) * 0.35, round ? Math.sin(a) * r * spreadZ : -spreadZ + (2 * spreadZ * (i + 0.5)) / count);
    p.userData.seed = (i * 5 % 9) / 9;
    p.userData.base = p.position.y;
    group.add(p);
  }
  group.userData.mat = mat;
  return group;
}

function buildSporePuff(theme) {
  const group = new THREE.Group();
  const b = makeBuilder();
  const caps = [0x8a5aa8, 0x6e4a90, SPORE];
  const spots = [[0, 0, 0.55], [0.55, 0.3, 0.4], [-0.45, 0.4, 0.38], [0.2, -0.55, 0.35], [-0.5, -0.35, 0.3]];
  for (let i = 0; i < spots.length; i++) {
    const [x, z, s] = spots[i];
    b.lathe(x, z, [[s * 0.28, 0], [s * 0.22, s * 1.2]], 6, [0xd8d0b8], null, i);
    b.lathe(x, z, [[s * 0.25, s * 1.15], [s, s * 1.35], [s * 0.7, s * 1.7], [0, s * 1.85]], 7, [caps[i % 3], caps[(i + 1) % 3], caps[i % 3]], null, i);
  }
  const shrooms = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  shrooms.castShadow = true;
  group.add(shrooms);
  const cloud = buildCloud(SPORE, 12, 1.4, 1.4, true);
  group.add(cloud);
  return { group, shrooms, cloud };
}

function buildRockfall(theme) {
  const group = new THREE.Group();
  const rock = theme.rock || [0x6e7882, 0x5e6771, 0x4c545e];
  const b = makeBuilder();
  // Cracks radiating from the spot, a few pebbles, pale dust.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    b.at(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45, -a, 1);
    b.box(0, 0.012, 0, 0.75, 0.01, 0.05, 0x1c1a19);
  }
  b.at(0, 0, 0, 0, 1);
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4;
    const r = 0.35 + (k % 3) * 0.25;
    b.box(Math.cos(a) * r, 0.05, Math.sin(a) * r, 0.14, 0.1, 0.12, rock[k % 3]);
  }
  b.disc(0, 0.006, 0, 0.95, 12, 0x9a9488);
  const spot = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  spot.receiveShadow = true;
  group.add(spot);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);
  const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), new THREE.MeshLambertMaterial({ color: rock[1], flatShading: true }));
  stone.castShadow = true;
  stone.visible = false;
  group.add(stone);
  return { group, shadow, stone };
}

function buildSporeVent(def) {
  const group = new THREE.Group();
  const ember = glowMat(0x2a3a12, 0.3);
  ember.emissive.setHex(SPORE);
  const grate = buildGrate(def.along * 0.6, def.across * 2 - 0.1, ember);
  group.add(grate.frame, grate.bed);
  const cloud = buildCloud(SPORE, 14, def.along, def.across - 0.4, false);
  group.add(cloud);
  return { group, ember, cloud };
}

// Posts against both corridor walls, a beam over the top, and a blade on an arm
// that swings across the corridor (local z).
function buildPendulum(theme) {
  const group = new THREE.Group();
  const stone = theme.trim || [0x4c545e, 0x3e4650];
  const b = makeBuilder();
  for (const z of [-1.86, 1.86]) b.box(0, 2.2, z, 0.34, 4.4, 0.26, stone[0], stone[1] || stone[0]);
  b.box(0, 4.45, 0, 0.4, 0.3, 4.0, stone[1] || stone[0], stone[0]);
  const frame = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  frame.castShadow = true;
  group.add(frame);
  const arm = new THREE.Group();
  arm.position.set(0, 4.3, 0);
  const ab = makeBuilder();
  ab.box(0, -1.6, 0, 0.08, 3.2, 0.08, IRON[1], IRON[0]);
  // The blade: a crescent of steel, edge along local z.
  for (let k = -3; k <= 3; k++) {
    const z = k * 0.16;
    const drop = 0.1 * k * k;
    ab.box(0, -3.25 - drop * 0.4 + 0.12, z, 0.05, 0.42 - Math.abs(k) * 0.03, 0.17, SPIKE[1], SPIKE[0]);
  }
  const blade = new THREE.Mesh(ab.geometry(), lambert({ side: THREE.FrontSide }));
  blade.castShadow = true;
  arm.add(blade);
  group.add(arm);
  return { group, arm };
}

function buildFlood(def) {
  const group = new THREE.Group();
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(def.along * 2, 0.06, def.across * 2 - 0.02),
    new THREE.MeshLambertMaterial({ color: 0x2e6a86, emissive: 0x12384a, emissiveIntensity: 0.4, flatShading: true, transparent: true, opacity: 0.78 })
  );
  water.position.y = 0.035;
  group.add(water);
  const silt = new THREE.Mesh(new THREE.BoxGeometry(def.along * 2, 0.012, def.across * 2 - 0.02), new THREE.MeshLambertMaterial({ color: 0x3a3428, flatShading: true }));
  silt.position.y = 0.007;
  silt.receiveShadow = true;
  group.add(silt);
  return { group, water };
}

function buildGrasp(theme) {
  const group = new THREE.Group();
  const root = theme.root || [0x3a2416, 0x5a3a24, 0x6b4428];
  const b = makeBuilder();
  b.disc(0, 0.01, 0, 1.2, 10, 0x2a2016);
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9;
    b.box(Math.cos(a) * 0.7, 0.03, Math.sin(a) * 0.7, 0.5, 0.05, 0.1, root[k % 3]);
  }
  const bed = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  bed.receiveShadow = true;
  group.add(bed);
  // Tendrils that whip up and curl in when the patch springs.
  const tendrils = new THREE.Group();
  const geo = new THREE.ConeGeometry(0.08, 1.3, 4);
  geo.translate(0, 0.65, 0);
  const mat = new THREE.MeshLambertMaterial({ color: root[2], flatShading: true });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const t = new THREE.Mesh(geo, mat);
    t.position.set(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75);
    t.userData.a = a;
    tendrils.add(t);
  }
  tendrils.visible = false;
  group.add(tendrils);
  return { group, tendrils };
}

// A band of thorns across the corridor; `low` keeps a few sprouts showing.
function buildThorns(theme, across, tall) {
  const group = new THREE.Group();
  const root = theme.root || [0x3a2416, 0x5a3a24, 0x6b4428];
  const b = makeBuilder();
  const n = Math.round(across * 4);
  for (let i = 0; i < n; i++) {
    const z = -across + (2 * across * (i + 0.5)) / n;
    for (let row = 0; row < 3; row++) {
      const x = (row - 1) * 0.35 + ((i * 7 + row) % 5) * 0.04;
      const h = tall * (0.6 + ((i * 3 + row * 5) % 7) / 12);
      b.lathe(x, z, [[0.09, 0], [0.05, h * 0.6], [0, h]], 4, [root[(i + row) % 3], root[(i + row + 1) % 3]], null, i + row);
    }
  }
  const mesh = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}

function buildThornWall(theme, def) {
  const group = new THREE.Group();
  const sprouts = buildThorns(theme, def.across - 0.1, 0.35);
  group.add(sprouts);
  const wall = buildThorns(theme, def.across - 0.1, 3.0);
  wall.position.y = -3.2;
  wall.visible = false;
  group.add(wall);
  return { group, wall };
}

function buildBriar(theme, def) {
  const group = new THREE.Group();
  const bush = buildThorns(theme, def.across - 0.1, 1.6);
  group.add(bush);
  return { group, bush };
}

// A stone coffin lying along its wall, lid on top; local +x runs along the wall.
function buildSarcophagus(theme) {
  const group = new THREE.Group();
  const stone = theme.wall || [0x5e6771, 0x4c545e, 0x6e7882];
  const b = makeBuilder();
  b.box(0, 0.42, 0, 2.1, 0.84, 0.95, stone[0], stone[1] || stone[0]);
  b.box(0, 0.06, 0, 2.24, 0.12, 1.08, stone[1] || stone[0]);
  const body = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const lb = makeBuilder();
  lb.box(0, 0.08, 0, 2.2, 0.16, 1.04, stone[2] || stone[0], stone[2] || stone[0]);
  lb.box(0, 0.2, 0, 1.2, 0.08, 0.36, stone[1] || stone[0]);
  lb.box(0.3, 0.2, 0, 0.12, 0.08, 0.7, stone[1] || stone[0]);
  const lid = new THREE.Mesh(lb.geometry(), lambert({ side: THREE.FrontSide }));
  lid.castShadow = true;
  lid.position.y = 0.84;
  group.add(lid);
  return { group, lid };
}

function buildCandle() {
  const group = new THREE.Group();
  const b = makeBuilder();
  b.box(0, 0.04, 0, 0.5, 0.08, 0.5, IRON[1], IRON[0]);
  b.box(0, 0.6, 0, 0.08, 1.1, 0.08, IRON[0], IRON[1]);
  b.box(0, 1.16, 0, 0.32, 0.05, 0.32, IRON[1], IRON[0]);
  b.box(0, 1.3, 0, 0.12, 0.24, 0.12, 0xe8e0c8, 0xf4ecd4);
  const stand = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  stand.castShadow = true;
  group.add(stand);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 5), flameMat(CURSED, CURSED, 0.9));
  flame.position.y = 1.54;
  group.add(flame);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 16), new THREE.MeshBasicMaterial({ color: CURSED, transparent: true, opacity: 0.5, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);
  return { group, flame, ring };
}

// A post at the edge of the tile, an arm over the middle, and a hammer head
// that lifts and slams onto an iron plate.
function buildTripHammer(theme) {
  const group = new THREE.Group();
  const b = makeBuilder();
  b.box(-1.75, 1.4, 0, 0.42, 2.8, 0.42, IRON[1], IRON[0]);
  b.box(-1.75, 0.1, 0, 0.8, 0.2, 0.8, IRON[0], IRON[1]);
  b.disc(0, 0.015, 0, 1.25, 12, 0x2a2826);
  b.ring(0, 0.02, 0, 1.25, 1.4, 16, 0x8a6a3a);
  const base = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  const arm = new THREE.Group();
  arm.position.set(-1.75, 2.6, 0);
  const hb = makeBuilder();
  hb.box(0.9, 0, 0, 1.9, 0.22, 0.22, IRON[1], IRON[0]);
  hb.box(1.75, -0.95, 0, 1.0, 1.2, 1.0, IRON[2], IRON[1]);
  hb.box(1.75, -1.6, 0, 1.15, 0.14, 1.15, 0x8a6a3a);
  const head = new THREE.Mesh(hb.geometry(), lambert({ side: THREE.FrontSide }));
  head.castShadow = true;
  arm.add(head);
  group.add(arm);
  const glow = glowMat(0x5a1c0c, 0);
  glow.emissive.setHex(FLAME_EDGE);
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.1, 14), glow);
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = 0.025;
  group.add(scorch);
  return { group, arm, glow };
}

function buildSlagPool(def) {
  const group = new THREE.Group();
  const molten = glowMat(0xff6a1e, 0.9);
  molten.emissive.setHex(0xd8381a);
  // A round pool, the same circle as the footprint.
  const r = def.radius + 0.05;
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 11), molten);
  pool.position.y = 0.025;
  group.add(pool);
  const b = makeBuilder();
  // A few dark crusts drifting on it, and a ring of slag stones.
  for (let k = 0; k < 3; k++) {
    b.at(Math.cos(k * 2.2 + 0.4) * r * 0.45, 0, Math.sin(k * 2.2 + 0.4) * r * 0.45, k * 1.3, 1);
    b.box(0, 0.06, 0, 0.32, 0.03, 0.2, 0x2a2420);
  }
  b.at(0, 0, 0, 0, 1);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    b.box(Math.cos(a) * (r + 0.12), 0.09, Math.sin(a) * (r + 0.12), 0.38, 0.18 + (k % 3) * 0.04, 0.34, 0x4a403a, 0x3a3230);
  }
  const rim = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  rim.receiveShadow = true;
  group.add(rim);
  return { group, molten };
}

// The sluice lever for a flooded channel: a post against the wall, the handle
// swinging down from up (shut) when pulled.
function buildLever() {
  const group = new THREE.Group();
  const b = makeBuilder();
  b.box(0, 0.55, 0.18, 0.3, 1.1, 0.24, 0x5a4a3a, 0x4a3a2a);
  b.box(0, 0.1, 0.18, 0.5, 0.2, 0.4, IRON[1], IRON[0]);
  const body = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  body.castShadow = true;
  group.add(body);
  const handle = new THREE.Group();
  handle.position.set(0, 0.95, 0.02);
  const hb = makeBuilder();
  hb.box(0, 0.4, 0, 0.07, 0.8, 0.07, IRON[0], IRON[1]);
  hb.box(0, 0.82, 0, 0.16, 0.16, 0.16, 0xe2ba60);
  const grip = new THREE.Mesh(hb.geometry(), lambert({ side: THREE.FrontSide }));
  grip.castShadow = true;
  handle.add(grip);
  handle.rotation.x = -0.5;
  group.add(handle);
  return { group, handle };
}

// A briar's root heart: a swollen red pod against the wall, struck out in three hits.
function buildHeart(theme) {
  const group = new THREE.Group();
  const root = theme.root || [0x3a2416, 0x5a3a24, 0x6b4428];
  const b = makeBuilder();
  for (let k = 0; k < 5; k++) b.box(Math.cos(k * 1.3) * 0.3, 0.1, 0.2 + Math.sin(k * 1.3) * 0.15, 0.45, 0.1, 0.1, root[k % 3]);
  const roots = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  group.add(roots);
  const podMat = new THREE.MeshLambertMaterial({ color: 0x9a2a3a, emissive: 0x6a1020, emissiveIntensity: 0.5, flatShading: true });
  const pod = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), podMat);
  pod.position.set(0, 0.55, 0.1);
  pod.scale.set(1, 1.25, 1);
  pod.castShadow = true;
  group.add(pod);
  return { group, pod, podMat };
}

function buildSwitch(type, theme) {
  if (type === "lever") return Object.assign(buildLever(), { type });
  if (type === "heart") return Object.assign(buildHeart(theme), { type });
  return Object.assign(buildValve(theme), { type: "valve" });
}

// ---- Set pieces and boss hazards (docs/traps.md §3.3, §4) ----

// A cracked floor tile; it shudders and sheds dust as it goes, then leaves a pit.
function buildCollapse(theme, def) {
  const group = new THREE.Group();
  const floor = theme.floor || [0x4a5a3a, 0x55663f, 0x3f5034];
  const s = def.along * 2;
  const b = makeBuilder();
  // Four slabs a hair apart, as if the tile had already split.
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    b.box(x * s / 4, 0.015, z * s / 4, s / 2 - 0.08, 0.03, s / 2 - 0.08, floor[1] || floor[0], floor[0]);
  }
  for (let k = 0; k < 5; k++) {
    const a = k * 1.26 + 0.2;
    b.at(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, -a, 1);
    b.box(0, 0.035, 0, 0.9, 0.01, 0.04, 0x1c1a19);
  }
  b.at(0, 0, 0, 0, 1);
  const slabs = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  slabs.receiveShadow = true;
  group.add(slabs);
  const pit = new THREE.Mesh(new THREE.BoxGeometry(s, 0.02, s), new THREE.MeshBasicMaterial({ color: 0x050403 }));
  pit.position.y = 0.012;
  pit.visible = false;
  group.add(pit);
  const rb = makeBuilder();
  for (let k = 0; k < 12; k++) {
    const side = k % 4;
    const u = (Math.floor(k / 4) - 1) * 0.8;
    const x = side === 0 ? -s / 2 : side === 1 ? s / 2 : u;
    const z = side === 2 ? -s / 2 : side === 3 ? s / 2 : u;
    rb.box(x, 0.05, z, 0.32, 0.1, 0.32, floor[k % 3] || floor[0]);
  }
  const rim = new THREE.Mesh(rb.geometry(), lambert({ side: THREE.FrontSide }));
  rim.visible = false;
  group.add(rim);
  return { group, slabs, pit, rim };
}

// Iron bars that rise out of a doorway's floor slot; local x runs along the corridor.
function buildBars() {
  const group = new THREE.Group();
  const b = makeBuilder();
  b.box(0, 0.01, 0, 0.3, 0.02, 3.9, 0x15110f);
  const slot = new THREE.Mesh(b.geometry(), lambert({ side: THREE.FrontSide }));
  group.add(slot);
  const bb = makeBuilder();
  for (let k = 0; k < 9; k++) bb.box(0, 1.6, -1.8 + k * 0.45, 0.1, 3.2, 0.1, IRON[1], IRON[0]);
  for (const y of [0.6, 1.8, 3.0]) bb.box(0, y, 0, 0.12, 0.12, 3.9, IRON[0], IRON[1]);
  const bars = new THREE.Mesh(bb.geometry(), lambert({ side: THREE.FrontSide }));
  bars.castShadow = true;
  bars.position.y = -3.4;
  bars.visible = false;
  group.add(bars);
  return { group, bars };
}

// A boss's flame burst: a ring of grates around the spot, fire up out of all of them.
function buildBossFlame(def) {
  const group = new THREE.Group();
  const ember = glowMat(0x5a1c0c, 0.2);
  ember.emissive.setHex(FLAME_EDGE);
  const ring = new THREE.Mesh(new THREE.CircleGeometry(def.radius, 14), ember);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);
  const tongues = buildTongues(def.radius * 1.6);
  const cross = buildTongues(def.radius * 1.6);
  cross.rotation.y = Math.PI / 2;
  const fire = new THREE.Group();
  fire.add(tongues, cross);
  group.add(fire);
  return { group, ember, tongues: fire };
}

function buildBossFlood(def) {
  const group = new THREE.Group();
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(def.radius, def.radius, 0.05, 20),
    new THREE.MeshLambertMaterial({ color: 0x2e6a86, emissive: 0x12384a, emissiveIntensity: 0.4, flatShading: true, transparent: true, opacity: 0.72 })
  );
  water.position.y = 0.03;
  group.add(water);
  return { group, water };
}

// One hazard a boss calls down mid-fight (src/play/traps.js), built like a floor
// trap of that kind at (x, z). The caller adds `item.root` to the floor and
// removes it when the hazard is done.
export function buildHazard(kind, theme, x, z, phase) {
  const def = trapDef(kind);
  const t = { id: -1, kind, axis: "x", phase: phase || 0 };
  const built = buildKind(t, def, theme);
  built.group.position.set(x, 0, z);
  built.group.name = "hazard:" + kind;
  return Object.assign({ id: -1, kind, x, z, axis: "x", phase: phase || 0, sw: null }, built, { root: built.group });
}

function buildKind(t, def, theme) {
  if (t.kind === "collapse") return buildCollapse(theme, def);
  if (t.kind === "seal") return { group: new THREE.Group() };
  if (t.kind === "bossFlame") return buildBossFlame(def);
  if (t.kind === "bossFlood") return buildBossFlood(def);
  if (t.kind === "spikes") return buildSpikes(theme, def);
  if (t.kind === "darts") return buildDartPlate(theme, def);
  if (t.kind === "gong") return buildGong(theme, t.side || 1);
  if (t.kind === "sporePuff") return buildSporePuff(theme);
  if (t.kind === "rockfall") return buildRockfall(theme);
  if (t.kind === "sporeVent") return buildSporeVent(def);
  if (t.kind === "pendulum") return buildPendulum(theme);
  if (t.kind === "flood") return buildFlood(def);
  if (t.kind === "grasp") return buildGrasp(theme);
  if (t.kind === "thornWall") return buildThornWall(theme, def);
  if (t.kind === "briar") return buildBriar(theme, def);
  if (t.kind === "sarcophagus") return buildSarcophagus(theme);
  if (t.kind === "tripHammer") return buildTripHammer(theme);
  if (t.kind === "slagPool") return buildSlagPool(def);
  if (t.kind === "candles") return { group: new THREE.Group() };
  return buildFlames(def, def.counter === "constant");
}

// Every trap and valve on the floor. Valves add a circle to `colliders`.
export function buildTraps(plan, theme, colliders) {
  const group = new THREE.Group();
  group.name = "traps";
  const items = [];
  const list = plan.traps || [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const def = trapDef(t.kind);
    if (!def) continue;
    const w = tileToWorld(t.col, t.row, plan.cols, plan.rows);
    const item = { id: t.id, kind: t.kind, x: w.x, z: w.z, axis: t.axis, phase: t.phase, sw: null };
    const built = buildKind(t, def, theme);
    built.group.position.set(w.x, 0, w.z);
    // Local +x runs along the corridor.
    built.group.rotation.y = t.axis === "z" ? Math.PI / 2 : 0;
    if (t.kind === "sarcophagus") {
      // Pushed against its wall, long side along it.
      built.group.position.set(w.x + (t.wc || 0) * 1.25, 0, w.z + (t.wr || 0) * 1.25);
      built.group.rotation.y = t.wc ? Math.PI / 2 : 0;
      const along = t.wc ? { x: 0, z: 1 } : { x: 1, z: 0 };
      for (const k of [-0.55, 0.55]) {
        if (colliders) colliders.push({ x: built.group.position.x + along.x * k, z: built.group.position.z + along.z * k, r: 0.55, tileX: w.x, tileZ: w.z });
      }
    } else if (t.kind === "tripHammer") {
      if (colliders) colliders.push({ x: w.x - 1.75, z: w.z, r: 0.38, tileX: w.x, tileZ: w.z });
    } else if (t.kind === "candles") {
      // One stand per part, each its own snuffable switch.
      item.parts = [];
      for (const part of t.parts || []) {
        const pw = tileToWorld(part.col, part.row, plan.cols, plan.rows);
        const candle = buildCandle();
        candle.group.position.set(pw.x, 0, pw.z);
        candle.group.name = "candle:" + t.id;
        group.add(candle.group);
        if (colliders) colliders.push({ x: pw.x, z: pw.z, r: 0.28, tileX: pw.x, tileZ: pw.z });
        item.parts.push(Object.assign(candle, { x: pw.x, z: pw.z, lit: true }));
      }
    }
    if (t.kind === "seal") {
      // Bars in every doorway of the room, sunk in their floor slots until it shuts.
      item.doors = [];
      for (const d of t.doors || []) {
        const dw = tileToWorld(d.col, d.row, plan.cols, plan.rows);
        const bars = buildBars();
        bars.group.position.set(dw.x, 0, dw.z);
        // The bars span the doorway: across the way into the room.
        bars.group.rotation.y = d.axis === "z" ? 0 : Math.PI / 2;
        bars.group.name = "bars:" + t.id;
        group.add(bars.group);
        item.doors.push(Object.assign(bars, { col: d.col, row: d.row }));
      }
    }
    if (t.room) {
      // The room a thorn wall seals or the candles curse, in world metres.
      const a = tileToWorld(t.room.col, t.room.row, plan.cols, plan.rows);
      item.room = { x0: a.x - 2, z0: a.z - 2, x1: a.x - 2 + t.room.w * 4, z1: a.z - 2 + t.room.h * 4 };
      item.col = t.col;
      item.row = t.row;
    }
    built.group.name = "trap:" + t.id + ":" + t.kind;
    group.add(built.group);
    Object.assign(item, built, { root: built.group });
    if (t.kind === "darts" && t.from && t.to) {
      const fromW = tileToWorld(t.from.col, t.from.row, plan.cols, plan.rows);
      const toW = tileToWorld(t.to.col, t.to.row, plan.cols, plan.rows);
      item.fromW = fromW;
      item.toW = toW;
      const dir = (t.axis === "z" ? toW.z - fromW.z : toW.x - fromW.x) >= 0 ? 1 : -1;
      // The arrow points the way the darts fly.
      built.arrow.rotation.y = dir > 0 ? 0 : Math.PI;
      // The launcher turns to face down the run; it stands at the run's outer edge.
      const launcher = buildLauncher(theme);
      const ax = t.axis === "z" ? 0 : dir;
      const az = t.axis === "z" ? dir : 0;
      launcher.position.set(fromW.x - ax * 1.4, 0, fromW.z - az * 1.4);
      launcher.rotation.y = Math.atan2(-az, ax);
      launcher.name = "launcher:" + t.id;
      group.add(launcher);
      for (const side of [-1.78, 1.78]) {
        const wx = launcher.position.x + (t.axis === "z" ? side : 0);
        const wz = launcher.position.z + (t.axis === "z" ? 0 : side);
        if (colliders) colliders.push({ x: wx, z: wz, r: 0.3, tileX: fromW.x, tileZ: fromW.z });
      }
    }
    if (t.sw) {
      const sw = tileToWorld(t.sw.col, t.sw.row, plan.cols, plan.rows);
      const sx = sw.x + t.sw.ox;
      const sz = sw.z + t.sw.oz;
      const valve = buildSwitch(def.switch, theme);
      valve.group.position.set(sx, 0, sz);
      valve.group.rotation.y = t.sw.yaw || 0;
      // A feed pipe (or a root) runs along the wall from the switch to the trap it shuts.
      const wall = 1 + 0.24 / 1.55;
      const ax = sw.x + t.sw.ox * wall;
      const az = sw.z + t.sw.oz * wall;
      const bx = w.x + t.sw.ox * wall;
      const bz = w.z + t.sw.oz * wall;
      const len = Math.hypot(bx - ax, bz - az);
      const pipeHex = valve.type === "heart" ? ((theme.root && theme.root[1]) || 0x5a3a24) : IRON[1];
      const pipe = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.14), new THREE.MeshLambertMaterial({ color: pipeHex, flatShading: true }));
      pipe.position.set((ax + bx) / 2, 0.14, (az + bz) / 2);
      pipe.rotation.y = Math.atan2(-(bz - az), bx - ax);
      pipe.receiveShadow = true;
      group.add(pipe);
      valve.group.name = "switch:" + t.id + ":" + valve.type;
      group.add(valve.group);
      if (colliders) colliders.push({ x: sx, z: sz, r: 0.32, tileX: sw.x, tileZ: sw.z });
      item.sw = Object.assign(valve, { x: sx, z: sz });
    }
    items.push(item);
  }
  const darts = buildDartMesh();
  group.add(darts);
  return { group, items, darts };
}

// Pose one trap from its live state (src/sim/traps.js makeTrapState).
// `glint` 0..1: Delver trap sense on a plate or wire the Warden is near.
export function syncTrapView(item, trap, time, glint) {
  if (!item || !trap) return;
  const def = trapDef(item.kind);
  const shine = glint > 0 ? glint * (0.22 + 0.16 * Math.sin(time * 4 + item.id)) : 0;
  if (item.kind === "gong") {
    item.wire.visible = !trap.disabled;
    item.wireMat.emissiveIntensity = trap.disabled ? 0 : shine * 2;
    const ring = trap.ringT > 0 ? trap.ringT : 0;
    item.hanger.rotation.z = ring > 0 ? Math.sin(ring * 30) * 0.18 * Math.min(1, ring / 2) : 0;
    item.discMat.emissiveIntensity = 0.25 + Math.min(1, ring) * 0.8;
    return;
  }
  if (item.kind === "darts") {
    let glow = 0;
    if (trap.state === "arming") glow = 0.4 + 0.9 * Math.min(1, trap.stateT / Math.max(0.01, def.arm));
    else if (trap.state === "up") glow = 1.2;
    else if (trap.state === "rearm") glow = 0.6 * Math.max(0, 1 - trap.stateT / 0.5);
    item.joints.emissiveIntensity = Math.max(glow, shine);
    item.plate.position.y = trap.state === "arming" || trap.state === "up" ? -0.025 : 0;
    return;
  }
  if (item.kind === "spikes") {
    let y = -0.8;
    let glow = 0;
    if (trap.state === "arming") {
      const u = Math.min(1, trap.stateT / def.arm);
      y = -0.72 + 0.22 * u;
      glow = 0.4 + 0.9 * u;
    } else if (trap.state === "up") {
      const u = Math.min(1, trap.stateT / 0.08);
      y = -0.5 + 0.5 * u;
      glow = 0.6;
    } else if (trap.state === "rearm") {
      const u = Math.min(1, trap.stateT / 0.35);
      y = -0.8 * u;
      glow = 0.6 * (1 - u);
    }
    item.spikes.position.y = y;
    item.spikes.visible = y > -0.78;
    item.plate.position.y = trap.state === "arming" || trap.state === "up" ? -0.025 : 0;
    item.joints.emissiveIntensity = Math.max(glow, shine);
    return;
  }
  if (POSE[item.kind]) {
    POSE[item.kind](item, trap, time, def, shine);
    return;
  }
  // Flame jet and fire wall.
  let height = 0;
  let ember = 0.1;
  if (trap.disabled) {
    height = 0;
    ember = 0;
  } else if (def.counter === "constant") {
    height = 1;
    ember = 1.2;
  } else {
    const s = cycleStage(def, time, item.phase);
    if (s.stage === "glow") {
      height = 0.12 + 0.12 * s.u;
      ember = 0.25 + 1.0 * s.u;
    } else if (s.stage === "fire") {
      height = s.u < 0.1 ? s.u / 0.1 : s.u > 0.9 ? (1 - s.u) / 0.1 * 0.7 + 0.3 : 1;
      ember = 1.3;
    } else {
      height = 0;
      ember = 0.12 * (1 - s.u) + 0.05;
    }
  }
  item.ember.emissiveIntensity = ember;
  const kids = item.tongues.children;
  item.tongues.visible = height > 0.01;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    const seed = k.userData.seed;
    const flick = 0.72 + 0.28 * Math.sin(time * (9 + seed * 8) + seed * 20) * Math.sin(time * (4.3 + seed * 3) + seed * 7);
    const tall = k.userData.core ? 1.05 : 1.55 + seed * 0.6;
    const h = height * tall * (0.8 + 0.35 * flick);
    const w = 0.85 + 0.3 * flick;
    k.scale.set(w, Math.max(0.01, h), w);
    k.rotation.z = Math.sin(time * (3 + seed * 2) + seed * 9) * 0.12;
    k.rotation.x = Math.sin(time * (2.6 + seed) + seed * 5) * 0.1;
  }
  poseSwitch(item, trap, time);
}

function poseSwitch(item, trap, time) {
  const sw = item.sw;
  if (!sw) return;
  if (sw.lamp) {
    sw.lamp.material.emissiveIntensity = trap.disabled ? 0 : 0.8 + 0.3 * Math.sin(time * 6);
    sw.lamp.material.color.setHex(trap.disabled ? 0x2a2420 : 0xff5a2a);
  }
  if (sw.type === "lever" && trap.disabled) sw.handle.rotation.x = 1.6;
  if (sw.type === "heart") {
    sw.pod.visible = !trap.disabled;
    // The heart throbs, and shrinks with every blow it takes.
    const hits = trap.heartHits || 0;
    const beat = 1 + 0.08 * Math.max(0, Math.sin(time * 5));
    const s = (1 - hits * 0.18) * beat;
    sw.pod.scale.set(s, s * 1.25, s);
    sw.podMat.emissiveIntensity = trap.flashT > 0 ? 1.4 : 0.5;
  }
}

// Clouds swell from nothing (u = 0) to full (u = 1) and drift.
function poseCloud(cloud, u, time) {
  cloud.visible = u > 0.02;
  if (!cloud.visible) return;
  const kids = cloud.children;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    const seed = k.userData.seed;
    const s = u * (0.85 + 0.3 * Math.sin(time * (1.3 + seed) + seed * 9));
    k.scale.setScalar(Math.max(0.01, s * 1.5));
    k.position.y = k.userData.base + Math.sin(time * (0.9 + seed) + seed * 4) * 0.15;
  }
  cloud.userData.mat.opacity = 0.42 * Math.min(1, u * 1.4);
}

const POSE = {
  sporePuff(item, trap, time) {
    let u = 0;
    let swell = 1;
    if (trap.stage === "glow") {
      u = 0.15 * trap.stageU;
      swell = 1 + 0.15 * trap.stageU;
    } else if (trap.stage === "fire") {
      u = trap.stageU < 0.15 ? trap.stageU / 0.15 : 1 - Math.max(0, trap.stageU - 0.7) / 0.3 * 0.6;
    }
    item.shrooms.scale.set(swell, 1 / Math.sqrt(swell), swell);
    poseCloud(item.cloud, u, time);
  },
  rockfall(item, trap) {
    const def = trapDef("rockfall");
    if (trap.state === "arming") {
      const u = Math.min(1, trap.stateT / def.arm);
      item.shadow.material.opacity = 0.15 + 0.4 * u;
      item.shadow.scale.setScalar(0.4 + 0.6 * u);
      item.stone.visible = u > 0.55;
      item.stone.position.y = 9 - 8.6 * Math.max(0, (u - 0.55) / 0.45) ** 2;
    } else if (trap.state === "up" || trap.disabled) {
      item.shadow.material.opacity = 0;
      item.stone.visible = true;
      item.stone.position.y = 0.45;
      item.stone.rotation.set(0.4, 1.1, 0.2);
    } else {
      item.shadow.material.opacity = 0;
      item.stone.visible = false;
    }
  },
  sporeVent(item, trap, time) {
    item.ember.emissiveIntensity = trap.disabled ? 0 : 0.6 + 0.2 * Math.sin(time * 2);
    poseCloud(item.cloud, trap.disabled ? 0 : 1, time);
    poseSwitch(item, trap, time);
  },
  pendulum(item, trap) {
    // The arm hangs 3.3 m; tilt it so the blade sits at trap.swing across.
    const s = Math.max(-0.99, Math.min(0.99, (trap.swing || 0) / 3.3));
    item.arm.rotation.x = -Math.asin(s);
  },
  flood(item, trap, time) {
    item.water.visible = !trap.disabled;
    item.water.position.y = 0.035 + Math.sin(time * 1.7) * 0.01;
    item.water.material.emissiveIntensity = 0.35 + 0.1 * Math.sin(time * 2.3 + item.id);
    poseSwitch(item, trap, time);
  },
  grasp(item, trap, time, def, shine) {
    const t = item.tendrils;
    const up = trap.state === "arming" || trap.state === "up";
    t.visible = up || (trap.state === "rearm" && trap.stateT < 0.6);
    let u = 0;
    if (trap.state === "arming") u = Math.min(1, trap.stateT / def.arm);
    else if (trap.state === "up") u = 1;
    else if (trap.state === "rearm") u = Math.max(0, 1 - trap.stateT / 0.6);
    for (let i = 0; i < t.children.length; i++) {
      const k = t.children[i];
      k.scale.set(1, Math.max(0.01, u), 1);
      // Lean in toward the middle as they close.
      k.rotation.set(Math.sin(k.userData.a) * u * 0.7, 0, -Math.cos(k.userData.a) * u * 0.7);
    }
  },
  thornWall(item, trap) {
    const closing = trap.state === "arming" ? Math.min(1, trap.stateT / trapDef("thornWall").arm) : trap.state === "up" && !trap.disabled ? 1 : 0;
    const open = trap.openT > 0 ? Math.max(0, 1 - trap.openT / 0.8) : null;
    const u = open != null ? open : closing;
    item.wall.visible = u > 0.01;
    item.wall.position.y = -3.2 + 3.2 * u;
  },
  briar(item, trap, time) {
    item.bush.visible = !trap.disabled || trap.witherT > 0;
    const w = trap.disabled ? Math.max(0, trap.witherT || 0) : 1;
    item.bush.scale.set(1, Math.max(0.01, w), 1);
    poseSwitch(item, trap, time);
  },
  sarcophagus(item, trap) {
    const def = trapDef("sarcophagus");
    let u = 0;
    if (trap.state === "arming") u = Math.min(1, trap.stateT / def.arm) * 0.25;
    else if (trap.state !== "idle" || trap.disabled) u = 1;
    // The lid grinds sideways, then tips onto the floor beside the coffin.
    item.lid.position.z = -u * 0.9;
    item.lid.rotation.x = u >= 1 ? -0.5 : 0;
    item.lid.position.y = u >= 1 ? 0.55 : 0.84;
  },
  candles(item, trap, time) {
    for (let i = 0; i < (item.parts || []).length; i++) {
      const c = item.parts[i];
      c.flame.visible = c.lit && !trap.disabled;
      c.ring.visible = c.flame.visible;
      if (c.flame.visible) {
        const f = 0.85 + 0.2 * Math.sin(time * 11 + i * 3);
        c.flame.scale.set(f, 1 + 0.25 * Math.sin(time * 7 + i), f);
        c.ring.material.opacity = 0.35 + 0.15 * Math.sin(time * 2 + i);
      }
    }
  },
  tripHammer(item, trap) {
    // Raised: the arm tips up 0.75 rad. Fire: it slams to 0 and the plate glows.
    let lift = 0.75;
    if (trap.stage === "glow") lift = 0.75 * Math.min(1, 0.3 + trap.stageU);
    else if (trap.stage === "fire") lift = trap.stageU < 0.25 ? 0.75 * (1 - trap.stageU / 0.25) : 0;
    else lift = 0.75 * Math.min(1, trap.stageU * 0.4);
    item.arm.rotation.z = lift;
    item.glow.emissiveIntensity = trap.stage === "fire" ? 1.4 * (1 - trap.stageU * 0.6) : 0;
  },
  collapse(item, trap, time) {
    const def = trapDef("collapse");
    const gone = trap.disabled || trap.state === "up";
    item.pit.visible = gone;
    item.rim.visible = gone;
    item.slabs.visible = !gone;
    if (trap.state === "arming") {
      // The slabs shudder and sag as the tile gives.
      const u = Math.min(1, trap.stateT / def.arm);
      item.slabs.position.set(Math.sin(time * 60) * 0.03 * u, -0.06 * u, Math.cos(time * 53) * 0.03 * u);
    } else {
      item.slabs.position.set(0, 0, 0);
    }
  },
  seal(item, trap) {
    const def = trapDef("seal");
    let u = 0;
    if (trap.state === "arming") u = Math.min(1, trap.stateT / def.arm);
    else if (trap.state === "up" && !trap.opened) u = 1;
    if (trap.openT > 0) u = Math.max(0, 1 - trap.openT / 0.8);
    for (const d of item.doors || []) {
      d.bars.visible = u > 0.01;
      d.bars.position.y = -3.4 + 3.4 * u;
    }
  },
  bossFlame(item, trap, time) {
    const def = trapDef("bossFlame");
    let height = 0;
    let ember = 0.2;
    if (trap.state === "arming") {
      const u = Math.min(1, trap.stateT / def.arm);
      height = 0.15 * u;
      ember = 0.3 + 1.0 * u;
    } else if (trap.state === "up") {
      height = 1;
      ember = 1.4;
    } else if (trap.state === "rearm") {
      height = Math.max(0, 1 - trap.stateT / def.rearm);
      ember = 1.4 * height;
    }
    item.ember.emissiveIntensity = ember;
    const flames = item.tongues;
    flames.visible = height > 0.01;
    for (const band of flames.children) {
      for (let i = 0; i < band.children.length; i++) {
        const k = band.children[i];
        const seed = k.userData.seed;
        const flick = 0.75 + 0.25 * Math.sin(time * (9 + seed * 8) + seed * 20);
        const h = height * (k.userData.core ? 1.2 : 1.9 + seed * 0.6) * flick;
        k.scale.set(0.9 + 0.3 * flick, Math.max(0.01, h), 0.9 + 0.3 * flick);
      }
    }
  },
  bossFlood(item, trap, time) {
    item.water.visible = !trap.disabled;
    item.water.position.y = 0.03 + Math.sin(time * 1.5) * 0.01;
  },
  slagPool(item, trap, time) {
    item.molten.emissiveIntensity = 0.8 + 0.25 * Math.sin(time * 1.6 + item.id);
  }
};

// Turn the valve wheel: `u` 0..1 of the hold, or 1 once the wall is out.
export function syncValveView(item, u, time) {
  if (!item || !item.sw) return;
  if (item.sw.type === "lever") {
    item.sw.handle.rotation.x = -0.5 + u * 2.1;
    return;
  }
  if (!item.sw.wheel) return;
  item.sw.wheel.rotation.z = -u * Math.PI * 3;
  item.sw.wheelMat.emissiveIntensity = u > 0 && u < 1 ? 0.45 + 0.2 * Math.sin(time * 10) : 0.15;
}

// Snuff progress on one candle: the flame shrinks as the Warden pinches it.
export function syncCandleView(part, u) {
  if (!part || !part.flame) return;
  const s = Math.max(0.05, 1 - u);
  part.flame.scale.set(s, s, s);
}
