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
    let built;
    if (t.kind === "spikes") built = buildSpikes(theme, def);
    else built = buildFlames(def, def.counter === "constant");
    built.group.position.set(w.x, 0, w.z);
    // Local +x runs along the corridor.
    built.group.rotation.y = t.axis === "z" ? Math.PI / 2 : 0;
    built.group.name = "trap:" + t.id + ":" + t.kind;
    group.add(built.group);
    Object.assign(item, built, { root: built.group });
    if (t.sw) {
      const sw = tileToWorld(t.sw.col, t.sw.row, plan.cols, plan.rows);
      const sx = sw.x + t.sw.ox;
      const sz = sw.z + t.sw.oz;
      const valve = buildValve(theme);
      valve.group.position.set(sx, 0, sz);
      valve.group.rotation.y = t.sw.yaw || 0;
      // A feed pipe runs along the wall from the valve to the fire wall it shuts.
      const wall = 1 + 0.24 / 1.55;
      const ax = sw.x + t.sw.ox * wall;
      const az = sw.z + t.sw.oz * wall;
      const bx = w.x + t.sw.ox * wall;
      const bz = w.z + t.sw.oz * wall;
      const len = Math.hypot(bx - ax, bz - az);
      const pipe = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.14), new THREE.MeshLambertMaterial({ color: IRON[1], flatShading: true }));
      pipe.position.set((ax + bx) / 2, 0.14, (az + bz) / 2);
      pipe.rotation.y = Math.atan2(-(bz - az), bx - ax);
      pipe.receiveShadow = true;
      group.add(pipe);
      valve.group.name = "valve:" + t.id;
      group.add(valve.group);
      if (colliders) colliders.push({ x: sx, z: sz, r: 0.32, tileX: sw.x, tileZ: sw.z });
      item.sw = Object.assign(valve, { x: sx, z: sz });
    }
    items.push(item);
  }
  return { group, items };
}

// Pose one trap from its live state (src/sim/traps.js makeTrapState).
export function syncTrapView(item, trap, time) {
  if (!item || !trap) return;
  const def = trapDef(item.kind);
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
    item.joints.emissiveIntensity = glow;
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
  if (item.sw) {
    item.sw.lamp.material.emissiveIntensity = trap.disabled ? 0 : 0.8 + 0.3 * Math.sin(time * 6);
    item.sw.lamp.material.color.setHex(trap.disabled ? 0x2a2420 : 0xff5a2a);
  }
}

// Turn the valve wheel: `u` 0..1 of the hold, or 1 once the wall is out.
export function syncValveView(item, u, time) {
  if (!item || !item.sw) return;
  item.sw.wheel.rotation.z = -u * Math.PI * 3;
  item.sw.wheelMat.emissiveIntensity = u > 0 && u < 1 ? 0.45 + 0.2 * Math.sin(time * 10) : 0.15;
}
