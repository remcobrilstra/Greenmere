import * as THREE from "three";
import { mulberry32, hash2 } from "../sim/rng.js";
import { terrainHeight, WORLD, HALF } from "../sim/terrain.js";
import { paintFaces, mergeParts, lambert } from "./materials.js";
import { buildTownBuildings } from "./buildings.js";
import { FOREST_CLEAR_R, GATE, HEARTH, INTERACT_R, townBlocked } from "../sim/townplan.js";

export const TREE_COUNT = 3050;
// Flowers, grass, mushrooms, and the flame have no colliders.
export const DECOR = ["flowers", "grass", "mushrooms", "flame"];

export function buildTown(scene, addCollider, addBoxCollider) {
  const rand = mulberry32(0x6e11e5);
  const townRoot = new THREE.Group();
  townRoot.name = "townRoot";
  scene.add(townRoot);

  function deformRadial(geo, amount) {
    // Polyhedron and box corners are stored once per face. A different
    // scale per copy opens a crack, so every vertex at one point shares
    // the first roll. rand() still advances once per vertex, which keeps
    // the forest stream in step.
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    const q = 1e4;
    const keys = new Array(p.count);
    const scaleOf = new Map();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const key = Math.round(v.x * q) + "," + Math.round(v.y * q) + "," + Math.round(v.z * q);
      keys[i] = key;
      const roll = 1 + (rand() - 0.5) * amount;
      if (!scaleOf.has(key)) scaleOf.set(key, roll);
    }
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      v.multiplyScalar(scaleOf.get(keys[i]));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    p.needsUpdate = true;
  }
  function paintTrunk(geo) {
    const g = geo.toNonIndexed();
    const p = g.attributes.position;
    g.computeBoundingBox();
    const minY = g.boundingBox.min.y;
    const maxY = g.boundingBox.max.y;
    const cols = new Float32Array(p.count * 3);
    const dark = new THREE.Color(0x3a2416);
    const mid = new THREE.Color(0x6b4428);
    const light = new THREE.Color(0x8d5b34);
    const col = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const t = (y - minY) / (maxY - minY + 1e-6);
      col.copy(dark).lerp(mid, t);
      if ((i / 3) % 4 === 0) col.lerp(light, 0.4);
      for (let k = 0; k < 3; k++) {
        cols[(i + k) * 3] = col.r;
        cols[(i + k) * 3 + 1] = col.g;
        cols[(i + k) * 3 + 2] = col.b;
      }
    }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return g;
  }

  const LEAF = [0x1b5c32, 0x21743c, 0x2f8f45, 0x3ea84a, 0x67c85a, 0x8ed15a, 0x14532d, 0xb6e36a];
  const BUSH_COLS = [0x1f6a34, 0x2d8a3e, 0x3e9a36, 0x4eaf45, 0x173f22, 0x6aaa44];
  const ROCK_COLS = [0x4c545e, 0x5e6771, 0x6e7882, 0x3e4650, 0x7d868f, 0x2f363e];

  const terrainGeo = new THREE.PlaneGeometry(WORLD, WORLD, 100, 100);
  {
    const p = terrainGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setZ(i, terrainHeight(x, -y));
    }
    p.needsUpdate = true;
  }
  const terrainPainted = paintTerrain(terrainGeo);
  const terrain = new THREE.Mesh(terrainPainted, lambert());
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  townRoot.add(terrain);
  terrain.updateMatrixWorld(true);

  // Same downward ray as play/camera groundY, so station feet sit on the mesh.
  const _groundRay = new THREE.Raycaster();
  const _groundFrom = new THREE.Vector3();
  const _groundDown = new THREE.Vector3(0, -1, 0);
  function groundAt(x, z) {
    _groundFrom.set(x, 48, z);
    _groundRay.set(_groundFrom, _groundDown);
    _groundRay.near = 0;
    _groundRay.far = 90;
    const hits = _groundRay.intersectObject(terrain, false);
    if (hits.length) return hits[0].point.y;
    return terrainHeight(x, z);
  }

  function paintTerrain(geo) {
    const g = geo.toNonIndexed();
    const p = g.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const low = new THREE.Color(0x2c6b2a);
    const mid = new THREE.Color(0x3f9a34);
    const high = new THREE.Color(0x8ed15a);
    const patch = new THREE.Color(0x3c6e2e);
    const col = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const h = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      const n = hash2(x, -y);
      const ht = Math.max(0, Math.min(1, (h + 3) / 11));
      col.copy(low).lerp(mid, ht);
      col.lerp(high, Math.max(0, ht - 0.55) * 1.5);
      if (n > 0.8) col.lerp(patch, 0.55);
      const f = 0.9 + n * 0.18;
      col.multiplyScalar(f);
      col.r = Math.min(1, col.r);
      col.g = Math.min(1, col.g);
      col.b = Math.min(1, col.b);
      for (let k = 0; k < 3; k++) {
        cols[(i + k) * 3] = col.r;
        cols[(i + k) * 3 + 1] = col.g;
        cols[(i + k) * 3 + 2] = col.b;
      }
    }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return g;
  }

  function makePineCanopy() {
    const specs = [[1.65, 1.75, 2.25, 6], [1.2, 1.5, 3.35, 6], [0.72, 1.25, 4.4, 5]];
    return mergeParts(specs.map(([r, h, y, seg]) => {
      const cone = new THREE.ConeGeometry(r, h, seg);
      cone.translate(0, y, 0);
      return paintFaces(cone, LEAF, rand);
    }));
  }
  function makeDecCanopy() {
    const a = new THREE.DodecahedronGeometry(1.35, 0);
    deformRadial(a, 0.32);
    a.scale(1.25, 0.82, 1.12);
    a.translate(0, 2.65, 0);
    const b = new THREE.IcosahedronGeometry(0.92, 0);
    deformRadial(b, 0.38);
    b.translate(0.42, 3.45, 0.18);
    const c = new THREE.IcosahedronGeometry(0.68, 0);
    deformRadial(c, 0.34);
    c.translate(-0.48, 3.05, -0.22);
    return mergeParts([a, b, c].map((g) => paintFaces(g, LEAF, rand)));
  }
  function makeTrunk(top, bottom, height) {
    const g = new THREE.CylinderGeometry(top, bottom, height, 6, 1);
    g.translate(0, height / 2, 0);
    return paintTrunk(g);
  }

  const pineCanopy = makePineCanopy();
  const decCanopy = makeDecCanopy();
  const pineTrunk = makeTrunk(0.2, 0.46, 2.35);
  const decTrunk = makeTrunk(0.3, 0.55, 1.7);

  const bushGeo = (() => {
    const g = new THREE.IcosahedronGeometry(0.72, 0);
    deformRadial(g, 0.42);
    g.scale(1.25, 0.62, 1.15);
    return paintFaces(g, BUSH_COLS, rand);
  })();
  const rockGeos = [0, 1, 2].map(() => {
    const g = rand() > 0.45
      ? new THREE.DodecahedronGeometry(0.8, 0)
      : new THREE.BoxGeometry(1.15, 0.85, 1.0, 1, 1, 1);
    deformRadial(g, 0.4);
    return paintFaces(g, ROCK_COLS, rand);
  });
  const flowerGeos = [0xffe14a, 0xfff6e4, 0xf2a3c2, 0xc7b0f0, 0xff8d6a].map((hex) => {
    const stem = new THREE.CylinderGeometry(0.03, 0.045, 0.28, 5);
    stem.translate(0, 0.14, 0);
    const petal = new THREE.IcosahedronGeometry(0.11, 0);
    petal.scale(1.2, 0.7, 1.2);
    petal.translate(0, 0.32, 0);
    const stemP = paintFaces(stem, [0x2f7a32, 0x3d8f3a], rand);
    const petalP = paintFaces(petal, [hex, hex, 0xfff8ea], rand);
    return mergeParts([stemP, petalP]);
  });
  const grassGeo = (() => {
    const blades = [];
    for (let i = 0; i < 5; i++) {
      const blade = new THREE.ConeGeometry(0.055, 0.38 + (i % 3) * 0.1, 4);
      blade.translate(Math.cos(i * 1.2) * 0.1, 0.2, Math.sin(i * 1.2) * 0.1);
      blade.rotateZ((i - 2) * 0.18);
      blades.push(paintFaces(blade, [0x67b84a, 0x8bc85a, 0x3e9a34, 0xc6e07a], rand));
    }
    return mergeParts(blades);
  })();
  const mushroomGeo = (() => {
    const stem = new THREE.CylinderGeometry(0.06, 0.08, 0.22, 5);
    stem.translate(0, 0.11, 0);
    const cap = new THREE.ConeGeometry(0.18, 0.16, 6);
    cap.translate(0, 0.26, 0);
    return mergeParts([
      paintFaces(stem, [0xefe6d4, 0xd9d0be], rand),
      paintFaces(cap, [0xc4473a, 0xe15a48, 0xf4efe4, 0xa33b32], rand)
    ]);
  })();

  function stampInstances(geo, items, castShadow) {
    const mesh = new THREE.InstancedMesh(geo, lambert(), items.length);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
      dummy.scale.set(it.sx, it.sy, it.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setRGB(it.cr, it.cg, it.cb);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    townRoot.add(mesh);
    return mesh;
  }
  function tint() {
    return {
      cr: 0.86 + rand() * 0.28,
      cg: 0.9 + rand() * 0.22,
      cb: 0.82 + rand() * 0.2
    };
  }

  const treeBases = [];
  const pines = [];
  const decs = [];
  const occupied = new Map();
  function nearTree(x, z, minDist) {
    const ix = Math.floor(x / minDist);
    const iz = Math.floor(z / minDist);
    for (let gx = ix - 1; gx <= ix + 1; gx++) {
      for (let gz = iz - 1; gz <= iz + 1; gz++) {
        const bucket = occupied.get(gx + ":" + gz);
        if (!bucket) continue;
        for (const p of bucket) {
          const dx = p.x - x;
          const dz = p.z - z;
          if (dx * dx + dz * dz < minDist * minDist) return true;
        }
      }
    }
    return false;
  }
  function rememberTree(x, z, minDist) {
    const k = Math.floor(x / minDist) + ":" + Math.floor(z / minDist);
    let bucket = occupied.get(k);
    if (!bucket) occupied.set(k, bucket = []);
    bucket.push({ x, z });
  }
  function pushTree(x, z, scaleBias, forcePine) {
    const pine = forcePine || rand() < 0.4;
    const s = (scaleBias || 1) * (0.82 + rand() * 0.7);
    const sy = s * (0.92 + rand() * 0.28);
    const y = terrainHeight(x, z);
    const item = Object.assign({
      x, y, z,
      rx: (rand() - 0.5) * 0.06,
      ry: rand() * Math.PI * 2,
      rz: (rand() - 0.5) * 0.06,
      sx: s, sy, sz: s
    }, tint());
    (pine ? pines : decs).push(item);
    treeBases.push({ x, z });
    addCollider(x, z, (pine ? 0.4 : 0.48) * s);
    return item;
  }
  const TREE_GAP = 4.3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.35;
    const x = Math.cos(a) * (FOREST_CLEAR_R + 3);
    const z = Math.sin(a) * (FOREST_CLEAR_R + 3);
    pushTree(x, z, 1.28, i % 2 === 0);
    rememberTree(x, z, TREE_GAP);
  }
  let guard = 0;
  while (pines.length + decs.length < TREE_COUNT && guard < TREE_COUNT * 80) {
    guard++;
    const x = (rand() - 0.5) * (WORLD - 20);
    const z = (rand() - 0.5) * (WORLD - 20);
    if (Math.hypot(x, z) < FOREST_CLEAR_R) continue;
    if (nearTree(x, z, TREE_GAP)) continue;
    pushTree(x, z, 1, false);
    rememberTree(x, z, TREE_GAP);
  }
  guard = 0;
  while (pines.length + decs.length < TREE_COUNT && guard < TREE_COUNT * 40) {
    guard++;
    const x = (rand() - 0.5) * (WORLD - 20);
    const z = (rand() - 0.5) * (WORLD - 20);
    if (Math.hypot(x, z) < FOREST_CLEAR_R) continue;
    if (nearTree(x, z, 2.6)) continue;
    pushTree(x, z, 1, false);
    rememberTree(x, z, 2.6);
  }
  while (pines.length + decs.length < TREE_COUNT) {
    const a = rand() * Math.PI * 2;
    const rad = FOREST_CLEAR_R + 4 + rand() * (HALF - FOREST_CLEAR_R - 14);
    pushTree(Math.cos(a) * rad, Math.sin(a) * rad, 1, false);
  }

  stampInstances(pineTrunk, pines, true);
  stampInstances(pineCanopy, pines, true);
  stampInstances(decTrunk, decs, true);
  stampInstances(decCanopy, decs, true);

  function scatter(count, avoidR, minDist, makeItem) {
    const items = [];
    const local = new Map();
    let guardN = 0;
    while (items.length < count && guardN < count * 50) {
      guardN++;
      const x = (rand() - 0.5) * (WORLD - 16);
      const z = (rand() - 0.5) * (WORLD - 16);
      if (Math.hypot(x, z) < avoidR) continue;
      if (minDist > 0) {
        const ix = Math.floor(x / minDist);
        const iz = Math.floor(z / minDist);
        let blocked = false;
        for (let gx = ix - 1; gx <= ix + 1 && !blocked; gx++) {
          for (let gz = iz - 1; gz <= iz + 1 && !blocked; gz++) {
            const bucket = local.get(gx + ":" + gz);
            if (!bucket) continue;
            for (const p of bucket) {
              const dx = p.x - x;
              const dz = p.z - z;
              if (dx * dx + dz * dz < minDist * minDist) blocked = true;
            }
          }
        }
        if (blocked) continue;
        const k = ix + ":" + iz;
        let bucket = local.get(k);
        if (!bucket) local.set(k, bucket = []);
        bucket.push({ x, z });
      }
      items.push(makeItem(x, z));
    }
    return items;
  }

  const bushes = scatter(680, FOREST_CLEAR_R - 4, 1.8, (x, z) => {
    const s = 0.45 + rand() * 0.85;
    return Object.assign({
      x, y: terrainHeight(x, z) + s * 0.18, z,
      ry: rand() * Math.PI * 2,
      sx: s * (0.9 + rand() * 0.3),
      sy: s * (0.7 + rand() * 0.35),
      sz: s * (0.9 + rand() * 0.3)
    }, tint());
  });
  stampInstances(bushGeo, bushes, true);

  const rocks = scatter(230, FOREST_CLEAR_R - 2, 2.2, (x, z) => {
    const s = rand() > 0.86 ? 1.4 + rand() * 1.1 : 0.35 + rand() * 0.85;
    const item = Object.assign({
      x,
      y: terrainHeight(x, z) + s * 0.18,
      z,
      rx: rand() * Math.PI,
      ry: rand() * Math.PI,
      rz: rand() * 0.6,
      sx: s * (0.8 + rand() * 0.5),
      sy: s * (0.55 + rand() * 0.5),
      sz: s * (0.8 + rand() * 0.5),
      geo: Math.floor(rand() * rockGeos.length)
    }, tint());
    if (s > 0.95) addCollider(x, z, s * 0.55);
    return item;
  });
  for (let v = 0; v < rockGeos.length; v++) {
    stampInstances(rockGeos[v], rocks.filter((r) => r.geo === v), true);
  }

  const flowers = [];
  for (let i = 0; i < treeBases.length && flowers.length < 980; i += 3) {
    const t = treeBases[i];
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n && flowers.length < 980; k++) {
      const ang = rand() * Math.PI * 2;
      const rad = 0.75 + rand() * 1.7;
      const x = t.x + Math.cos(ang) * rad;
      const z = t.z + Math.sin(ang) * rad;
      const s = 0.75 + rand() * 0.7;
      flowers.push(Object.assign({
        x, y: terrainHeight(x, z), z,
        ry: rand() * Math.PI * 2,
        sx: s, sy: s * (0.85 + rand() * 0.4), sz: s,
        geo: Math.floor(rand() * flowerGeos.length)
      }, tint()));
    }
  }
  // Town greens: flowers between the buildings, off roads and floors.
  for (let i = 0; i < 160; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = 10.5 + rand() * 26;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    const s = 0.8 + rand() * 0.5;
    if (townBlocked(x, z, 0.2)) continue;
    flowers.push(Object.assign({
      x, y: terrainHeight(x, z), z,
      ry: rand() * 6,
      sx: s, sy: s, sz: s,
      geo: Math.floor(rand() * flowerGeos.length)
    }, tint()));
  }
  for (let v = 0; v < flowerGeos.length; v++) {
    const subset = flowers.filter((f) => f.geo === v);
    if (subset.length) stampInstances(flowerGeos[v], subset, false);
  }

  const grasses = [];
  for (let i = 1; i < treeBases.length && grasses.length < 1500; i += 2) {
    const t = treeBases[i];
    const n = 2 + Math.floor(rand() * 2);
    for (let k = 0; k < n && grasses.length < 1500; k++) {
      const ang = rand() * Math.PI * 2;
      const rad = 0.4 + rand() * 1.5;
      const x = t.x + Math.cos(ang) * rad;
      const z = t.z + Math.sin(ang) * rad;
      const s = 0.7 + rand() * 0.8;
      grasses.push(Object.assign({
        x, y: terrainHeight(x, z), z,
        ry: rand() * Math.PI,
        sx: s, sy: 0.7 + rand() * 0.8, sz: s
      }, tint()));
    }
  }
  for (let i = 0; i < 260; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = 10.5 + rand() * 30;
    const s = 0.6 + rand() * 0.7;
    if (townBlocked(Math.cos(ang) * rad, Math.sin(ang) * rad, 0.1)) continue;
    grasses.push(Object.assign({
      x: Math.cos(ang) * rad,
      y: terrainHeight(Math.cos(ang) * rad, Math.sin(ang) * rad),
      z: Math.sin(ang) * rad,
      ry: rand() * 6,
      sx: s, sy: 0.55 + rand() * 0.6, sz: s
    }, tint()));
  }
  stampInstances(grassGeo, grasses, false);

  const mushrooms = scatter(80, FOREST_CLEAR_R - 4, 1.2, (x, z) => {
    const s = 0.7 + rand() * 0.8;
    return Object.assign({
      x, y: terrainHeight(x, z), z,
      ry: rand() * 6,
      sx: s, sy: s * (0.8 + rand() * 0.4), sz: s
    }, tint());
  });
  stampInstances(mushroomGeo, mushrooms, false);

  const INTERACT = INTERACT_R;
  const camp = { x: HEARTH.x, z: HEARTH.z };
  const campFoot = groundAt(camp.x, camp.z);
  const hearthGroup = new THREE.Group();
  hearthGroup.name = "Hearth";
  hearthGroup.position.set(camp.x, campFoot, camp.z);
  townRoot.add(hearthGroup);

  const campRockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const hearthColliders = [];
  const hearthDecor = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = camp.x + Math.cos(a) * 2.15;
    const z = camp.z + Math.sin(a) * 2.15;
    const mesh = new THREE.Mesh(rockGeos[i % rockGeos.length], campRockMat);
    const s = 0.55 + (i % 3) * 0.12;
    mesh.position.set(Math.cos(a) * 2.15, groundAt(x, z) + s * 0.2 - campFoot, Math.sin(a) * 2.15);
    mesh.rotation.set(rand(), rand(), rand() * 0.4);
    mesh.scale.set(s, s * 0.7, s);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    hearthGroup.add(mesh);
    hearthColliders.push(addCollider(x, z, s * 0.62));
  }
  const logMat = new THREE.MeshLambertMaterial({ color: 0x5a3a24, flatShading: true });
  let footLog = null;
  for (let i = 0; i < 2; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.15, 6), logMat);
    log.position.set(i ? 0.15 : -0.1, 0.14, 0);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = i ? 0.7 : -0.55;
    log.castShadow = true;
    hearthGroup.add(log);
    hearthDecor.push(log);
    if (!footLog) footLog = log;
  }
  hearthGroup.updateMatrixWorld(true);
  {
    footLog.updateWorldMatrix(true, true);
    const logBox = new THREE.Box3().setFromObject(footLog);
    footLog.position.y += campFoot - logBox.min.y;
  }
  const flameMat = new THREE.MeshLambertMaterial({
    color: 0xff8a2a,
    emissive: 0xff6a12,
    emissiveIntensity: 0.95,
    flatShading: true
  });
  const flameCoreMat = new THREE.MeshLambertMaterial({
    color: 0xffe08a,
    emissive: 0xfff1b0,
    emissiveIntensity: 1,
    flatShading: true
  });
  const flame = new THREE.Group();
  const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.72, 5), flameMat);
  flameOuter.position.y = 0.42;
  const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.46, 5), flameCoreMat);
  flameInner.position.y = 0.5;
  flame.add(flameOuter, flameInner);
  flame.position.set(0, 0.12, 0);
  hearthGroup.add(flame);
  hearthDecor.push(flame);
  const campLight = new THREE.PointLight(0xff9340, 8, 9, 2);
  campLight.position.set(0, 0.57, 0);
  hearthGroup.add(campLight);

  function solidMat(hex) {
    return new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  }
  const gold = solidMat(0xd4a03a);
  const stoneMats = [0x2f363e, 0x3e4650, 0x4c545e, 0x5e6771, 0x6e7882, 0x7d868f].map(solidMat);

  function addDecor(parent, mesh, decor) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    decor.push(mesh);
    return mesh;
  }

  // Pillar boxes and their colliders share hx/hz. The circle reaches the box corners.
  function buildGate() {
    const x = GATE.x;
    const z = GATE.z;
    const footY = groundAt(x, z);
    const group = new THREE.Group();
    group.name = "Delve Gate";
    group.position.set(x, footY, z);
    townRoot.add(group);
    const decor = [];
    const colliders = [];
    const openingW = 3.2;
    const openingH = 3.6;
    const hx = 0.48;
    const hz = 0.62;
    const footprintR = Math.hypot(hx, hz);
    for (let side = -1; side <= 1; side += 2) {
      const geo = new THREE.BoxGeometry(hx * 2, openingH, hz * 2);
      geo.translate(0, openingH / 2, 0);
      const pillar = new THREE.Mesh(geo, side < 0 ? stoneMats[0] : stoneMats[4]);
      pillar.position.set(side * (openingW / 2 + hx), 0, 0);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      group.add(pillar);
      colliders.push(addCollider(x + pillar.position.x, z, footprintR));
    }
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(openingW + hx * 4, 0.52, hz * 2),
      stoneMats[1]
    );
    lintel.position.y = openingH + 0.26;
    addDecor(group, lintel, decor);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(openingW + hx * 2.2, 0.28, hz * 1.4),
      stoneMats[5]
    );
    cap.position.y = openingH + 0.66;
    addDecor(group, cap, decor);
    const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.18), gold);
    keystone.position.set(0, openingH + 0.08, hz + 0.02);
    addDecor(group, keystone, decor);
    const stepGeo = new THREE.BoxGeometry(openingW, 0.04, hz * 2);
    stepGeo.translate(0, 0.02, 0);
    const step = new THREE.Mesh(stepGeo, stoneMats[2]);
    step.castShadow = false;
    step.receiveShadow = true;
    group.add(step);
    decor.push(step);

    const dz = GATE.descent;
    const discY = groundAt(dz.x, dz.z);
    const disc = new THREE.Group();
    disc.name = "descent";
    disc.position.set(dz.x, discY, dz.z);
    townRoot.add(disc);
    const discGeo = new THREE.CylinderGeometry(0.72, 0.78, 0.05, 8);
    discGeo.translate(0, 0.025, 0);
    const discMesh = new THREE.Mesh(discGeo, stoneMats[0]);
    discMesh.receiveShadow = true;
    disc.add(discMesh);
    decor.push(discMesh);
    const ringGeo = new THREE.CylinderGeometry(0.92, 0.96, 0.03, 8);
    ringGeo.translate(0, 0.015, 0);
    const ring = new THREE.Mesh(ringGeo, gold);
    ring.receiveShadow = true;
    disc.add(ring);
    decor.push(ring);

    return {
      id: "gate",
      name: "Delve Gate",
      x, z,
      interact: INTERACT,
      descent: { x: dz.x, z: dz.z, r: dz.r },
      group,
      footMesh: step,
      footY,
      colliders,
      decor
    };
  }

  const town = buildTownBuildings(townRoot, addCollider, addBoxCollider);

  const stations = [
    {
      id: "hearth",
      name: "Hearth",
      x: camp.x,
      z: camp.z,
      interact: INTERACT,
      group: hearthGroup,
      footMesh: footLog,
      footY: campFoot,
      colliders: hearthColliders,
      decor: hearthDecor
    }
  ].concat(town.stations, [buildGate()]);

  function addClouds() {
    const clouds = [];
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xf7f8fb, flatShading: true });
    const puff = new THREE.DodecahedronGeometry(1, 0);
    for (let c = 0; c < 7; c++) {
      const cloud = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(puff, cloudMat);
        m.position.set((i - 1.5) * 1.35, (i % 2) * 0.28, ((i + c) % 2) * 0.2);
        m.scale.setScalar(0.75 + (i % 3) * 0.28);
        cloud.add(m);
      }
      const s = 4.2 + rand() * 3.4;
      cloud.scale.setScalar(s);
      cloud.position.set((rand() - 0.5) * WORLD * 0.8, 30 + rand() * 10, (rand() - 0.5) * WORLD * 0.8);
      townRoot.add(cloud);
      clouds.push(cloud);
    }
    return clouds;
  }

  return {
    terrain,
    townRoot,
    stations,
    buildings: town.buildings,
    setTier: town.setTier,
    getTier: town.getTier,
    tierMeshes: town.tierMeshes,
    nightMats: town.nightMats,
    townGlow: town.glow,
    interiorLight: town.interiorLight,
    pines,
    decs,
    pineCanopy,
    decCanopy,
    pineTrunk,
    decTrunk,
    bushGeo,
    rockGeos,
    treeBases,
    rocks,
    camp,
    flame,
    flameOuter,
    flameInner,
    campLight,
    addClouds
  };
}
