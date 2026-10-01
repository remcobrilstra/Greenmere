import * as THREE from "three";
import { mulberry32 } from "../sim/rng.js";
import { mixSeed, tileToWorld } from "../sim/floorgen.js";
import { paintFacesWith, mergeParts, lambert } from "./materials.js";
import { dungeonTheme } from "./lights.js";

const TILE = 4;
const BODY_HEX = [0x3a2416, 0x5a3a24, 0x6b4428];
const SKIN_HEX = [0x8e2e28, 0x6e2e28, 0xa34a3a];

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

function mergeChunks(chunks) {
  let count = 0;
  for (let i = 0; i < chunks.length; i++) count += chunks[i].attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  let o = 0;
  for (let c = 0; c < chunks.length; c++) {
    const p = chunks[c].attributes.position;
    const n = chunks[c].attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const k = (o + i) * 3;
      pos[k] = p.getX(i);
      pos[k + 1] = p.getY(i);
      pos[k + 2] = p.getZ(i);
      nrm[k] = n.getX(i);
      nrm[k + 1] = n.getY(i);
      nrm[k + 2] = n.getZ(i);
    }
    o += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  return geo;
}

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

function makeSkirmisherGeo(rand) {
  const parts = [];
  const body = new THREE.BoxGeometry(0.72, 0.34, 0.48);
  body.translate(0, 0.42, 0);
  parts.push(paintFacesWith(body, BODY_HEX, rand));
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.CylinderGeometry(0.07, 0.09, 0.26, 5);
    const sx = (i & 1) ? 0.22 : -0.22;
    const sz = (i & 2) ? 0.14 : -0.16;
    leg.translate(sx, 0.13, sz);
    parts.push(paintFacesWith(leg, [0x241c18, 0x3a2a22], rand));
  }
  const head = new THREE.IcosahedronGeometry(0.2, 0);
  head.translate(0, 0.74, -0.02);
  parts.push(paintFacesWith(head, SKIN_HEX, rand));
  // Local −z is the face. The muzzle sits on that axis by construction.
  const muzzle = new THREE.BoxGeometry(0.1, 0.08, 0.16);
  muzzle.translate(0, 0.7, -0.24);
  parts.push(paintFacesWith(muzzle, [0xe0a878, 0xd4a03a], rand));
  return mergeParts(parts);
}

function makeBruteGeo(rand) {
  const parts = [];
  const body = new THREE.BoxGeometry(1.15, 0.72, 0.78);
  body.translate(0, 0.78, 0);
  parts.push(paintFacesWith(body, BODY_HEX, rand));
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.CylinderGeometry(0.11, 0.14, 0.42, 5);
    const sx = (i & 1) ? 0.34 : -0.34;
    const sz = (i & 2) ? 0.18 : -0.2;
    leg.translate(sx, 0.2, sz);
    parts.push(paintFacesWith(leg, [0x241c18, 0x3a2a22], rand));
  }
  const head = new THREE.BoxGeometry(0.46, 0.36, 0.4);
  head.translate(0, 1.32, -0.04);
  parts.push(paintFacesWith(head, SKIN_HEX, rand));
  const muzzle = new THREE.BoxGeometry(0.28, 0.14, 0.22);
  muzzle.translate(0, 1.22, -0.32);
  parts.push(paintFacesWith(muzzle, [0xe0a878, 0xd4a03a], rand));
  return mergeParts(parts);
}

function makeSpitterGeo(rand) {
  const parts = [];
  const body = new THREE.BoxGeometry(0.7, 0.4, 0.55);
  body.translate(0, 0.46, 0.06);
  parts.push(paintFacesWith(body, [0x3c6e2e, 0x4f8c38, 0x2c6b2a], rand));
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.CylinderGeometry(0.06, 0.08, 0.24, 5);
    const sx = (i & 1) ? 0.22 : -0.22;
    const sz = (i & 2) ? 0.16 : -0.08;
    leg.translate(sx, 0.12, sz);
    parts.push(paintFacesWith(leg, [0x241c18, 0x3a2a22], rand));
  }
  const sac = new THREE.SphereGeometry(0.22, 6, 5);
  sac.translate(0, 0.48, -0.38);
  parts.push(paintFacesWith(sac, [0x8fb84a, 0xc6d46a, 0x6a9a32], rand));
  const muzzle = new THREE.BoxGeometry(0.1, 0.08, 0.16);
  muzzle.translate(0, 0.5, -0.58);
  parts.push(paintFacesWith(muzzle, [0xe0a878, 0xd4a03a], rand));
  return mergeParts(parts);
}

function makeShadeGeo(rand) {
  const parts = [];
  const slate = [0x4c545e, 0x6e7882, 0x3e4650];
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

function makeBossGeo(rand) {
  const parts = [];
  const moss = [0x2c6b2a, 0x3c6e2e, 0x1d4a22];
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
  parts.push(paintFacesWith(head, [0x4f8c38, 0x3c6e2e], rand));
  const muzzle = new THREE.BoxGeometry(0.36, 0.16, 0.28);
  muzzle.translate(0, 1.66, -0.42);
  parts.push(paintFacesWith(muzzle, [0xe2ba60, 0xd4a03a], rand));
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

export function buildStrikeCrescent() {
  const group = new THREE.Group();
  group.name = "strikeCrescent";
  const mat = new THREE.MeshLambertMaterial({
    color: 0xf4e7c8,
    emissive: 0xf4e7c8,
    emissiveIntensity: 0.85,
    flatShading: true
  });
  const spots = [[-0.38, -0.82], [0, -1.05], [0.38, -0.82]];
  for (let i = 0; i < spots.length; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.46, 0.02), mat);
    mesh.position.set(spots[i][0], 1.12, spots[i][1]);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }
  group.visible = false;
  return group;
}

export function buildFloorMesh(plan) {
  const rand = mulberry32(mixSeed(plan.runSeed || 1, (plan.floorIndex || 1) + 0x5a17));
  const theme = dungeonTheme(plan.themeId);
  const cols = plan.cols;
  const rows = plan.rows;
  const tiles = plan.tiles;
  const root = new THREE.Group();
  root.name = "dungeonRoot";

  const floorChunks = [];
  let quadCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r * cols + c] !== 1) continue;
      quadCount++;
    }
  }
  const floorPos = new Float32Array(quadCount * 18);
  let q = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r * cols + c] !== 1) continue;
      const w = tileToWorld(c, r, cols, rows);
      const x0 = w.x - TILE / 2;
      const x1 = w.x + TILE / 2;
      const y0 = -w.z - TILE / 2;
      const y1 = -w.z + TILE / 2;
      const v = [
        x0, y0, 0, x1, y0, 0, x1, y1, 0,
        x0, y0, 0, x1, y1, 0, x0, y1, 0
      ];
      floorPos.set(v, q);
      q += 18;
    }
  }
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute("position", new THREE.BufferAttribute(floorPos, 3));
  const paintedFloor = paintFacesWith(floorGeo, theme.floor, rand);
  const floorMat = lambert({ side: THREE.FrontSide });
  const floorMesh = new THREE.Mesh(paintedFloor, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  floorMesh.castShadow = false;
  floorMesh.name = "dungeonFloor";
  root.add(floorMesh);

  const wallChunks = [];
  function addWall(sx, sy, sz, x, y, z) {
    const box = new THREE.BoxGeometry(sx, sy, sz);
    box.translate(x, y, z);
    const raw = box.index ? box.toNonIndexed() : box;
    if (raw !== box) box.dispose();
    if (!raw.attributes.normal) raw.computeVertexNormals();
    wallChunks.push(raw);
  }
  const half = 0.2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r * cols + c] !== 1) continue;
      const w = tileToWorld(c, r, cols, rows);
      const neigh = [
        [1, 0, TILE / 2 + half, 0, 0.4, TILE],
        [-1, 0, -(TILE / 2 + half), 0, 0.4, TILE],
        [0, 1, 0, TILE / 2 + half, TILE, 0.4],
        [0, -1, 0, -(TILE / 2 + half), TILE, 0.4]
      ];
      for (let n = 0; n < neigh.length; n++) {
        const dc = neigh[n][0];
        const dr = neigh[n][1];
        const nc = c + dc;
        const nr = r + dr;
        const outside = nc < 0 || nr < 0 || nc >= cols || nr >= rows;
        if (!outside && tiles[nr * cols + nc] === 1) continue;
        const ox = neigh[n][2];
        const oz = neigh[n][3];
        const sx = neigh[n][4];
        const sz = neigh[n][5];
        addWall(sx, 2.6, sz, w.x + ox, 1.3, w.z + oz);
      }
    }
  }
  let wallMesh = null;
  if (wallChunks.length) {
    const wallGeo = paintFacesWith(mergeChunks(wallChunks), theme.wall, rand);
    wallMesh = new THREE.Mesh(wallGeo, lambert({ side: THREE.DoubleSide }));
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    wallMesh.name = "dungeonWalls";
    root.add(wallMesh);
    for (let i = 0; i < wallChunks.length; i++) {
      if (wallChunks[i] !== wallGeo) wallChunks[i].dispose();
    }
  }

  const propColliders = [];
  const rockItems = [];
  const rootItems = [];
  const brazierItems = [];
  const props = plan.props || [];
  for (let i = 0; i < props.length; i++) {
    const prop = props[i];
    const w = tileToWorld(prop.col, prop.row, cols, rows);
    const x = w.x + prop.ox;
    const z = w.z + prop.oz;
    const s = 0.85 + rand() * 0.15;
    const yaw = rand() * Math.PI * 2;
    const item = { x, z, s, yaw };
    if (prop.kind === "brazier" && theme.id === 3 && brazierItems.length < 4) brazierItems.push(item);
    else if (prop.kind === "root") rootItems.push(item);
    else rockItems.push(item);
    propColliders.push({ x, z, r: 0.45, tileX: w.x, tileZ: w.z });
  }
  function stamp(geo, items, y, mat) {
    if (!items.length) {
      geo.dispose();
      return null;
    }
    const mesh = new THREE.InstancedMesh(geo, mat || lambert(), items.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      _dummy.position.set(it.x, y, it.z);
      _dummy.rotation.set(0, it.yaw, 0);
      _dummy.scale.setScalar(it.s);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    nearWhiteInstances(mesh);
    root.add(mesh);
    return mesh;
  }
  const rockGeo = paintFacesWith(new THREE.DodecahedronGeometry(0.46, 0), theme.rock, rand);
  const rootGeo = paintFacesWith(new THREE.ConeGeometry(0.28, 0.72, 5), theme.root, rand);
  rootGeo.translate(0, 0.28, 0);
  stamp(rockGeo, rockItems, 0.22);
  stamp(rootGeo, rootItems, 0);

  if (theme.id === 3 && brazierItems.length) {
    const bowl = new THREE.CylinderGeometry(0.26, 0.34, 0.22, 6);
    bowl.translate(0, 0.12, 0);
    const bowlGeo = paintFacesWith(bowl, theme.wall, rand);
    if (bowl !== bowlGeo) bowl.dispose();
    stamp(bowlGeo, brazierItems, 0);
    const flameGeo = new THREE.ConeGeometry(0.16, 0.5, 5);
    flameGeo.translate(0, 0.5, 0);
    const flameMat = new THREE.MeshLambertMaterial({
      color: theme.accent || 0xff8a2a,
      emissive: theme.accent || 0xff8a2a,
      emissiveIntensity: 0.95,
      flatShading: true
    });
    const flameMesh = stamp(flameGeo, brazierItems, 0, flameMat);
    if (flameMesh) {
      flameMesh.castShadow = false;
      flameMesh.name = "braziers";
    }
    for (let i = 0; i < brazierItems.length && i < 4; i++) {
      const it = brazierItems[i];
      const light = new THREE.PointLight(theme.accent || 0xff8a2a, 6, 9, 2);
      light.castShadow = false;
      light.position.set(it.x, 0.72, it.z);
      light.name = "brazierLight";
      root.add(light);
    }
  }

  const stairsW = tileToWorld(plan.stairs.col, plan.stairs.row, cols, rows);
  const stairs = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.08, 1.15),
    new THREE.MeshLambertMaterial({ color: 0xe2ba60, flatShading: true })
  );
  stairs.position.set(stairsW.x, 0.04, stairsW.z);
  stairs.receiveShadow = true;
  stairs.castShadow = false;
  stairs.name = "stairs";
  root.add(stairs);

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
  const bossFloor = (plan.floorIndex || 1) % 5 === 0;
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
  addPack("skirmisher", makeSkirmisherGeo(rand), new THREE.Vector3(0, 0.7, -0.24), makeRing(0.35, 1.15), skirmCap);
  addPack("brute", makeBruteGeo(rand), new THREE.Vector3(0, 1.22, -0.32), makeWedge(2), buckets.brute.length);
  addPack("spitter", makeSpitterGeo(rand), new THREE.Vector3(0, 0.5, -0.58), makeRing(0.3, 1.05), buckets.spitter.length);
  addPack("shade", makeShadeGeo(rand), new THREE.Vector3(0, 1.44 * 0.85, -0.28 * 0.85), makeRing(0.3, 1.15), buckets.shade.length);
  addPack("boss", makeBossGeo(rand), new THREE.Vector3(0, 1.66, -0.42), makeWedge(2.4), buckets.boss.length);

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

  function syncActors(list) {
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
    if (orbMesh) {
      for (let i = 0; i < orbs.length && i < orbMesh.count; i++) {
        const o = orbs[i];
        writeInstance(orbMesh, i, o.x, 0.45, o.z, 0, 1);
      }
      orbMesh.instanceMatrix.needsUpdate = true;
    }
  }
  syncActors(actors);

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
  root.userData.actors = actors;
  root.userData.enemyMesh = enemyMesh;
  root.userData.telegraphMesh = telegraphMesh;
  root.userData.orbMesh = orbMesh;
  root.userData.orbs = orbs;
  root.userData.claimSlot = claimSlot;
  root.userData.syncActors = syncActors;
  root.userData.dispose = function () {
    if (root.parent) root.parent.remove(root);
    disposeObject(root);
  };
  return root;
}

export function buildGlint() {
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.16, 0),
    new THREE.MeshLambertMaterial({
      color: 0xe2ba60,
      emissive: 0xd4a03a,
      emissiveIntensity: 0.4,
      flatShading: true
    })
  );
  mesh.name = "glint";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
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
